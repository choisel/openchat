import { useEffect, useState } from 'react'
import { api, type Conversation } from '../api-client'
import { useTempSessions, tempSessionStore, type TempSession } from '../temp-session-store'
import { getLastActivityAt } from '../lmstudio-activity'

const STATUS_POLL_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const ACTIVITY_QUIET_PERIOD_MS = 10 * 60 * 1000 // suppress poll for 10 min after last LM activity

interface Props {
  selectedId: number | null
  selectedTempId: string | null
  onSelect: (conv: Conversation) => void
  onSelectTemp: (session: TempSession) => void
  onNew: () => void
  onNewTemp: () => void
  onPromote: (tempId: string, conv: Conversation) => void
  prependConversation?: Conversation | null
}

export function Sidebar({ selectedId, selectedTempId, onSelect, onSelectTemp, onNew, onNewTemp, onPromote, prependConversation }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [connected, setConnected] = useState(false)
  const [tempSessions] = useTempSessions()

  useEffect(() => {
    api.listConversations().then(setConversations).catch(console.error)

    function pollStatus(force = false) {
      const timeSinceActivity = Date.now() - getLastActivityAt()
      if (!force && timeSinceActivity < ACTIVITY_QUIET_PERIOD_MS) {
        // Recent LM Studio traffic — deduce status from that, skip explicit check
        console.log('[sidebar] skipping status poll — LM Studio active', Math.round(timeSinceActivity / 1000), 's ago')
        return
      }
      console.log('[sidebar] polling LM Studio status')
      api.getLmStatus()
        .then(s => {
          console.log('[sidebar] LM Studio status:', s.connected ? 'connected' : 'offline')
          setConnected(s.connected)
        })
        .catch(() => {
          console.warn('[sidebar] LM Studio status check failed')
          setConnected(false)
        })
    }

    pollStatus(true) // first poll always runs to initialize connected state
    const interval = setInterval(pollStatus, STATUS_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!prependConversation) return
    setConversations(prev => {
      if (prev.some(c => c.id === prependConversation.id)) return prev
      return [prependConversation, ...prev]
    })
  }, [prependConversation])

  async function handlePromote(e: React.MouseEvent, tempId: string) {
    e.stopPropagation()
    const payload = tempSessionStore.promote(tempId)
    const conv = await api.promoteSession(payload)
    tempSessionStore.delete(tempId)
    setConversations(prev => [conv, ...prev])
    onPromote(tempId, conv)
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.search}>
        <span>🔍</span>
        <input style={styles.searchInput} placeholder="Search..." />
      </div>
      <div style={styles.listHeader}>CONVERSATIONS</div>
      <div style={styles.btnRow}>
        <button style={styles.newBtn} onClick={onNew}>+ New conversation</button>
        <button style={styles.newTempBtn} onClick={onNewTemp}>⚡ New temp session</button>
      </div>
      <div style={styles.list}>
        {tempSessions.map(session => (
          <div
            key={session.id}
            style={{
              ...styles.item,
              ...styles.itemTemp,
              ...(session.id === selectedTempId ? styles.itemActive : {})
            }}
            onClick={() => onSelectTemp(session)}
          >
            <span style={styles.tempLabel}>⚡ {session.name}</span>
            <button
              style={styles.saveBtn}
              onClick={e => handlePromote(e, session.id)}
              title="Save conversation"
            >
              Save
            </button>
          </div>
        ))}
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
  btnRow: { display: 'flex', flexDirection: 'column', gap: 4, margin: '0 8px 6px' },
  newBtn: { background: '#2c2c2e', border: 'none', borderRadius: 8, padding: '7px 10px', color: '#e5e5ea', fontSize: 12, cursor: 'pointer', textAlign: 'left' },
  newTempBtn: { background: '#2c2c2e', border: 'none', borderRadius: 8, padding: '7px 10px', color: '#f4a535', fontSize: 12, cursor: 'pointer', textAlign: 'left' },
  list: { flex: 1, overflowY: 'auto' },
  item: { padding: '8px 12px', fontSize: 12, color: '#8e8e93', cursor: 'pointer', borderRadius: 6, margin: '1px 6px' },
  itemTemp: { fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  itemActive: { background: '#2c2c2e', color: '#e5e5ea' },
  tempLabel: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  saveBtn: { flexShrink: 0, marginLeft: 4, background: 'transparent', border: '1px solid #3a3a3c', borderRadius: 4, color: '#636366', fontSize: 10, cursor: 'pointer', padding: '2px 5px' },
  footer: { padding: 12, borderTop: '1px solid #2c2c2e' },
  status: { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }
}
