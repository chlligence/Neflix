import shaka from 'shaka-player'
import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react'
import type { AppConfig } from '../data/config'
import type { VideoItem } from '../data/types'
import {
  createPlaybackError,
  fromMediaError,
  fromShakaError,
  type PlaybackError
} from './playbackErrors'
import {
  initialPlaybackState,
  playbackReducer,
  type PlaybackState,
  type SelectedQuality
} from './playbackMachine'
import { chooseSource, mimeTypeFor, qualitySnapshot, type ShakaVariantLike } from './source'

interface UseShakaPlaybackOptions {
  video: VideoItem
  startPosition: number
  config: Pick<
    AppConfig,
    | 'preferredFormat'
    | 'loadingTimeoutMs'
    | 'bufferTimeoutMs'
    | 'playbackRates'
  >
  onPositionChange?: (position: number, duration: number) => void
}

export interface ShakaPlaybackApi {
  videoRef: RefObject<HTMLVideoElement | null>
  state: PlaybackState
  togglePlay: () => void
  seekTo: (time: number) => void
  seekBy: (offset: number) => void
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  selectQuality: (quality: SelectedQuality) => void
  retry: () => void
}

function bufferedEnd(video: HTMLVideoElement): number {
  try {
    if (video.buffered.length === 0) return 0
    return video.buffered.end(video.buffered.length - 1)
  } catch {
    return 0
  }
}

function nativeDuration(video: HTMLVideoElement, fallback: number): number {
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallback
}

