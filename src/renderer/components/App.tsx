import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { api, type Conversation } from '../api-client'

export function App() {
  const [selected, setSelected] = useState<Conversation | null>(null)

  async function handleNew() {
    const conv = await api.createConversation('New conversation')
    setSelected(conv)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1c1c1e', color: '#e5e5ea', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Sidebar selectedId={selected?.id ?? null} onSelect={setSelected} onNew={handleNew} />
      <ChatArea conversation={selected} />
    </div>
  )
}
