import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appConfig } from '../data/config'
import { createVideoRepository } from '../data/repository'
import { AppError, type VideoItem, type VideoRepository } from '../data/types'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { Icon } from './Icon'
import { VideoCard } from './VideoCard'

interface LibraryPageProps {
  onPlay: (video: VideoItem) => void
}

interface RepositoryState {
  repository: VideoRepository | null
  error: string | null
}

const SKELETON_ITEMS = [0, 1, 2, 3]

export function LibraryPage({ onPlay }: LibraryPageProps): React.JSX.Element {
  const online = useOnlineStatus()
  const [items, setItems] = useState<VideoItem[]>([])
  const [total, setTotal] = useState(0)
  const [nextPage, setNextPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadingRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const repositoryState = useMemo<RepositoryState>(() => {
    try {
      return { repository: createVideoRepository(appConfig), error: null }
    } catch (caught) {
      return {
        repository: null,
        error:
          caught instanceof AppError
            ? caught.userMessage
            : '视频清单服务配置失败，请检查环境变量。'
      }
    }
  }, [])

  const loadPage = useCallback(
    async (page: number): Promise<void> => {
      const repository = repositoryState.repository
      if (!repository || loadingRef.current) return

      loadingRef.current = true
      setLoading(true)
      setError(null)

      const controller = new AbortController()
      controllerRef.current = controller

      try {
        const result = await repository.listVideos({
          page,
          pageSize: appConfig.pageSize,
          signal: controller.signal
        })
        if (controller.signal.aborted) return

        setItems((previous) => {
          const merged = page === 1 ? [] : [...previous]
          const existingIds = new Set(merged.map((item) => item.id))
          for (const item of result.items) {
            if (!existingIds.has(item.id)) {
              merged.push(item)
              existingIds.add(item.id)
            }
          }
          return merged
        })
        setTotal(result.total)
        setNextPage(page + 1)
        setHasMore(result.hasMore)
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(
          caught instanceof AppError
            ? caught.userMessage
            : '视频清单加载失败，请稍后重试。'
        )
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null
          loadingRef.current = false
          setLoading(false)
        }
      }
    },
    [repositoryState.repository]
  )

  useEffect(() => {
    void loadPage(1)
    return () => {
      controllerRef.current?.abort()
    }
  }, [loadPage])

  useEffect(() => {
    if (!hasMore || loading || error || !repositoryState.repository) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadPage(nextPage)
        }
      },
      { rootMargin: '0px 0px -160px 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, error, nextPage, loadPage, repositoryState.repository])

  const retry = (): void => {
    void loadPage(items.length === 0 ? 1 : nextPage)
  }

  const fullError = repositoryState.error ?? (items.length === 0 ? error : null)
  const inlineError = items.length > 0 ? error : null

  return (
    <div className="library">
      <header className="library-header">
        <div className="brand-row">
          <div className="brand" aria-label="Neflix Desktop">
            <span className="brand-mark">N</span>
            <span className="brand-name">NEFLIX</span>
            <span className="brand-caption">DESKTOP CINEMA</span>
          </div>

          <div className="header-status">
            {appConfig.demoMode ? <span className="demo-badge">演示片源</span> : null}
            <span className={`connection-status ${online ? 'is-online' : 'is-offline'}`}>
              <Icon name={online ? 'wifi' : 'wifi-off'} size={16} />
              {online ? '在线' : '网络已断开'}
            </span>
          </div>
        </div>

        <div className="hero">
          <div className="hero-kicker">
            <span className="kicker-line" />
            NEFLIX LIBRARY / 在线片库
          </div>
          <h1>
            随时开始，
            <span>无缝续播。</span>
          </h1>
          <p>
            HLS / DASH 自适应流媒体 · 分页加载片库 · 只在播放期间进行临时内存缓冲
          </p>
        </div>
      </header>

      <main className="library-main">
        <div className="section-head">
          <div>
            <h2>影片库</h2>
            <p>逐页从清单接口获取内容，不一次性加载全部视频。</p>
          </div>
          <span className="library-count">
            {total > 0 ? `已加载 ${items.length} / ${total}` : '正在读取片库'}
          </span>
        </div>

        {fullError ? (
          <div className="state-panel" role="alert">
            <span className="state-icon">
              <Icon name="alert" size={26} />
            </span>
            <h3>{repositoryState.error ? '片库配置未完成' : '片库暂时无法加载'}</h3>
            <p>{fullError}</p>
            {repositoryState.error ? (
              <div className="config-hint">
                <code>VITE_VIDEO_MANIFEST_URL</code>
                <code>VITE_CDN_BASE_URL</code>
                <code>VITE_DEMO_MODE</code>
              </div>
            ) : (
              <button type="button" className="primary-button" onClick={retry}>
                <Icon name="retry" size={18} />
                重新加载
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="video-grid">
              {items.map((video, index) => (
                <VideoCard key={video.id} video={video} index={index} onPlay={onPlay} />
              ))}
              {loading && items.length === 0
                ? SKELETON_ITEMS.map((item) => (
                    <div className="video-card skeleton-card" key={`skeleton-${item}`}>
                      <span className="skeleton-cover shimmer" />
                      <span className="skeleton-body">
                        <span className="skeleton-line shimmer" />
                        <span className="skeleton-line short shimmer" />
                      </span>
                    </div>
                  ))
                : null}
            </div>

            {inlineError ? (
              <div className="inline-error" role="alert">
                <span>{inlineError}</span>
                <button type="button" className="text-button" onClick={retry}>
                  重试
                </button>
              </div>
            ) : null}

            {!loading && items.length === 0 && !error ? (
              <div className="state-panel">
                <h3>片库还是空的</h3>
                <p>请确认视频清单接口返回了有效分页数据。</p>
              </div>
            ) : null}

            <div ref={sentinelRef} className="load-sentinel" aria-hidden="true" />

            <div className="load-more-row">
              {loading && items.length > 0 ? (
                <span className="loading-inline">
                  <span className="spinner small" />
                  正在加载更多
                </span>
              ) : hasMore && !inlineError ? (
                <button type="button" className="ghost-button" onClick={() => void loadPage(nextPage)}>
                  加载更多
                </button>
              ) : items.length > 0 ? (
                <span className="end-of-library">已到达片库末尾</span>
              ) : null}
            </div>
          </>
        )}
      </main>

      <footer className="library-footer">
        <span>仅在线播放 · 不提供下载 / 离线缓存</span>
        <span className="footer-separator" />
        <span>退出播放后释放临时视频缓冲</span>
        <span className="footer-spacer" />
        <span>{appConfig.demoMode ? 'Demo catalog' : 'Connected catalog'}</span>
      </footer>
    </div>
  )
}