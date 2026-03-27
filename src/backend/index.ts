import express from 'express'
import type { Db } from './db'
import { createLmStudioClient } from './lmstudio-client'
import type { LmStudioClient } from './lmstudio-client'
import { createConversationsRouter } from './routes/conversations'
import { createLmStudioRouter, createChatRouter } from './routes/lmstudio'

interface AppOptions {
  db: Db
  lmStudioUrl: string
  /** Optional: inject a pre-built client (useful in tests) */
  lmClient?: LmStudioClient
}

export function createApp({ db, lmStudioUrl, lmClient }: AppOptions) {
  const app = express()
  app.use(express.json())

  const resolvedClient = lmClient ?? createLmStudioClient(lmStudioUrl)

  app.use('/api/conversations', createConversationsRouter(db))
  app.use('/api/lmstudio', createLmStudioRouter(resolvedClient, db))
  app.use('/api/chat', createChatRouter(resolvedClient, db))

  return { app, lmClient: resolvedClient }
}

// Entry point when spawned as child process
if (require.main === module) {
  const path = require('path')
  const { createDb } = require('./db')

  const dbPath = process.env.DB_PATH ?? path.join(__dirname, '../../data/openchat.db')
  const lmStudioUrl = process.env.LM_STUDIO_URL ?? 'http://localhost:1234'
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
