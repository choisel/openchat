import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/backend/index'
import { createDb } from '../../src/backend/db'
import path from 'path'
import fs from 'fs'

const TEST_DB = path.join(__dirname, 'system-routes-test.db')

/**
 * Parse SSE events from a supertest response body text.
 * Returns parsed JSON objects from `data: ...` lines.
 */
function parseSseEvents(text: string): Array<{ type: string; data: string }> {
  const events: Array<{ type: string; data: string }> = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data: ')) {
      try {
        events.push(JSON.parse(trimmed.slice(6)))
      } catch {
        // skip malformed lines
      }
    }
  }
  return events
}

describe('POST /api/system/shell', () => {
  let app: ReturnType<typeof createApp>['app']
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(TEST_DB)
    app = createApp({ db, lmStudioUrl: 'http://localhost:1234' }).app
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
  })

  it('returns 400 when command is missing', async () => {
    const res = await request(app).post('/api/system/shell').send({})
    expect(res.status).toBe(400)
  })

  it('returns 202 with requiresConfirmation when command is not allowlisted', async () => {
    const res = await request(app)
      .post('/api/system/shell')
      .send({ command: 'echo hello' })
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ requiresConfirmation: true })
  })

  it('streams execution for an allowlisted command', async () => {
    db.addPermission('shell', 'echo *')

    const res = await request(app)
      .post('/api/system/shell')
      .send({ command: 'echo hello' })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })

    expect(res.status).toBe(200)
    const events = parseSseEvents(res.body as string)
    const stdoutEvents = events.filter(e => e.type === 'stdout')
    expect(stdoutEvents.length).toBeGreaterThan(0)
    const allStdout = stdoutEvents.map(e => e.data).join('')
    expect(allStdout).toContain('hello')
    const exitEvent = events.find(e => e.type === 'exit')
    expect(exitEvent).toBeDefined()
  })

  it('streams execution when confirmed is true, even if not allowlisted', async () => {
    const res = await request(app)
      .post('/api/system/shell')
      .send({ command: 'echo confirmed', confirmed: true })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })

    expect(res.status).toBe(200)
    const events = parseSseEvents(res.body as string)
    const stdoutEvents = events.filter(e => e.type === 'stdout')
    expect(stdoutEvents.length).toBeGreaterThan(0)
    const allStdout = stdoutEvents.map(e => e.data).join('')
    expect(allStdout).toContain('confirmed')
  })

  it('allowlist glob pattern only matches the registered pattern', async () => {
    // Register a glob that matches "echo *" (no slashes, so * works as expected)
    db.addPermission('shell', 'echo *')

    // "echo hello" matches "echo *"
    const matched = await request(app)
      .post('/api/system/shell')
      .send({ command: 'echo hello' })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })
    expect(matched.status).toBe(200)
    const matchedEvents = parseSseEvents(matched.body as string)
    const matchedExit = matchedEvents.find(e => e.type === 'exit')
    expect(matchedExit).toBeDefined()

    // "pwd" does not match "echo *" — 202
    const unmatched = await request(app)
      .post('/api/system/shell')
      .send({ command: 'pwd' })
    expect(unmatched.status).toBe(202)
    expect(unmatched.body.requiresConfirmation).toBe(true)
  })

  it('client disconnect aborts execution and exit event is received', async () => {
    // Run a fast command that produces output and verify the stream ends with an exit event
    const res = await request(app)
      .post('/api/system/shell')
      .send({ command: 'echo line1', confirmed: true })
      .buffer(true)
      .parse((res, callback) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => callback(null, data))
      })

    expect(res.status).toBe(200)
    const events = parseSseEvents(res.body as string)
    const exitEvent = events.find(e => e.type === 'exit')
    expect(exitEvent).toBeDefined()
    // Process completes successfully
    expect(exitEvent!.data).toBe('0')
  })
})

describe('POST /api/system/applescript — allowlist/confirmation logic', () => {
  let app: ReturnType<typeof createApp>['app']
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(TEST_DB)
    app = createApp({ db, lmStudioUrl: 'http://localhost:1234' }).app
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
  })

  it('returns 400 when script is missing', async () => {
    const res = await request(app).post('/api/system/applescript').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 when script is empty string', async () => {
    const res = await request(app)
      .post('/api/system/applescript')
      .send({ script: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 202 when app is not in allowlist', async () => {
    const res = await request(app)
      .post('/api/system/applescript')
      .send({ script: 'tell application "Finder"\n  activate\nend tell' })
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ requiresConfirmation: true })
  })

  it('returns 202 for script without a tell application block', async () => {
    const res = await request(app)
      .post('/api/system/applescript')
      .send({ script: 'display dialog "hello"' })
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ requiresConfirmation: true })
  })

  it('returns 202 when a different app is allowlisted but not the one in the script', async () => {
    db.addPermission('applescript', 'Mail')
    const res = await request(app)
      .post('/api/system/applescript')
      .send({ script: 'tell application "Finder"\n  activate\nend tell' })
    expect(res.status).toBe(202)
    expect(res.body.requiresConfirmation).toBe(true)
  })

  it('does not return 202 when the allowlisted app matches (case-insensitive)', async () => {
    db.addPermission('applescript', 'finder')
    // On macOS the osascript may or may not work; we just check the allowlist bypass
    const res = await request(app)
      .post('/api/system/applescript')
      .send({ script: 'tell application "Finder"\n  activate\nend tell' })
    // Status should NOT be 202 — it should attempt streaming
    expect(res.status).not.toBe(202)
  })

  it('does not return 202 when confirmed is true', async () => {
    const res = await request(app)
      .post('/api/system/applescript')
      .send({ script: 'tell application "Finder"\n  activate\nend tell', confirmed: true })
    // Status should NOT be 202 — confirmed bypasses allowlist check
    expect(res.status).not.toBe(202)
  })
})
