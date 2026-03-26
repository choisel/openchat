# OpenChat — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a working Electron app with Express backend, React frontend, SQLite persistence, and a live connection to LM Studio — enough to send a message and receive a streamed response in the UI.

**Architecture:** Electron main process spawns an Express server as a child process on a dynamic port, communicates the port to the React renderer via IPC. The renderer talks to Express over HTTP/SSE. SQLite (via better-sqlite3) stores conversations and messages.

**Tech Stack:** Electron 29, React 18, TypeScript 5, Express 4, better-sqlite3, Vite (renderer bundler), electron-builder (packaging), Vitest (tests)

---

## File Map

```
openchat/
├── package.json                          # root — Electron entry + scripts
├── tsconfig.json                         # base TS config
├── electron.vite.config.ts              # electron-vite config (main + renderer)
├── .gitignore
│
├── src/
│   ├── main/                            # Electron main process
│   │   ├── index.ts                     # app lifecycle, window creation, backend spawn
│   │   ├── backend-spawner.ts           # spawn/kill Express child process, port negotiation
│   │   └── ipc-handlers.ts             # IPC handlers exposed to renderer
│   │
│   ├── backend/                         # Express server (runs in child process)
│   │   ├── index.ts                     # Express app entry, port binding
│   │   ├── db.ts                        # SQLite connection + schema migrations
│   │   ├── routes/
│   │   │   ├── conversations.ts         # CRUD /api/conversations
│   │   │   └── lmstudio.ts             # GET /api/models, POST /api/chat (SSE proxy)
│   │   └── lmstudio-client.ts          # OpenAI-compatible HTTP client for LM Studio
│   │
│   └── renderer/                        # React frontend
│       ├── index.html
│       ├── main.tsx                     # React root
│       ├── api-client.ts               # typed fetch wrapper for Express backend
│       └── components/
│           ├── App.tsx                  # root layout (sidebar + chat area)
│           ├── Sidebar.tsx              # conversation list + LM Studio status
│           └── ChatArea.tsx             # message thread + input area (stub)
│
└── tests/
    ├── backend/
    │   ├── db.test.ts                   # schema, CRUD operations
    │   ├── conversations.test.ts        # API route tests
    │   └── lmstudio-client.test.ts     # LM Studio client (mocked HTTP)
    └── main/
        └── backend-spawner.test.ts      # spawn/kill lifecycle
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `electron.vite.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Install dependencies**

```bash
mkdir openchat && cd openchat
npm init -y
npm install --save-dev electron@29 electron-vite electron-builder typescript @types/node vite @vitejs/plugin-react vitest supertest @types/supertest
npm install react react-dom @types/react @types/react-dom
npm install express @types/express better-sqlite3 @types/better-sqlite3
npm install node-fetch@3
```

- [ ] **Step 2: Write TypeScript configs**

`tsconfig.json` (base, shared by all):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "dist", "out"]
}
```

`tsconfig.node.json` (main process + backend — compiled to CJS by electron-vite):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "out"
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/backend/**/*"]
}
```

`tsconfig.web.json` (renderer — compiled to ESM by Vite):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  },
  "include": ["src/renderer/**/*"]
}
```

> Note: electron-vite automatically picks up `tsconfig.node.json` for main/preload and `tsconfig.web.json` for renderer. The backend (Express) is compiled to CJS via `tsconfig.node.json`, which is required for `require.main`, `fork()`, and native modules like `better-sqlite3`.

- [ ] **Step 3: Write `electron.vite.config.ts`**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    input: { index: 'src/preload/index.ts' },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
```

- [ ] **Step 4: Update `package.json` scripts and Electron entry**

```json
{
  "name": "openchat",
  "version": "0.1.0",
  "description": "Local LLM chat interface",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run"
  }
}
```

