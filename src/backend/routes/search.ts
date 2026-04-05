import { Router } from 'express'
import type { Db } from '../db'
import { createSearchClient, SearchUnavailableError } from '../search-client'

export function createSearchRouter(db: Db): Router {
  const router = Router()

  router.post('/', async (req, res) => {
    const { query } = req.body as { query?: string }
    if (!query?.trim()) {
      res.status(400).json({ error: 'query is required' })
      return
    }

    const braveKey = db.getSetting('brave_api_key')
    const tavilyKey = db.getSetting('tavily_api_key')
    const client = createSearchClient({ braveKey, tavilyKey })

    try {
      const results = await client.search(query.trim())
      res.json(results)
    } catch (err) {
      if (err instanceof SearchUnavailableError) {
        res.status(503).json({ error: 'Web search not configured' })
      } else {
        console.error('[search] unexpected error:', err)
        res.status(500).json({ error: 'Search failed' })
      }
    }
  })

  return router
}
