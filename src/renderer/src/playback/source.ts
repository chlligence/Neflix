import type { PreferredFormat } from '../data/config'
import type { VideoItem, VideoSource } from '../data/types'
import { formatQualityLabel, type QualityOption } from './playbackMachine'

export interface ShakaVariantLike {
  height?: number | null
  bandwidth?: number
  active?: boolean
}

export interface QualitySnapshot {
  qualities: QualityOption[]
  activeHeight: number | null
  activeBandwidth: number | null
}

export function chooseSource(video: VideoItem, preferred: PreferredFormat): VideoSource | null {
  const supported = video.sources.filter(
    (source) => source.type === 'hls' || source.type === 'dash'
  )
  if (supported.length === 0) return null

  if (preferred !== 'auto') {
    return supported.find((source) => source.type === preferred) ?? supported[0] ?? null
  }

  return supported[0] ?? null
}

export function mimeTypeFor(source: VideoSource): string | null {
  if (source.type === 'hls') return 'application/x-mpegurl'
  if (source.type === 'dash') return 'application/dash+xml'
  return null
}

export function qualitySnapshot(tracks: ShakaVariantLike[]): QualitySnapshot {
  const byHeight = new Map<number, QualityOption>()
  let activeHeight: number | null = null
  let activeBandwidth: number | null = null

  for (const track of tracks) {
    const height = typeof track.height === 'number' ? track.height : 0
    const bandwidth = typeof track.bandwidth === 'number' ? track.bandwidth : 0
    if (height > 0) {
      const existing = byHeight.get(height)
      if (!existing || existing.bandwidth < bandwidth) {
        byHeight.set(height, {
          height,
          bandwidth,
          label: formatQualityLabel(height, bandwidth)
        })
      }
    }
    if (track.active) {
      activeHeight = height > 0 ? height : null
      activeBandwidth = bandwidth > 0 ? bandwidth : null
    }
  }

  return {
    qualities: [...byHeight.values()].sort((a, b) => b.height - a.height),
    activeHeight,
    activeBandwidth
  }
}