import { describe, expect, it } from 'vitest'
import type { VideoItem } from '../src/renderer/src/data/types'
import { chooseSource, qualitySnapshot } from '../src/renderer/src/playback/source'

const video: VideoItem = {
  id: 'demo',
  title: 'Demo',
  description: '',
  durationSeconds: 100,
  qualities: ['1080p'],
  tags: [],
  sources: [
    { type: 'dash', url: 'https://cdn.example.com/dash.mpd' },
    { type: 'hls', url: 'https://cdn.example.com/hls.m3u8' }
  ]
}

describe('source and quality helpers', () => {
  it('chooses the first source for auto and respects an explicit format preference', () => {
    expect(chooseSource(video, 'auto')?.type).toBe('dash')
    expect(chooseSource(video, 'hls')?.url).toContain('hls.m3u8')
    expect(chooseSource(video, 'dash')?.url).toContain('dash.mpd')
  })

  it('returns null when no supported source exists', () => {
    expect(
      chooseSource({ ...video, sources: [{ type: 'unknown', url: 'https://example.com/a.mp4' }] }, 'auto')
    ).toBeNull()
  })

  it('deduplicates qualities by height and reports the active variant', () => {
    const snapshot = qualitySnapshot([
      { height: 720, bandwidth: 1_500_000, active: false },
      { height: 720, bandwidth: 2_500_000, active: true },
      { height: 1080, bandwidth: 5_000_000, active: false },
      { height: 0, bandwidth: 128_000, active: false }
    ])

    expect(snapshot.qualities.map((quality) => quality.height)).toEqual([1080, 720])
    expect(snapshot.qualities[1]?.bandwidth).toBe(2_500_000)
    expect(snapshot.qualities[1]?.label).toBe('720p · 2.5 Mbps')
    expect(snapshot.activeHeight).toBe(720)
    expect(snapshot.activeBandwidth).toBe(2_500_000)
  })
})