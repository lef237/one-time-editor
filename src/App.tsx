import { useState, useEffect, useRef, useCallback } from 'react'
import type { HistoryEntry } from './types'

function App() {
  const [text, setText] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [shortcut, setShortcut] = useState('')
  const [shortcutInput, setShortcutInput] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.electronAPI.getHistory().then(setHistory)
    window.electronAPI.getShortcut().then((s) => {
      setShortcut(s)
      setShortcutInput(s)
    })
  }, [])

  useEffect(() => {
    if (!showHistory && !showSettings) {
      textareaRef.current?.focus()
    }
  }, [showHistory, showSettings])

  const saveCurrentText = useCallback(async () => {
    if (text.trim()) {
      const updated = await window.electronAPI.saveToHistory(text)
      setHistory(updated)
    }
  }, [text])

  const handleNew = useCallback(async () => {
    await saveCurrentText()
    setText('')
    textareaRef.current?.focus()
  }, [saveCurrentText])

  const handleCopy = useCallback(async () => {
    if (!text.trim()) return
    await window.electronAPI.copyToClipboard(text)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 1500)
  }, [text])

  const handleSelectHistory = useCallback(async (entry: HistoryEntry) => {
    if (text.trim()) {
      const updated = await window.electronAPI.saveToHistory(text)
      setHistory(updated)
    }
    setText(entry.text)
    setShowHistory(false)
    textareaRef.current?.focus()
  }, [text])

  const handleDeleteHistory = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = await window.electronAPI.deleteHistoryEntry(id)
    setHistory(updated)
  }, [])

  const handleSaveShortcut = useCallback(async () => {
    if (shortcutInput.trim()) {
      await window.electronAPI.setShortcut(shortcutInput)
      setShortcut(shortcutInput)
      setShowSettings(false)
    }
  }, [shortcutInput])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showHistory) {
        setShowHistory(false)
      } else if (showSettings) {
        setShowSettings(false)
      } else {
        window.electronAPI.hideWindow()
      }
    }
  }, [showHistory, showSettings])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const hours = d.getHours().toString().padStart(2, '0')
    const minutes = d.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hours}:${minutes}`
  }

  const truncate = (s: string, len: number) => {
    const line = s.split('\n')[0]
    return line.length > len ? line.slice(0, len) + '...' : line
  }

  return (
    <div className="app" onKeyDown={handleKeyDown}>
      {/* Titlebar (drag region) */}
      <div className="titlebar">
        <span className="titlebar-text">One-Time Editor</span>
        <div className="titlebar-buttons">
          <button
            className="btn btn-new"
            onClick={handleNew}
            title="New"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </button>
          <button
            className={`btn btn-copy ${copyFeedback ? 'copied' : ''}`}
            onClick={handleCopy}
            title="Copy"
          >
            {copyFeedback ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <button
            className={`btn btn-history ${showHistory ? 'active' : ''}`}
            onClick={() => { setShowHistory(!showHistory); setShowSettings(false) }}
            title="History"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          <button
            className={`btn btn-settings ${showSettings ? 'active' : ''}`}
            onClick={() => { setShowSettings(!showSettings); setShowHistory(false) }}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="main-area">
        <textarea
          ref={textareaRef}
          className="editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type here..."
          spellCheck={false}
          autoFocus
        />

        {/* History panel */}
        {showHistory && (
          <div className="panel history-panel">
            <div className="panel-header">
              <h3>History</h3>
            </div>
            <div className="panel-content">
              {history.length === 0 ? (
                <div className="empty-message">No history</div>
              ) : (
                history.map((entry) => (
                  <div
                    key={entry.id}
                    className="history-item"
                    onClick={() => handleSelectHistory(entry)}
                  >
                    <div className="history-item-text">
                      {truncate(entry.text, 60)}
                    </div>
                    <div className="history-item-footer">
                      <span className="history-item-date">
                        {formatDate(entry.createdAt)}
                      </span>
                      <button
                        className="history-delete-btn"
                        onClick={(e) => handleDeleteHistory(entry.id, e)}
                        title="Delete"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="panel settings-panel">
            <div className="panel-header">
              <h3>Settings</h3>
            </div>
            <div className="panel-content">
              <div className="settings-item">
                <label>Shortcut Key</label>
                <div className="shortcut-current">
                  Current: <code>{shortcut}</code>
                </div>
                <input
                  type="text"
                  className="shortcut-input"
                  value={shortcutInput}
                  onChange={(e) => setShortcutInput(e.target.value)}
                  placeholder="e.g. CommandOrControl+Shift+M"
                />
                <div className="shortcut-hint">
                  e.g. CommandOrControl+M, Alt+Space, CommandOrControl+Shift+E
                </div>
                <button className="btn-save" onClick={handleSaveShortcut}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
