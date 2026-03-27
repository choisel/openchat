import type { Conversation } from '../api-client'

interface Props {
  conversation: Conversation | null
}

export function ChatArea({ conversation }: Props) {
  if (!conversation) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>Select a conversation or create a new one</p>
      </div>
    )
  }
  return (
    <div style={styles.area}>
      <div style={styles.topBar}>
        <span style={styles.title}>{conversation.name}</span>
      </div>
      <div style={styles.messages}>
        {/* Messages and full chat UI in Plan 2 */}
      </div>
      <div style={styles.inputArea}>
        <div style={styles.inputBox}>
          <textarea style={styles.textarea} placeholder="Message..." />
          <div style={styles.inputRow}>
            <button style={styles.plusBtn}>+</button>
            <button style={styles.sendBtn}>↑</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#636366', fontSize: 14 },
  area: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' },
  topBar: { padding: '10px 18px', borderBottom: '1px solid #2c2c2e', display: 'flex', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: 500, color: '#e5e5ea' },
  messages: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  inputArea: { padding: '12px 18px 18px' },
  inputBox: { background: '#2c2c2e', borderRadius: 16, padding: '12px 14px 10px' },
  textarea: { width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#e5e5ea', fontSize: 13, resize: 'none', fontFamily: 'inherit', minHeight: 24 },
  inputRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  plusBtn: { background: 'transparent', border: 'none', color: '#8e8e93', fontSize: 18, cursor: 'pointer' },
  sendBtn: { background: '#3a3a3c', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#8e8e93', cursor: 'pointer', fontSize: 14 }
}
