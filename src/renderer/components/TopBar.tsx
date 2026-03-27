import { useState } from 'react'
import { api } from '../api-client'
import { ModelSelector } from './ModelSelector'
import { ContextBar } from './ContextBar'

type CompactState = 'idle' | 'queued' | 'running' | 'error'

interface Props {
  conversationId: number
  conversationName: string
  models: string[]
  selectedModel: string
  usedTokens: number
  contextWindow: number
  isStreaming: boolean
  compactState: CompactState
  autoCompactEnabled: boolean
  onModelChange: (model: string) => void
  onStop: () => void
  onNameChange: (name: string) => void
  onCompactRequest: () => void
  onAutoCompactToggle: () => void
}

export function TopBar({
  conversationId,
  conversationName,
  models,
  selectedModel,
  usedTokens,
  contextWindow,
  isStreaming,
  compactState,
  autoCompactEnabled,
  onModelChange,
  onStop,
  onNameChange,
  onCompactRequest,
  onAutoCompactToggle,
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

  function compactLabel() {
    if (compactState === 'queued') return '⏱'
    if (compactState === 'running') return '…'
    return 'Compact'
  }

  return (
    <div style={styles.wrapper}>
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
          <button
            style={{
              ...styles.compactBtn,
              ...(compactState === 'running' ? styles.compactBtnDisabled : {}),
            }}
            onClick={onCompactRequest}
            disabled={compactState === 'running'}
            title={compactState === 'queued' ? 'Click to cancel queued compaction' : 'Compact conversation context'}
          >
            {compactLabel()}
          </button>
          <button
            style={{
              ...styles.autoCompactToggleBtn,
              ...(autoCompactEnabled ? styles.autoCompactToggleBtnOn : {}),
            }}
            onClick={onAutoCompactToggle}
            title={autoCompactEnabled ? 'Auto-compact enabled — click to disable' : 'Auto-compact disabled — click to enable'}
          >
            Auto
          </button>
          {isStreaming && (
            <button style={styles.stopBtn} onClick={onStop}>
              Stop
            </button>
          )}
        </div>
      </div>
      {compactState === 'error' && (
        <div style={styles.errorBanner}>
          Compaction failed — conversation unchanged
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flexShrink: 0,
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    background: '#1c1c1e',
    height: 48,
    padding: '0 16px',
    borderBottom: '1px solid #3a3a3c',
    gap: 12,
  },
  errorBanner: {
    background: '#3a0000',
    color: '#ff6b6b',
    fontSize: 12,
    padding: '6px 16px',
    borderBottom: '1px solid #5a1a1a',
  },
  compactBtn: {
    border: '1px solid #48484a',
    background: 'transparent',
    color: '#aeaeb2',
    borderRadius: 12,
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  compactBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
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
  autoCompactToggleBtn: {
    border: '1px solid #48484a',
    background: 'transparent',
    color: '#636366',
    borderRadius: 12,
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  autoCompactToggleBtnOn: {
    borderColor: '#30d158',
    color: '#30d158',
  },
}
