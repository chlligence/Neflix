import type { PlaybackError } from './playbackErrors'

export type PlaybackPhase =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'error'

export type SelectedQuality = 'auto' | number

export interface QualityOption {
  height: number
  label: string
  bandwidth: number
}

export interface PlaybackState {
  phase: PlaybackPhase
  currentTime: number
  duration: number
  bufferedEnd: number
  playbackRate: number
  volume: number
  muted: boolean
  qualities: QualityOption[]
  selectedQuality: SelectedQuality
  activeHeight: number | null
  activeBandwidth: number | null
  error: PlaybackError | null
  retryCount: number
}

export type PlaybackAction =
  | { type: 'LOAD_START' }
  | { type: 'READY'; duration: number }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TIME_UPDATE'; currentTime: number; duration?: number; bufferedEnd?: number }
  | { type: 'BUFFERING_START' }
  | { type: 'BUFFERING_END'; playing: boolean }
  | { type: 'ENDED' }
  | { type: 'SET_RATE'; rate: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'SET_QUALITIES'; qualities: QualityOption[]; activeHeight?: number | null; activeBandwidth?: number | null }
  | { type: 'SELECT_QUALITY'; quality: SelectedQuality }
  | { type: 'SEEK'; currentTime: number }
  | { type: 'FAIL'; error: PlaybackError }
  | { type: 'RETRY' }
  | { type: 'RESET' }

export const initialPlaybackState: PlaybackState = {
  phase: 'loading',
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
  playbackRate: 1,
  volume: 1,
  muted: false,
  qualities: [],
  selectedQuality: 'auto',
  activeHeight: null,
  activeBandwidth: null,
  error: null,
  retryCount: 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isFiniteNonNegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case 'LOAD_START':
      return {
        ...state,
        phase: 'loading',
        error: null,
        bufferedEnd: 0
      }

    case 'READY': {
      const duration = Number.isFinite(action.duration) && action.duration > 0 ? action.duration : 0
      return {
        ...state,
        phase: 'ready',
        duration,
        currentTime: duration > 0 ? clamp(state.currentTime, 0, duration) : state.currentTime,
        error: null
      }
    }

    case 'PLAY':
      if (state.phase === 'error') return state
      return {
        ...state,
        phase: 'playing',
        currentTime: state.phase === 'ended' ? 0 : state.currentTime
      }

    case 'PAUSE':
      if (state.phase === 'error' || state.phase === 'ended') return state
      return {
        ...state,
        phase: 'paused'
      }

    case 'TIME_UPDATE': {
      if (state.phase === 'error') return state
      const duration = isFiniteNonNegative(action.duration) ? action.duration : state.duration
      const currentTime =
        isFiniteNonNegative(action.currentTime) && duration > 0
          ? clamp(action.currentTime, 0, duration)
          : isFiniteNonNegative(action.currentTime)
            ? action.currentTime
            : state.currentTime
      const bufferedEnd = isFiniteNonNegative(action.bufferedEnd)
        ? action.bufferedEnd
        : state.bufferedEnd
      return {
        ...state,
        currentTime,
        duration: duration > 0 ? duration : state.duration,
        bufferedEnd: Math.max(bufferedEnd, state.bufferedEnd, currentTime)
      }
    }

    case 'BUFFERING_START':
      if (state.phase === 'error' || state.phase === 'ended' || state.phase === 'loading') {
        return state
      }
      return { ...state, phase: 'buffering' }

    case 'BUFFERING_END':
      if (state.phase === 'error' || state.phase === 'ended') return state
      return {
        ...state,
        phase: action.playing ? 'playing' : state.phase === 'ready' ? 'ready' : 'paused'
      }

    case 'ENDED':
      return {
        ...state,
        phase: 'ended',
        currentTime: state.duration,
        bufferedEnd: state.duration
      }

    case 'SET_RATE':
      if (!Number.isFinite(action.rate) || action.rate <= 0) return state
      return { ...state, playbackRate: action.rate }

    case 'SET_VOLUME': {
      if (!Number.isFinite(action.volume)) return state
      const volume = clamp(action.volume, 0, 1)
      return {
        ...state,
        volume,
        muted: volume === 0 ? true : false
      }
    }

    case 'SET_MUTED':
      return { ...state, muted: action.muted }

    case 'SET_QUALITIES': {
      const qualities = [...action.qualities].sort((a, b) => b.height - a.height)
      const selectedQuality =
        state.selectedQuality !== 'auto' &&
        !qualities.some((quality) => quality.height === state.selectedQuality)
          ? 'auto'
          : state.selectedQuality
      return {
        ...state,
        qualities,
        selectedQuality,
        activeHeight:
          action.activeHeight === undefined ? state.activeHeight : action.activeHeight,
        activeBandwidth:
          action.activeBandwidth === undefined
            ? state.activeBandwidth
            : action.activeBandwidth
      }
    }

    case 'SELECT_QUALITY':
      return {
        ...state,
        selectedQuality: action.quality,
        activeHeight: action.quality === 'auto' ? state.activeHeight : action.quality
      }

    case 'SEEK': {
      if (!Number.isFinite(action.currentTime)) return state
      const target =
        state.duration > 0
          ? clamp(action.currentTime, 0, state.duration)
          : Math.max(0, action.currentTime)
      return {
        ...state,
        currentTime: target,
        bufferedEnd: Math.max(state.bufferedEnd, target),
        phase: state.phase === 'ended' ? 'paused' : state.phase
      }
    }

    case 'FAIL':
      return {
        ...state,
        phase: 'error',
        error: action.error
      }

    case 'RETRY':
      return {
        ...state,
        phase: 'loading',
        error: null,
        retryCount: state.retryCount + 1
      }

    case 'RESET':
      return { ...initialPlaybackState }

    default:
      return state
  }
}

export function isPlaybackActive(state: PlaybackState): boolean {
  return state.phase === 'playing' || state.phase === 'buffering'
}

export function formatQualityLabel(height: number, bandwidth?: number): string {
  const resolution = height > 0 ? `${height}p` : '未知清晰度'
  if (!bandwidth || !Number.isFinite(bandwidth)) return resolution
  const mbps = bandwidth / 1_000_000
  return `${resolution} · ${mbps >= 1 ? `${mbps.toFixed(1)} Mbps` : `${Math.round(bandwidth / 1000)} Kbps`}`
}