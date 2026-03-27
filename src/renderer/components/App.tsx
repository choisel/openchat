import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { api, type Conversation } from '../api-client'

export function App() {
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [models, setModels] = useState<string[]>([])

  useEffect(() => {
    function fetchModels() {
      api.listModels().then(list => setModels(list.map(m => m.id))).catch((err) => console.error('Failed to fetch models:', err))
    }
    fetchModels()
    const interval = setInterval(fetchModels, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function handleNew() {
    const conv = await api.createConversation('New conversation')
    setSelected(conv)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1c1c1e', color: '#e5e5ea', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Sidebar selectedId={selected?.id ?? null} onSelect={setSelected} onNew={handleNew} />
      <ChatArea
        conversation={selected}
        models={models}
        contextWindow={4096}
        onConversationUpdate={setSelected}
      />
    </div>
  )
}
