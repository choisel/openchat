export interface LmModel {
  id: string
  owned_by: string
  object?: string
}

export interface LmStudioClient {
  listModels: () => Promise<LmModel[]>
  checkConnection: () => Promise<{ connected: boolean }>
  chatStream: (args: {
    model: string
    messages: { role: string; content: string }[]
    onToken: (token: string) => void
    signal?: AbortSignal
  }) => Promise<{ usage?: { prompt_tokens: number; completion_tokens: number } }>
}

export function createLmStudioClient(baseUrl: string): LmStudioClient {
  async function fetchJson(path: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch {
      throw new Error('LM Studio unreachable')
    }
    if (!response.ok) throw new Error(`LM Studio error: ${response.status}`)
    return response.json()
  }

  return {
    async listModels() {
      const data = await fetchJson('/v1/models') as { data: LmModel[] }
      return data.data
    },

    async checkConnection() {
      try {
        await fetchJson('/v1/models')
        return { connected: true }
      } catch {
        return { connected: false }
      }
    },

    async chatStream({ model, messages, onToken, signal }) {
      let response: Response
      try {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
          signal
        })
      } catch {
        throw new Error('LM Studio unreachable')
      }

      if (!response.ok) throw new Error(`LM Studio error: ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let usage: { prompt_tokens: number; completion_tokens: number } | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          const trimmed = line.replace(/^data: /, '').trim()
          if (!trimmed || trimmed === '[DONE]') continue
          try {
            const parsed = JSON.parse(trimmed)
            const token = parsed.choices?.[0]?.delta?.content
            if (token) onToken(token)
            if (parsed.usage) usage = parsed.usage
          } catch {
            // malformed SSE line — skip
          }
        }
      }

      return { usage }
    }
  }
}
