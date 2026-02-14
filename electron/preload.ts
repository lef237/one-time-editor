import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getHistory: () => ipcRenderer.invoke('get-history'),
  saveToHistory: (text: string) => ipcRenderer.invoke('save-to-history', text),
  deleteHistoryEntry: (id: string) => ipcRenderer.invoke('delete-history-entry', id),
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),
  syncText: (text: string) => ipcRenderer.invoke('sync-text', text),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setShortcut: (shortcut: string) => ipcRenderer.invoke('set-shortcut', shortcut),
  setAlwaysOnTop: (alwaysOnTop: boolean) => ipcRenderer.invoke('set-always-on-top', alwaysOnTop),
  setIndent: (indentType: string, indentSize: number) => ipcRenderer.invoke('set-indent', indentType, indentSize),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
})