- [ ] **Step 5: Create `src/renderer/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>OpenChat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Verify scaffold compiles**

```bash
npm run build
```
Expected: no TypeScript errors, `out/` directory created.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json electron.vite.config.ts src/renderer/index.html
git commit -m "feat: scaffold Electron + Vite + React + TypeScript project"
```

---

### Task 2: SQLite database layer

**Files:**
- Create: `src/backend/db.ts`
- Create: `tests/backend/db.test.ts`

- [ ] **Step 1: Write failing tests for schema and CRUD**

```typescript
// tests/backend/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDb, type Db } from '../../src/backend/db'
import path from 'path'
import fs from 'fs'

const TEST_DB_PATH = path.join(__dirname, 'test.db')

describe('db', () => {
  let db: Db

  beforeEach(() => {
    db = createDb(TEST_DB_PATH)
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(TEST_DB_PATH)
  })

  it('creates conversations table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('conversations')
    expect(names).toContain('messages')
  })

  it('inserts and retrieves a conversation', () => {
    const id = db.createConversation({ name: 'Test chat', model: 'auto' })
    const conv = db.getConversation(id)
    expect(conv?.name).toBe('Test chat')
    expect(conv?.model).toBe('auto')
  })

  it('inserts and retrieves messages for a conversation', () => {
    const convId = db.createConversation({ name: 'Test', model: 'auto' })
    db.addMessage({ conversationId: convId, role: 'user', content: 'Hello', tokens: 5 })
    const messages = db.getMessages(convId)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Hello')
    expect(messages[0].role).toBe('user')
  })

  it('lists all conversations ordered by updated_at desc', () => {
    db.createConversation({ name: 'First', model: 'auto' })
    db.createConversation({ name: 'Second', model: 'auto' })
    const convs = db.listConversations()
    expect(convs).toHaveLength(2)
    expect(convs[0].name).toBe('Second')
  })

  it('deletes a conversation and its messages', () => {
    const id = db.createConversation({ name: 'ToDelete', model: 'auto' })
    db.addMessage({ conversationId: id, role: 'user', content: 'hi', tokens: 2 })
    db.deleteConversation(id)
    expect(db.getConversation(id)).toBeUndefined()
    expect(db.getMessages(id)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/backend/db.test.ts
```
Expected: FAIL — `createDb` not found.

- [ ] **Step 3: Implement `src/backend/db.ts`**

```typescript
import Database from 'better-sqlite3'

export interface Conversation {
  id: number
  name: string
  model: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  tokens: number
  created_at: string
}

export interface Db {
  close: () => void
  prepare: InstanceType<typeof Database>['prepare']
  createConversation: (args: { name: string; model: string }) => number
  getConversation: (id: number) => Conversation | undefined
  listConversations: () => Conversation[]
  deleteConversation: (id: number) => void
  addMessage: (args: { conversationId: number; role: string; content: string; tokens: number }) => number
  getMessages: (conversationId: number) => Message[]
}

export function createDb(dbPath: string): Db {
  const db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    PRAGMA foreign_keys = ON;
  `)

  return {
    close: () => db.close(),
    prepare: db.prepare.bind(db),

    createConversation({ name, model }) {
      const result = db.prepare(
        'INSERT INTO conversations (name, model) VALUES (?, ?)'
      ).run(name, model)
      return result.lastInsertRowid as number
    },

    getConversation(id) {
      return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | undefined
    },

    listConversations() {
      return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as Conversation[]
    },

    deleteConversation(id) {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    },

    addMessage({ conversationId, role, content, tokens }) {
      const result = db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)'
      ).run(conversationId, role, content, tokens)
      db.prepare(
        "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
      ).run(conversationId)
      return result.lastInsertRowid as number
    },

    getMessages(conversationId) {
      return db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
      ).all(conversationId) as Message[]
    }
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test tests/backend/db.test.ts
```
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/backend/db.ts tests/backend/db.test.ts
git commit -m "feat: add SQLite database layer with conversations and messages schema"
```

---

### Task 3: LM Studio HTTP client

