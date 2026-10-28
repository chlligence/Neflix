import { useState } from 'react'
import { LibraryPage } from './components/LibraryPage'
import { PlayerPage } from './components/PlayerPage'
import type { VideoItem } from './data/types'

export default function App(): React.JSX.Element {
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null)
  const platform = window.desktop?.platform ?? 'web'

  return (
    <div className={`app platform-${platform} ${activeVideo ? 'has-player' : ''}`}>
      <div
        aria-hidden={activeVideo ? 'true' : undefined}
        inert={activeVideo ? true : undefined}
      >
        <LibraryPage onPlay={setActiveVideo} />
      </div>
      {activeVideo ? (
        <PlayerPage
          key={activeVideo.id}
          video={activeVideo}
          onClose={() => setActiveVideo(null)}
        />
      ) : null}
    </div>
  )
}