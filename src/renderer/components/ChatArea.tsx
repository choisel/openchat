import { useEffect, useRef, useState } from 'react'
import { api, type Conversation, type Message } from '../api-client'
import { estimateTokens } from '../lib/tokens'
import { TopBar } from './TopBar'
import { MessageBubble } from './MessageBubble'

interface ChatAreaProps {
  conversation: Conversation | null
  models: string[]
  contextWindow: number
  onConversationUpdate: (conv: Conversation) => void
}

export function ChatArea({ conversation, models, contextWindow, onConversationUpdate }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingAssistantId, setStreamingAssistantId] = useState<number | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [usedTokens, setUsedTokens] = useState(0)
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load messages when conversation changes
  useEffect(() => {
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
      const total = msgs.reduce((sum, m) => sum + m.tokens, 0)
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

  async function handleSend() {
    if (!inputText.trim() || isStreaming || !conversation) return

    const text = inputText
    setInputText('')

    const estimatedUserTokens = estimateTokens(text)

    // Create user message on backend
    const userMsg = await api.sendMessage(conversation.id, 'user', text, estimatedUserTokens)

    // Pre-create empty assistant message
    const assistantMsg = await api.sendMessage(conversation.id, 'assistant', '', 0)

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setUsedTokens(prev => prev + estimatedUserTokens)
    setStreamingContent('')
    setStreamingAssistantId(assistantMsg.id)
    setIsStreaming(true)

    const controller = new AbortController()
    setAbortController(controller)

    // Capture base token count before streaming (user msg + previous messages)
    const baseTokens = usedTokens + estimatedUserTokens

    // Use refs-like approach via closure: track streaming content locally
    let accumulated = ''

    api.streamChat(
      conversation.id,
      assistantMsg.id,
      (token: string) => {
        accumulated += token
        setStreamingContent(accumulated)
        setUsedTokens(baseTokens + estimateTokens(accumulated))
      },
      (usage?: { prompt_tokens: number; completion_tokens: number }) => {
        const finalTokens = usage?.completion_tokens ?? estimateTokens(accumulated)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: accumulated, tokens: finalTokens }
              : m
          )
        )
        setUsedTokens(baseTokens + finalTokens)
        setStreamingContent('')
        setStreamingAssistantId(null)
        setIsStreaming(false)
        setAbortController(null)
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
        onModelChange={handleModelChange}
        onStop={handleStop}
        onNameChange={handleNameChange}
      />
      <div style={styles.messages}>
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.id === streamingAssistantId ? streamingContent || msg.content : msg.content}
            tokens={msg.id === streamingAssistantId ? estimateTokens(streamingContent) : msg.tokens}
            isStreaming={isStreaming && msg.id === streamingAssistantId}
          />
        ))}
        <div ref={messagesEndRef} />
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
