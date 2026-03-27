import { Router } from 'express'
import type { Db } from '../db'

export function createConversationsRouter(db: Db): Router {
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
    const { name, model } = req.body
    db.updateConversation(id, { name, model })
    res.json(db.getConversation(id))
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

  return router
}
