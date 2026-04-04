import express from 'express'
import type { Db } from './db'
import { createLmStudioClient } from './lmstudio-client'
import type { LmStudioClient } from './lmstudio-client'
import { ModelRouter } from './model-router'
import { createConversationsRouter } from './routes/conversations'
import { createLmStudioRouter, createChatRouter } from './routes/lmstudio'
import { createFilesRouter } from './routes/files'
import { createSettingsRouter } from './routes/settings'

interface AppOptions {
  db: Db
  lmStudioUrl: string
  /** Optional: inject a pre-built client (useful in tests) */
  lmClient?: LmStudioClient
}

export function createApp({ db, lmStudioUrl, lmClient }: AppOptions) {
  const app = express()
  app.use(express.json())

  // Allow renderer (Vite dev server or file://) to call the backend
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    next()
  })

  const resolvedClient = lmClient ?? createLmStudioClient(lmStudioUrl)
  const modelRouter = new ModelRouter(resolvedClient)

  app.use('/api/conversations', createConversationsRouter(db, resolvedClient))
  app.use('/api/lmstudio', createLmStudioRouter(resolvedClient, db, modelRouter))
  app.use('/api/chat', createChatRouter(resolvedClient, db, modelRouter))
  app.use('/api/files', createFilesRouter())

  return { app, lmClient: resolvedClient }
}

// Entry point when spawned as child process
if (require.main === module) {
  const path = require('path')
  const { createDb } = require('./db')

  const dbPath = process.env.DB_PATH ?? path.join(__dirname, '../../data/openchat.db')
  const lmStudioUrl = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234'
  const port = Number(process.env.PORT ?? 0)

  const db = createDb(dbPath)
  const { app } = createApp({ db, lmStudioUrl })

  const server = app.listen(port, '127.0.0.1', () => {
    const addr = server.address() as { port: number }
    process.send?.({ type: 'ready', port: addr.port })
  })

  process.on('SIGTERM', () => {
    server.close()
    db.close()
    process.exit(0)
  })
}
