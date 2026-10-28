import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appConfig } from '../data/config'
import { progressStore } from '../data/progressStore'
import type { VideoItem } from '../data/types'
import { useWindowFullscreen } from '../hooks/useWindowFullscreen'
import { chooseSource } from '../playback/source'
import { useShakaPlayback } from '../playback/useShakaPlayback'
import { formatPlaybackTime } from '../utils/format'
import { Icon } from './Icon'

interface PlayerPageProps {
  video: VideoItem
  onClose: () => void
}

type OpenMenu = 'quality' | 'speed' | null

export function PlayerPage({ video, onClose }: PlayerPageProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const clickTimerRef = useRef<number | null>(null)

  const initialProgress = useMemo(() => progressStore.get(video.id), [video.id])
  const startPosition = initialProgress?.position ?? 0
  const progressRef = useRef({
    position: startPosition,
    duration: video.durationSeconds
  })

  const handlePositionChange = useCallback((position: number, duration: number): void => {
    progressRef.current = {
      position,
      duration: duration > 0 ? duration : progressRef.current.duration
    }
  }, [])

  const {
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
  } = useShakaPlayback({
    video,
    startPosition,
    config: appConfig,
    onPositionChange: handlePositionChange
  })

  const { isFullscreen, toggleFullscreen, exitFullscreen } = useWindowFullscreen()

  const [menu, setMenu] = useState<OpenMenu>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [activity, setActivity] = useState(0)
  const [pointerOverControls, setPointerOverControls] = useState(false)
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [resumeNotice, setResumeNotice] = useState<string | null>(null)
  const resumeNoticeShownRef = useRef(false)
  const lastWakeRef = useRef(0)

  const source = chooseSource(video, appConfig.preferredFormat)
  const sourceLabel = source?.type === 'dash' ? 'DASH' : source?.type === 'hls' ? 'HLS' : '未知格式'
  const isIdle = state.phase === 'playing' && !controlsVisible

  const wakeControls = useCallback((): void => {
    const now = performance.now()
    if (now - lastWakeRef.current < 120) return
    lastWakeRef.current = now
    setActivity((value) => value + 1)
  }, [])

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    containerRef.current?.focus()
    return () => {
      previouslyFocusedRef.current?.focus?.()
    }
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${video.title} · Neflix`
    return () => {
      document.title = previousTitle
    }
  }, [video.title])

  useEffect(() => {
    const save = (): void => {
      progressStore.save(
        video.id,
        progressRef.current.position,
        progressRef.current.duration
      )
    }
    const interval = window.setInterval(save, appConfig.progressSaveIntervalMs)
    window.addEventListener('beforeunload', save)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('beforeunload', save)
      save()
      void window.desktop?.clearMediaCache().catch(() => undefined)
    }
  }, [video.id])

  useEffect(() => {
    if (
      resumeNoticeShownRef.current ||
      !initialProgress ||
      (state.phase !== 'ready' && state.phase !== 'playing' && state.phase !== 'buffering')
    ) {
      return
    }
    resumeNoticeShownRef.current = true
    setResumeNotice(`已从 ${formatPlaybackTime(initialProgress.position)} 继续播放`)
  }, [initialProgress, state.phase])

  useEffect(() => {
    if (!resumeNotice) return
    const timer = window.setTimeout(() => setResumeNotice(null), 3600)
    return () => window.clearTimeout(timer)
  }, [resumeNotice])

  useEffect(() => {
    setControlsVisible(true)
    if (state.phase !== 'playing' || menu || pointerOverControls) {
      return
    }
    const timer = window.setTimeout(() => setControlsVisible(false), 3000)
    return () => window.clearTimeout(timer)
  }, [state.phase, menu, pointerOverControls, activity])

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [menu])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  const handleBack = useCallback(async (): Promise<void> => {
    await exitFullscreen()
    onClose()
  }, [exitFullscreen, onClose])

  const retryPlayback = (): void => {
    setMenu(null)
    retry()
  }

  const replay = (): void => {
    seekTo(0)
    togglePlay()
  }

  useEffect(() => {
    const desktop = window.desktop
    if (!desktop) return
    return desktop.onMenuAction((action) => {
      switch (action) {
        case 'play-pause':
          togglePlay()
          break
        case 'seek-backward':
          seekBy(-10)
          break
        case 'seek-forward':
          seekBy(10)
          break
        case 'back':
          void handleBack()
          break
        case 'toggle-fullscreen':
          void toggleFullscreen()
          break
      }
    })
  }, [togglePlay, seekBy, handleBack, toggleFullscreen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Escape') {
        if (menu) {
          setMenu(null)
          event.preventDefault()
        } else if (isFullscreen) {
          void exitFullscreen()
          event.preventDefault()
        } else {
          void handleBack()
          event.preventDefault()
        }
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === ' ' && target?.closest('button')) return

      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          if (event.repeat) return
          togglePlay()
          event.preventDefault()
          wakeControls()
          break
        case 'ArrowLeft':
          seekBy(-10)
          event.preventDefault()
          wakeControls()
          break
        case 'ArrowRight':
          seekBy(10)
          event.preventDefault()
          wakeControls()
          break
        case 'j':
        case 'J':
          seekBy(-10)
          event.preventDefault()
          break
        case 'l':
        case 'L':
          seekBy(10)
          event.preventDefault()
          break
        case 'ArrowUp': {
          const current = videoRef.current?.volume ?? state.volume
          setVolume(current + 0.05)
          event.preventDefault()
          wakeControls()
          break
        }
        case 'ArrowDown': {
          const current = videoRef.current?.volume ?? state.volume
          setVolume(current - 0.05)
          event.preventDefault()
          wakeControls()
          break
        }
        case 'm':
        case 'M':
          toggleMute()
          event.preventDefault()
          wakeControls()
          break
        case 'f':
        case 'F':
          void toggleFullscreen()
          event.preventDefault()
          wakeControls()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    menu,
    isFullscreen,
    exitFullscreen,
    handleBack,
    togglePlay,
    seekBy,
    setVolume,
    toggleMute,
    toggleFullscreen,
    videoRef,
    state.volume,
    wakeControls
  ])

  const handleStageClick = (): void => {
    if (menu) {
      setMenu(null)
      return
    }
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      void toggleFullscreen()
      return
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      togglePlay()
    }, 220)
  }

  const commitSeek = (): void => {
    if (scrubTime === null) return
    seekTo(scrubTime)
    setScrubTime(null)
  }

  const displayedTime = scrubTime ?? state.currentTime
  const duration = state.duration > 0 ? state.duration : video.durationSeconds
  const progressPercent = duration > 0 ? Math.min(100, (displayedTime / duration) * 100) : 0
  const bufferedPercent =
    duration > 0 ? Math.min(100, (state.bufferedEnd / duration) * 100) : 0
  const qualityLabel =
    state.selectedQuality === 'auto'
      ? state.activeHeight
        ? `自动 · ${state.activeHeight}p`
        : '自动'
      : `${state.selectedQuality}p`
  const isMuted = state.muted || state.volume === 0
  const statusText =
    state.phase === 'loading'
      ? '正在加载视频'
      : state.phase === 'buffering'
        ? '正在缓冲'
        : state.phase === 'paused'
          ? '已暂停'
          : state.phase === 'ended'
            ? '播放结束'
            : state.phase === 'error'
              ? state.error?.title ?? '播放失败'
              : state.phase === 'playing'
                ? '正在播放'
                : '准备播放'

  return (
    <div
      ref={containerRef}
      className={`player ${isFullscreen ? 'is-fullscreen' : ''} ${
        isIdle ? 'is-idle' : ''
      }`}
      tabIndex={-1}
      onPointerMove={wakeControls}
      role="region"
      aria-label={`正在播放 ${video.title}`}
    >
      <div className="player-backdrop" aria-hidden="true" />
      <div className="player-stage" onClick={handleStageClick}>
        <video
          ref={videoRef}
          className="player-video"
          playsInline
          preload="metadata"
          aria-label={video.title}
        />

        {state.phase === 'loading' ? (
          <div className="player-loading">
            <span className="spinner large" />
            <span>正在加载视频…</span>
          </div>
        ) : null}

        {state.phase === 'buffering' ? (
          <div className="player-buffering">
            <span className="spinner" />
            <span>正在缓冲…</span>
          </div>
        ) : null}

        {(state.phase === 'paused' || state.phase === 'ready') && !state.error ? (
          <button
            type="button"
            className="center-play"
            onClick={(event) => {
              event.stopPropagation()
              togglePlay()
            }}
            aria-label="播放"
          >
            <Icon name="play" size={38} />
          </button>
        ) : null}

        {state.phase === 'ended' ? (
          <div className="ended-panel" onClick={(event) => event.stopPropagation()}>
            <span className="ended-kicker">THE END</span>
            <h2>{video.title}</h2>
            <p>播放已结束，是否重新观看？</p>
            <button type="button" className="primary-button" onClick={replay}>
              <Icon name="replay" size={18} />
              重新播放
            </button>
          </div>
        ) : null}

        <div className="player-vignette" aria-hidden="true" />
      </div>

      <header className={`player-topbar ${controlsVisible ? '' : 'is-hidden'}`}>
        <div className="player-topbar-left">
          <button
            type="button"
            className="icon-button back-button"
            onClick={() => void handleBack()}
            aria-label="返回片库"
            title="返回片库"
          >
            <Icon name="back" size={24} />
          </button>
          <div className="player-title-block">
            <span className="player-eyebrow">NOW PLAYING / 正在播放</span>
            <h1>{video.title}</h1>
            <span className="player-subtitle">
              {video.year ? `${video.year} · ` : ''}
              {sourceLabel} · {video.qualities[0] ?? '自动清晰度'}
            </span>
          </div>
        </div>
        <div className="player-topbar-right">
          <span className="player-stream-badge">
            <span className="live-dot" />
            {sourceLabel}
          </span>
          <span className="no-cache-note">在线播放 · 不写入视频缓存</span>
        </div>
      </header>

      {resumeNotice ? (
        <div className="resume-toast" role="status">
          <Icon name="spark" size={17} />
          {resumeNotice}
        </div>
      ) : null}

      <div
        className={`player-controls ${controlsVisible ? '' : 'is-hidden'}`}
        onPointerEnter={() => setPointerOverControls(true)}
        onPointerLeave={() => setPointerOverControls(false)}
      >
        <div className="seek-row">
          <span className="timecode">{formatPlaybackTime(displayedTime)}</span>
          <input
            className="seek-slider"
            type="range"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.1}
            value={Math.min(displayedTime, duration > 0 ? duration : 1)}
            onChange={(event) => setScrubTime(Number(event.target.value))}
            onPointerUp={commitSeek}
            onKeyUp={commitSeek}
            onBlur={commitSeek}
            disabled={duration <= 0}
            aria-label="播放进度"
            style={
              {
                '--seek-progress': `${progressPercent}%`,
                '--seek-buffered': `${bufferedPercent}%`
              } as React.CSSProperties
            }
          />
          <span className="timecode total">{formatPlaybackTime(duration)}</span>
        </div>

        <div className="control-row">
          <div className="control-cluster">
            <button
              type="button"
              className="icon-button play-button"
              onClick={togglePlay}
              aria-label={state.phase === 'playing' ? '暂停' : '播放'}
              title={state.phase === 'playing' ? '暂停 (Space)' : '播放 (Space)'}
            >
              <Icon name={state.phase === 'playing' ? 'pause' : 'play'} size={24} />
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={toggleMute}
              aria-label={isMuted ? '取消静音' : '静音'}
              title={isMuted ? '取消静音 (M)' : '静音 (M)'}
            >
              <Icon name={isMuted ? 'mute' : 'volume'} size={21} />
            </button>

            <input
              className="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : state.volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="音量"
              style={
                {
                  '--volume-progress': `${isMuted ? 0 : state.volume * 100}%`
                } as React.CSSProperties
              }
            />

            <span className="playback-status">{statusText}</span>
          </div>

          <div className="control-cluster right" ref={settingsRef}>
            <button
              type="button"
              className={`text-button quality-button ${menu === 'quality' ? 'is-active' : ''}`}
              onClick={() => setMenu((current) => (current === 'quality' ? null : 'quality'))}
              aria-haspopup="menu"
              aria-expanded={menu === 'quality'}
            >
              {qualityLabel}
              <Icon name="chevron-up" size={15} />
            </button>

            <button
              type="button"
              className={`text-button speed-button ${menu === 'speed' ? 'is-active' : ''}`}
              onClick={() => setMenu((current) => (current === 'speed' ? null : 'speed'))}
              aria-haspopup="menu"
              aria-expanded={menu === 'speed'}
            >
              {state.playbackRate === 1 ? '倍速' : `${state.playbackRate}x`}
              <Icon name="chevron-up" size={15} />
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? '退出全屏' : '全屏'}
              title={isFullscreen ? '退出全屏 (F)' : '全屏 (F)'}
            >
              <Icon name={isFullscreen ? 'exit-fullscreen' : 'fullscreen'} size={22} />
            </button>

            {menu === 'quality' ? (
              <div className="settings-menu quality-menu" role="menu" aria-label="播放清晰度">
                <div className="settings-heading">
                  <span>播放清晰度</span>
                  <span className="settings-caption">ABR 自动 / 手动</span>
                </div>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={state.selectedQuality === 'auto'}
                  className={`settings-option ${state.selectedQuality === 'auto' ? 'is-selected' : ''}`}
                  onClick={() => {
                    selectQuality('auto')
                    setMenu(null)
                  }}
                >
                  <span>
                    <strong>自动</strong>
                    <small>
                      {state.activeHeight
                        ? `当前 ${state.activeHeight}p · 根据网络自动切换`
                        : '根据网络状况自动切换清晰度'}
                    </small>
                  </span>
                  {state.selectedQuality === 'auto' ? <Icon name="check" size={17} /> : null}
                </button>
                {state.qualities.length > 0 ? <div className="settings-divider" /> : null}
                {state.qualities.map((quality) => (
                  <button
                    key={quality.height}
                    type="button"
                    role="menuitemradio"
                    aria-checked={
                      state.selectedQuality !== 'auto' &&
                      state.selectedQuality === quality.height
                    }
                    className={`settings-option ${
                      state.selectedQuality !== 'auto' &&
                      state.selectedQuality === quality.height
                        ? 'is-selected'
                        : ''
                    }`}
                    onClick={() => {
                      selectQuality(quality.height)
                      setMenu(null)
                    }}
                  >
                    <span>
                      <strong>{quality.height}p</strong>
                      <small>{quality.label.split(' · ')[1] ?? '视频清晰度'}</small>
                    </span>
                    {state.selectedQuality !== 'auto' &&
                    state.selectedQuality === quality.height ? (
                      <Icon name="check" size={17} />
                    ) : null}
                  </button>
                ))}
                {state.qualities.length === 0 ? (
                  <div className="settings-empty">正在读取清晰度信息…</div>
                ) : null}
              </div>
            ) : null}

            {menu === 'speed' ? (
              <div className="settings-menu speed-menu" role="menu" aria-label="播放倍速">
                <div className="settings-heading">
                  <span>播放倍速</span>
                  <span className="settings-caption">{state.playbackRate}x</span>
                </div>
                {appConfig.playbackRates.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    role="menuitemradio"
                    aria-checked={state.playbackRate === rate}
                    className={`settings-option compact ${
                      state.playbackRate === rate ? 'is-selected' : ''
                    }`}
                    onClick={() => {
                      setRate(rate)
                      setMenu(null)
                    }}
                  >
                    <span>
                      <strong>{rate === 1 ? '正常' : `${rate}x`}</strong>
                      {rate === 1 ? <small>1.0x</small> : null}
                    </span>
                    {state.playbackRate === rate ? <Icon name="check" size={17} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {state.error ? (
        <div className="error-overlay" role="alertdialog" aria-modal="true" aria-labelledby="playback-error-title">
          <div className="error-card">
            <span className="error-icon">
              <Icon name="alert" size={30} />
            </span>
            <span className="error-code">{state.error.code.toUpperCase()}</span>
            <h2 id="playback-error-title">{state.error.title}</h2>
            <p>{state.error.message}</p>
            {state.error.technical ? (
              <details className="error-detail">
                <summary>技术信息</summary>
                <code>{state.error.technical}</code>
              </details>
            ) : null}
            <div className="error-actions">
              <button
                type="button"
                className={state.error.retryable ? 'primary-button' : 'ghost-button'}
                onClick={retryPlayback}
              >
                <Icon name="retry" size={18} />
                重新加载
              </button>
              <button
                type="button"
                className={state.error.retryable ? 'ghost-button' : 'primary-button'}
                onClick={() => void handleBack()}
              >
                <Icon name="back" size={18} />
                返回片库
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {statusText}
      </span>
    </div>
  )
}