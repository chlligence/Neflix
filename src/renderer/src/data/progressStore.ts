const STORAGE_KEY = 'neflix.playback-progress.v1'
const MAX_ENTRIES = 200
const MIN_RESUME_SECONDS = 5
const END_THRESHOLD_SECONDS = 5

export interface PlaybackProgress {
  videoId: string
  position: number
  duration: number
  updatedAt: number
}

export interface ProgressStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isValidEntry(value: unknown): value is PlaybackProgress {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<PlaybackProgress>
  return (
    typeof entry.videoId === 'string' &&
    entry.videoId.trim() !== '' &&
    typeof entry.position === 'number' &&
    Number.isFinite(entry.position) &&
    entry.position >= 0 &&
    typeof entry.duration === 'number' &&
    Number.isFinite(entry.duration) &&
    entry.duration > 0 &&
    typeof entry.updatedAt === 'number' &&
    Number.isFinite(entry.updatedAt)
  )
}

function defaultStorage(): ProgressStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 只保存播放位置等元数据。这里刻意不接触任何视频分片、播放地址或封面数据。
 */
export class ProgressStore {
  private readonly storage: ProgressStorage | null

  constructor(storage: ProgressStorage | null = defaultStorage()) {
    this.storage = storage
  }

  get(videoId: string): PlaybackProgress | null {
    const entry = this.readAll().get(videoId)
    if (!entry) return null
    if (entry.position < MIN_RESUME_SECONDS) return null
    if (entry.duration - entry.position <= END_THRESHOLD_SECONDS) return null
    return entry
  }

  save(videoId: string, position: number, duration: number, now = Date.now()): void {
    if (!this.storage || !videoId.trim()) return
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return

    const safePosition = Math.min(Math.max(position, 0), duration)
    if (
      safePosition < MIN_RESUME_SECONDS ||
      duration - safePosition <= END_THRESHOLD_SECONDS
    ) {
      this.remove(videoId)
      return
    }

    const entries = this.readAll()
    entries.set(videoId, {
      videoId,
      position: safePosition,
      duration,
      updatedAt: now
    })

    while (entries.size > MAX_ENTRIES) {
      const oldest = [...entries.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0]
      if (!oldest) break
      entries.delete(oldest.videoId)
    }

    this.writeAll(entries)
  }

  remove(videoId: string): void {
    if (!this.storage) return
    const entries = this.readAll()
    if (entries.delete(videoId)) {
      this.writeAll(entries)
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY)
    } catch {
      // 存储不可用时忽略，播放本身不受影响。
    }
  }

  private readAll(): Map<string, PlaybackProgress> {
    if (!this.storage) return new Map()
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return new Map()
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return new Map()

      const entries = new Map<string, PlaybackProgress>()
      for (const entry of parsed) {
        if (isValidEntry(entry)) {
          entries.set(entry.videoId, entry)
        }
      }
      return entries
    } catch {
      return new Map()
    }
  }

  private writeAll(entries: Map<string, PlaybackProgress>): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify([...entries.values()]))
    } catch {
      // 配额或权限错误不应打断播放。
    }
  }
}

export const progressStore = new ProgressStore()