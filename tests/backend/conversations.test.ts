import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/backend/index'
import { createDb } from '../../src/backend/db'
import path from 'path'
import fs from 'fs'

const TEST_DB = path.join(__dirname, 'conv-test.db')

describe('conversations API', () => {
  let app: ReturnType<typeof createApp>['app']
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(TEST_DB)
    app = createApp({ db, lmStudioUrl: 'http://localhost:1234' }).app
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(TEST_DB)
  })

  it('GET /api/conversations returns empty array initially', async () => {
    const res = await request(app).get('/api/conversations')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('POST /api/conversations creates a conversation', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ name: 'Test chat', model: 'auto' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.name).toBe('Test chat')
  })

  it('DELETE /api/conversations/:id removes it', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'To delete', model: 'auto' })
    const id = create.body.id
    const del = await request(app).delete(`/api/conversations/${id}`)
    expect(del.status).toBe(204)
    const list = await request(app).get('/api/conversations')
    expect(list.body).toHaveLength(0)
  })

  it('GET /api/conversations/:id/messages returns messages', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Chat', model: 'auto' })
    const id = create.body.id
    db.addMessage({ conversationId: id, role: 'user', content: 'Hello', tokens: 5 })
    const res = await request(app).get(`/api/conversations/${id}/messages`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].content).toBe('Hello')
  })

  it('PATCH /api/conversations/:id updates model', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Chat', model: 'auto' })
    const id = create.body.id
    const res = await request(app)
      .patch(`/api/conversations/${id}`)
      .send({ model: 'phi-2' })
    expect(res.status).toBe(200)
    expect(res.body.model).toBe('phi-2')
    expect(res.body.name).toBe('Chat')
  })

  it('PATCH /api/conversations/:id updates name', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Old name', model: 'auto' })
    const id = create.body.id
    const res = await request(app)
      .patch(`/api/conversations/${id}`)
      .send({ name: 'New name' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New name')
    expect(res.body.model).toBe('auto')
  })

  it('PATCH /api/conversations/:id returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/conversations/9999')
      .send({ model: 'phi-2' })
    expect(res.status).toBe(404)
  })

  it('POST /api/conversations/:id/messages persists a message', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Chat', model: 'auto' })
    const id = create.body.id
    const res = await request(app)
      .post(`/api/conversations/${id}/messages`)
      .send({ role: 'user', content: 'hi', tokens: 0 })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.role).toBe('user')
    expect(res.body.content).toBe('hi')
    expect(res.body.tokens).toBe(0)
    const messages = db.getMessages(id)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('hi')
  })

  it('POST /api/conversations/:id/messages returns 404 for unknown conversation', async () => {
    const res = await request(app)
      .post('/api/conversations/9999/messages')
      .send({ role: 'user', content: 'hi', tokens: 0 })
    expect(res.status).toBe(404)
  })

  it('PATCH /api/conversations/:id updates context_window and auto_compact fields', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Chat', model: 'auto' })
    const id = create.body.id
    const res = await request(app)
      .patch(`/api/conversations/${id}`)
      .send({ name: 'renamed', context_window: 8192, auto_compact_enabled: 0 })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('renamed')
    expect(res.body.context_window).toBe(8192)
    expect(res.body.auto_compact_enabled).toBe(0)
  })

  it('POST /api/conversations/:id/fork creates a fork with messages up to fromMessageId', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Original', model: 'auto' })
    const id = create.body.id
    const m1 = db.addMessage({ conversationId: id, role: 'user', content: 'Hello', tokens: 5 })
    const m2 = db.addMessage({ conversationId: id, role: 'assistant', content: 'Hi', tokens: 3 })
    db.addMessage({ conversationId: id, role: 'user', content: 'Keep going', tokens: 4 })
    const res = await request(app)
      .post(`/api/conversations/${id}/fork`)
      .send({ fromMessageId: m2 })
    expect(res.status).toBe(201)
    expect(res.body.id).not.toBe(id)
    expect(res.body.name).toBe('Original (fork)')
    const forkedMessages = db.getMessages(res.body.id)
    expect(forkedMessages).toHaveLength(2)
    expect(forkedMessages[0].content).toBe('Hello')
    expect(forkedMessages[1].content).toBe('Hi')
  })

  it('POST /api/conversations/:id/fork returns 404 for unknown conversation', async () => {
    const res = await request(app)
      .post('/api/conversations/9999/fork')
      .send({ fromMessageId: 1 })
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })

  it('POST /api/conversations/promote creates a persistent conversation with messages', async () => {
    const res = await request(app)
      .post('/api/conversations/promote')
      .send({
        name: 'Promoted chat',
        model: 'phi-2',
        messages: [
          { role: 'user', content: 'First', tokens: 2 },
          { role: 'assistant', content: 'Second', tokens: 3 },
        ],
      })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.name).toBe('Promoted chat')
    expect(res.body.model).toBe('phi-2')
    const messages = db.getMessages(res.body.id)
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('First')
    expect(messages[1].content).toBe('Second')
  })

  it('updateMessageTokens corrects token count', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Chat', model: 'auto' })
    const convId = create.body.id
    const msgId = db.addMessage({ conversationId: convId, role: 'assistant', content: 'Hello!', tokens: 0 })
    db.updateMessageTokens(msgId, 42)
    const messages = db.getMessages(convId)
    expect(messages[0].exact_tokens).toBe(42)
  })
})
