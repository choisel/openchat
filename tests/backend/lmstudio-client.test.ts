import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLmStudioClient } from '../../src/backend/lmstudio-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('LmStudioClient', () => {
  const client = createLmStudioClient('http://127.0.0.1:1234')

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches available models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'mistral-7b', owned_by: 'local' },
          { id: 'phi-2', owned_by: 'local' }
        ]
      })
    })

    const models = await client.listModels()
    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('mistral-7b')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/v1/models',
      expect.any(Object)
    )
  })

  it('throws when LM Studio is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    await expect(client.listModels()).rejects.toThrow('LM Studio unreachable')
  })

  it('returns isConnected false when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const result = await client.checkConnection()
    expect(result.connected).toBe(false)
  })

  it('returns isConnected true when fetch succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] })
    })
    const result = await client.checkConnection()
    expect(result.connected).toBe(true)
  })

  it('handles chat stream with split chunks', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hel"}}'))
        controller.enqueue(new TextEncoder().encode(']}\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockStream
    })

    let tokens = ''
    await client.chatStream({
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: (t) => { tokens += t }
    })

    expect(tokens).toBe('Hello')

    // Verify payload mapping
    const fetchCall = mockFetch.mock.calls[0]
    const payload = JSON.parse(fetchCall[1].body)
    expect(payload.messages[0]).toEqual({ role: 'user', content: 'hi' })
    expect(Object.keys(payload.messages[0])).toHaveLength(2)
  })
})
