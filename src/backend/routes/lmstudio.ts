import { Router } from 'express'
import type { LmStudioClient, LmModel } from '../lmstudio-client'
import type { Db } from '../db'
import type { ModelRouter } from '../model-router'

// 30-second in-memory cache for the model list
interface ModelCache {
  value: LmModel[]
  fetchedAt: number
}
const MODEL_CACHE_TTL_MS = 30_000
let modelCache: ModelCache | null = null

async function getCachedModels(client: LmStudioClient): Promise<LmModel[]> {
  const now = Date.now()
  if (modelCache && now - modelCache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return modelCache.value
  }
  const value = await client.listModels()
  modelCache = { value, fetchedAt: now }
  return value
}

export function createLmStudioRouter(client: LmStudioClient, db: Db, modelRouter: ModelRouter): Router {
  const router = Router()

  router.get('/models', async (_req, res) => {
    try {
      const models = await client.listModels()
      res.json(models)
    } catch {
      res.json([])
    }
  })

  router.get('/status', async (_req, res) => {
    const result = await client.checkConnection()
    res.json(result)
  })

  router.get('/routing-health', (_req, res) => {
    res.json({ consecutiveFailures: modelRouter.getConsecutiveFailures() })
  })

  return router
}

export function createChatRouter(client: LmStudioClient, db: Db, modelRouter: ModelRouter): Router {
  const router = Router()

  router.post('/:conversationId', async (req, res) => {
    const conversationId = Number(req.params.conversationId)
    const { assistantMessageId } = req.body as { assistantMessageId?: number }

    const conversation = db.getConversation(conversationId)
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' })
      return
    }

    // Resolve model: use ModelRouter when "auto", otherwise use the specified model directly
    let model = conversation.model
    if (!model || model === 'auto') {
      // Build messages to extract the latest user message for routing
      const dbMessages = db.getMessages(conversationId)
      const lastUserMessage = [...dbMessages].reverse().find(m => m.role === 'user')
      const userMessageText = lastUserMessage?.content ?? ''

      try {
        const loadedModels = await getCachedModels(client)
        if (loadedModels.length === 0) {
          res.status(503).json({ error: 'No models loaded in LM Studio' })
          return
        }
        model = await modelRouter.resolveModel(userMessageText, loadedModels)
      } catch (err) {
        res.status(503).json({ error: 'LM Studio unreachable' })
        return
      }
    }

    // Build messages array from conversation history
    const dbMessages = db.getMessages(conversationId)
    console.log('[chat] db messages:', dbMessages.map(m => `${m.id}:${m.role}(${m.content.slice(0, 30)})`))
    const messages = dbMessages
      .filter(m => m.content !== '')
      .map(m => ({ role: m.role, content: m.content }))
    console.log('[chat] messages to LM Studio:', messages.map(m => `${m.role}(${m.content.slice(0, 30)})`))

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // AbortController for client disconnect — only abort if response not yet finished
    const abortController = new AbortController()
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort()
      }
    })

    function sendEvent(obj: Record<string, unknown>): void {
      res.write(`data: ${JSON.stringify(obj)}\n\n`)
    }

    try {
      const result = await client.chatStream({
        model,
        messages,
        onToken: (token) => {
          try {
            sendEvent({ type: 'token', content: token })
          } catch (err) {
            // If writing to the response fails (e.g. client disconnected), 
            // the chatStream will eventually throw or abort, but we should handle it here
            console.error('[chat] Failed to send token event:', err)
          }
        },
        signal: abortController.signal,
      })

      sendEvent({ type: 'done', usage: result.usage ?? null })

      // Update assistant message token count if we have usage and an ID
      if (result.usage && assistantMessageId != null) {
        db.updateMessageTokens(assistantMessageId, result.usage.completion_tokens)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      sendEvent({ type: 'error', message })
    } finally {
      res.end()
    }
  })

  return router
}
