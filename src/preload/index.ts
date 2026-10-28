import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type DesktopApi,
  type MenuAction,
  type PlatformName
} from '../shared/desktop-api'

const desktopApi: DesktopApi = {
  platform: process.platform as PlatformName,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome
  },
  isFullScreen: () => ipcRenderer.invoke(IPC_CHANNELS.isFullScreen),
  toggleFullScreen: () => ipcRenderer.invoke(IPC_CHANNELS.toggleFullScreen),
  onFullScreenChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, isFullScreen: boolean): void => {
      callback(isFullScreen)
    }
    ipcRenderer.on(IPC_CHANNELS.fullScreenChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.fullScreenChanged, listener)
    }
  },
  onMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => {
      callback(action)
    }
    ipcRenderer.on(IPC_CHANNELS.menuAction, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.menuAction, listener)
    }
  },
  clearMediaCache: () => ipcRenderer.invoke(IPC_CHANNELS.clearMediaCache),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url)
}

contextBridge.exposeInMainWorld('desktop', desktopApi)