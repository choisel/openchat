import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDb, type Db } from '../../src/backend/db'
import path from 'path'
import fs from 'fs'

const TEST_DB_PATH = path.join(__dirname, 'test.db')

describe('db', () => {
  let db: Db

  beforeEach(() => {
    db = createDb(TEST_DB_PATH)
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(TEST_DB_PATH)
  })

  it('creates conversations table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('conversations')
    expect(names).toContain('messages')
  })

  it('inserts and retrieves a conversation', () => {
    const id = db.createConversation({ name: 'Test chat', model: 'auto' })
    const conv = db.getConversation(id)
    expect(conv?.name).toBe('Test chat')
    expect(conv?.model).toBe('auto')
  })

  it('inserts and retrieves messages for a conversation', () => {
    const convId = db.createConversation({ name: 'Test', model: 'auto' })
    db.addMessage({ conversationId: convId, role: 'user', content: 'Hello', tokens: 5 })
    const messages = db.getMessages(convId)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Hello')
    expect(messages[0].role).toBe('user')
  })

  it('lists all conversations ordered by updated_at desc', () => {
    db.createConversation({ name: 'First', model: 'auto' })
    db.createConversation({ name: 'Second', model: 'auto' })
    const convs = db.listConversations()
    expect(convs).toHaveLength(2)
    expect(convs[0].name).toBe('Second')
  })

  it('deletes a conversation and its messages', () => {
    const id = db.createConversation({ name: 'ToDelete', model: 'auto' })
    db.addMessage({ conversationId: id, role: 'user', content: 'hi', tokens: 2 })
    db.deleteConversation(id)
    expect(db.getConversation(id)).toBeUndefined()
    expect(db.getMessages(id)).toHaveLength(0)
  })

  // --- New columns ---

  it('conversations have default context_window = 4096', () => {
    const id = db.createConversation({ name: 'ctx', model: 'auto' })
    const conv = db.getConversation(id)
    expect(conv?.context_window).toBe(4096)
  })

  it('conversations have default auto_compact_threshold = 0.8', () => {
    const id = db.createConversation({ name: 'ctx', model: 'auto' })
    const conv = db.getConversation(id)
    expect(conv?.auto_compact_threshold).toBeCloseTo(0.8)
  })

  it('conversations have default auto_compact_enabled = 1', () => {
    const id = db.createConversation({ name: 'ctx', model: 'auto' })
    const conv = db.getConversation(id)
    expect(conv?.auto_compact_enabled).toBe(1)
  })

  it('messages have nullable exact_tokens column defaulting to null', () => {
    const convId = db.createConversation({ name: 'tok', model: 'auto' })
    db.addMessage({ conversationId: convId, role: 'user', content: 'hi', tokens: 3 })
    const msgs = db.getMessages(convId)
    expect(msgs[0].exact_tokens).toBeNull()
  })

  // --- New helpers ---

  it('updateMessageTokens sets exact_tokens on a message', () => {
    const convId = db.createConversation({ name: 'tok', model: 'auto' })
    const msgId = db.addMessage({ conversationId: convId, role: 'user', content: 'hi', tokens: 3 })
    db.updateMessageTokens(msgId, 42)
    const msgs = db.getMessages(convId)
    expect(msgs[0].exact_tokens).toBe(42)
  })

  it('addCompactedMarker inserts a system message with correct content', () => {
    const convId = db.createConversation({ name: 'compact', model: 'auto' })
    db.addMessage({ conversationId: convId, role: 'user', content: 'a', tokens: 1 })
    db.addMessage({ conversationId: convId, role: 'assistant', content: 'b', tokens: 1 })
    db.addCompactedMarker(convId, 2)
    const msgs = db.getMessages(convId)
    const marker = msgs.find(m => m.role === 'system')
    expect(marker).toBeDefined()
    expect(marker?.content).toBe('[Compacted — 2 messages summarized]')
  })

  it('forkConversation creates a new conversation with messages up to fromMessageId', () => {
    const convId = db.createConversation({ name: 'original', model: 'gpt-4' })
    const m1 = db.addMessage({ conversationId: convId, role: 'user', content: 'first', tokens: 1 })
    const m2 = db.addMessage({ conversationId: convId, role: 'assistant', content: 'second', tokens: 2 })
    db.addMessage({ conversationId: convId, role: 'user', content: 'third', tokens: 3 })

    const forked = db.forkConversation(convId, m2)
    expect(forked.id).not.toBe(convId)
    expect(forked.model).toBe('gpt-4')

    const forkedMsgs = db.getMessages(forked.id)
    expect(forkedMsgs).toHaveLength(2)
    expect(forkedMsgs[0].content).toBe('first')
    expect(forkedMsgs[1].content).toBe('second')
  })

  it('forkConversation inherits auto_compact_threshold and auto_compact_enabled', () => {
    const convId = db.createConversation({ name: 'src', model: 'auto' })
    db.updateConversation(convId, { auto_compact_threshold: 0.6, auto_compact_enabled: 0 })
    const m1 = db.addMessage({ conversationId: convId, role: 'user', content: 'x', tokens: 1 })

    const forked = db.forkConversation(convId, m1)
    expect(forked.auto_compact_threshold).toBeCloseTo(0.6)
    expect(forked.auto_compact_enabled).toBe(0)
  })

  it('updateConversation updates context_window, auto_compact_threshold, auto_compact_enabled', () => {
    const id = db.createConversation({ name: 'u', model: 'auto' })
    db.updateConversation(id, { context_window: 8192, auto_compact_threshold: 0.5, auto_compact_enabled: 0 })
    const conv = db.getConversation(id)
    expect(conv?.context_window).toBe(8192)
    expect(conv?.auto_compact_threshold).toBeCloseTo(0.5)
    expect(conv?.auto_compact_enabled).toBe(0)
  })
})