**Files:**
- Create: `src/backend/lmstudio-client.ts`
- Create: `tests/backend/lmstudio-client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/backend/lmstudio-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLmStudioClient } from '../../src/backend/lmstudio-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('LmStudioClient', () => {
  const client = createLmStudioClient('http://localhost:1234')

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches available models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'mistral-7b', owned_by: 'local' },
          { id: 'phi-2', owned_by: 'local' }
        ]
      })
    })

    const models = await client.listModels()
    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('mistral-7b')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.any(Object)
    )
  })

  it('throws when LM Studio is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    await expect(client.listModels()).rejects.toThrow('LM Studio unreachable')
  })

  it('returns isConnected false when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const result = await client.checkConnection()
    expect(result.connected).toBe(false)
  })

  it('returns isConnected true when fetch succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] })
    })
    const result = await client.checkConnection()
    expect(result.connected).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/backend/lmstudio-client.test.ts
```
Expected: FAIL — `createLmStudioClient` not found.

- [ ] **Step 3: Implement `src/backend/lmstudio-client.ts`**

```typescript
export interface LmModel {
  id: string
  owned_by: string
  object?: string
}

export interface LmStudioClient {
  listModels: () => Promise<LmModel[]>
  checkConnection: () => Promise<{ connected: boolean }>
  chatStream: (args: {
    model: string
    messages: { role: string; content: string }[]
    onToken: (token: string) => void
    signal?: AbortSignal
  }) => Promise<{ usage?: { prompt_tokens: number; completion_tokens: number } }>
}

export function createLmStudioClient(baseUrl: string): LmStudioClient {
  async function fetchJson(path: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch {
      throw new Error('LM Studio unreachable')
    }
    if (!response.ok) throw new Error(`LM Studio error: ${response.status}`)
    return response.json()
  }

  return {
    async listModels() {
      const data = await fetchJson('/v1/models') as { data: LmModel[] }
      return data.data
    },

    async checkConnection() {
      try {
        await fetchJson('/v1/models')
        return { connected: true }
      } catch {
        return { connected: false }
      }
    },

    async chatStream({ model, messages, onToken, signal }) {
      let response: Response
      try {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
          signal
        })
      } catch {
        throw new Error('LM Studio unreachable')
      }

      if (!response.ok) throw new Error(`LM Studio error: ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let usage: { prompt_tokens: number; completion_tokens: number } | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          const trimmed = line.replace(/^data: /, '').trim()
          if (!trimmed || trimmed === '[DONE]') continue
          try {
            const parsed = JSON.parse(trimmed)
            const token = parsed.choices?.[0]?.delta?.content
            if (token) onToken(token)
            if (parsed.usage) usage = parsed.usage
          } catch {
            // malformed SSE line — skip
          }
        }
      }

      return { usage }
    }
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test tests/backend/lmstudio-client.test.ts
```
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/backend/lmstudio-client.ts tests/backend/lmstudio-client.test.ts
git commit -m "feat: add LM Studio HTTP client with model listing and SSE streaming"
```

---

### Task 4: Express backend — conversations API

**Files:**
- Create: `src/backend/routes/conversations.ts`
- Create: `src/backend/routes/lmstudio.ts`
- Create: `src/backend/index.ts`
- Create: `tests/backend/conversations.test.ts`

- [ ] **Step 1: Write failing tests for conversations routes**

