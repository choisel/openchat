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

  router.delete('/:id', (req, res) => {
    db.deleteConversation(Number(req.params.id))
    res.status(204).send()
  })

  router.get('/:id/messages', (req, res) => {
    res.json(db.getMessages(Number(req.params.id)))
  })

  return router
}
