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
  updateConversation: (id: number, fields: { name?: string; model?: string }) => void
  deleteConversation: (id: number) => void
  addMessage: (args: { conversationId: number; role: 'user' | 'assistant'; content: string; tokens: number }) => number
  getMessages: (conversationId: number) => Message[]
  updateMessageTokens: (id: number, tokens: number) => void
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
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
    );
  `)
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

    getMessages(conversationId) {
      return db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
      ).all(conversationId) as Message[]
    }
  }
}
