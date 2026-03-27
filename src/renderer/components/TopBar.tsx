import { useState } from 'react'
import { api } from '../api-client'
import { ModelSelector } from './ModelSelector'
import { ContextBar } from './ContextBar'

interface Props {
  conversationId: number
  conversationName: string
  models: string[]
  selectedModel: string
  usedTokens: number
  contextWindow: number
  isStreaming: boolean
  onModelChange: (model: string) => void
  onStop: () => void
  onNameChange: (name: string) => void
}

export function TopBar({
  conversationId,
  conversationName,
  models,
  selectedModel,
  usedTokens,
  contextWindow,
  isStreaming,
  onModelChange,
  onStop,
  onNameChange,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(conversationName)

  function handleDoubleClick() {
    setDraftName(conversationName)
    setEditing(true)
  }

  async function commitName() {
    setEditing(false)
    const trimmed = draftName.trim() || conversationName
    await api.updateConversation(conversationId, { name: trimmed })
    onNameChange(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitName()
    }
  }

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        {editing ? (
          <input
            style={styles.nameInput}
            value={draftName}
            autoFocus
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span style={styles.name} onDoubleClick={handleDoubleClick}>
            {conversationName}
          </span>
        )}
      </div>
      <div style={styles.center}>
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          conversationId={conversationId}
          onModelChange={onModelChange}
        />
      </div>
      <div style={styles.right}>
        <ContextBar usedTokens={usedTokens} contextWindow={contextWindow} />
        {isStreaming && (
          <button style={styles.stopBtn} onClick={onStop}>
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    background: '#1c1c1e',
    height: 48,
    padding: '0 16px',
    borderBottom: '1px solid #3a3a3c',
    gap: 12,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: '#e5e5ea',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'default',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  nameInput: {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #636366',
    outline: 'none',
    color: '#e5e5ea',
    fontSize: 14,
    fontWeight: 500,
    width: '100%',
    padding: '2px 0',
  },
  center: {
    flexShrink: 0,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  stopBtn: {
    border: '1px solid #ff453a',
    background: 'transparent',
    color: '#ff453a',
    borderRadius: 12,
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
}
