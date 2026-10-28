import { AppError, type StreamType, type VideoItem, type VideoPage, type VideoSource } from './types'

export interface ManifestParseOptions {
  cdnBaseUrl?: string | null
  imageBaseUrl?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown, field: string, index?: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(
      'manifest_format',
      `视频清单格式不正确：缺少 ${field}${index === undefined ? '' : `（第 ${index + 1} 条）`}。`,
      { technical: `Invalid ${field}`, retryable: false }
    )
  }
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function finiteNumber(value: unknown, field: string, index: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AppError('manifest_format', `视频清单格式不正确：${field} 必须是数字。`, {
      technical: `Invalid ${field} at item ${index}`,
      retryable: false
    })
  }
  return value
}

function resolveBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`
}

function resolveHttpUrl(rawUrl: string, base?: string | null): string {
  const trimmed = rawUrl.trim()
  if (trimmed.startsWith('//')) {
    return new URL(`https:${trimmed}`).toString()
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only HTTP(S) URLs are supported')
    }
    return url.toString()
  }

  if (!base) {
    throw new AppError(
      'manifest_format',
      '视频清单包含相对播放地址，但尚未配置 CDN 域名。请设置 VITE_CDN_BASE_URL。',
      { technical: `Relative URL without base: ${trimmed}`, retryable: false }
    )
  }

  const url = new URL(trimmed, resolveBase(base))
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs are supported')
  }
  return url.toString()
}

export function inferStreamType(url: string): StreamType {
  let pathname = url.toLowerCase()
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    // 相对地址按原字符串判断。
  }
  if (pathname.endsWith('.m3u8') || pathname.includes('.m3u8')) return 'hls'
  if (pathname.endsWith('.mpd') || pathname.includes('.mpd')) return 'dash'
  return 'unknown'
}

function parseSource(raw: unknown, index: number, options: ManifestParseOptions): VideoSource {
  if (!isRecord(raw)) {
    throw new AppError('manifest_format', '视频清单格式不正确：播放源必须是对象。', {
      technical: `Invalid source at item ${index}`,
      retryable: false
    })
  }

  const rawUrl = nonEmptyString(raw.url, 'sources[].url', index)
  let url: string
  try {
    url = resolveHttpUrl(rawUrl, options.cdnBaseUrl)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('manifest_format', '视频清单中存在无效的播放地址。', {
      cause: error,
      technical: rawUrl,
      retryable: false
    })
  }

  const explicitType = optionalString(raw.type)?.toLowerCase()
  const type: StreamType =
    explicitType === 'hls' || explicitType === 'dash'
      ? explicitType
      : explicitType === 'auto' || explicitType === undefined
        ? inferStreamType(url)
        : 'unknown'

  const label = optionalString(raw.label)
  return {
    type,
    url,
    ...(label ? { label } : {})
  }
}

function parseCover(raw: unknown, options: ManifestParseOptions): string | undefined {
  const cover = optionalString(raw)
  if (!cover) return undefined

  if (/^https?:\/\//i.test(cover) || cover.startsWith('//')) {
    try {
      return resolveHttpUrl(cover, null)
    } catch {
      return undefined
    }
  }

  if (options.imageBaseUrl) {
    try {
      return resolveHttpUrl(cover, options.imageBaseUrl)
    } catch {
      return undefined
    }
  }

  // 允许使用打包在应用内的演示封面，例如 covers/bunny.svg。
  return cover
}

function parseQualities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const qualities: string[] = []
  for (const quality of raw) {
    if (typeof quality !== 'string') continue
    const value = quality.trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    qualities.push(value)
  }
  return qualities
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(
    new Set(
      raw
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 6)
}

export function parseVideoItem(
  raw: unknown,
  index: number,
  options: ManifestParseOptions = {}
): VideoItem {
  if (!isRecord(raw)) {
    throw new AppError('manifest_format', '视频清单格式不正确：视频条目必须是对象。', {
      technical: `Invalid item at index ${index}`,
      retryable: false
    })
  }

  const id = nonEmptyString(raw.id, 'id', index)
  const title = nonEmptyString(raw.title, 'title', index)
  const duration = finiteNumber(raw.duration, 'duration', index)
  if (duration <= 0) {
    throw new AppError('manifest_format', `视频清单格式不正确：${title} 的时长必须大于 0。`, {
      technical: `Invalid duration at item ${index}`,
      retryable: false
    })
  }

  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new AppError('manifest_format', `视频清单格式不正确：${title} 缺少播放源。`, {
      technical: `Missing sources at item ${index}`,
      retryable: false
    })
  }

  const sources: VideoSource[] = []
  const seenUrls = new Set<string>()
  raw.sources.forEach((source, sourceIndex) => {
    const parsed = parseSource(source, index, options)
    if (!seenUrls.has(parsed.url)) {
      seenUrls.add(parsed.url)
      sources.push(parsed)
    }
  })

  if (sources.length === 0) {
    throw new AppError('manifest_format', `视频清单格式不正确：${title} 没有可用播放源。`, {
      retryable: false
    })
  }

  const yearValue = raw.year
  const year =
    typeof yearValue === 'number' && Number.isInteger(yearValue) && yearValue > 1900
      ? yearValue
      : undefined

  return {
    id,
    title,
    description: optionalString(raw.description) ?? '',
    cover: parseCover(raw.cover, options),
    durationSeconds: duration,
    ...(year === undefined ? {} : { year }),
    qualities: parseQualities(raw.qualities),
    tags: parseTags(raw.tags),
    sources
  }
}

function positiveInteger(value: unknown, field: string, max?: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    (max !== undefined && value > max)
  ) {
    throw new AppError(
      'manifest_format',
      `视频清单格式不正确：分页字段 ${field} 必须是${max ? ` 1-${max} 之间的` : '正'}整数。`,
      { technical: `Invalid pagination field ${field}`, retryable: false }
    )
  }
  return value
}

export function parseVideoPage(
  raw: unknown,
  options: ManifestParseOptions = {}
): VideoPage {
  if (!isRecord(raw)) {
    throw new AppError('manifest_format', '视频清单接口返回了无法识别的数据。', {
      retryable: false
    })
  }

  const page = positiveInteger(raw.page, 'page')
  const pageSize = positiveInteger(raw.pageSize, 'pageSize', 100)
  const total = raw.total
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) {
    throw new AppError('manifest_format', '视频清单格式不正确：total 必须是非负整数。', {
      technical: 'Invalid total',
      retryable: false
    })
  }

  if (!Array.isArray(raw.items)) {
    throw new AppError('manifest_format', '视频清单格式不正确：items 必须是数组。', {
      technical: 'Invalid items',
      retryable: false
    })
  }

  if (raw.items.length > pageSize) {
    throw new AppError('manifest_format', '视频清单分页异常：返回条目数量超过 pageSize。', {
      technical: `items.length=${raw.items.length}, pageSize=${pageSize}`,
      retryable: false
    })
  }

  const items = raw.items.map((item, index) => parseVideoItem(item, index, options))

  return {
    page,
    pageSize,
    total,
    items,
    hasMore: page * pageSize < total
  }
}

export function parseDemoCatalog(
  raw: unknown,
  page: number,
  pageSize: number,
  options: ManifestParseOptions = {}
): VideoPage {
  if (!Array.isArray(raw)) {
    throw new AppError('manifest_format', '内置演示视频清单格式不正确。', { retryable: false })
  }

  const start = (page - 1) * pageSize
  const pageItems = raw
    .slice(start, start + pageSize)
    .map((item, index) => parseVideoItem(item, start + index, options))

  return {
    page,
    pageSize,
    total: raw.length,
    items: pageItems,
    hasMore: start + pageSize < raw.length
  }
}