```typescript
// tests/backend/conversations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/backend/index'
import { createDb } from '../../src/backend/db'
import path from 'path'
import fs from 'fs'

// npm install --save-dev supertest @types/supertest

const TEST_DB = path.join(__dirname, 'conv-test.db')

describe('conversations API', () => {
  let app: ReturnType<typeof createApp>['app']
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(TEST_DB)
    app = createApp({ db, lmStudioUrl: 'http://localhost:1234' }).app
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(TEST_DB)
  })

  it('GET /api/conversations returns empty array initially', async () => {
    const res = await request(app).get('/api/conversations')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('POST /api/conversations creates a conversation', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ name: 'Test chat', model: 'auto' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.name).toBe('Test chat')
  })

  it('DELETE /api/conversations/:id removes it', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'To delete', model: 'auto' })
    const id = create.body.id
    const del = await request(app).delete(`/api/conversations/${id}`)
    expect(del.status).toBe(204)
    const list = await request(app).get('/api/conversations')
    expect(list.body).toHaveLength(0)
  })

  it('GET /api/conversations/:id/messages returns messages', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .send({ name: 'Chat', model: 'auto' })
    const id = create.body.id
    db.addMessage({ conversationId: id, role: 'user', content: 'Hello', tokens: 5 })
    const res = await request(app).get(`/api/conversations/${id}/messages`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].content).toBe('Hello')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/backend/conversations.test.ts
```
Expected: FAIL — `createApp` not found.

- [ ] **Step 4: Implement `src/backend/routes/conversations.ts`**

```typescript
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
```

- [ ] **Step 5: Implement `src/backend/routes/lmstudio.ts`**

```typescript
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
```

- [ ] **Step 6: Implement `src/backend/index.ts`**

```typescript
import express from 'express'
import type { Db } from './db'
import type { LmStudioClient } from './lmstudio-client'
import { createLmStudioClient } from './lmstudio-client'
import { createConversationsRouter } from './routes/conversations'
import { createLmStudioRouter } from './routes/lmstudio'

interface AppOptions {
  db: Db
  lmStudioUrl: string
}

export function createApp({ db, lmStudioUrl }: AppOptions) {
  const app = express()
  app.use(express.json())

  const lmClient = createLmStudioClient(lmStudioUrl)

  app.use('/api/conversations', createConversationsRouter(db))
  app.use('/api/lmstudio', createLmStudioRouter(lmClient))

  return { app, lmClient }
}

// Entry point when spawned as child process
if (require.main === module) {
  import('path').then(({ default: path }) => {
    import('./db').then(({ createDb }) => {
      const dbPath = process.env.DB_PATH ?? path.join(__dirname, '../../data/openchat.db')
      const lmStudioUrl = process.env.LM_STUDIO_URL ?? 'http://localhost:1234'
      const port = Number(process.env.PORT ?? 0)

      const db = createDb(dbPath)
      const { app } = createApp({ db, lmStudioUrl })

      const server = app.listen(port, '127.0.0.1', () => {
        const addr = server.address() as { port: number }
        // Signal port to parent process
        process.send?.({ type: 'ready', port: addr.port })
      })

      process.on('SIGTERM', () => {
        server.close()
        db.close()
        process.exit(0)
      })
    })
  })
}
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
npm test tests/backend/conversations.test.ts
```
Expected: 4 passing.

- [ ] **Step 8: Commit**

```bash
git add src/backend/ tests/backend/conversations.test.ts
git commit -m "feat: add Express backend with conversations API and LM Studio proxy routes"
```

---

### Task 5: Electron main process — window + backend spawner

**Files:**
- Create: `src/main/backend-spawner.ts`
- Create: `src/main/ipc-handlers.ts`
- Create: `src/main/index.ts`
- Create: `tests/main/backend-spawner.test.ts`

- [ ] **Step 1: Write failing tests for backend spawner**

```typescript
// tests/main/backend-spawner.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BackendSpawner } from '../../src/main/backend-spawner'

// We test the port-negotiation logic, not the actual child process
describe('BackendSpawner', () => {
  it('resolves with a port number when child sends ready message', async () => {
    const spawner = new BackendSpawner({ scriptPath: '/fake/path.js', dbPath: '/fake/db' })

    // Simulate child process sending { type: 'ready', port: 3456 }
    const portPromise = spawner.waitForReady()
    spawner._simulateReady(3456) // test-only escape hatch
    const port = await portPromise
    expect(port).toBe(3456)
    spawner.kill()
  })

  it('rejects if child does not send ready within timeout', async () => {
    const spawner = new BackendSpawner({
      scriptPath: '/fake/path.js',
      dbPath: '/fake/db',
      timeoutMs: 50
    })
    await expect(spawner.waitForReady()).rejects.toThrow('Backend failed to start')
    spawner.kill()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/main/backend-spawner.test.ts
```
Expected: FAIL — `BackendSpawner` not found.

