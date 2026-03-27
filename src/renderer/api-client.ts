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
  }
}
