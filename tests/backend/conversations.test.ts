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
})
