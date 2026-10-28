import { describe, expect, it } from 'vitest'
import {
  createPlaybackError,
  fromMediaError,
  fromShakaError
} from '../src/renderer/src/playback/playbackErrors'

describe('playback error mapping', () => {
  it('maps CDN HTTP failures to a retryable user-facing error', () => {
    const error = fromShakaError({ category: 1, code: 1001, message: '404' })
    expect(error.code).toBe('http')
    expect(error.retryable).toBe(true)
    expect(error.message).toContain('CDN')
    expect(error.technical).toContain('category=1')
  })

  it('maps Shaka network timeouts and connection failures', () => {
    expect(fromShakaError({ category: 1, code: 1003 }).code).toBe('timeout')
    expect(fromShakaError({ category: 1, code: 1002 }).code).toBe('network')
    expect(fromShakaError({ category: 1, code: 1010 }).code).toBe('network')
  })

  it('distinguishes unsupported formats from malformed manifests', () => {
    expect(fromShakaError({ category: 4, code: 4000 }).code).toBe('unsupported')
    expect(fromShakaError({ category: 4, code: 4032 }).code).toBe('unsupported')
    expect(fromShakaError({ category: 4, code: 4001 }).code).toBe('manifest')
  })

  it('maps media, DRM and unknown failures', () => {
    expect(fromShakaError({ category: 3, code: 3000 }).code).toBe('media')
    expect(fromShakaError({ category: 6, code: 6001 }).code).toBe('drm')
    expect(fromShakaError(new Error('boom')).code).toBe('unknown')
    expect(fromShakaError({ category: 7, code: 7000 }).code).toBe('unknown')
  })

  it('maps native MediaError codes without relying on the DOM global', () => {
    expect(fromMediaError({ code: 4, message: 'src' } as MediaError).code).toBe('unsupported')
    expect(fromMediaError({ code: 2, message: 'net' } as MediaError).code).toBe('network')
    expect(fromMediaError({ code: 3, message: 'decode' } as MediaError).code).toBe('media')
    expect(fromMediaError(null).code).toBe('unknown')
  })

  it('creates consistent buffer and offline prompts', () => {
    const buffer = createPlaybackError('buffer_timeout')
    expect(buffer.title).toBe('缓冲超时')
    expect(buffer.retryable).toBe(true)
    expect(createPlaybackError('network_offline').title).toBe('网络已断开')
    expect(createPlaybackError('unsupported').retryable).toBe(false)
  })
})