import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { RoutingWarningBanner } from './RoutingWarningBanner'
import { api, type Conversation } from '../api-client'

export function App() {
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const prevFailuresRef = useRef(0)

  useEffect(() => {
    function fetchModels() {
      api.listModels().then(list => setModels(list.map(m => m.id))).catch((err) => console.error('Failed to fetch models:', err))
    }
    fetchModels()
    const interval = setInterval(fetchModels, 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function fetchRoutingHealth() {
      api.getRoutingHealth()
        .then(({ consecutiveFailures: failures }) => {
          setConsecutiveFailures(failures)
          // Reset dismissed state when failures drop below threshold then rise again
          if (failures >= 3 && prevFailuresRef.current < 3) {
            setDismissed(false)
          }
          prevFailuresRef.current = failures
        })
        .catch((err) => console.error('Failed to fetch routing health:', err))
    }
    fetchRoutingHealth()
    const interval = setInterval(fetchRoutingHealth, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function handleNew() {
    const conv = await api.createConversation('New conversation')
    setSelected(conv)
  }

  const showBanner = consecutiveFailures >= 3 && !dismissed

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1c1c1e', color: '#e5e5ea', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {showBanner && <RoutingWarningBanner onDismiss={() => setDismissed(true)} />}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar selectedId={selected?.id ?? null} onSelect={setSelected} onNew={handleNew} />
        <ChatArea
          conversation={selected}
          models={models}
          contextWindow={4096}
          onConversationUpdate={setSelected}
        />
      </div>
    </div>
  )
}
