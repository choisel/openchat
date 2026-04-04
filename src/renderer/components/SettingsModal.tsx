import { useEffect, useState } from 'react'
import { api } from '../api-client'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [braveKey, setBraveKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    api.getSettings().then(s => {
      if (!active) return
      setBraveKey(s['brave_api_key'] ?? '')
      setTavilyKey(s['tavily_api_key'] ?? '')
      setLoaded(true)
    }).catch(console.error)
    return () => { active = false }
  }, [])

  function handleBlur(key: string, value: string) {
    api.setSetting(key, value).catch(console.error)
  }

  if (!loaded) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Settings</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

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
  },
  modal: {
    background: '#2c2c2e',
    borderRadius: 12,
    padding: '24px',
    width: 420,
    maxWidth: '90vw',
    border: '1px solid #3a3a3c',
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
  section: { marginBottom: 16 },
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
  hint: { color: '#636366', fontSize: 11, marginTop: 4 },
}
