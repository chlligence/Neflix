import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
  type WebContents
} from 'electron'
import { IPC_CHANNELS } from '../shared/desktop-api'
import { createApplicationMenu } from './menu'

const isMac = process.platform === 'darwin'
let mainWindow: BrowserWindow | null = null
let isQuitting = false

app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disk-cache-size', '0')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.setAppUserModelId('com.neflix.desktop')
app.setName('Neflix')

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function getWindowForSender(sender: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#08090d',
    title: 'Neflix',
    autoHideMenuBar: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 20, y: 22 }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  const emitFullScreenState = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.fullScreenChanged, window.isFullScreen())
    }
  }
  window.on('enter-full-screen', emitFullScreenState)
  window.on('leave-full-screen', emitFullScreenState)

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
    }
  })

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && window.isFullScreen()) {
      event.preventDefault()
      window.setFullScreen(false)
    }
  })

  window.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

ipcMain.handle(IPC_CHANNELS.toggleFullScreen, (event): boolean => {
  const window = getWindowForSender(event.sender)
  if (!window) return false
  const next = !window.isFullScreen()
  window.setFullScreen(next)
  return next
})

ipcMain.handle(IPC_CHANNELS.isFullScreen, (event): boolean => {
  return getWindowForSender(event.sender)?.isFullScreen() ?? false
})

ipcMain.handle(IPC_CHANNELS.clearMediaCache, async (): Promise<void> => {
  await session.defaultSession.clearCache()
})

ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, url: unknown): Promise<void> => {
  if (typeof url === 'string' && isSafeExternalUrl(url)) {
    await shell.openExternal(url)
  }
})

app.whenReady().then(async () => {
  const defaultSession = session.defaultSession
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  defaultSession.on('will-download', (event) => {
    event.preventDefault()
  })
  await defaultSession.clearCache()

  createApplicationMenu(() => mainWindow)
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, 1500)
  })
  void Promise.race([
    session.defaultSession.clearCache().catch(() => undefined),
    timeout
  ]).finally(() => {
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})