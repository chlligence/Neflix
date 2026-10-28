import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { app, Menu } from 'electron'
import { IPC_CHANNELS, type MenuAction } from '../shared/desktop-api'

function sendAction(getWindow: () => BrowserWindow | null, action: MenuAction): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.menuAction, action)
  }
}

export function createApplicationMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin'
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = []
  const action = (label: string, accelerator: string, menuAction: MenuAction) => ({
    label,
    accelerator,
    click: () => sendAction(getWindow, menuAction)
  })
  const toggleFullScreen = (): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.setFullScreen(!window.isFullScreen())
    }
  }

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: `关于 ${app.name}` },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${app.name}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${app.name}` }
      ]
    })
  }

  template.push(
    {
      label: '文件',
      submenu: [
        { role: 'close', label: '关闭窗口', accelerator: 'CommandOrControl+W' },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              { role: 'quit' as const, label: '退出', accelerator: 'Alt+F4' }
            ])
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '播放',
      submenu: [
        action('播放 / 暂停', 'Space', 'play-pause'),
        action(
          '后退 10 秒',
          isMac ? 'CommandOrControl+Shift+Left' : 'Ctrl+Shift+Left',
          'seek-backward'
        ),
        action(
          '前进 10 秒',
          isMac ? 'CommandOrControl+Shift+Right' : 'Ctrl+Shift+Right',
          'seek-forward'
        ),
        { type: 'separator' },
        action('返回片库', isMac ? 'CommandOrControl+[' : 'Alt+Left', 'back')
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '全屏', accelerator: isMac ? 'Control+Command+F' : 'F11', click: toggleFullScreen },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        ...(isDev
          ? ([
              { type: 'separator' as const },
              { role: 'reload' as const, label: '重新加载' },
              { role: 'toggleDevTools' as const, label: '开发者工具' }
            ])
          : [])
      ]
    },
    {
      label: '窗口',
      submenu: isMac
        ? [
            { role: 'minimize', label: '最小化' },
            { role: 'zoom', label: '缩放' },
            { type: 'separator' },
            { role: 'front', label: '前置全部窗口' }
          ]
        : [
            { role: 'minimize', label: '最小化' },
            { role: 'close', label: '关闭' }
          ]
    }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}