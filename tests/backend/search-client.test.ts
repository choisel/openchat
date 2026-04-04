import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSearchClient, SearchUnavailableError } from '../../src/backend/search-client'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('SearchClient', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('uses Brave when key is present and returns results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'Result 1', url: 'https://example.com', description: 'Snippet 1' },
            { title: 'Result 2', url: 'https://other.com', description: 'Snippet 2' },
          ]
        }
      })
    })

    const client = createSearchClient({ braveKey: 'brave-key-123' })
    const results = await client.search('test query')

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Result 1', url: 'https://example.com', snippet: 'Snippet 1' })
    expect(mockFetch).toHaveBeenCalledOnce()
    const callUrl = mockFetch.mock.calls[0][0] as string
    expect(callUrl).toContain('api.search.brave.com')
    expect(callUrl).toContain('test%20query')
  })

  it('falls back to Tavily when Brave returns non-2xx', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ title: 'Tavily Result', url: 'https://tavily.com', content: 'Tavily snippet' }]
        })
      })

    const client = createSearchClient({ braveKey: 'bad-key', tavilyKey: 'tavily-key-456' })
    const results = await client.search('fallback query')

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Tavily Result')
    expect(results[0].snippet).toBe('Tavily snippet')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const secondUrl = mockFetch.mock.calls[1][0] as string
    expect(secondUrl).toContain('tavily')
  })

  it('falls back to Tavily when Brave key is absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ title: 'T', url: 'https://t.com', content: 'snippet' }]
      })
    })

    const client = createSearchClient({ tavilyKey: 'tavily-only' })
    const results = await client.search('no brave')

    expect(results).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledOnce()
    const callUrl = mockFetch.mock.calls[0][0] as string
    expect(callUrl).toContain('tavily')
  })

  it('throws SearchUnavailableError when both keys absent', async () => {
    const client = createSearchClient({})
    await expect(client.search('no keys')).rejects.toThrow(SearchUnavailableError)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws SearchUnavailableError when both providers fail', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    const client = createSearchClient({ braveKey: 'k1', tavilyKey: 'k2' })
    await expect(client.search('both fail')).rejects.toThrow(SearchUnavailableError)
  })
})
