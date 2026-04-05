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

  it('emits onToolCall when finish_reason is tool_calls', async () => {
    const toolCallChunk = JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_abc',
            function: { name: 'web_search', arguments: '{"query":"test query"}' }
          }]
        },
        finish_reason: 'tool_calls'
      }]
    })
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${toolCallChunk}\n`))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValueOnce({ ok: true, body: mockStream })

    const toolCalls: Array<{ name: string; args: string }> = []
    await client.chatStream({
      model: 'test',
      messages: [{ role: 'user', content: 'search for something' }],
      onToken: () => {},
      onToolCall: (name, args) => toolCalls.push({ name, args })
    })

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('web_search')
    expect(toolCalls[0].args).toBe('{"query":"test query"}')
  })

  it('sends tools array in payload when provided', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n'))
        controller.close()
      }
    })
    mockFetch.mockResolvedValueOnce({ ok: true, body: mockStream })

    await client.chatStream({
      model: 'test',
      messages: [{ role: 'user', content: 'hello' }],
      onToken: () => {},
      tools: [{
        type: 'function' as const,
        function: { name: 'web_search', description: 'Search', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }
      }]
    })

    const payload = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(payload.tools).toBeDefined()
    expect(payload.tools[0].function.name).toBe('web_search')
  })
})
