export type PlaybackErrorCode =
  | 'network_offline'
  | 'network'
  | 'http'
  | 'timeout'
  | 'load_timeout'
  | 'buffer_timeout'
  | 'unsupported'
  | 'media'
  | 'drm'
  | 'manifest'
  | 'unknown'

export interface PlaybackError {
  code: PlaybackErrorCode
  title: string
  message: string
  retryable: boolean
  technical?: string
}

const TEMPLATES: Record<PlaybackErrorCode, Omit<PlaybackError, 'code'>> = {
  network_offline: {
    title: '网络已断开',
    message: '请检查网络连接，恢复后点击重试继续播放。',
    retryable: true
  },
  network: {
    title: '网络连接异常',
    message: '视频数据加载失败，请检查网络或稍后重试。',
    retryable: true
  },
  http: {
    title: '视频地址不可用',
    message: 'CDN 播放地址可能已失效、无权限或文件不存在，请联系管理员检查。',
    retryable: true
  },
  timeout: {
    title: '连接超时',
    message: '加载视频花费时间过长，请检查网络后重试。',
    retryable: true
  },
  load_timeout: {
    title: '加载超时',
    message: '视频清单长时间未能加载，可能是 CDN 或网络异常。',
    retryable: true
  },
  buffer_timeout: {
    title: '缓冲超时',
    message: '视频缓冲时间过长，请检查网络后重试。',
    retryable: true
  },
  unsupported: {
    title: '视频格式不支持',
    message: '当前播放器仅支持 HLS / DASH 流，请检查视频清单中的播放地址。',
    retryable: false
  },
  media: {
    title: '无法解码视频',
    message: '当前设备或播放内核无法解码该视频，请尝试其他清晰度或视频。',
    retryable: false
  },
  drm: {
    title: '受保护的内容',
    message: '该视频需要 DRM 支持，当前版本不提供 DRM 播放能力。',
    retryable: false
  },
  manifest: {
    title: '视频清单解析失败',
    message: 'HLS / DASH 清单无法解析，CDN 上的视频可能未正确转码或已损坏。',
    retryable: true
  },
  unknown: {
    title: '播放失败',
    message: '播放器遇到了未知问题，请重试或返回片库。',
    retryable: true
  }
}

export function createPlaybackError(
  code: PlaybackErrorCode,
  technical?: string
): PlaybackError {
  return {
    code,
    ...TEMPLATES[code],
    ...(technical ? { technical } : {})
  }
}

interface ShakaErrorLike {
  category?: number
  code?: number
  message?: string
  data?: unknown
}

function isShakaErrorLike(error: unknown): error is ShakaErrorLike {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as ShakaErrorLike
  return typeof candidate.category === 'number' && typeof candidate.code === 'number'
}

export function fromShakaError(error: unknown): PlaybackError {
  if (!isShakaErrorLike(error)) {
    return createPlaybackError(
      'unknown',
      error instanceof Error ? error.message : String(error)
    )
  }

  const technical = `Shaka category=${error.category}, code=${error.code}${
    error.message ? `, ${error.message}` : ''
  }`

  if (error.category === 1) {
    if (error.code === 1003) return createPlaybackError('timeout', technical)
    if (error.code === 1001) return createPlaybackError('http', technical)
    if (error.code === 1000) return createPlaybackError('unsupported', technical)
    return createPlaybackError('network', technical)
  }

  if (error.category === 4) {
    return createPlaybackError(
      error.code === 4000 || error.code === 4032 ? 'unsupported' : 'manifest',
      technical
    )
  }

  if (error.category === 3) return createPlaybackError('media', technical)
  if (error.category === 6) return createPlaybackError('drm', technical)
  if (error.category === 5) return createPlaybackError('network', technical)

  return createPlaybackError('unknown', technical)
}

export function fromMediaError(error: MediaError | null): PlaybackError {
  if (!error) return createPlaybackError('unknown')
  const technical = `MediaError code=${error.code}${error.message ? `, ${error.message}` : ''}`
  // 直接使用规范数值，避免测试环境没有 MediaError 全局对象时出错。
  if (error.code === 4) {
    return createPlaybackError('unsupported', technical)
  }
  if (error.code === 2) {
    return createPlaybackError('network', technical)
  }
  if (error.code === 3) {
    return createPlaybackError('media', technical)
  }
  return createPlaybackError('unknown', technical)
}