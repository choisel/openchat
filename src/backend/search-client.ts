export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export class SearchUnavailableError extends Error {
  constructor(message = 'Web search not configured') {
    super(message)
    this.name = 'SearchUnavailableError'
  }
}

export interface SearchClientOptions {
  braveKey?: string
  tavilyKey?: string
}

export interface SearchClient {
  search: (query: string) => Promise<SearchResult[]>
}

export function createSearchClient({ braveKey, tavilyKey }: SearchClientOptions): SearchClient {
  return {
    async search(query: string): Promise<SearchResult[]> {
      if (!braveKey && !tavilyKey) throw new SearchUnavailableError()

      if (braveKey) {
        try {
          const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`
          const res = await fetch(url, {
            headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey }
          })
          if (res.ok) {
            const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description?: string }> } }
            const results = data.web?.results ?? []
            return results.map(r => ({ title: r.title, url: r.url, snippet: r.description ?? '' }))
          }
          console.warn('[search] Brave returned', res.status, '— falling back to Tavily')
        } catch (err) {
          console.warn('[search] Brave request failed:', err, '— falling back to Tavily')
        }
      }

      if (tavilyKey) {
        try {
          const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tavilyKey}`
            },
            body: JSON.stringify({ query, max_results: 5 })
          })
          if (res.ok) {
            const data = await res.json() as { results?: Array<{ title: string; url: string; content?: string }> }
            const results = data.results ?? []
            return results.map(r => ({ title: r.title, url: r.url, snippet: r.content ?? '' }))
          }
          console.warn('[search] Tavily returned', res.status)
        } catch (err) {
          console.warn('[search] Tavily request failed:', err)
        }
      }

      throw new SearchUnavailableError('All search providers failed')
    }
  }
}
