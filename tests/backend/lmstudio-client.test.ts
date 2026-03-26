import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLmStudioClient } from '../../src/backend/lmstudio-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('LmStudioClient', () => {
  const client = createLmStudioClient('http://localhost:1234')

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
      'http://localhost:1234/v1/models',
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
})
