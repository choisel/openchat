import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/backend/index'
import { createDb } from '../../src/backend/db'
import type { LmStudioClient } from '../../src/backend/lmstudio-client'
import path from 'path'
import fs from 'fs'

const TEST_DB = path.join(__dirname, 'chat-test.db')

function makeMockClient(overrides: Partial<LmStudioClient> = {}): LmStudioClient {
  return {
    listModels: vi.fn().mockResolvedValue([{ id: 'test-model', owned_by: 'test' }]),
    checkConnection: vi.fn().mockResolvedValue({ connected: true }),
    chatStream: vi.fn().mockImplementation(async ({ onToken }) => {
      onToken('Hello')
      onToken(' world')
      return { usage: { prompt_tokens: 10, completion_tokens: 5 } }
    }),
    summarize: vi.fn().mockResolvedValue('Mock summary'),
    ...overrides,
  }
}

/**
 * Collect SSE events from a supertest response buffer.
 * Returns an array of parsed JSON objects from `data: ...` lines.
 */
function parseSseEvents(text: string): unknown[] {
  const events: unknown[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data: ')) {
      try {
        events.push(JSON.parse(trimmed.slice(6)))
      } catch {
        // skip malformed lines
      }
    }
  }
  return events
}

describe('POST /api/chat/:conversationId SSE streaming', () => {
  let app: ReturnType<typeof createApp>['app']
  let db: ReturnType<typeof createDb>
  let mockClient: LmStudioClient
  let convId: number
  let assistantMsgId: number

  beforeEach(() => {
    db = createDb(TEST_DB)
    mockClient = makeMockClient()
    app = createApp({ db, lmStudioUrl: 'http://localhost:1234', lmClient: mockClient }).app

    convId = db.createConversation({ name: 'Test chat', model: 'test-model' })
    db.addMessage({ conversationId: convId, role: 'user', content: 'Say hello', tokens: 3 })
    assistantMsgId = db.addMessage({ conversationId: convId, role: 'assistant', content: '', tokens: 0 })
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
  })

  it('produces token events followed by a done event', async () => {
    const res = await request(app)
      .post(`/api/chat/${convId}`)
      .send({ assistantMessageId: assistantMsgId })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)

    const events = parseSseEvents(res.body as string)
    const tokenEvents = events.filter((e: any) => e.type === 'token')
    const doneEvents = events.filter((e: any) => e.type === 'done')

    expect(tokenEvents).toHaveLength(2)
    expect(tokenEvents[0]).toEqual({ type: 'token', content: 'Hello' })
    expect(tokenEvents[1]).toEqual({ type: 'token', content: ' world' })

    expect(doneEvents).toHaveLength(1)
    expect((doneEvents[0] as any).usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 })
  })

  it('updates assistant message tokens after done', async () => {
    await request(app)
      .post(`/api/chat/${convId}`)
      .send({ assistantMessageId: assistantMsgId })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })

    const messages = db.getMessages(convId)
    const assistantMsg = messages.find(m => m.id === assistantMsgId)
    expect(assistantMsg?.exact_tokens).toBe(5)
  })

  it('falls back to first loaded model when conversation model is "auto"', async () => {
    const autoConvId = db.createConversation({ name: 'Auto model chat', model: 'auto' })
    db.addMessage({ conversationId: autoConvId, role: 'user', content: 'Hi', tokens: 1 })
    const autoAsstId = db.addMessage({ conversationId: autoConvId, role: 'assistant', content: '', tokens: 0 })

    const res = await request(app)
      .post(`/api/chat/${autoConvId}`)
      .send({ assistantMessageId: autoAsstId })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })

    expect(res.status).toBe(200)
    const chatStreamCalls = (mockClient.chatStream as ReturnType<typeof vi.fn>).mock.calls
    expect(chatStreamCalls[0][0].model).toBe('test-model') // resolved from listModels
  })

  it('returns 404 when conversation does not exist', async () => {
    const res = await request(app)
      .post('/api/chat/9999')
      .send({ assistantMessageId: 1 })

    expect(res.status).toBe(404)
  })

  it('emits error event when LM Studio returns 503', async () => {
    const errorClient = makeMockClient({
      chatStream: vi.fn().mockRejectedValue(new Error('LM Studio error: 503')),
    })
    const errorApp = createApp({ db, lmStudioUrl: 'http://localhost:1234', lmClient: errorClient }).app

    const res = await request(errorApp)
      .post(`/api/chat/${convId}`)
      .send({ assistantMessageId: assistantMsgId })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })

    expect(res.status).toBe(200)
    const events = parseSseEvents(res.body as string)
    const errorEvents = events.filter((e: any) => e.type === 'error')
    expect(errorEvents).toHaveLength(1)
    expect((errorEvents[0] as any).message).toContain('503')
  })

  it('fires AbortController signal on client disconnect', async () => {
    let capturedSignal: AbortSignal | undefined

    const abortClient = makeMockClient({
      chatStream: vi.fn().mockImplementation(async ({ onToken, signal }) => {
        capturedSignal = signal
        // Simulate a slow stream: wait for abort or end
        await new Promise<void>((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
          // Emit one token then hang
          onToken('partial')
          // Never resolves on its own — relies on abort
        })
        return { usage: undefined }
      }),
    })

    const abortApp = createApp({ db, lmStudioUrl: 'http://localhost:1234', lmClient: abortClient }).app

    // We use a low-level HTTP request so we can destroy it mid-stream
    const http = await import('http')
    const net = await import('net')

    await new Promise<void>((resolve) => {
      const server = abortApp.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number }
        const socket = net.createConnection(addr.port, '127.0.0.1', () => {
          const body = JSON.stringify({ assistantMessageId: assistantMsgId })
          socket.write(
            `POST /api/chat/${convId} HTTP/1.1\r\n` +
            `Host: 127.0.0.1\r\n` +
            `Content-Type: application/json\r\n` +
            `Content-Length: ${Buffer.byteLength(body)}\r\n` +
            `Connection: close\r\n\r\n` +
            body
          )
        })

        // Destroy socket after receiving at least the first token event
        let received = ''
        socket.on('data', (chunk: Buffer) => {
          received += chunk.toString()
          if (received.includes('"type":"token"')) {
            socket.destroy()
          }
        })

        socket.on('close', () => {
          // Give the server a moment to fire the abort
          setTimeout(() => {
            server.close()
            resolve()
          }, 50)
        })
      })
    })

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal?.aborted).toBe(true)
  })
})
