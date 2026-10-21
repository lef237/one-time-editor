import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

process.env.DIST = path.join(__dirname, '../dist')
const appPagePath = path.join(process.env.DIST, 'index.html')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let menuBarEnabled = false
let currentText = ''
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// Config and history file paths
const configPath = path.join(app.getPath('userData'), 'config.json')
const historyPath = path.join(app.getPath('userData'), 'history.json')

const defaultMod = 'Control'
const defaultNewShortcut = `${defaultMod}+T`
const defaultCopyShortcut = `${defaultMod}+Shift+C`

const shortcutValidator = /^(Command|Control|Alt|Shift|Meta|Super)(\+(Command|Control|Alt|Shift|Meta|Super))*\+[A-Za-z0-9]$/

interface Config {
  shortcut: string
  newShortcut: string
  copyShortcut: string
  alwaysOnTop: boolean
  indentType: 'space' | 'tab'
  indentSize: number
  showWhitespace: boolean
  showInMenuBar: boolean
}

interface HistoryEntry {
  id: string
  text: string
  createdAt: string
}

function loadConfig(): Config {
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return {
        shortcut: saved.shortcut || `${defaultMod}+J`,
        newShortcut: typeof saved.newShortcut === 'string' && shortcutValidator.test(saved.newShortcut)
          ? saved.newShortcut
          : defaultNewShortcut,
        copyShortcut: typeof saved.copyShortcut === 'string' && shortcutValidator.test(saved.copyShortcut)
          ? saved.copyShortcut
          : defaultCopyShortcut,
        alwaysOnTop: saved.alwaysOnTop === true,
        indentType: saved.indentType === 'tab' ? 'tab' : 'space',
        indentSize: [2, 4, 6, 8].includes(Number(saved.indentSize)) ? Number(saved.indentSize) : 2,
        showWhitespace: saved.showWhitespace === true,
        showInMenuBar: saved.showInMenuBar === true,
      }
    }
  } catch {}
  return {
    shortcut: `${defaultMod}+J`,
    newShortcut: defaultNewShortcut,
    copyShortcut: defaultCopyShortcut,
    alwaysOnTop: false,
    indentType: 'space',
    indentSize: 2,
    showWhitespace: false,
    showInMenuBar: false,
  }
}

function saveConfig(config: Config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

function loadHistory(): HistoryEntry[] {
  try {
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
    }
  } catch {}
  return []
}

function saveHistory(history: HistoryEntry[]) {
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))
}

// Only the app's own page may navigate the window or call into the main process.
// A dropped file or link would otherwise load with the preload API attached.
function isAppURL(url: string | undefined) {
  if (!url) return false
  try {
    if (VITE_DEV_SERVER_URL) return new URL(url).origin === new URL(VITE_DEV_SERVER_URL).origin
    return fileURLToPath(url) === appPagePath
  } catch {
    return false
  }
}

function handleFromApp(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAppURL(event.senderFrame?.url)) throw new Error(`Rejected ${channel} from an untrusted page`)
    return listener(event, ...args)
  })
}

function createWindow(config: Config) {
  win = new BrowserWindow({
    width: 700,
    height: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    frame: false,
    show: false,
    skipTaskbar: false,
    alwaysOnTop: config.alwaysOnTop,
  })

  win.on('ready-to-show', () => {
    win?.show()
    win?.focus()
  })


  win.on('close', (event) => {
    if (menuBarEnabled && !isQuitting) {
      event.preventDefault()
      copyText()
      win?.hide()
      return
    }
    copyText()
    if (!isQuitting) saveCurrentTextToHistory()
  })

  win.on('closed', () => {
    win = null
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(appPagePath)
  }
}

function toggleWindow() {
  if (!win) {
    createWindow(loadConfig())
    return
  }
  if (win.isMinimized()) {
    win.restore()
    win.show()
    win.focus()
    return
  }
  if (win.isVisible()) {
    copyText()
    if (process.platform === 'darwin') {
      app.hide()
    } else {
      win.hide()
    }
  } else {
    win.show()
    win.focus()
  }
}

function copyText() {
  if (currentText.trim()) {
    // Resolves asynchronously, but the text is committed before it returns,
    // so quitting right after a copy keeps it on the clipboard.
    clipboard.writeText(currentText)
  }
}

function saveCurrentTextToHistory() {
  if (!currentText.trim()) return
  const history = loadHistory()
  const entry: HistoryEntry = {
    id: Date.now().toString(),
    text: currentText,
    createdAt: new Date().toISOString(),
  }
  history.unshift(entry)
  if (history.length > 100) {
    history.splice(100)
  }
  saveHistory(history)
}

function registerShortcut(config: Config) {
  globalShortcut.unregisterAll()
  try {
    globalShortcut.register(config.shortcut, toggleWindow)
  } catch {
    globalShortcut.register(`${defaultMod}+J`, toggleWindow)
  }
}

function createMenuBar() {
  if (tray) return
  // A monochrome template lets macOS adapt the icon to light/dark menu bars.
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAVUlEQVR4nO2TyQkAMAzDsv/S7QiF1iZHJchX6OFEAHhZppsXpIIgu4+gG8HLR/0RlOojyC5Q+1qMulxQqo8gu0DtazHqckGpPoLsArWvbJD65gQBnNj8Hv8BB9uGHwAAAABJRU5ErkJggg==').resize({ width: 18, height: 18 })
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('One-Time Editor')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / Hide Editor', click: toggleWindow },
    { type: 'separator' },
    { label: 'Quit One-Time Editor', click: () => app.quit() },
  ]))
  app.dock?.hide()
}

