import { useEffect, useRef, useState } from 'react'
import { api, type Conversation, type Message } from '../api-client'
import { estimateTokens } from '../lib/tokens'
import { TopBar } from './TopBar'
import { MessageBubble } from './MessageBubble'
import { CompactToast } from './CompactToast'
import { AttachmentChip } from './AttachmentChip'
import type { AttachmentData } from '../api-client'
import { SourcesBlock } from './SourcesBlock'
import type { SearchResult } from './SourcesBlock'

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
  const isSendingRef = useRef(false)
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  // Prevents re-arming auto-compact within the same stream cycle after a cancel
  const autoCompactArmedThisStream = useRef(false)

  const [attachments, setAttachments] = useState<AttachmentData[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const [webSearchActive, setWebSearchActive] = useState(false)
  const [searchResultsForMessageId, setSearchResultsForMessageId] = useState<Map<number, SearchResult[]>>(new Map())
  const [searchWarning, setSearchWarning] = useState<string | null>(null)

  function isVisionModel(model: string): boolean {
    return /vision|llava|bakllava|moondream/i.test(model)
  }

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
    setAttachments([])
    setIsDragging(false)
    setSearchResultsForMessageId(new Map())
    setWebSearchActive(false)
    setSearchWarning(null)
    isSendingRef.current = false
    activeAbortControllerRef.current?.abort()
    activeAbortControllerRef.current = null

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
      activeAbortControllerRef.current?.abort()
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [])

  async function handleSend() {
    if (!inputText.trim() || isStreaming || isSendingRef.current || !conversation) return

    // Web search pre-send
    let pendingSearchResults: SearchResult[] | null = null
    setSearchWarning(null)

    if (webSearchActive && inputText.trim()) {
      try {
        pendingSearchResults = await api.search(inputText.trim())
      } catch (err: any) {
        if (err.message?.includes('not configured')) {
          setSearchWarning('Web search not configured — add API keys in Settings')
        } else {
          setSearchWarning('Web search failed — sending without search results')
        }
      }
    }

    isSendingRef.current = true
    // Dismiss any pending auto-compact toast when a new message is sent
    setAutoCompactToastVisible(false)
    // Reset the arm guard so the next stream can trigger auto-compact if needed
    autoCompactArmedThisStream.current = false

    const text = inputText
    setInputText('')

    // Build enriched text with file content injected
    let enrichedText = text

    for (const att of attachments) {
      if (att.type === 'text') {
        enrichedText = `\`\`\`${att.language}\n// ${att.filename}\n${att.content}\n\`\`\`\n\n${enrichedText}`
      } else if (att.type === 'pdf') {
        enrichedText = `[PDF: ${att.filename}]\n${att.content}\n\n${enrichedText}`
      } else if (att.type === 'pdf-unreadable') {
        enrichedText = `[PDF: ${att.filename} — could not extract text]\n\n${enrichedText}`
      }
      // images: handled as dataUrl in attachment chips; skipped in text for now
    }

    setAttachments([])

    const estimatedUserTokens = estimateTokens(enrichedText)

    let userMsg, assistantMsg
    try {
      // Create user message on backend
      userMsg = await api.sendMessage(conversation.id, 'user', enrichedText, estimatedUserTokens)

      // Pre-create empty assistant message
      assistantMsg = await api.sendMessage(conversation.id, 'assistant', '', 0)
    } catch (err) {
      console.error('Failed to create messages:', err)
      setInputText(text)
      isSendingRef.current = false
      return
    }

    if (pendingSearchResults && pendingSearchResults.length > 0) {
      setSearchResultsForMessageId(prev => {
        const next = new Map(prev)
        next.set(userMsg.id, pendingSearchResults!)
        return next
      })
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setUsedTokens(prev => prev + estimatedUserTokens)
    setStreamingContent('')
    setStreamingAssistantId(assistantMsg.id)
    setIsStreaming(true)

    const controller = new AbortController()
    activeAbortControllerRef.current = controller
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
              if (m.id === assistantMsg!.id) {
                return { ...m, content: accumulated, tokens: finalTokens, exact_tokens: exactTokens }
              }
              if (usage && m.id === userMsg!.id) {
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
          activeAbortControllerRef.current = null
          isSendingRef.current = false
          if (usage) {
            api.updateMessageTokens(conversation.id, assistantMsg!.id, usage.completion_tokens).catch(e =>
              console.error('Failed to persist assistant token count:', e)
            )
            api.updateMessageTokens(conversation.id, userMsg!.id, usage.prompt_tokens).catch(e =>
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
              m.id === assistantMsg!.id
                ? { ...m, content: `[Error: ${message}]`, tokens: 0 }
                : m
            )
          )
          setStreamingContent('')
          setStreamingAssistantId(null)
          setIsStreaming(false)
          setAbortController(null)
          activeAbortControllerRef.current = null
          isSendingRef.current = false
        },
        controller.signal,
        (results) => {
          // Auto-search sources — associate with the assistant message
          setSearchResultsForMessageId(prev => {
            const next = new Map(prev)
            next.set(assistantMsg!.id, results)
            return next
          })
        }
      )
    } catch (err) {
      console.error('Failed to start streaming:', err)
      setInputText(text)
      setIsStreaming(false)
      setAbortController(null)
      activeAbortControllerRef.current = null
      isSendingRef.current = false
      setStreamingContent('')
      setStreamingAssistantId(null)
      setMessages(prev => prev.filter(m => m.id !== userMsg!.id && m.id !== assistantMsg!.id))
      controller.abort()
    }
  }

  function handleStop() {
    activeAbortControllerRef.current?.abort()
    setAbortController(null)
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
    try {
      const updated = await api.updateConversation(conversation.id, { auto_compact_enabled: newValue })
      onConversationUpdate(updated)
    } catch (err) {
      console.error('Failed to update auto-compact setting:', err)
    }
  }

  function handleAutoCompactToastCancel() {
    setAutoCompactToastVisible(false)
    autoCompactArmedThisStream.current = true
  }

  function handleAutoCompactToastExpire() {
    setAutoCompactToastVisible(false)
    if (conversation) runCompaction(conversation.id)
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    try {
      const results = await api.processFiles(files)
      setAttachments(prev => [...prev, ...results])
    } catch (err) {
      console.error('File processing failed:', err)
    }
  }

  if (!conversation) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>Select a conversation to start</p>
      </div>
    )
  }

  return (
    <div
      style={{ ...styles.container, position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div style={styles.dropOverlay}>
          <span style={styles.dropLabel}>Drop files here</span>
        </div>
      )}
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
          const sources = searchResultsForMessageId.get(msg.id)
          return (
            <div key={msg.id}>
              {sources && <SourcesBlock results={sources} />}
              <MessageBubble
                role={msg.role}
                content={displayContent}
                tokens={displayTokens}
                exact_tokens={isStreamingMsg ? undefined : msg.exact_tokens}
                isStreaming={isStreamingMsg}
                onFork={() => handleFork(msg.id)}
              />
            </div>
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
      {attachments.length > 0 && (
        <div style={styles.attachmentRow}>
          {attachments.map((att, i) => (
            <AttachmentChip
              key={i}
              attachment={att}
              onRemove={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
              isVisionWarning={att.type === 'image' && !isVisionModel(conversation.model)}
            />
          ))}
        </div>
      )}
      <div style={styles.inputArea}>
        <div style={styles.inputToolbar}>
          <button
            onClick={() => setWebSearchActive(a => !a)}
            title={webSearchActive ? 'Disable web search' : 'Enable web search for next message'}
            style={{
              ...styles.toolbarBtn,
              ...(webSearchActive ? styles.toolbarBtnActive : {})
            }}
          >
            🌐
          </button>
        </div>
        {searchWarning && (
          <div style={styles.searchWarning}>{searchWarning}</div>
        )}
        <div style={styles.inputRow}>
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
    flexDirection: 'column',
  },
  inputRow: {
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
  dropOverlay: {
    position: 'absolute', inset: 0, zIndex: 50,
    background: 'rgba(10, 132, 255, 0.12)',
    border: '2px dashed #0a84ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
  },
  dropLabel: { color: '#0a84ff', fontSize: 18, fontWeight: 600 },
  attachmentRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
    padding: '0 16px 8px',
  },
  inputToolbar: {
    display: 'flex', gap: 4, marginBottom: 6,
  },
  toolbarBtn: {
    background: 'none', border: '1px solid #3a3a3c',
    borderRadius: 6, color: '#8e8e93', cursor: 'pointer',
    fontSize: 14, padding: '3px 8px',
  },
  toolbarBtnActive: {
    background: '#0a84ff22', border: '1px solid #0a84ff',
    color: '#0a84ff',
  },
  searchWarning: {
    color: '#ff9f0a', fontSize: 11, marginBottom: 4,
  },
}
