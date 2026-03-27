import { useState } from 'react'

interface Props {
  role: 'user' | 'assistant'
  content: string
  tokens: number
  exact_tokens?: number | null
  modelName?: string
  isStreaming?: boolean
  onFork?: () => void
}

export function MessageBubble({ role, content, tokens, exact_tokens, modelName, isStreaming, onFork }: Props) {
  const [hovered, setHovered] = useState(false)
  const displayTokens = exact_tokens ?? tokens
  const isUser = role === 'user'

  return (
    <div
      style={isUser ? styles.wrapperUser : styles.wrapperAssistant}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isUser && modelName && (
        <span style={styles.modelLabel}>{modelName}</span>
      )}
      <div style={isUser ? styles.bubbleUser : styles.bubbleAssistant}>
        <span style={styles.content}>
          {content}
          {isStreaming && <span className="streaming-cursor">▋</span>}
        </span>
      </div>
      <div style={styles.metaRow}>
        <span style={styles.tokenAnnotation}>{displayTokens} tokens</span>
        {onFork && hovered && !isStreaming && (
          <button
            style={styles.forkBtn}
            onClick={onFork}
            title="Fork conversation from here"
          >
            ⑂ Fork
          </button>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapperUser: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  wrapperAssistant: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modelLabel: {
    color: '#8e8e93',
    fontSize: 11,
    marginBottom: 4,
  },
  bubbleUser: {
    background: '#2c2c2e',
    color: '#e5e5ea',
    borderRadius: 12,
    padding: '10px 14px',
    maxWidth: '75%',
  },
  bubbleAssistant: {
    background: 'transparent',
    color: '#e5e5ea',
    maxWidth: '75%',
  },
  content: {
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  tokenAnnotation: {
    color: '#48484a',
    fontSize: 11,
  },
  forkBtn: {
    background: 'transparent',
    border: '1px solid #3a3a3c',
    borderRadius: 4,
    color: '#8e8e93',
    fontSize: 10,
    cursor: 'pointer',
    padding: '2px 6px',
  },
}