function applyMenuBarPreference(enabled: boolean) {
  menuBarEnabled = process.platform === 'darwin' && enabled
  if (process.platform !== 'darwin') return
  if (menuBarEnabled) {
    createMenuBar()
  } else {
    tray?.destroy()
    tray = null
    app.dock?.show()
  }
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAppURL(url)) event.preventDefault()
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})

app.whenReady().then(() => {
  const config = loadConfig()
  applyMenuBarPreference(config.showInMenuBar)
  createWindow(config)
  registerShortcut(config)

  // IPC handlers
  handleFromApp('get-history', () => {
    return loadHistory()
  })

  handleFromApp('save-to-history', (_event, text: string) => {
    if (!text.trim()) return loadHistory()
    const history = loadHistory()
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      text,
      createdAt: new Date().toISOString(),
    }
    history.unshift(entry)
    // Keep up to 100 entries
    if (history.length > 100) {
      history.splice(100)
    }
    saveHistory(history)
    return history
  })

  handleFromApp('delete-history-entry', (_event, id: string) => {
    let history = loadHistory()
    history = history.filter(h => h.id !== id)
    saveHistory(history)
    return history
  })

  handleFromApp('copy-to-clipboard', (_event, text: string) => {
    return clipboard.writeText(text)
  })

  handleFromApp('sync-text', (_event, text: string) => {
    currentText = text
  })

  handleFromApp('get-config', () => {
    return loadConfig()
  })

  handleFromApp('set-shortcut', (_event, shortcut: string) => {
    if (!shortcutValidator.test(shortcut)) return false
    const config = loadConfig()
    config.shortcut = shortcut
    saveConfig(config)
    registerShortcut(config)
    return true
  })

  handleFromApp('set-local-shortcut', (_event, name: string, shortcut: string) => {
    if (name !== 'new' && name !== 'copy') return false
    if (!shortcutValidator.test(shortcut)) return false
    const config = loadConfig()
    if (name === 'new') {
      config.newShortcut = shortcut
    } else {
      config.copyShortcut = shortcut
    }
    saveConfig(config)
    return true
  })

  handleFromApp('set-always-on-top', (_event, alwaysOnTop: boolean) => {
    const config = loadConfig()
    config.alwaysOnTop = alwaysOnTop === true
    saveConfig(config)
    win?.setAlwaysOnTop(config.alwaysOnTop)
    return config.alwaysOnTop
  })

  handleFromApp('set-indent', (_event, indentType: string, indentSize: number) => {
    const config = loadConfig()
    config.indentType = indentType === 'tab' ? 'tab' : 'space'
    config.indentSize = [2, 4, 6, 8].includes(indentSize) ? indentSize : 2
    saveConfig(config)
  })

  handleFromApp('set-show-whitespace', (_event, showWhitespace: boolean) => {
    const config = loadConfig()
    config.showWhitespace = showWhitespace === true
    saveConfig(config)
    return config.showWhitespace
  })

  handleFromApp('set-show-in-menu-bar', (_event, showInMenuBar: boolean) => {
    const config = loadConfig()
    config.showInMenuBar = showInMenuBar === true
    saveConfig(config)
    applyMenuBarPreference(config.showInMenuBar)
    return config.showInMenuBar
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!win) {
    createWindow(loadConfig())
  } else {
    win.show()
    win.focus()
  }
})

app.on('will-quit', () => {
  saveCurrentTextToHistory()
  globalShortcut.unregisterAll()
  tray?.destroy()
  tray = null
})