- [ ] **Step 3: Implement `src/main/backend-spawner.ts`**

```typescript
import { fork, type ChildProcess } from 'child_process'

interface SpawnerOptions {
  scriptPath: string
  dbPath: string
  lmStudioUrl?: string
  timeoutMs?: number
}

export class BackendSpawner {
  private child: ChildProcess | null = null
  private _readyResolve?: (port: number) => void
  private _readyReject?: (err: Error) => void
  private readonly options: Required<SpawnerOptions>

  constructor(options: SpawnerOptions) {
    this.options = {
      lmStudioUrl: 'http://localhost:1234',
      timeoutMs: 10_000,
      ...options
    }
  }

  waitForReady(): Promise<number> {
    return new Promise((resolve, reject) => {
      this._readyResolve = resolve
      this._readyReject = reject

      const timeout = setTimeout(() => {
        reject(new Error('Backend failed to start within timeout'))
      }, this.options.timeoutMs)

      this.child = fork(this.options.scriptPath, [], {
        env: {
          ...process.env,
          DB_PATH: this.options.dbPath,
          LM_STUDIO_URL: this.options.lmStudioUrl,
          PORT: '0'
        },
        silent: false
      })

      this.child.on('message', (msg: { type: string; port: number }) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout)
          resolve(msg.port)
        }
      })

      this.child.on('exit', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(`Backend exited with code ${code}`))
        }
      })
    })
  }

  // Test-only escape hatch — simulates child sending ready
  _simulateReady(port: number) {
    this._readyResolve?.(port)
  }

  kill() {
    this.child?.kill('SIGTERM')
    this.child = null
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test tests/main/backend-spawner.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Implement `src/main/ipc-handlers.ts`**

```typescript
import { ipcMain } from 'electron'

export function registerIpcHandlers({ backendPort }: { backendPort: number }) {
  ipcMain.handle('get-backend-port', () => backendPort)
}
```

- [ ] **Step 6: Implement `src/main/index.ts`**

```typescript
import { app, BrowserWindow, dialog } from 'electron'
import path from 'path'
import { BackendSpawner } from './backend-spawner'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let spawner: BackendSpawner | null = null

async function createWindow(backendPort: number) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(`http://localhost:5173`)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'openchat.db')
  const scriptPath = path.join(__dirname, '../backend/index.js')

  spawner = new BackendSpawner({ scriptPath, dbPath })

  let backendPort: number
  try {
    backendPort = await spawner.waitForReady()
  } catch (err) {
    dialog.showErrorBox(
      'OpenChat — Fatal Error',
      'The backend server failed to start. Please restart the application.'
    )
    app.quit()
    return
  }

  registerIpcHandlers({ backendPort })
  await createWindow(backendPort)
})

app.on('window-all-closed', () => {
  spawner?.kill()
  app.quit()
})
```

- [ ] **Step 7: Commit**

```bash
git add src/main/ tests/main/backend-spawner.test.ts
git commit -m "feat: add Electron main process with backend spawner and IPC handlers"
```

---

### Task 6: React frontend — layout + API client

**Files:**
- Create: `src/renderer/api-client.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/components/App.tsx`
- Create: `src/renderer/components/Sidebar.tsx`
- Create: `src/renderer/components/ChatArea.tsx`

- [ ] **Step 1: Create preload script** (required for contextIsolation)

Create `src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendPort: () => ipcRenderer.invoke('get-backend-port')
})
```

- [ ] **Step 2: Implement `src/renderer/api-client.ts`**

```typescript
declare global {
  interface Window {
    electronAPI: { getBackendPort: () => Promise<number> }
  }
}

