import { Router } from 'express'
import type { LmStudioClient } from '../lmstudio-client'

export function createLmStudioRouter(client: LmStudioClient): Router {
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
