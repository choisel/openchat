import { Router } from 'express'
import type { Db } from '../db'

const ALLOWED_KEYS = new Set(['brave_api_key', 'tavily_api_key'])

export function createSettingsRouter(db: Db): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const result: Record<string, string | null> = {}
    for (const key of ALLOWED_KEYS) {
      result[key] = db.getSetting(key) ?? null
    }
    res.json(result)
  })

  router.put('/:key', (req, res) => {
    const { key } = req.params
    if (!ALLOWED_KEYS.has(key)) {
      res.status(400).json({ error: `Unknown setting key: ${key}` })
      return
    }
    const { value } = req.body as { value?: string }
    if (typeof value !== 'string') {
      res.status(400).json({ error: 'value must be a string' })
      return
    }
    db.setSetting(key, value)
    res.json({ key, value })
  })

  return router
}
