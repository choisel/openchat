import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/backend/index'
import { createDb } from '../../src/backend/db'
import type { LmStudioClient } from '../../src/backend/lmstudio-client'
import path from 'path'
import fs from 'fs'

const TEST_DB = path.join(__dirname, 'compaction-test.db')

function makeMockClient(overrides: Partial<LmStudioClient> = {}): LmStudioClient {
  return {
    listModels: vi.fn().mockResolvedValue([]),
    checkConnection: vi.fn().mockResolvedValue({ connected: true }),
    chatStream: vi.fn().mockResolvedValue({ usage: undefined }),
    summarize: vi.fn().mockResolvedValue('Mock summary'),
    ...overrides
  }
}

describe('POST /api/conversations/:id/compact', () => {
  let app: ReturnType<typeof createApp>['app']
  let db: ReturnType<typeof createDb>
  let lmClient: LmStudioClient

  beforeEach(() => {
    db = createDb(TEST_DB)
    lmClient = makeMockClient()
    app = createApp({ db, lmStudioUrl: 'http://localhost:1234', lmClient }).app
  })

  afterEach(() => {
    db.close()
    try { fs.unlinkSync(TEST_DB) } catch { /* ignore */ }
  })

  it('success path: compact 10 messages → summary + last 4 + marker (6 rows)', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .send({ name: 'Test', model: 'some-model' })
    const convId = convRes.body.id

    // Insert 10 messages
    for (let i = 1; i <= 10; i++) {
      db.addMessage({ conversationId: convId, role: i % 2 === 0 ? 'assistant' : 'user', content: `Message ${i}`, tokens: 5 })
    }

    lmClient.summarize = vi.fn().mockResolvedValue('Concise summary of messages 1-6')

    const res = await request(app)
      .post(`/api/conversations/${convId}/compact`)
      .send({ keep: 4 })

    expect(res.status).toBe(200)
    const { messages } = res.body

    // 1 summary + 4 kept + 1 marker = 6
    expect(messages).toHaveLength(6)

    // First message is the summary (assistant role)
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toBe('Concise summary of messages 1-6')

    // Last message is the compaction marker (system role)
    const marker = messages[messages.length - 1]
    expect(marker.role).toBe('system')
    expect(marker.content).toContain('6 messages summarized')

    // Middle 4 are the original last 4 messages
    expect(messages[1].content).toBe('Message 7')
    expect(messages[2].content).toBe('Message 8')
    expect(messages[3].content).toBe('Message 9')
    expect(messages[4].content).toBe('Message 10')
  })

  it('HTTP error path: LM Studio returns 500 → 422, DB unchanged', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .send({ name: 'Test', model: 'some-model' })
    const convId = convRes.body.id

    for (let i = 1; i <= 6; i++) {
      db.addMessage({ conversationId: convId, role: 'user', content: `Message ${i}`, tokens: 3 })
    }

    const originalMessages = db.getMessages(convId)

    lmClient.summarize = vi.fn().mockRejectedValue(new Error('LM Studio error: 500'))

    const res = await request(app)
      .post(`/api/conversations/${convId}/compact`)
      .send({ keep: 4 })

    expect(res.status).toBe(422)
    expect(res.body).toEqual({
      error: 'compaction_failed',
      details: res.body.details
    })

    // DB unchanged
    const messagesAfter = db.getMessages(convId)
    expect(messagesAfter).toHaveLength(originalMessages.length)
    expect(messagesAfter.map(m => m.content)).toEqual(originalMessages.map(m => m.content))
  })

  it('timeout path: summarize rejects with AbortError → 422, DB unchanged', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .send({ name: 'Test', model: 'some-model' })
    const convId = convRes.body.id

    for (let i = 1; i <= 6; i++) {
      db.addMessage({ conversationId: convId, role: 'user', content: `Message ${i}`, tokens: 3 })
    }

    const originalMessages = db.getMessages(convId)

    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    lmClient.summarize = vi.fn().mockRejectedValue(abortError)

    const res = await request(app)
      .post(`/api/conversations/${convId}/compact`)
      .send({ keep: 4 })

    expect(res.status).toBe(422)
    expect(res.body).toEqual({
      error: 'compaction_failed',
      details: res.body.details
    })

    // DB unchanged
    const messagesAfter = db.getMessages(convId)
    expect(messagesAfter).toHaveLength(originalMessages.length)
    expect(messagesAfter.map(m => m.content)).toEqual(originalMessages.map(m => m.content))
  })
})
