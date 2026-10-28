export type StreamType = 'hls' | 'dash' | 'unknown'

export interface VideoSource {
  type: StreamType
  url: string
  label?: string
}

export interface VideoItem {
  id: string
  title: string
  description: string
  cover?: string
  durationSeconds: number
  year?: number
  qualities: string[]
  tags: string[]
  sources: VideoSource[]
}

export interface VideoPage {
  page: number
  pageSize: number
  total: number
  items: VideoItem[]
  hasMore: boolean
}

export interface VideoPageRequest {
  page: number
  pageSize: number
  signal?: AbortSignal
}

export interface VideoRepository {
  listVideos(request: VideoPageRequest): Promise<VideoPage>
}

export type AppErrorCode =
  | 'manifest_format'
  | 'manifest_request'
  | 'network_offline'
  | 'timeout'
  | 'unsupported_format'
  | 'configuration'

export interface AppErrorOptions {
  cause?: unknown
  retryable?: boolean
  technical?: string
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly userMessage: string
  readonly retryable: boolean
  readonly technical?: string

  constructor(code: AppErrorCode, userMessage: string, options: AppErrorOptions = {}) {
    super(userMessage, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.userMessage = userMessage
    this.retryable = options.retryable ?? true
    this.technical = options.technical
  }
}