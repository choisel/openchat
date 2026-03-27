declare global {
  interface Window {
    electronAPI: { getBackendPort: () => Promise<number> }
  }
}

let baseUrl: string | null = null

async function getBaseUrl(): Promise<string> {
  if (!baseUrl) {
    const port = await window.electronAPI.getBackendPort()
    baseUrl = `http://localhost:${port}`
  }
  return baseUrl
}

export interface Conversation {
  id: number
  name: string
  model: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  tokens: number
  created_at: string
}

export const api = {
  async listConversations(): Promise<Conversation[]> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations`)
    return res.json()
  },

  async createConversation(name: string, model = 'auto'): Promise<Conversation> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, model })
    })
    return res.json()
  },

  async deleteConversation(id: number): Promise<void> {
    const base = await getBaseUrl()
    await fetch(`${base}/api/conversations/${id}`, { method: 'DELETE' })
  },

  async getMessages(conversationId: number): Promise<Message[]> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations/${conversationId}/messages`)
    return res.json()
  },

  async getLmStatus(): Promise<{ connected: boolean }> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/lmstudio/status`)
    return res.json()
  },

  async listModels(): Promise<{ id: string }[]> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/lmstudio/models`)
    return res.json()
  },

  async getRoutingHealth(): Promise<{ consecutiveFailures: number }> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/lmstudio/routing-health`)
    return res.json()
  },

  async sendMessage(conversationId: number, role: 'user' | 'assistant', content: string, tokens: number): Promise<Message> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content, tokens })
    })
    return res.json()
  },

  async updateConversationModel(conversationId: number, model: string): Promise<Conversation> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    })
    return res.json()
  },

  async updateConversation(conversationId: number, fields: Partial<Pick<Conversation, 'name' | 'model'>>): Promise<Conversation> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    })
    return res.json()
  },

  async streamChat(
    conversationId: number,
    assistantMessageId: number,
    onToken: (token: string) => void,
    onDone: (usage?: { prompt_tokens: number; completion_tokens: number }) => void,
    onError: (message: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/chat/${conversationId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantMessageId }),
      signal
    })

    if (!res.body) {
      onError('No response body')
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonStr = line.slice(5).trim()
            if (jsonStr) {
              try {
                const event = JSON.parse(jsonStr)
                if (event.type === 'token') {
                  onToken(event.token)
                } else if (event.type === 'done') {
                  onDone(event.usage)
                } else if (event.type === 'error') {
                  onError(event.message)
                }
              } catch (e) {
                onError(`Failed to parse event: ${jsonStr}`)
              }
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        onError(e.message)
      }
    } finally {
      reader.releaseLock()
    }
  }
}
