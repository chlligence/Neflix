export type PlatformName = 'win32' | 'darwin' | 'linux'

export type MenuAction =
  | 'play-pause'
  | 'seek-backward'
  | 'seek-forward'
  | 'back'
  | 'toggle-fullscreen'

export interface DesktopApi {
  platform: PlatformName
  versions: {
    electron: string
    chrome: string
  }
  isFullScreen: () => Promise<boolean>
  toggleFullScreen: () => Promise<boolean>
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => () => void
  onMenuAction: (callback: (action: MenuAction) => void) => () => void
  clearMediaCache: () => Promise<void>
  openExternal: (url: string) => Promise<void>
}

export const IPC_CHANNELS = {
  toggleFullScreen: 'window:toggle-fullscreen',
  isFullScreen: 'window:is-fullscreen',
  fullScreenChanged: 'window:fullscreen-changed',
  menuAction: 'menu:action',
  clearMediaCache: 'media:clear-cache',
  openExternal: 'shell:open-external'
} as const