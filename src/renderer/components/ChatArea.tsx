import { useEffect, useRef, useState } from 'react'
import { api, type Conversation, type Message } from '../api-client'
import { estimateTokens } from '../lib/tokens'
import { TopBar } from './TopBar'
import { MessageBubble } from './MessageBubble'
import { CompactToast } from './CompactToast'

interface ChatAreaProps {
  conversation: Conversation | null
  models: string[]
  contextWindow: number
  onConversationUpdate: (conv: Conversation) => void
  onFork: (newConversation: Conversation) => void
}

type CompactState = 'idle' | 'queued' | 'running' | 'error'

export function ChatArea({ conversation, models, contextWindow, onConversationUpdate, onFork }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingAssistantId, setStreamingAssistantId] = useState<number | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [usedTokens, setUsedTokens] = useState(0)
  const [streamingBaseTokens, setStreamingBaseTokens] = useState(0)
  const [inputText, setInputText] = useState('')
  const [compactState, setCompactState] = useState<CompactState>('idle')
  const [autoCompactToastVisible, setAutoCompactToastVisible] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevents re-arming auto-compact within the same stream cycle after a cancel
  const autoCompactArmedThisStream = useRef(false)

  async function runCompaction(convId: number) {
    setCompactState('running')
    try {
      const result = await api.compactConversation(convId)
      setMessages(result.messages)
      const total = result.messages.reduce((sum, m) => sum + (m.exact_tokens ?? m.tokens), 0)
      setUsedTokens(total)
      setCompactState('idle')
    } catch (err) {
      console.error('Compaction failed:', err)
      setCompactState('error')
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => setCompactState('idle'), 4000)
    }
  }

  function handleCompactRequest(convId: number) {
    if (compactState === 'queued') {
      // Cancel the pending compaction
      setCompactState('idle')
      return
    }
    if (isStreaming) {
      setCompactState('queued')
      return
    }
    runCompaction(convId)
  }

  // Load messages when conversation changes
  useEffect(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setCompactState('idle')
    setAutoCompactToastVisible(false)
    autoCompactArmedThisStream.current = false

    if (!conversation) {
      setMessages([])
      setUsedTokens(0)
      setStreamingContent('')
      setStreamingAssistantId(null)
      setIsStreaming(false)
      setAbortController(null)
      return
    }

    api.getMessages(conversation.id).then(msgs => {
      setMessages(msgs)
      const total = msgs.reduce((sum, m) => sum + (m.exact_tokens ?? m.tokens), 0)
      setUsedTokens(total)
      setStreamingContent('')
      setStreamingAssistantId(null)
      setIsStreaming(false)
      setAbortController(null)
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    })
  }, [conversation?.id])

  // Auto-scroll during streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamingContent])

  // Abort any in-flight stream when the component unmounts
  useEffect(() => {
    return () => {
      abortController?.abort()
    }
  }, [abortController])

  // Cleanup error timer on unmount to prevent setState after unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [])

  async function handleSend() {
    if (!inputText.trim() || isStreaming || !conversation) return

    // Dismiss any pending auto-compact toast when a new message is sent
    setAutoCompactToastVisible(false)
    // Reset the arm guard so the next stream can trigger auto-compact if needed
    autoCompactArmedThisStream.current = false

    const text = inputText
    setInputText('')

    const estimatedUserTokens = estimateTokens(text)

    let userMsg, assistantMsg
    try {
      // Create user message on backend
      userMsg = await api.sendMessage(conversation.id, 'user', text, estimatedUserTokens)

      // Pre-create empty assistant message
      assistantMsg = await api.sendMessage(conversation.id, 'assistant', '', 0)
    } catch (err) {
      console.error('Failed to create messages:', err)
      setInputText(text)
      return
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setUsedTokens(prev => prev + estimatedUserTokens)
    setStreamingContent('')
    setStreamingAssistantId(assistantMsg.id)
    setIsStreaming(true)

    const controller = new AbortController()
    setAbortController(controller)

    // Capture base token count before streaming (user msg + previous messages)
    // Use messages array directly to avoid stale usedTokens closure value
    const baseTokens = messages.reduce((sum, m) => sum + (m.exact_tokens ?? m.tokens ?? 0), 0) + estimatedUserTokens
    setStreamingBaseTokens(baseTokens)

    // Use refs-like approach via closure: track streaming content locally
    let accumulated = ''

    try {
    await api.streamChat(
      conversation.id,
      assistantMsg.id,
      (token: string) => {
        accumulated += token
        setStreamingContent(accumulated)
        setUsedTokens(baseTokens + estimateTokens(accumulated))
      },
      (usage?: { prompt_tokens: number; completion_tokens: number }) => {
        const finalTokens = usage?.completion_tokens ?? estimateTokens(accumulated)
        const exactTokens = usage?.completion_tokens
        setMessages(prev =>
          prev.map(m => {
            if (m.id === assistantMsg.id) {
              return { ...m, content: accumulated, tokens: finalTokens, exact_tokens: exactTokens }
            }
            if (usage && m.id === userMsg.id) {
              return { ...m, exact_tokens: usage.prompt_tokens }
            }
            return m
          })
        )
        const totalUsed = baseTokens + finalTokens
        setUsedTokens(totalUsed)
        setStreamingContent('')
        setStreamingAssistantId(null)
        setIsStreaming(false)
        setAbortController(null)
        if (usage) {
          api.updateMessageTokens(conversation.id, assistantMsg.id, usage.completion_tokens).catch(e =>
            console.error('Failed to persist assistant token count:', e)
          )
          api.updateMessageTokens(conversation.id, userMsg.id, usage.prompt_tokens).catch(e =>
            console.error('Failed to persist user token count:', e)
          )
        }
        // Evaluate auto-compact threshold after stream completes
        const threshold = conversation.auto_compact_threshold ?? 0.8
        const autoEnabled = conversation.auto_compact_enabled === 1
        if (
          autoEnabled &&
          !autoCompactArmedThisStream.current &&
          contextWindow > 0 &&
          totalUsed / contextWindow >= threshold
        ) {
          setAutoCompactToastVisible(true)
        }
        // Fire queued compaction after stream completes
        setCompactState(prev => {
          if (prev === 'queued') {
            runCompaction(conversation.id)
            return 'running'
          }
          return prev
        })
      },
      (message: string) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: `[Error: ${message}]`, tokens: 0 }
              : m
          )
        )
        setStreamingContent('')
        setStreamingAssistantId(null)
        setIsStreaming(false)
        setAbortController(null)
      },
      controller.signal
    )
    } catch (err) {
      console.error('Failed to start streaming:', err)
      setInputText(text)
      setIsStreaming(false)
      setAbortController(null)
      setStreamingContent('')
      setStreamingAssistantId(null)
      setMessages(prev => prev.filter(m => m.id !== userMsg.id && m.id !== assistantMsg.id))
      controller.abort()
    }
  }

  function handleStop() {
    abortController?.abort()
  }

  function handleModelChange(model: string) {
    if (!conversation) return
    onConversationUpdate({ ...conversation, model })
  }

  function handleNameChange(name: string) {
    if (!conversation) return
    onConversationUpdate({ ...conversation, name })
  }

  async function handleFork(messageId: number) {
    if (!conversation) return
    try {
      const newConversation = await api.forkConversation(conversation.id, messageId)
      onFork(newConversation)
    } catch (err) {
      console.error('Fork failed:', err)
    }
  }

  async function handleAutoCompactToggle() {
    if (!conversation) return
    const newValue = conversation.auto_compact_enabled === 1 ? 0 : 1
    const updated = await api.updateConversation(conversation.id, { auto_compact_enabled: newValue })
    onConversationUpdate(updated)
  }

  function handleAutoCompactToastCancel() {
    setAutoCompactToastVisible(false)
    autoCompactArmedThisStream.current = true
  }

  function handleAutoCompactToastExpire() {
    setAutoCompactToastVisible(false)
    runCompaction(conversation!.id)
  }

  if (!conversation) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>Select a conversation to start</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <TopBar
        conversationId={conversation.id}
        conversationName={conversation.name}
        models={models}
        selectedModel={conversation.model || 'auto'}
        usedTokens={usedTokens}
        contextWindow={contextWindow}
        isStreaming={isStreaming}
        compactState={compactState}
        autoCompactEnabled={conversation.auto_compact_enabled === 1}
        onModelChange={handleModelChange}
        onStop={handleStop}
        onNameChange={handleNameChange}
        onCompactRequest={() => handleCompactRequest(conversation.id)}
        onAutoCompactToggle={handleAutoCompactToggle}
      />
      <div style={{ ...styles.messages, position: 'relative' }}>
        {messages.map(msg => {
          const isStreamingMsg = isStreaming && msg.id === streamingAssistantId
          const displayContent = msg.id === streamingAssistantId ? streamingContent || msg.content : msg.content
          const displayTokens = isStreamingMsg
            ? Math.ceil(streamingContent.length / 4)
            : msg.tokens
          return (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={displayContent}
              tokens={displayTokens}
              exact_tokens={isStreamingMsg ? undefined : msg.exact_tokens}
              isStreaming={isStreamingMsg}
              onFork={() => handleFork(msg.id)}
            />
          )
        })}
        <div ref={messagesEndRef} />
        {autoCompactToastVisible && (
          <CompactToast
            onExpire={handleAutoCompactToastExpire}
            onCancel={handleAutoCompactToastCancel}
          />
        )}
      </div>
      <div style={styles.inputArea}>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Message..."
          disabled={isStreaming}
          style={styles.textarea}
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !inputText.trim()}
          style={styles.sendBtn}
        >
          ↑
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#636366',
    fontSize: 14,
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1c1c1e',
    flex: 1,
    minWidth: 0,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  inputArea: {
    padding: '16px',
    borderTop: '1px solid #3a3a3c',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    background: '#2c2c2e',
    color: '#e5e5ea',
    border: 'none',
    borderRadius: 8,
    padding: 12,
    resize: 'none',
    height: 80,
    fontFamily: 'inherit',
    fontSize: 13,
    outline: 'none',
  },
  sendBtn: {
    background: '#3a3a3c',
    border: 'none',
    borderRadius: '50%',
    width: 36,
    height: 36,
    color: '#e5e5ea',
    cursor: 'pointer',
    fontSize: 16,
    flexShrink: 0,
  },
}
