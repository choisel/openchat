import { useEffect, useState } from 'react'
import { api, type Conversation } from '../api-client'

interface Props {
  selectedId: number | null
  onSelect: (conv: Conversation) => void
  onNew: () => void
}

export function Sidebar({ selectedId, onSelect, onNew }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    api.listConversations().then(setConversations)
    api.getLmStatus().then(s => setConnected(s.connected))

    const interval = setInterval(() => {
      api.getLmStatus().then(s => setConnected(s.connected))
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <aside style={styles.sidebar}>
      <div style={styles.search}>
        <span>🔍</span>
        <input style={styles.searchInput} placeholder="Search..." />
      </div>
      <div style={styles.listHeader}>CONVERSATIONS</div>
      <button style={styles.newBtn} onClick={onNew}>+ New conversation</button>
      <div style={styles.list}>
        {conversations.map(conv => (
          <div
            key={conv.id}
            style={{
              ...styles.item,
              ...(conv.id === selectedId ? styles.itemActive : {})
            }}
            onClick={() => onSelect(conv)}
          >
            {conv.name}
          </div>
        ))}
      </div>
      <div style={styles.footer}>
        <div style={{ ...styles.status, color: connected ? '#32d74b' : '#ff453a' }}>
          <span style={{ ...styles.dot, background: connected ? '#32d74b' : '#ff453a' }} />
          {connected ? 'LM Studio connected' : 'LM Studio offline'}
        </div>
      </div>
    </aside>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: { width: 220, background: '#161618', borderRight: '1px solid #2c2c2e', display: 'flex', flexDirection: 'column', height: '100vh' },
  search: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid #2c2c2e' },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#8e8e93', fontSize: 12, flex: 1 },
  listHeader: { color: '#636366', fontSize: 10, fontWeight: 600, letterSpacing: '0.8px', padding: '8px 12px 4px' },
  newBtn: { margin: '0 8px 6px', background: '#2c2c2e', border: 'none', borderRadius: 8, padding: '7px 10px', color: '#e5e5ea', fontSize: 12, cursor: 'pointer', textAlign: 'left' },
  list: { flex: 1, overflowY: 'auto' },
  item: { padding: '8px 12px', fontSize: 12, color: '#8e8e93', cursor: 'pointer', borderRadius: 6, margin: '1px 6px' },
  itemActive: { background: '#2c2c2e', color: '#e5e5ea' },
  footer: { padding: 12, borderTop: '1px solid #2c2c2e' },
  status: { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }
}
