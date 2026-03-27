import Database from 'better-sqlite3'

export interface Conversation {
  id: number
  name: string
  model: string
  context_window: number
  auto_compact_threshold: number
  auto_compact_enabled: number
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens: number
  exact_tokens: number | null
  created_at: string
}

export interface Db {
  close: () => void
  prepare: InstanceType<typeof Database>['prepare']
  createConversation: (args: { name: string; model: string }) => number
  getConversation: (id: number) => Conversation | undefined
  listConversations: () => Conversation[]
  updateConversation: (id: number, fields: Partial<{ name: string; model: string; context_window: number; auto_compact_threshold: number; auto_compact_enabled: number }>) => void
  deleteConversation: (id: number) => void
  addMessage: (args: { conversationId: number; role: 'user' | 'assistant'; content: string; tokens: number }) => number
  bulkAddMessages: (conversationId: number, messages: Array<{ role: 'user' | 'assistant'; content: string; tokens: number }>) => void
  getMessages: (conversationId: number) => Message[]
  updateMessageTokens: (id: number, exact: number) => void
  addCompactedMarker: (conversationId: number, summaryMessageCount: number) => void
  forkConversation: (id: number, fromMessageId: number) => Conversation
}

export function createDb(dbPath: string): Db {
  const db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
    );
  `)

  // Idempotent migrations — SQLite does not support IF NOT EXISTS on ADD COLUMN,
  // so we catch the "duplicate column" error instead.
  const addColumnIfNotExists = (sql: string) => {
    try { db.exec(sql) } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.includes('duplicate column')) throw e
    }
  }
  addColumnIfNotExists('ALTER TABLE conversations ADD COLUMN context_window INTEGER DEFAULT 4096')
  addColumnIfNotExists('ALTER TABLE conversations ADD COLUMN auto_compact_threshold REAL DEFAULT 0.8')
  addColumnIfNotExists('ALTER TABLE conversations ADD COLUMN auto_compact_enabled INTEGER DEFAULT 1')
  addColumnIfNotExists('ALTER TABLE messages ADD COLUMN exact_tokens INTEGER')

  db.pragma('foreign_keys = ON')

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
      return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC, id DESC').all() as Conversation[]
    },

    updateConversation(id, fields) {
      const setClauses: string[] = []
      const values: unknown[] = []
      if (fields.name !== undefined) { setClauses.push('name = ?'); values.push(fields.name) }
      if (fields.model !== undefined) { setClauses.push('model = ?'); values.push(fields.model) }
      if (fields.context_window !== undefined) { setClauses.push('context_window = ?'); values.push(fields.context_window) }
      if (fields.auto_compact_threshold !== undefined) { setClauses.push('auto_compact_threshold = ?'); values.push(fields.auto_compact_threshold) }
      if (fields.auto_compact_enabled !== undefined) { setClauses.push('auto_compact_enabled = ?'); values.push(fields.auto_compact_enabled) }
      if (setClauses.length === 0) return
      setClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now')")
      values.push(id)
      db.prepare(`UPDATE conversations SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)
    },

    deleteConversation(id) {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    },

    addMessage({ conversationId, role, content, tokens }) {
      const result = db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)'
      ).run(conversationId, role, content, tokens)
      db.prepare(
        "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?"
      ).run(conversationId)
      return result.lastInsertRowid as number
    },

    bulkAddMessages(conversationId, messages) {
      const insertMsg = db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)'
      )
      const bulk = db.transaction((msgs: Array<{ role: 'user' | 'assistant'; content: string; tokens: number }>) => {
        for (const m of msgs) {
          insertMsg.run(conversationId, m.role, m.content, m.tokens)
        }
        db.prepare(
          "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?"
        ).run(conversationId)
      })
      bulk(messages)
    },

    getMessages(conversationId) {
      return db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC'
      ).all(conversationId) as Message[]
    },

    updateMessageTokens(id, exact) {
      db.prepare('UPDATE messages SET exact_tokens = ? WHERE id = ?').run(exact, id)
    },

    addCompactedMarker(conversationId, summaryMessageCount) {
      const content = `[Compacted — ${summaryMessageCount} messages summarized]`
      db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)'
      ).run(conversationId, 'system', content, 0)
      db.prepare(
        "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?"
      ).run(conversationId)
    },

    forkConversation(id, fromMessageId) {
      const source = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | undefined
      if (!source) throw new Error(`Conversation ${id} not found`)

      const result = db.prepare(
        `INSERT INTO conversations (name, model, context_window, auto_compact_threshold, auto_compact_enabled)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        `${source.name} (fork)`,
        source.model,
        source.context_window,
        source.auto_compact_threshold,
        source.auto_compact_enabled
      )
      const newId = result.lastInsertRowid as number

      const messages = db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? AND id <= ? ORDER BY created_at ASC, id ASC'
      ).all(id, fromMessageId) as Message[]

      const insertMsg = db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens, exact_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      const bulkInsert = db.transaction((msgs: Message[]) => {
        for (const m of msgs) {
          insertMsg.run(newId, m.role, m.content, m.tokens, m.exact_tokens, m.created_at)
        }
      })
      bulkInsert(messages)

      return db.prepare('SELECT * FROM conversations WHERE id = ?').get(newId) as Conversation
    }
  }
}
