import { Router } from 'express'
import type { Db } from '../db'

const ALLOWED_KEYS = new Set([
  'brave_api_key',
  'tavily_api_key',
  'shell_working_dir',
  'shell_timeout_ms',
  'applescript_timeout_ms',
])

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

  router.patch('/:key', (req, res) => {
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

  router.get('/permissions', (req, res) => {
    const { type } = req.query as { type?: string }
    if (type !== 'shell' && type !== 'applescript') {
      res.status(400).json({ error: 'type must be shell or applescript' })
      return
    }
    const permissions = db.listPermissions(type)
    res.json(permissions)
  })

  router.post('/permissions', (req, res) => {
    const { type, pattern } = req.body as { type?: string; pattern?: string }
    if (type !== 'shell' && type !== 'applescript') {
      res.status(400).json({ error: 'type must be shell or applescript' })
      return
    }
    if (typeof pattern !== 'string' || pattern.trim() === '') {
      res.status(400).json({ error: 'pattern must be a non-empty string' })
      return
    }
    db.addPermission(type, pattern)
    res.status(201).json({ type, pattern })
  })

  router.delete('/permissions/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'id must be a positive integer' })
      return
    }
    db.removePermission(id)
    res.status(204).send()
  })

  return router
}
