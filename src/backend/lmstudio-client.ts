export interface LmModel {
  id: string
  owned_by: string
  object?: string
  context_length?: number
}

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface LmStudioClient {
  listModels: () => Promise<LmModel[]>
  checkConnection: () => Promise<{ connected: boolean }>
  chatStream: (args: {
    model: string
    messages: Array<{ role: string; content: string | MessageContentPart[] }>
    onToken: (token: string) => void
    signal?: AbortSignal
  }) => Promise<{ usage?: { prompt_tokens: number; completion_tokens: number } }>
  summarize: (
    messages: { role: string; content: string }[],
    model: string,
    signal: AbortSignal
  ) => Promise<string>
}

export function createLmStudioClient(baseUrl: string): LmStudioClient {
  console.log('[lmstudio] client configured with base URL:', baseUrl)

  async function fetchJson(path: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (err) {
      console.error('[lmstudio] network error on GET', path, err)
      throw new Error('LM Studio unreachable')
    }
    if (!response.ok) throw new Error(`LM Studio error: ${response.status}`)
    return response.json()
  }

  return {
    async listModels() {
      console.log('[lmstudio] GET /v1/models')
      const data = await fetchJson('/v1/models') as { data: LmModel[] }
      console.log('[lmstudio] models:', data.data.map(m => m.id))
      return data.data
    },

    async checkConnection() {
      try {
        await fetchJson('/v1/models')
        console.log('[lmstudio] status: connected')
        return { connected: true }
      } catch {
        console.log('[lmstudio] status: offline')
        return { connected: false }
      }
    },

    async summarize(messages, model, signal) {
      const prompt = [
        {
          role: 'system',
          content:
            'Provide a concise summary of the conversation below, preserving all key information and decisions.'
        },
        ...messages
      ]
      const payload = { model, messages: prompt, stream: false }
      console.log('[lmstudio] POST /v1/chat/completions (summarize) model=%s messages=%d', model, prompt.length)
      console.log('[lmstudio] summarize payload:', JSON.stringify(payload, null, 2))

      let response: Response
      try {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal
        })
      } catch (err) {
        console.error('[lmstudio] network error on summarize:', err)
        throw new Error('LM Studio unreachable')
      }
      if (!response.ok) throw new Error(`LM Studio error: ${response.status}`)
      const data = await response.json() as {
        choices: { message: { content: string } }[]
      }
      console.log('[lmstudio] summarize response ok')
      return data.choices[0].message.content
    },

    async chatStream({ model, messages, onToken, signal }) {
      const payload = { model, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: true }
      console.log('[lmstudio] POST /v1/chat/completions (stream) model=%s messages=%d', model, messages.length)
      console.log('[lmstudio] chat payload:', JSON.stringify(payload, null, 2))

      let response: Response
      try {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal
        })
      } catch (err) {
        console.error('[lmstudio] network error on chatStream:', err)
        throw new Error('LM Studio unreachable')
      }

      if (!response.ok) {
        console.error('[lmstudio] chatStream HTTP error:', response.status)
        throw new Error(`LM Studio error: ${response.status}`)
      }
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let usage: { prompt_tokens: number; completion_tokens: number } | undefined
      let tokenCount = 0
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.replace(/^data:\s*/, '').trim()
            if (!trimmed || trimmed === '[DONE]') continue
            try {
              const parsed = JSON.parse(trimmed)
              const token = parsed.choices?.[0]?.delta?.content
              if (token) {
                tokenCount++
                onToken(token)
              }
              if (parsed.usage) usage = parsed.usage
            } catch {
              // malformed SSE line — skip
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      console.log('[lmstudio] chatStream complete tokens=%d usage=%j', tokenCount, usage)
      return { usage }
    }
  }
}