export function useShakaPlayback({
  video,
  startPosition,
  config,
  onPositionChange
}: UseShakaPlaybackOptions): ShakaPlaybackApi {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<shaka.Player | null>(null)
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState)
  const [attempt, setAttempt] = useState(0)
  const stateRef = useRef(state)
  const lastPositionRef = useRef(startPosition)
  const onPositionChangeRef = useRef(onPositionChange)
  const preferencesRef = useRef({ volume: 1, muted: false, rate: 1 })
  const initializedPositionRef = useRef(false)
  const destroyPromiseRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange
  }, [onPositionChange])

  useEffect(() => {
    if (state.currentTime >= 0) {
      lastPositionRef.current = state.currentTime
    }
  }, [state.currentTime])

  // 原生媒体事件：状态提示、缓冲超时与进度展示都基于这里的事件流。
  useEffect(() => {
    const element = videoRef.current
    if (!element) return

    const pushProgress = (): void => {
      const duration = nativeDuration(element, 0)
      const position = Number.isFinite(element.currentTime) ? element.currentTime : 0
      dispatch({
        type: 'TIME_UPDATE',
        currentTime: position,
        duration,
        bufferedEnd: bufferedEnd(element)
      })
      onPositionChangeRef.current?.(position, duration)
    }

    const onTimeUpdate = (): void => pushProgress()
    const onDurationChange = (): void => pushProgress()
    const onPlay = (): void => dispatch({ type: 'PLAY' })
    const onPlaying = (): void => dispatch({ type: 'BUFFERING_END', playing: true })
    const onPause = (): void => dispatch({ type: 'PAUSE' })
    const onWaiting = (): void => dispatch({ type: 'BUFFERING_START' })
    const onEnded = (): void => dispatch({ type: 'ENDED' })
    const onRateChange = (): void => {
      preferencesRef.current.rate = element.playbackRate
      dispatch({ type: 'SET_RATE', rate: element.playbackRate })
    }
    const onVolumeChange = (): void => {
      preferencesRef.current.volume = element.volume
      preferencesRef.current.muted = element.muted
      dispatch({ type: 'SET_VOLUME', volume: element.volume })
      dispatch({ type: 'SET_MUTED', muted: element.muted })
    }
    const onMediaError = (): void => {
      if (!element.error) return
      dispatch({ type: 'FAIL', error: fromMediaError(element.error) })
    }

    element.addEventListener('timeupdate', onTimeUpdate)
    element.addEventListener('durationchange', onDurationChange)
    element.addEventListener('play', onPlay)
    element.addEventListener('playing', onPlaying)
    element.addEventListener('pause', onPause)
    element.addEventListener('waiting', onWaiting)
    element.addEventListener('ended', onEnded)
    element.addEventListener('ratechange', onRateChange)
    element.addEventListener('volumechange', onVolumeChange)
    element.addEventListener('error', onMediaError)

    return () => {
      element.removeEventListener('timeupdate', onTimeUpdate)
      element.removeEventListener('durationchange', onDurationChange)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('playing', onPlaying)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('waiting', onWaiting)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('ratechange', onRateChange)
      element.removeEventListener('volumechange', onVolumeChange)
      element.removeEventListener('error', onMediaError)
    }
  }, [])

  useEffect(() => {
    const handleOffline = (): void => {
      if (stateRef.current.phase === 'error') return
      videoRef.current?.pause()
      dispatch({ type: 'FAIL', error: createPlaybackError('network_offline') })
    }
    window.addEventListener('offline', handleOffline)
    return () => window.removeEventListener('offline', handleOffline)
  }, [])

  useEffect(() => {
    if (state.phase !== 'buffering') return
    const timer = window.setTimeout(() => {
      videoRef.current?.pause()
      dispatch({ type: 'FAIL', error: createPlaybackError('buffer_timeout') })
    }, config.bufferTimeoutMs)
    return () => window.clearTimeout(timer)
  }, [state.phase, config.bufferTimeoutMs])

  useEffect(() => {
    const element = videoRef.current
    if (!element) return

    const source = chooseSource(video, config.preferredFormat)
    if (!source) {
      dispatch({ type: 'FAIL', error: createPlaybackError('unsupported') })
      return
    }

    let cancelled = false
    let failed = false
    let loaded = false
    let destroyed = false
    let player: shaka.Player | null = null
    let loadTimer: number | null = null
    let removePlayerListeners = (): void => undefined

    const initialTime = initializedPositionRef.current
      ? lastPositionRef.current
      : Math.max(0, startPosition)
    initializedPositionRef.current = true

    dispatch({ type: 'LOAD_START' })

    const fail = (error: PlaybackError): void => {
      if (cancelled || failed) return
      failed = true
      if (loadTimer !== null) {
        window.clearTimeout(loadTimer)
        loadTimer = null
      }
      element.pause()
      dispatch({ type: 'FAIL', error })
    }

    const destroyPlayer = (): void => {
      if (!player || destroyed) return
      destroyed = true
      try {
        destroyPromiseRef.current = Promise.resolve(player.destroy()).catch(() => undefined)
      } catch {
        destroyPromiseRef.current = Promise.resolve()
      }
    }

    const initialize = async (): Promise<void> => {
      // 等前一个 Player 完全销毁后再挂载，避免重试时争用同一个 video 元素。
      try {
        await destroyPromiseRef.current
      } catch {
        // 前一个实例已销毁。
      }
      if (cancelled) return

      const activePlayer = new shaka.Player()
      player = activePlayer
      playerRef.current = activePlayer

      activePlayer.configure({
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 1_200_000,
          switchInterval: 6,
          bandwidthUpgradeTarget: 0.85,
          bandwidthDowngradeTarget: 0.95
        },
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 2,
          bufferBehind: 30,
          lowLatencyMode: false,
          retryParameters: {
            timeout: 15_000,
            connectionTimeout: 12_000,
            stallTimeout: 10_000,
            maxAttempts: 3,
            baseDelay: 500,
            backoffFactor: 2,
            fuzzFactor: 0.5
          }
        },
        manifest: {
          retryParameters: {
            timeout: 15_000,
            connectionTimeout: 12_000,
            stallTimeout: 10_000,
            maxAttempts: 3,
            baseDelay: 500,
            backoffFactor: 2,
            fuzzFactor: 0.5
          }
        },
        restrictions: {
          maxHeight: 2160
        }
      })

      const updateQuality = (): void => {
        if (cancelled || playerRef.current !== activePlayer) return
        try {
          const snapshot = qualitySnapshot(
            activePlayer.getVariantTracks() as unknown as ShakaVariantLike[]
          )
          dispatch({
            type: 'SET_QUALITIES',
            qualities: snapshot.qualities,
            activeHeight: snapshot.activeHeight,
            activeBandwidth: snapshot.activeBandwidth
          })
        } catch {
          // 播放器销毁瞬间可能无法读取轨道，忽略即可。
        }
      }

      const onShakaError = (event: Event): void => {
        const detail = (event as CustomEvent<unknown>).detail ?? event
        fail(fromShakaError(detail))
      }

      const onBuffering = (event: Event): void => {
        const detail = event as Event & { buffering?: boolean }
        if (detail.buffering) {
          dispatch({ type: 'BUFFERING_START' })
        } else {
          dispatch({ type: 'BUFFERING_END', playing: !element.paused })
        }
      }

      activePlayer.addEventListener('error', onShakaError)
      activePlayer.addEventListener('buffering', onBuffering)
      activePlayer.addEventListener('adaptation', updateQuality)
      activePlayer.addEventListener('variantchanged', updateQuality)
      activePlayer.addEventListener('trackschanged', updateQuality)

      removePlayerListeners = () => {
        activePlayer.removeEventListener('error', onShakaError)
        activePlayer.removeEventListener('buffering', onBuffering)
        activePlayer.removeEventListener('adaptation', updateQuality)
        activePlayer.removeEventListener('variantchanged', updateQuality)
        activePlayer.removeEventListener('trackschanged', updateQuality)
      }

      loadTimer = window.setTimeout(() => {
        if (cancelled || loaded) return
        fail(createPlaybackError('load_timeout'))
        destroyPlayer()
      }, config.loadingTimeoutMs)

      try {
        await activePlayer.attach(element)
        if (cancelled) return
        await activePlayer.load(source.url, initialTime, mimeTypeFor(source))
        loaded = true
        if (loadTimer !== null) {
          window.clearTimeout(loadTimer)
          loadTimer = null
        }
        if (cancelled || failed) return

        element.volume = preferencesRef.current.volume
        element.muted = preferencesRef.current.muted
        element.playbackRate = preferencesRef.current.rate

        dispatch({
          type: 'READY',
          duration: nativeDuration(element, video.durationSeconds)
        })
        updateQuality()

        const selectedQuality = stateRef.current.selectedQuality
        if (selectedQuality !== 'auto') {
          try {
            const tracks = activePlayer.getVariantTracks() as unknown as Array<
              ShakaVariantLike & { height?: number | null; bandwidth?: number }
            >
            const candidates = tracks.filter((track) => track.height === selectedQuality)
            if (candidates.length > 0) {
              const target = candidates.reduce((best, current) =>
                (current.bandwidth ?? 0) > (best.bandwidth ?? 0) ? current : best
              )
              activePlayer.configure({ abr: { enabled: false } })
              activePlayer.selectVariantTrack(target as never, true, 2)
            }
          } catch {
            // 清晰度轨道尚未就绪时保持自动模式。
          }
        }

        try {
          await element.play()
        } catch (error) {
          if (cancelled) return
          if (error instanceof DOMException && error.name === 'AbortError') return
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            dispatch({ type: 'PAUSE' })
            return
          }
          fail(element.error ? fromMediaError(element.error) : fromShakaError(error))
        }
      } catch (error) {
        if (cancelled || failed) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        fail(fromShakaError(error))
      }
    }

    void initialize()

    return () => {
      cancelled = true
      if (loadTimer !== null) {
        window.clearTimeout(loadTimer)
        loadTimer = null
      }
      removePlayerListeners()
      if (playerRef.current === player) {
        playerRef.current = null
      }
      destroyPlayer()
      void window.desktop?.clearMediaCache().catch(() => undefined)
    }
  }, [
    video,
    attempt,
    startPosition,
    config.preferredFormat,
    config.loadingTimeoutMs
  ])

  const togglePlay = useCallback((): void => {
    const element = videoRef.current
    if (!element || stateRef.current.phase === 'error') return
    if (stateRef.current.phase === 'loading') return

    if (element.paused) {
      if (stateRef.current.phase === 'ended') {
        element.currentTime = 0
        dispatch({ type: 'SEEK', currentTime: 0 })
      }
      void element.play().catch(() => {
        dispatch({ type: 'PAUSE' })
      })
    } else {
      element.pause()
    }
  }, [])

  const seekTo = useCallback((time: number): void => {
    const element = videoRef.current
    if (!element || !Number.isFinite(time)) return
    const target = Math.max(0, Math.min(time, nativeDuration(element, time)))
    element.currentTime = target
    dispatch({ type: 'SEEK', currentTime: target })
  }, [])

  const seekBy = useCallback((offset: number): void => {
    const element = videoRef.current
    if (!element) return
    seekTo(element.currentTime + offset)
  }, [seekTo])

  const setRate = useCallback((rate: number): void => {
    if (!config.playbackRates.includes(rate)) return
    preferencesRef.current.rate = rate
    if (videoRef.current) videoRef.current.playbackRate = rate
    dispatch({ type: 'SET_RATE', rate })
  }, [config.playbackRates])

  const setVolume = useCallback((volume: number): void => {
    const safeVolume = Math.min(1, Math.max(0, volume))
    preferencesRef.current.volume = safeVolume
    preferencesRef.current.muted = safeVolume === 0
    const element = videoRef.current
    if (element) {
      element.volume = safeVolume
      element.muted = safeVolume === 0
    }
    dispatch({ type: 'SET_VOLUME', volume: safeVolume })
    dispatch({ type: 'SET_MUTED', muted: safeVolume === 0 })
  }, [])

  const toggleMute = useCallback((): void => {
    const element = videoRef.current
    const nextMuted = element ? !element.muted : !stateRef.current.muted
    preferencesRef.current.muted = nextMuted
    if (element) {
      element.muted = nextMuted
      if (!nextMuted && element.volume === 0) {
        element.volume = 0.5
        preferencesRef.current.volume = 0.5
        dispatch({ type: 'SET_VOLUME', volume: 0.5 })
      }
    }
    dispatch({ type: 'SET_MUTED', muted: nextMuted })
  }, [])

  const selectQuality = useCallback((quality: SelectedQuality): void => {
    const player = playerRef.current
    if (!player) return

    if (quality === 'auto') {
      player.configure({ abr: { enabled: true } })
      dispatch({ type: 'SELECT_QUALITY', quality: 'auto' })
      return
    }

    const tracks = player.getVariantTracks() as unknown as Array<
      ShakaVariantLike & { height?: number | null; bandwidth?: number }
    >
    const candidates = tracks.filter((track) => track.height === quality)
    if (candidates.length === 0) return
    const target = candidates.reduce((best, current) =>
      (current.bandwidth ?? 0) > (best.bandwidth ?? 0) ? current : best
    )

    player.configure({ abr: { enabled: false } })
    player.selectVariantTrack(target as never, true, 2)
    dispatch({ type: 'SELECT_QUALITY', quality })
  }, [])

  const retry = useCallback((): void => {
    lastPositionRef.current = videoRef.current?.currentTime ?? lastPositionRef.current
    dispatch({ type: 'RETRY' })
    setAttempt((value) => value + 1)
  }, [])

  return {
    videoRef,
    state,
    togglePlay,
    seekTo,
    seekBy,
    setRate,
    setVolume,
    toggleMute,
    selectQuality,
    retry
  }
}