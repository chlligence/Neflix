import { describe, expect, it } from 'vitest'
import {
  ProgressStore,
  type ProgressStorage
} from '../src/renderer/src/data/progressStore'

class FakeStorage implements ProgressStorage {
  data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  rawValue(): string | null {
    return this.data.get('neflix.playback-progress.v1') ?? null
  }
}

describe('progress store', () => {
  it('saves and restores only playback metadata', () => {
    const storage = new FakeStorage()
    const store = new ProgressStore(storage)

    store.save('video-1', 42.5, 100, 1_700_000_000_000)
    const entry = store.get('video-1')

    expect(entry).toEqual({
      videoId: 'video-1',
      position: 42.5,
      duration: 100,
      updatedAt: 1_700_000_000_000
    })

    const raw = storage.rawValue() ?? ''
    expect(raw).not.toContain('http')
    expect(raw).not.toContain('m3u8')
    expect(Object.keys(JSON.parse(raw)[0]).sort()).toEqual([
      'duration',
      'position',
      'updatedAt',
      'videoId'
    ])
  })

  it('does not resume from the opening seconds or the final credits', () => {
    const storage = new FakeStorage()
    const store = new ProgressStore(storage)

    store.save('too-early', 2, 100)
    expect(store.get('too-early')).toBeNull()

    store.save('near-end', 98, 100)
    expect(store.get('near-end')).toBeNull()
  })

  it('removes an existing entry when the video finishes', () => {
    const storage = new FakeStorage()
    const store = new ProgressStore(storage)

    store.save('video-1', 40, 100)
    expect(store.get('video-1')).not.toBeNull()

    store.save('video-1', 99.5, 100)
    expect(store.get('video-1')).toBeNull()
  })

  it('ignores corrupt storage and invalid entries', () => {
    const storage = new FakeStorage()
    storage.setItem('neflix.playback-progress.v1', '{not-json')
    expect(new ProgressStore(storage).get('video-1')).toBeNull()

    storage.setItem(
      'neflix.playback-progress.v1',
      JSON.stringify([
        { videoId: 'bad', position: '42', duration: 100, updatedAt: 1 },
        { videoId: 'ok', position: 30, duration: 100, updatedAt: 2 }
      ])
    )
    const store = new ProgressStore(storage)
    expect(store.get('bad')).toBeNull()
    expect(store.get('ok')?.position).toBe(30)
  })

  it('caps stored entries to prevent unbounded local metadata', () => {
    const storage = new FakeStorage()
    const store = new ProgressStore(storage)

    for (let index = 0; index < 220; index += 1) {
      store.save(`video-${index}`, 30, 100, 1_000 + index)
    }

    const entries = JSON.parse(storage.rawValue() ?? '[]') as unknown[]
    expect(entries).toHaveLength(200)
    expect(store.get('video-0')).toBeNull()
    expect(store.get('video-219')?.position).toBe(30)
  })

  it('works without a storage backend', () => {
    const store = new ProgressStore(null)
    store.save('video-1', 30, 100)
    expect(store.get('video-1')).toBeNull()
    expect(() => store.clear()).not.toThrow()
  })
})