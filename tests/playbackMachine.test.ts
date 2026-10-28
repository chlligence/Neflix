import { describe, expect, it } from 'vitest'
import { createPlaybackError } from '../src/renderer/src/playback/playbackErrors'
import {
  formatQualityLabel,
  initialPlaybackState,
  playbackReducer,
  type PlaybackState
} from '../src/renderer/src/playback/playbackMachine'

function readyState(duration = 120): PlaybackState {
  return playbackReducer(initialPlaybackState, { type: 'READY', duration })
}

describe('playback state machine', () => {
  it('moves from loading to ready and playing', () => {
    const ready = readyState()
    expect(ready.phase).toBe('ready')
    expect(ready.duration).toBe(120)

    const playing = playbackReducer(ready, { type: 'PLAY' })
    expect(playing.phase).toBe('playing')

    const paused = playbackReducer(playing, { type: 'PAUSE' })
    expect(paused.phase).toBe('paused')
  })

  it('tracks buffering without leaving the error or ended states', () => {
    const playing = playbackReducer(readyState(), { type: 'PLAY' })
    const buffering = playbackReducer(playing, { type: 'BUFFERING_START' })
    expect(buffering.phase).toBe('buffering')

    const resumed = playbackReducer(buffering, { type: 'BUFFERING_END', playing: true })
    expect(resumed.phase).toBe('playing')

    const ended = playbackReducer(resumed, { type: 'ENDED' })
    expect(ended.phase).toBe('ended')
    expect(playbackReducer(ended, { type: 'BUFFERING_START' }).phase).toBe('ended')
  })

  it('clamps time updates and keeps buffered end monotonic', () => {
    const state = playbackReducer(readyState(100), {
      type: 'TIME_UPDATE',
      currentTime: 40,
      duration: 100,
      bufferedEnd: 65
    })
    expect(state.currentTime).toBe(40)
    expect(state.bufferedEnd).toBe(65)

    const rewound = playbackReducer(state, {
      type: 'TIME_UPDATE',
      currentTime: 190,
      duration: 100,
      bufferedEnd: 80
    })
    expect(rewound.currentTime).toBe(100)
    expect(rewound.bufferedEnd).toBe(100)
  })

  it('resets to paused when seeking back from the ended state', () => {
    const play = playbackReducer(readyState(90), { type: 'PLAY' })
    const ended = playbackReducer(play, { type: 'ENDED' })
    expect(ended.currentTime).toBe(90)

    const seeked = playbackReducer(ended, { type: 'SEEK', currentTime: 12 })
    expect(seeked.phase).toBe('paused')
    expect(seeked.currentTime).toBe(12)
  })

  it('preserves the error state and increments retry count on retry', () => {
    const error = createPlaybackError('network_offline')
    const failed = playbackReducer(readyState(), { type: 'FAIL', error })
    expect(failed.phase).toBe('error')
    expect(failed.error?.code).toBe('network_offline')
    expect(playbackReducer(failed, { type: 'PLAY' })).toBe(failed)

    const retrying = playbackReducer(failed, { type: 'RETRY' })
    expect(retrying.phase).toBe('loading')
    expect(retrying.error).toBeNull()
    expect(retrying.retryCount).toBe(1)
  })

  it('supports manual quality selection and falls back to auto if the track disappears', () => {
    const withQualities = playbackReducer(readyState(), {
      type: 'SET_QUALITIES',
      qualities: [
        { height: 1080, label: '1080p', bandwidth: 5_000_000 },
        { height: 720, label: '720p', bandwidth: 2_500_000 }
      ],
      activeHeight: 1080,
      activeBandwidth: 5_000_000
    })

    const manual = playbackReducer(withQualities, { type: 'SELECT_QUALITY', quality: 720 })
    expect(manual.selectedQuality).toBe(720)
    expect(manual.activeHeight).toBe(720)

    const missing = playbackReducer(manual, {
      type: 'SET_QUALITIES',
      qualities: [{ height: 1080, label: '1080p', bandwidth: 5_000_000 }],
      activeHeight: 1080
    })
    expect(missing.selectedQuality).toBe('auto')
  })

  it('handles volume and mute state consistently', () => {
    const mutedByVolume = playbackReducer(initialPlaybackState, {
      type: 'SET_VOLUME',
      volume: 0
    })
    expect(mutedByVolume.volume).toBe(0)
    expect(mutedByVolume.muted).toBe(true)

    const unmuted = playbackReducer(mutedByVolume, { type: 'SET_VOLUME', volume: 0.6 })
    expect(unmuted.volume).toBe(0.6)
    expect(unmuted.muted).toBe(false)

    const manuallyMuted = playbackReducer(unmuted, { type: 'SET_MUTED', muted: true })
    expect(manuallyMuted.volume).toBe(0.6)
    expect(manuallyMuted.muted).toBe(true)
  })

  it('formats quality labels for the settings menu', () => {
    expect(formatQualityLabel(1080, 5_000_000)).toBe('1080p · 5.0 Mbps')
    expect(formatQualityLabel(480, 800_000)).toBe('480p · 800 Kbps')
    expect(formatQualityLabel(720)).toBe('720p')
  })
})