let baseUrl: string | null = null

async function getBaseUrl(): Promise<string> {
  if (!baseUrl) {
    const port = await window.electronAPI.getBackendPort()
    baseUrl = `http://localhost:${port}`
  }
  return baseUrl
}

export interface Conversation {
  id: number
  name: string
  model: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  tokens: number
  created_at: string
}

export const api = {
  async listConversations(): Promise<Conversation[]> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations`)
    return res.json()
  },

  async createConversation(name: string, model = 'auto'): Promise<Conversation> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, model })
    })
    return res.json()
  },

  async deleteConversation(id: number): Promise<void> {
    const base = await getBaseUrl()
    await fetch(`${base}/api/conversations/${id}`, { method: 'DELETE' })
  },

  async getMessages(conversationId: number): Promise<Message[]> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/conversations/${conversationId}/messages`)
    return res.json()
  },

  async getLmStatus(): Promise<{ connected: boolean }> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/lmstudio/status`)
    return res.json()
  },

  async listModels(): Promise<{ id: string }[]> {
    const base = await getBaseUrl()
    const res = await fetch(`${base}/api/lmstudio/models`)
    return res.json()
  }
}
```

- [ ] **Step 3: Implement `src/renderer/components/Sidebar.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { api, type Conversation } from '../api-client'

interface Props {
  selectedId: number | null
  onSelect: (conv: Conversation) => void
  onNew: () => void
}

export function Sidebar({ selectedId, onSelect, onNew }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    api.listConversations().then(setConversations)
    api.getLmStatus().then(s => setConnected(s.connected))

    const interval = setInterval(() => {
      api.getLmStatus().then(s => setConnected(s.connected))
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <aside style={styles.sidebar}>
      <div style={styles.search}>
        <span>🔍</span>
        <input style={styles.searchInput} placeholder="Search..." />
      </div>
      <div style={styles.listHeader}>CONVERSATIONS</div>
      <button style={styles.newBtn} onClick={onNew}>+ New conversation</button>
      <div style={styles.list}>
        {conversations.map(conv => (
          <div
            key={conv.id}
            style={{
              ...styles.item,
              ...(conv.id === selectedId ? styles.itemActive : {})
            }}
            onClick={() => onSelect(conv)}
          >
            {conv.name}
          </div>
        ))}
      </div>
      <div style={styles.footer}>
        <div style={{ ...styles.status, color: connected ? '#32d74b' : '#ff453a' }}>
          <span style={{ ...styles.dot, background: connected ? '#32d74b' : '#ff453a' }} />
          {connected ? 'LM Studio connected' : 'LM Studio offline'}
        </div>
      </div>
    </aside>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: { width: 220, background: '#161618', borderRight: '1px solid #2c2c2e', display: 'flex', flexDirection: 'column', height: '100vh' },
  search: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid #2c2c2e' },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#8e8e93', fontSize: 12, flex: 1 },
  listHeader: { color: '#636366', fontSize: 10, fontWeight: 600, letterSpacing: '0.8px', padding: '8px 12px 4px' },
  newBtn: { margin: '0 8px 6px', background: '#2c2c2e', border: 'none', borderRadius: 8, padding: '7px 10px', color: '#e5e5ea', fontSize: 12, cursor: 'pointer', textAlign: 'left' },
  list: { flex: 1, overflowY: 'auto' },
  item: { padding: '8px 12px', fontSize: 12, color: '#8e8e93', cursor: 'pointer', borderRadius: 6, margin: '1px 6px' },
  itemActive: { background: '#2c2c2e', color: '#e5e5ea' },
  footer: { padding: 12, borderTop: '1px solid #2c2c2e' },
  status: { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }
}
```

