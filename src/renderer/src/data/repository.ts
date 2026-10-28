import demoCatalog from '../../../../examples/catalog.json'
import type { AppConfig } from './config'
import { parseDemoCatalog, parseVideoPage } from './manifest'
import { AppError, type VideoPage, type VideoPageRequest, type VideoRepository } from './types'

async function fetchJson(url: string, timeoutMs: number, outerSignal?: AbortSignal): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AppError('network_offline', '网络已断开，请检查网络连接后重试。', {
      retryable: true
    })
  }

  const controller = new AbortController()
  let timedOut = false
  const onOuterAbort = (): void => controller.abort()
  outerSignal?.addEventListener('abort', onOuterAbort, { once: true })

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    })

    if (!response.ok) {
      const statusMessage =
        response.status === 404
          ? '视频清单接口不存在（404）。'
          : response.status === 403
            ? '视频清单接口拒绝访问（403）。'
            : `视频清单接口请求失败（HTTP ${response.status}）。`
      throw new AppError('manifest_request', statusMessage, {
        technical: `${response.status} ${response.statusText}`,
        retryable: true
      })
    }

    try {
      return (await response.json()) as unknown
    } catch (error) {
      throw new AppError('manifest_format', '视频清单接口返回的内容不是有效 JSON。', {
        cause: error,
        retryable: false
      })
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    if (outerSignal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    if (timedOut) {
      throw new AppError('timeout', '视频清单加载超时，请稍后重试。', {
        cause: error,
        retryable: true
      })
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new AppError('network_offline', '网络已断开，请检查网络连接后重试。', {
        cause: error,
        retryable: true
      })
    }
    throw new AppError('manifest_request', '无法连接视频清单服务，请检查网络或接口配置。', {
      cause: error,
      technical: error instanceof Error ? error.message : String(error),
      retryable: true
    })
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener('abort', onOuterAbort)
  }
}

export class HttpVideoRepository implements VideoRepository {
  constructor(
    private readonly endpoint: string,
    private readonly config: Pick<AppConfig, 'requestTimeoutMs' | 'cdnBaseUrl' | 'imageBaseUrl'>
  ) {}

  async listVideos({ page, pageSize, signal }: VideoPageRequest): Promise<VideoPage> {
    const url = new URL(this.endpoint)
    url.searchParams.set('page', String(page))
    url.searchParams.set('pageSize', String(pageSize))

    const raw = await fetchJson(url.toString(), this.config.requestTimeoutMs, signal)
    return parseVideoPage(raw, {
      cdnBaseUrl: this.config.cdnBaseUrl,
      imageBaseUrl: this.config.imageBaseUrl
    })
  }
}

export class DemoVideoRepository implements VideoRepository {
  constructor(
    private readonly config: Pick<AppConfig, 'cdnBaseUrl' | 'imageBaseUrl'>
  ) {}

  async listVideos({ page, pageSize, signal }: VideoPageRequest): Promise<VideoPage> {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    return parseDemoCatalog(demoCatalog, page, pageSize, {
      cdnBaseUrl: this.config.cdnBaseUrl,
      imageBaseUrl: this.config.imageBaseUrl
    })
  }
}

export function createVideoRepository(config: AppConfig): VideoRepository {
  if (config.demoMode) {
    return new DemoVideoRepository(config)
  }

  if (!config.manifestUrl) {
    throw new AppError(
      'configuration',
      '尚未配置视频清单接口。请设置 VITE_VIDEO_MANIFEST_URL，或启用演示模式。',
      { retryable: false }
    )
  }

  return new HttpVideoRepository(config.manifestUrl, config)
}