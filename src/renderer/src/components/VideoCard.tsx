import type { VideoItem } from '../data/types'
import { formatPlaybackTime } from '../utils/format'
import { Icon } from './Icon'

interface VideoCardProps {
  video: VideoItem
  index: number
  onPlay: (video: VideoItem) => void
}

function sourceLabel(video: VideoItem): string {
  const types = new Set(
    video.sources
      .map((source) => source.type)
      .filter((type): type is 'hls' | 'dash' => type === 'hls' || type === 'dash')
  )
  if (types.size > 1) return 'HLS + DASH'
  if (types.has('dash')) return 'DASH'
  if (types.has('hls')) return 'HLS'
  return '未知格式'
}

export function VideoCard({ video, index, onPlay }: VideoCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="video-card"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
      onClick={() => onPlay(video)}
      aria-label={`播放 ${video.title}`}
    >
      <span className="video-cover">
        {video.cover ? (
          <img
            src={video.cover}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
        <span className="cover-shade" />
        <span className="cover-play">
          <Icon name="play" size={26} />
        </span>
        <span className="cover-duration">{formatPlaybackTime(video.durationSeconds)}</span>
        <span className="cover-source">{sourceLabel(video)}</span>
      </span>

      <span className="video-card-body">
        <span className="video-title-row">
          <span className="video-title">{video.title}</span>
          {video.year ? <span className="video-year">{video.year}</span> : null}
        </span>
        <span className="video-description">{video.description}</span>
        <span className="video-meta">
          {video.qualities.length > 0 ? (
            video.qualities.slice(0, 3).map((quality) => (
              <span className="quality-pill" key={quality}>
                {quality}
              </span>
            ))
          ) : (
            <span className="quality-pill">自动清晰度</span>
          )}
          {video.tags.slice(0, 2).map((tag) => (
            <span className="tag-pill" key={tag}>
              {tag}
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}