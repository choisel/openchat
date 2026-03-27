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

  it('updateMessageTokens corrects token count', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Chat', model: 'auto' })
    const convId = create.body.id
    const msgId = db.addMessage({ conversationId: convId, role: 'assistant', content: 'Hello!', tokens: 0 })
    db.updateMessageTokens(msgId, 42)
    const messages = db.getMessages(convId)
    expect(messages[0].tokens).toBe(42)
  })
})
