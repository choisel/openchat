import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDb } from '../../src/backend/db'
import type { Db } from '../../src/backend/db'
import fs from 'fs'

const TEST_DB = `${process.env.TMPDIR || '/tmp'}/settings-test.db`

describe('settings DB', () => {
  let db: Db

  beforeEach(() => {
    db = createDb(TEST_DB)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
  })

  it('getSetting returns undefined for unknown key', () => {
    expect(db.getSetting('brave_api_key')).toBeUndefined()
  })

  it('setSetting then getSetting returns the value', () => {
    db.setSetting('brave_api_key', 'test-key-123')
    expect(db.getSetting('brave_api_key')).toBe('test-key-123')
  })

  it('setSetting overwrites existing value', () => {
    db.setSetting('brave_api_key', 'old')
    db.setSetting('brave_api_key', 'new')
    expect(db.getSetting('brave_api_key')).toBe('new')
  })

  it('conversations have auto_search column defaulting to 0', () => {
    const id = db.createConversation({ name: 'test', model: 'auto' })
    const conv = db.getConversation(id)
    expect(conv?.auto_search).toBe(0)
  })
})
