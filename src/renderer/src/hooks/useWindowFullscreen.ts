import { useCallback, useEffect, useState } from 'react'

function getDesktopApi(): Window['desktop'] {
  return typeof window === 'undefined' ? undefined : window.desktop
}

export function useWindowFullscreen(): {
  isFullscreen: boolean
  toggleFullscreen: () => Promise<void>
  exitFullscreen: () => Promise<void>
} {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const desktop = getDesktopApi()
    if (desktop) {
      void desktop.isFullScreen().then(setIsFullscreen)
      return desktop.onFullScreenChange(setIsFullscreen)
    }

    const onChange = (): void => setIsFullscreen(Boolean(document.fullscreenElement))
    onChange()
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    const desktop = getDesktopApi()
    if (desktop) {
      const next = await desktop.toggleFullScreen()
      setIsFullscreen(next)
      return
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
  }, [])

  const exitFullscreen = useCallback(async (): Promise<void> => {
    const desktop = getDesktopApi()
    if (desktop) {
      if (isFullscreen) {
        await desktop.toggleFullScreen()
        setIsFullscreen(false)
      }
      return
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [isFullscreen])

  return { isFullscreen, toggleFullscreen, exitFullscreen }
}