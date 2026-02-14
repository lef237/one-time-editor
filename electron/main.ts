import { app, BrowserWindow, globalShortcut, ipcMain, clipboard } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

process.env.DIST = path.join(__dirname, '../dist')

let win: BrowserWindow | null = null
let currentText = ''
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// Config and history file paths
const configPath = path.join(app.getPath('userData'), 'config.json')
const historyPath = path.join(app.getPath('userData'), 'history.json')

const defaultMod = process.platform === 'darwin' ? 'Command' : 'Control'

interface Config {
  shortcut: string
  copyShortcut: string
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
        copyShortcut: saved.copyShortcut || `${defaultMod}+K`,
      }
    }
  } catch {}
  return { shortcut: `${defaultMod}+J`, copyShortcut: `${defaultMod}+K` }
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

function createWindow() {
  win = new BrowserWindow({
    width: 700,
    height: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    frame: false,
    show: false,
    skipTaskbar: false,
    alwaysOnTop: true,
  })

  win.on('ready-to-show', () => {
    win?.show()
    win?.focus()
  })

  win.on('blur', () => {
    // Hide window on blur
    win?.hide()
  })

  win.on('closed', () => {
    win = null
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

function toggleWindow() {
  if (!win) {
    createWindow()
    return
  }
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}

function copyText() {
  if (currentText.trim()) {
    clipboard.writeText(currentText)
  }
}

const shortcutValidator = /^(Command|Control|Alt|Shift|Meta|Super)(\+(Command|Control|Alt|Shift|Meta|Super))*\+[A-Za-z0-9]$/

function registerShortcuts(config: Config) {
  globalShortcut.unregisterAll()
  try {
    globalShortcut.register(config.shortcut, toggleWindow)
  } catch {
    globalShortcut.register(`${defaultMod}+J`, toggleWindow)
  }
  try {
    globalShortcut.register(config.copyShortcut, copyText)
  } catch {
    globalShortcut.register(`${defaultMod}+K`, copyText)
  }
}

app.whenReady().then(() => {
  const config = loadConfig()
  createWindow()
  registerShortcuts(config)

  // IPC handlers
  ipcMain.handle('get-history', () => {
    return loadHistory()
  })

  ipcMain.handle('save-to-history', (_event, text: string) => {
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

  ipcMain.handle('delete-history-entry', (_event, id: string) => {
    let history = loadHistory()
    history = history.filter(h => h.id !== id)
    saveHistory(history)
    return history
  })

  ipcMain.handle('copy-to-clipboard', (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('sync-text', (_event, text: string) => {
    currentText = text
  })

  ipcMain.handle('get-config', () => {
    return loadConfig()
  })

  ipcMain.handle('set-shortcut', (_event, shortcut: string) => {
    if (!shortcutValidator.test(shortcut)) return false
    const config = loadConfig()
    config.shortcut = shortcut
    saveConfig(config)
    registerShortcuts(config)
    return true
  })

  ipcMain.handle('set-copy-shortcut', (_event, shortcut: string) => {
    if (!shortcutValidator.test(shortcut)) return false
    const config = loadConfig()
    config.copyShortcut = shortcut
    saveConfig(config)
    registerShortcuts(config)
    return true
  })

  ipcMain.handle('hide-window', () => {
    win?.hide()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!win) {
    createWindow()
  } else {
    win.show()
    win.focus()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
