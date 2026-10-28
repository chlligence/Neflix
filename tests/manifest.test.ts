import { describe, expect, it } from 'vitest'
import catalog from '../examples/catalog.json'
import { parseDemoCatalog, parseVideoPage, inferStreamType } from '../src/renderer/src/data/manifest'
import { AppError } from '../src/renderer/src/data/types'

function makePage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    page: 1,
    pageSize: 2,
    total: 5,
    items: [
      {
        id: 'bbb',
        title: 'Big Buck Bunny',
        description: 'demo',
        duration: 634,
        qualities: ['1080p', '720p'],
        sources: [
          { type: 'hls', url: 'videos/bbb/master.m3u8' },
          { type: 'auto', url: 'videos/bbb/manifest.mpd' }
        ]
      }
    ],
    ...overrides
  }
}

describe('manifest parsing', () => {
  it('normalizes pagination and resolves relative playback URLs against the CDN', () => {
    const result = parseVideoPage(makePage(), {
      cdnBaseUrl: 'https://cdn.example.com/media',
      imageBaseUrl: 'https://img.example.com'
    })

    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(2)
    expect(result.total).toBe(5)
    expect(result.hasMore).toBe(true)
    expect(result.items[0]?.sources[0]).toMatchObject({
      type: 'hls',
      url: 'https://cdn.example.com/media/videos/bbb/master.m3u8'
    })
    expect(result.items[0]?.sources[1]).toMatchObject({
      type: 'dash',
      url: 'https://cdn.example.com/media/videos/bbb/manifest.mpd'
    })
  })

  it('deduplicates sources and quality labels while keeping the first source order', () => {
    const result = parseVideoPage(
      makePage({
        items: [
          {
            id: 'one',
            title: 'One',
            duration: 30,
            qualities: ['1080p', '1080P', '720p', '720p'],
            sources: [
              { type: 'hls', url: 'https://cdn.example.com/a.m3u8' },
              { type: 'hls', url: 'https://cdn.example.com/a.m3u8' }
            ]
          }
        ]
      })
    )

    expect(result.items[0]?.qualities).toEqual(['1080p', '720p'])
    expect(result.items[0]?.sources).toHaveLength(1)
  })

  it('keeps application-relative demo covers when no image base is configured', () => {
    const result = parseVideoPage(
      makePage({
        items: [
          {
            id: 'one',
            title: 'One',
            duration: 30,
            cover: 'covers/bunny.svg',
            sources: [{ type: 'hls', url: 'https://cdn.example.com/a.m3u8' }]
          }
        ]
      })
    )

    expect(result.items[0]?.cover).toBe('covers/bunny.svg')
  })

  it('rejects relative playback URLs when the CDN base is missing', () => {
    expect(() => parseVideoPage(makePage())).toThrow(AppError)
    try {
      parseVideoPage(makePage())
    } catch (error) {
      expect((error as AppError).code).toBe('manifest_format')
      expect((error as AppError).userMessage).toContain('VITE_CDN_BASE_URL')
    }
  })

  it('rejects items that exceed the declared page size', () => {
    const page = makePage({ pageSize: 1 })
    expect(() => parseVideoPage(page)).toThrow(AppError)
  })

  it('rejects videos without a playback source', () => {
    expect(() =>
      parseVideoPage(
        makePage({
          items: [
            {
              id: 'broken',
              title: 'Broken',
              duration: 10,
              sources: []
            }
          ]
        })
      )
    ).toThrow(AppError)
  })

  it('infers stream types for signed URLs without file extensions', () => {
    expect(inferStreamType('https://cdn.example.com/a.m3u8?sign=abc')).toBe('hls')
    expect(inferStreamType('https://cdn.example.com/b.mpd?sign=abc')).toBe('dash')
    expect(inferStreamType('https://cdn.example.com/file.bin')).toBe('unknown')
  })

  it('marks unsupported explicit formats as unknown instead of silently treating them as HLS', () => {
    const result = parseVideoPage(
      makePage({
        items: [
          {
            id: 'mp4',
            title: 'MP4',
            duration: 10,
            sources: [{ type: 'mp4', url: 'https://cdn.example.com/a.mp4' }]
          }
        ]
      })
    )
    expect(result.items[0]?.sources[0]?.type).toBe('unknown')
  })

  it('paginates the bundled demo catalog without exposing the whole list', () => {
    const first = parseDemoCatalog(catalog, 1, 4)
    const second = parseDemoCatalog(catalog, 2, 4)
    const third = parseDemoCatalog(catalog, 3, 4)

    expect(first.total).toBe(6)
    expect(first.items).toHaveLength(4)
    expect(first.hasMore).toBe(true)
    expect(second.items).toHaveLength(2)
    expect(second.hasMore).toBe(false)
    expect(third.items).toHaveLength(0)
  })
})