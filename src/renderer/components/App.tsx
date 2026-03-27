import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { RoutingWarningBanner } from './RoutingWarningBanner'
import { api, type Conversation, type LmModel } from '../api-client'
import { tempSessionStore, type TempSession } from '../temp-session-store'

export function App() {
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [selectedTemp, setSelectedTemp] = useState<TempSession | null>(null)
  const [modelList, setModelList] = useState<LmModel[]>([])
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const prevFailuresRef = useRef(0)

  useEffect(() => {
    function fetchModels() {
      api.listModels().then(list => setModelList(list)).catch((err) => console.error('Failed to fetch models:', err))
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
    setSelectedTemp(null)
    setSelected(conv)
  }

  function handleNewTemp() {
    const session = tempSessionStore.create()
    setSelected(null)
    setSelectedTemp(session)
  }

  function handleSelectConv(conv: Conversation) {
    setSelectedTemp(null)
    setSelected(conv)
  }

  function handleSelectTemp(session: TempSession) {
    setSelected(null)
    setSelectedTemp(session)
  }

  function handlePromote(_tempId: string, conv: Conversation) {
    setSelectedTemp(null)
    setSelected(conv)
  }

  const showBanner = consecutiveFailures >= 3 && !dismissed

  const models = modelList.map(m => m.id)

  const activeModel = selected?.model ?? selectedTemp?.model ?? null
  const matchedModel = activeModel ? modelList.find(m => m.id === activeModel) : null
  const contextWindow = matchedModel?.context_length ?? 4096

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1c1c1e', color: '#e5e5ea', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {showBanner && <RoutingWarningBanner onDismiss={() => setDismissed(true)} />}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar
          selectedId={selected?.id ?? null}
          selectedTempId={selectedTemp?.id ?? null}
          onSelect={handleSelectConv}
          onSelectTemp={handleSelectTemp}
          onNew={handleNew}
          onNewTemp={handleNewTemp}
          onPromote={handlePromote}
        />
        <ChatArea
          conversation={selected}
          models={models}
          contextWindow={contextWindow}
          onConversationUpdate={setSelected}
        />
      </div>
    </div>
  )
}
