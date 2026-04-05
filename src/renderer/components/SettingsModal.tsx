import { useEffect, useRef, useState } from 'react'
import { api, type Permission, listPermissions, addPermission, removePermission, updateSetting } from '../api-client'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [braveKey, setBraveKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [loaded, setLoaded] = useState(false)

  // Permissions
  const [shellPerms, setShellPerms] = useState<Permission[]>([])
  const [asPerms, setAsPerms] = useState<Permission[]>([])
  const [newShell, setNewShell] = useState('')
  const [newAs, setNewAs] = useState('')

  // Shell settings
  const [workingDir, setWorkingDir] = useState('')
  const [timeoutMs, setTimeoutMs] = useState('')

  const shellInputRef = useRef<HTMLInputElement>(null)
  const asInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true

    Promise.all([
      api.getSettings(),
      listPermissions('shell'),
      listPermissions('applescript'),
    ]).then(([s, shell, as_]) => {
      if (!active) return
      setBraveKey(s['brave_api_key'] ?? '')
      setTavilyKey(s['tavily_api_key'] ?? '')
      setWorkingDir(s['shell_working_dir'] ?? '')
      setTimeoutMs(s['shell_timeout_ms'] ?? '')
      setShellPerms(shell)
      setAsPerms(as_)
      setLoaded(true)
    }).catch(console.error)

    return () => { active = false }
  }, [])

  function handleBlur(key: string, value: string) {
    api.setSetting(key, value).catch(console.error)
  }

  async function handleAddShell() {
    const pattern = newShell.trim()
    if (!pattern) return
    await addPermission('shell', pattern).catch(console.error)
    setShellPerms(prev => [...prev, { id: Date.now(), type: 'shell', pattern, created_at: '' }])
    setNewShell('')
    shellInputRef.current?.focus()
    // Refresh from server to get real id
    listPermissions('shell').then(setShellPerms).catch(console.error)
  }

  async function handleAddAs() {
    const pattern = newAs.trim()
    if (!pattern) return
    await addPermission('applescript', pattern).catch(console.error)
    setAsPerms(prev => [...prev, { id: Date.now(), type: 'applescript', pattern, created_at: '' }])
    setNewAs('')
    asInputRef.current?.focus()
    listPermissions('applescript').then(setAsPerms).catch(console.error)
  }

  async function handleRemoveShell(id: number) {
    await removePermission(id).catch(console.error)
    setShellPerms(prev => prev.filter(p => p.id !== id))
  }

  async function handleRemoveAs(id: number) {
    await removePermission(id).catch(console.error)
    setAsPerms(prev => prev.filter(p => p.id !== id))
  }

  if (!loaded) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Settings</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Web Search */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Web Search</div>
          <div style={styles.field}>
            <label style={styles.label}>Brave Search API Key</label>
            <input
              type="password"
              value={braveKey}
              onChange={e => setBraveKey(e.target.value)}
              onBlur={() => handleBlur('brave_api_key', braveKey)}
              placeholder="BSA..."
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Tavily API Key</label>
            <input
              type="password"
              value={tavilyKey}
              onChange={e => setTavilyKey(e.target.value)}
              onBlur={() => handleBlur('tavily_api_key', tavilyKey)}
              placeholder="tvly-..."
              style={styles.input}
            />
          </div>
          <div style={styles.hint}>
            Keys are stored locally. Brave is tried first; Tavily is used as fallback.
          </div>
        </div>

        {/* Shell Settings */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Shell</div>
          <div style={styles.field}>
            <label style={styles.label}>Default Working Directory</label>
            <input
              type="text"
              value={workingDir}
              onChange={e => setWorkingDir(e.target.value)}
              onBlur={() => updateSetting('shell_working_dir', workingDir).catch(console.error)}
              placeholder="/Users/you/projects"
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Shell Timeout (ms)</label>
            <input
              type="number"
              value={timeoutMs}
              onChange={e => setTimeoutMs(e.target.value)}
              onBlur={() => updateSetting('shell_timeout_ms', timeoutMs).catch(console.error)}
              placeholder="30000"
              style={styles.input}
            />
          </div>
        </div>

        {/* Permissions */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Permissions</div>

          {/* Shell allowlist */}
          <div style={styles.field}>
            <label style={styles.label}>Shell Command Allowlist</label>
            <div style={styles.hint}>Glob patterns that skip confirmation (e.g. <code>git *</code>, <code>npm run *</code>)</div>
            <div style={styles.permList}>
              {shellPerms.map(p => (
                <div key={p.id} style={styles.permItem}>
                  <span style={styles.permPattern}>{p.pattern}</span>
                  <button
                    style={styles.removeBtn}
                    onClick={() => handleRemoveShell(p.id)}
                    title="Remove"
                  >×</button>
                </div>
              ))}
            </div>
            <div style={styles.addRow}>
              <input
                ref={shellInputRef}
                type="text"
                value={newShell}
                onChange={e => setNewShell(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddShell() }}
                placeholder="git *"
                style={{ ...styles.input, flex: 1 }}
              />
              <button style={styles.addBtn} onClick={handleAddShell}>Add</button>
            </div>
          </div>

          {/* AppleScript allowlist */}
          <div style={styles.field}>
            <label style={styles.label}>AppleScript Allowlist</label>
            <div style={styles.hint}>App names that skip confirmation (e.g. <code>Finder</code>, <code>Calendar</code>)</div>
            <div style={styles.permList}>
              {asPerms.map(p => (
                <div key={p.id} style={styles.permItem}>
                  <span style={styles.permPattern}>{p.pattern}</span>
                  <button
                    style={styles.removeBtn}
                    onClick={() => handleRemoveAs(p.id)}
                    title="Remove"
                  >×</button>
                </div>
              ))}
            </div>
            <div style={styles.addRow}>
              <input
                ref={asInputRef}
                type="text"
                value={newAs}
                onChange={e => setNewAs(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddAs() }}
                placeholder="Finder"
                style={{ ...styles.input, flex: 1 }}
              />
              <button style={styles.addBtn} onClick={handleAddAs}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
    overflowY: 'auto',
  },
  modal: {
    background: '#2c2c2e',
    borderRadius: 12,
    padding: '24px',
    width: 460,
    maxWidth: '90vw',
    border: '1px solid #3a3a3c',
    maxHeight: '85vh',
    overflowY: 'auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  title: { color: '#f2f2f7', fontSize: 17, fontWeight: 600 },
  closeBtn: {
    background: 'none', border: 'none', color: '#8e8e93',
    fontSize: 18, cursor: 'pointer', padding: '0 4px',
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    color: '#8e8e93', fontSize: 12, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 12,
  },
  field: { marginBottom: 12 },
  label: { display: 'block', color: '#aeaeb2', fontSize: 13, marginBottom: 4 },
  input: {
    width: '100%', boxSizing: 'border-box',
    background: '#1c1c1e', border: '1px solid #3a3a3c',
    borderRadius: 6, color: '#f2f2f7', fontSize: 13,
    padding: '8px 10px',
  },
  hint: { color: '#636366', fontSize: 11, marginTop: 4, marginBottom: 6 },
  permList: { marginBottom: 6 },
  permItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#1c1c1e', borderRadius: 6, padding: '5px 8px',
    marginBottom: 4, border: '1px solid #3a3a3c',
  },
  permPattern: { color: '#e5e5ea', fontSize: 13, fontFamily: 'monospace' },
  removeBtn: {
    background: 'none', border: 'none', color: '#ff453a',
    fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 2px',
  },
  addRow: { display: 'flex', gap: 8, alignItems: 'center' },
  addBtn: {
    background: '#636366', border: 'none', borderRadius: 6,
    color: '#f2f2f7', fontSize: 13, padding: '8px 14px',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
}