- [ ] **Step 4: Implement `src/renderer/components/ChatArea.tsx`** (stub — full chat in Plan 2)

```tsx
import type { Conversation } from '../api-client'

interface Props {
  conversation: Conversation | null
}

export function ChatArea({ conversation }: Props) {
  if (!conversation) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>Select a conversation or create a new one</p>
      </div>
    )
  }
  return (
    <div style={styles.area}>
      <div style={styles.topBar}>
        <span style={styles.title}>{conversation.name}</span>
      </div>
      <div style={styles.messages}>
        {/* Messages rendered in Plan 2 */}
      </div>
      <div style={styles.inputArea}>
        <div style={styles.inputBox}>
          <textarea style={styles.textarea} placeholder="Message..." />
          <div style={styles.inputRow}>
            <button style={styles.plusBtn}>+</button>
            <button style={styles.sendBtn}>↑</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#636366', fontSize: 14 },
  area: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' },
  topBar: { padding: '10px 18px', borderBottom: '1px solid #2c2c2e', display: 'flex', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: 500, color: '#e5e5ea' },
  messages: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  inputArea: { padding: '12px 18px 18px' },
  inputBox: { background: '#2c2c2e', borderRadius: 16, padding: '12px 14px 10px' },
  textarea: { width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#e5e5ea', fontSize: 13, resize: 'none', fontFamily: 'inherit', minHeight: 24 },
  inputRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  plusBtn: { background: 'transparent', border: 'none', color: '#8e8e93', fontSize: 18, cursor: 'pointer' },
  sendBtn: { background: '#3a3a3c', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#8e8e93', cursor: 'pointer', fontSize: 14 }
}
```

- [ ] **Step 5: Implement `src/renderer/components/App.tsx`**

```tsx
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { api, type Conversation } from '../api-client'

export function App() {
  const [selected, setSelected] = useState<Conversation | null>(null)

  async function handleNew() {
    const conv = await api.createConversation('New conversation')
    setSelected(conv)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1c1c1e', color: '#e5e5ea', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Sidebar selectedId={selected?.id ?? null} onSelect={setSelected} onNew={handleNew} />
      <ChatArea conversation={selected} />
    </div>
  )
}
```

- [ ] **Step 6: Implement `src/renderer/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './components/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 7: Launch the app and verify it runs**

```bash
npm run dev
```
Expected: Electron window opens, sidebar visible, LM Studio status indicator shown, "New conversation" creates a conversation in the sidebar.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/ src/preload/
git commit -m "feat: add React frontend with sidebar, conversation management, and LM Studio status"
```

---

### Task 7: Global CSS reset and Clear Dark theme

**Files:**
- Create: `src/renderer/styles/global.css`

- [ ] **Step 1: Create global stylesheet**

```css
/* src/renderer/styles/global.css */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg-primary: #1c1c1e;
  --bg-surface: #2c2c2e;
  --bg-elevated: #3a3a3c;
  --text-primary: #e5e5ea;
  --text-secondary: #8e8e93;
  --text-muted: #48484a;
  --accent: #636366;
  --color-success: #32d74b;
  --color-warning: #ff9f0a;
  --color-error: #ff453a;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--bg-elevated);
  border-radius: 3px;
}
```

- [ ] **Step 2: Import in `src/renderer/main.tsx`**

Add at the top:
```tsx
import './styles/global.css'
```

- [ ] **Step 3: Verify visually**

```bash
npm run dev
```
Expected: Clear Dark theme applied, custom scrollbar, no default browser styling.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/
git commit -m "feat: add Clear Dark theme CSS variables and global reset"
```

---

## End State

After Plan 1, the app:
- Launches as an Electron app
- Spawns Express backend with dynamic port negotiation
- Persists conversations to SQLite
- Shows LM Studio connection status (polling every 30s)
- Allows creating and selecting conversations
- Displays a stub chat area ready for Plan 2
- All backend logic covered by passing tests
