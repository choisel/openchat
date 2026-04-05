import { Router } from 'express'
import type { Db } from '../db'
import type { LmStudioClient } from '../lmstudio-client'

export function createConversationsRouter(db: Db, lmClient: LmStudioClient): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(db.listConversations())
  })

  router.post('/', (req, res) => {
    const { name = 'New conversation', model = 'auto' } = req.body
    const id = db.createConversation({ name, model })
    res.status(201).json(db.getConversation(id))
  })

  router.patch('/:id', (req, res) => {
    const id = Number(req.params.id)
    const existing = db.getConversation(id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    const { name, model, context_window, auto_compact_threshold, auto_compact_enabled, auto_search } = req.body
    db.updateConversation(id, {
      ...(name !== undefined && { name }),
      ...(model !== undefined && { model }),
      ...(context_window !== undefined && { context_window }),
      ...(auto_compact_threshold !== undefined && { auto_compact_threshold }),
      ...(auto_compact_enabled !== undefined && { auto_compact_enabled }),
      ...(auto_search !== undefined && { auto_search })
    })
    res.json(db.getConversation(id))
  })

  // promote must be registered before /:id/fork to avoid Express matching "promote" as an id
  router.post('/promote', (req, res) => {
    const { name = 'New conversation', model = 'auto', messages = [] } = req.body
    const id = db.createConversation({ name, model })
    const msgs = (messages as Array<{ role: 'user' | 'assistant'; content: string; tokens: number }>)
      .map(m => ({ role: m.role, content: m.content, tokens: m.tokens ?? 0 }))
    db.bulkAddMessages(id, msgs)
    const conversation = db.getConversation(id)
    res.status(201).json(conversation)
  })

  router.post('/:id/fork', (req, res) => {
    const id = Number(req.params.id)
    const { fromMessageId } = req.body
    const existing = db.getConversation(id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    const forked = db.forkConversation(id, fromMessageId)
    res.status(201).json(forked)
  })

  router.delete('/:id', (req, res) => {
    db.deleteConversation(Number(req.params.id))
    res.status(204).send()
  })

  router.get('/:id/messages', (req, res) => {
    res.json(db.getMessages(Number(req.params.id)))
  })

  router.post('/:id/messages', (req, res) => {
    const conversationId = Number(req.params.id)
    const existing = db.getConversation(conversationId)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    const { role, content, tokens = 0 } = req.body
    const msgId = db.addMessage({ conversationId, role, content, tokens })
    const messages = db.getMessages(conversationId)
    const message = messages.find(m => m.id === msgId)
    res.status(201).json(message)
  })

  router.patch('/:id/messages/:msgId/tokens', (req, res) => {
    const { exact } = req.body
    if (typeof exact !== 'number') { res.status(400).json({ error: 'exact must be a number' }); return }
    db.updateMessageTokens(Number(req.params.msgId), exact)
    res.status(204).send()
  })

  router.post('/:id/compact', async (req, res) => {
    const conversationId = Number(req.params.id)
    const existing = db.getConversation(conversationId)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }

    const keep: number = typeof req.body?.keep === 'number' ? req.body.keep : 4
    const allMessages = db.getMessages(conversationId)
    const toSummarize = allMessages.slice(0, allMessages.length - keep)

    if (toSummarize.length === 0) {
      // Nothing to compact — return current messages as-is
      res.json({ messages: allMessages })
      return
    }

    let model = existing.model
    if (model === 'auto') {
      try {
        const loadedModels = await lmClient.listModels()
        if (loadedModels.length === 0) {
          res.status(503).json({ error: 'No models loaded' })
          return
        }
        // Simplified auto-selection for summary: use the largest model
        const sorted = [...loadedModels].sort((a, b) => {
          const { parseParamCount } = require('../model-param-parser')
          return parseParamCount(b.id) - parseParamCount(a.id)
        })
        model = sorted[0].id
      } catch {
        res.status(503).json({ error: 'LM Studio unreachable' })
        return
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

    let summary: string
    try {
      const promptMessages = toSummarize.map(m => ({ role: m.role, content: m.content }))
      summary = await lmClient.summarize(promptMessages, model, controller.signal)
    } catch (err: any) {
      console.error('[compact] summarization failed:', err)
      clearTimeout(timer)
      res.status(422).json({ error: 'compaction_failed', details: err.message })
      return
    }
    clearTimeout(timer)

    const keptMessages = allMessages.slice(allMessages.length - keep)
    const summarizedCount = toSummarize.length

    db.compactConversation(conversationId, summary, keptMessages, summarizedCount)

    const updatedMessages = db.getMessages(conversationId)
    res.json({ messages: updatedMessages })
  })

  return router
}
