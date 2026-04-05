import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/backend/index'
import { createDb } from '../../src/backend/db'
import path from 'path'
import fs from 'fs'

const TEST_DB = path.join(__dirname, 'settings-routes-test.db')

describe('settings routes API', () => {
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

  describe('GET /api/settings', () => {
    it('returns shell_working_dir and shell_timeout_ms', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('shell_working_dir')
      expect(res.body).toHaveProperty('shell_timeout_ms')
      expect(res.body).toHaveProperty('applescript_timeout_ms')
    })

    it('returns default values for system settings', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.shell_timeout_ms).toBe('30000')
      expect(res.body.applescript_timeout_ms).toBe('10000')
    })
  })

  describe('PATCH /api/settings/:key', () => {
    it('persists the change and returns updated value', async () => {
      const res = await request(app)
        .patch('/api/settings/shell_timeout_ms')
        .send({ value: '60000' })
      expect(res.status).toBe(200)
      expect(res.body.key).toBe('shell_timeout_ms')
      expect(res.body.value).toBe('60000')
    })

    it('change is visible in subsequent GET', async () => {
      await request(app)
        .patch('/api/settings/shell_working_dir')
        .send({ value: '/tmp' })
      const res = await request(app).get('/api/settings')
      expect(res.body.shell_working_dir).toBe('/tmp')
    })

    it('returns 400 for unknown key', async () => {
      const res = await request(app)
        .patch('/api/settings/unknown_key')
        .send({ value: 'something' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when value is not a string', async () => {
      const res = await request(app)
        .patch('/api/settings/shell_timeout_ms')
        .send({ value: 123 })
      expect(res.status).toBe(400)
    })
  })

  describe('permissions round-trip', () => {
    it('POST + GET returns the created permission', async () => {
      const post = await request(app)
        .post('/api/settings/permissions')
        .send({ type: 'shell', pattern: '/bin/ls' })
      expect(post.status).toBe(201)
      expect(post.body.type).toBe('shell')
      expect(post.body.pattern).toBe('/bin/ls')

      const get = await request(app).get('/api/settings/permissions?type=shell')
      expect(get.status).toBe(200)
      expect(get.body).toHaveLength(1)
      expect(get.body[0].pattern).toBe('/bin/ls')
      expect(get.body[0].type).toBe('shell')
      expect(get.body[0].id).toBeDefined()
    })

    it('DELETE removes the permission', async () => {
      await request(app)
        .post('/api/settings/permissions')
        .send({ type: 'applescript', pattern: 'tell application "Finder"' })

      const list = await request(app).get('/api/settings/permissions?type=applescript')
      const id = list.body[0].id

      const del = await request(app).delete(`/api/settings/permissions/${id}`)
      expect(del.status).toBe(204)

      const after = await request(app).get('/api/settings/permissions?type=applescript')
      expect(after.body).toHaveLength(0)
    })

    it('GET permissions returns empty array when none exist', async () => {
      const res = await request(app).get('/api/settings/permissions?type=shell')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('GET permissions returns 400 for invalid type', async () => {
      const res = await request(app).get('/api/settings/permissions?type=invalid')
      expect(res.status).toBe(400)
    })

    it('POST permissions returns 400 for invalid type', async () => {
      const res = await request(app)
        .post('/api/settings/permissions')
        .send({ type: 'invalid', pattern: 'foo' })
      expect(res.status).toBe(400)
    })

    it('POST permissions returns 400 for empty pattern', async () => {
      const res = await request(app)
        .post('/api/settings/permissions')
        .send({ type: 'shell', pattern: '' })
      expect(res.status).toBe(400)
    })

    it('DELETE returns 404 for non-existent id', async () => {
      const res = await request(app).delete('/api/settings/permissions/99999')
      expect(res.status).toBe(404)
    })

    it('shell and applescript permissions are isolated', async () => {
      await request(app)
        .post('/api/settings/permissions')
        .send({ type: 'shell', pattern: '/usr/bin/python' })
      await request(app)
        .post('/api/settings/permissions')
        .send({ type: 'applescript', pattern: 'tell application "Mail"' })

      const shell = await request(app).get('/api/settings/permissions?type=shell')
      expect(shell.body).toHaveLength(1)
      expect(shell.body[0].pattern).toBe('/usr/bin/python')

      const applescript = await request(app).get('/api/settings/permissions?type=applescript')
      expect(applescript.body).toHaveLength(1)
      expect(applescript.body[0].pattern).toBe('tell application "Mail"')
    })
  })
})
