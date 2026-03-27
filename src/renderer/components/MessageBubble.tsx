interface Props {
  role: 'user' | 'assistant'
  content: string
  tokens: number
  exact_tokens?: number | null
  modelName?: string
  isStreaming?: boolean
}

export function MessageBubble({ role, content, tokens, exact_tokens, modelName, isStreaming }: Props) {
  const displayTokens = exact_tokens ?? tokens
  const isUser = role === 'user'

  return (
    <div style={isUser ? styles.wrapperUser : styles.wrapperAssistant}>
      {!isUser && modelName && (
        <span style={styles.modelLabel}>{modelName}</span>
      )}
      <div style={isUser ? styles.bubbleUser : styles.bubbleAssistant}>
        <span style={styles.content}>
          {content}
          {isStreaming && <span className="streaming-cursor">▋</span>}
        </span>
      </div>
      <span style={styles.tokenAnnotation}>{displayTokens} tokens</span>
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
  tokenAnnotation: {
    color: '#48484a',
    fontSize: 11,
    marginTop: 4,
  },
}
