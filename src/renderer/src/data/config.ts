export type PreferredFormat = 'auto' | 'hls' | 'dash'

export interface AppConfig {
  demoMode: boolean
  manifestUrl: string | null
  cdnBaseUrl: string | null
  imageBaseUrl: string | null
  preferredFormat: PreferredFormat
  pageSize: number
  requestTimeoutMs: number
  loadingTimeoutMs: number
  bufferTimeoutMs: number
  progressSaveIntervalMs: number
  playbackRates: number[]
  oss: {
    bucket: string | null
    region: string | null
    endpoint: string | null
  }
  configurationIssue: string | null
}

type EnvSource = Record<string, unknown>

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true' || String(value) === '1'
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function asHttpUrl(raw: string | null, label: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('not http(s)')
    }
    return url.toString()
  } catch {
    throw new Error(`${label} 不是有效的 HTTP(S) 地址`)
  }
}

function resolveManifestUrl(rawUrl: string | null, apiBaseUrl: string | null): string | null {
  if (!rawUrl) return null
  if (/^https?:\/\//i.test(rawUrl)) {
    return asHttpUrl(rawUrl, 'VITE_VIDEO_MANIFEST_URL')
  }
  if (!apiBaseUrl) {
    throw new Error('VITE_VIDEO_MANIFEST_URL 为相对路径时必须配置 VITE_MANIFEST_API_BASE_URL')
  }
  const base = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`
  return asHttpUrl(new URL(rawUrl, base).toString(), 'VITE_VIDEO_MANIFEST_URL')
}

export function createAppConfig(env: EnvSource = import.meta.env as EnvSource): AppConfig {
  const pageSize = Math.round(asNumber(env.VITE_PAGE_SIZE, 4, 1, 50))
  const requestTimeoutMs = Math.round(asNumber(env.VITE_REQUEST_TIMEOUT_MS, 12_000, 2_000, 60_000))
  const loadingTimeoutMs = Math.round(asNumber(env.VITE_LOADING_TIMEOUT_MS, 30_000, 5_000, 120_000))
  const bufferTimeoutMs = Math.round(asNumber(env.VITE_BUFFER_TIMEOUT_MS, 20_000, 5_000, 120_000))
  const progressSaveIntervalMs = Math.round(
    asNumber(env.VITE_PROGRESS_SAVE_INTERVAL_MS, 5_000, 2_000, 60_000)
  )

  const preferredRaw = asString(env.VITE_PREFERRED_FORMAT)?.toLowerCase()
  const preferredFormat: PreferredFormat =
    preferredRaw === 'hls' || preferredRaw === 'dash' ? preferredRaw : 'auto'

  const rawManifestUrl = asString(env.VITE_VIDEO_MANIFEST_URL)
  const rawApiBase = asString(env.VITE_MANIFEST_API_BASE_URL)
  let manifestUrl: string | null = null
  let cdnBaseUrl: string | null = null
  let imageBaseUrl: string | null = null
  let configurationIssue: string | null = null

  try {
    const apiBaseUrl = asHttpUrl(rawApiBase, 'VITE_MANIFEST_API_BASE_URL')
    manifestUrl = resolveManifestUrl(rawManifestUrl, apiBaseUrl)
  } catch (error) {
    configurationIssue = error instanceof Error ? error.message : '视频清单接口配置无效'
  }

  try {
    cdnBaseUrl = asHttpUrl(asString(env.VITE_CDN_BASE_URL), 'VITE_CDN_BASE_URL')
    imageBaseUrl =
      asHttpUrl(asString(env.VITE_IMAGE_BASE_URL), 'VITE_IMAGE_BASE_URL') ?? cdnBaseUrl
  } catch (error) {
    configurationIssue ??= error instanceof Error ? error.message : 'CDN 配置无效'
  }

  const demoMode = asBoolean(env.VITE_DEMO_MODE, manifestUrl === null)
  if (!demoMode && !manifestUrl && !configurationIssue) {
    configurationIssue =
      '视频清单接口尚未配置。请设置 VITE_VIDEO_MANIFEST_URL，或将 VITE_DEMO_MODE 设为 true 使用演示数据。'
  }

  return {
    demoMode,
    manifestUrl,
    cdnBaseUrl,
    imageBaseUrl,
    preferredFormat,
    pageSize,
    requestTimeoutMs,
    loadingTimeoutMs,
    bufferTimeoutMs,
    progressSaveIntervalMs,
    playbackRates: DEFAULT_RATES,
    oss: {
      bucket: asString(env.VITE_OSS_BUCKET),
      region: asString(env.VITE_OSS_REGION),
      endpoint: asString(env.VITE_OSS_ENDPOINT)
    },
    configurationIssue
  }
}

export const appConfig = createAppConfig()