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
})
