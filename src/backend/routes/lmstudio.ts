import { Router } from 'express'
import type { LmStudioClient } from '../lmstudio-client'
import type { Db } from '../db'

export function createLmStudioRouter(client: LmStudioClient, db: Db): Router {
  const router = Router()

  router.get('/models', async (_req, res) => {
    try {
      const models = await client.listModels()
      res.json(models)
    } catch (err) {
      res.status(503).json({ error: 'LM Studio unreachable' })
    }
  })

  router.get('/status', async (_req, res) => {
    const result = await client.checkConnection()
    res.json(result)
  })

  return router
}

export function createChatRouter(client: LmStudioClient, db: Db): Router {
  const router = Router()

  router.post('/:conversationId', async (req, res) => {
    const conversationId = Number(req.params.conversationId)
    const { assistantMessageId } = req.body as { assistantMessageId?: number }

    const conversation = db.getConversation(conversationId)
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' })
      return
    }

    // Resolve model: fall back to first loaded model if "auto" or empty
    let model = conversation.model
    if (!model || model === 'auto') {
      try {
        const models = await client.listModels()
        if (models.length === 0) {
          res.status(503).json({ error: 'No models loaded in LM Studio' })
          return
        }
        model = models[0].id
      } catch {
        res.status(503).json({ error: 'LM Studio unreachable' })
        return
      }
    }

    // Build messages array from conversation history
    const dbMessages = db.getMessages(conversationId)
    const messages = dbMessages
      .filter(m => m.content !== '')
      .map(m => ({ role: m.role, content: m.content }))

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // AbortController for client disconnect
    const abortController = new AbortController()
    req.on('close', () => {
      abortController.abort()
    })

    function sendEvent(obj: Record<string, unknown>): void {
      res.write(`data: ${JSON.stringify(obj)}\n\n`)
    }

    try {
      const result = await client.chatStream({
        model,
        messages,
        onToken: (token) => {
          sendEvent({ type: 'token', content: token })
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
