import { Router } from 'express'
import os from 'os'
import { minimatch } from 'minimatch'
import type { Db } from '../db'
import { executeShell, executeAppleScript } from '../system-executor'

export function createSystemRouter(db: Db): Router {
  const router = Router()

  router.post('/shell', async (req, res) => {
    const { command, confirmed } = req.body as { command?: string; confirmed?: boolean }

    if (typeof command !== 'string' || command.trim() === '') {
      res.status(400).json({ error: 'command must be a non-empty string' })
      return
    }

    const permissions = db.listPermissions('shell')
    const isAllowed = permissions.some(p => minimatch(command, p.pattern))

    if (!isAllowed && confirmed !== true) {
      res.status(202).json({ requiresConfirmation: true })
      return
    }

    const workingDir = db.getSetting('shell_working_dir') ?? os.homedir()
    const timeoutMs = Number(db.getSetting('shell_timeout_ms') ?? '30000')

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const controller = new AbortController()
    // Use res.on('close') to detect genuine client disconnect (not just end of request body)
    res.on('close', () => {
      if (!res.writableEnded) {
        controller.abort()
      }
    })

    try {
      for await (const event of executeShell({ command, workingDir, timeoutMs }, controller.signal)) {
        res.write('data: ' + JSON.stringify(event) + '\n\n')
      }
    } finally {
      res.end()
    }
  })

  router.post('/applescript', async (req, res) => {
    const { script, confirmed } = req.body as { script?: string; confirmed?: boolean }

    if (typeof script !== 'string' || script.trim() === '') {
      res.status(400).json({ error: 'script must be a non-empty string' })
      return
    }

    const match = script.match(/tell application "([^"]+)"/i)
    const appName = match?.[1] ?? ''

    const permissions = db.listPermissions('applescript')
    const isAllowed = permissions.some(p => p.pattern.toLowerCase() === appName.toLowerCase())

    if (!isAllowed && confirmed !== true) {
      res.status(202).json({ requiresConfirmation: true })
      return
    }

    const timeoutMs = Number(db.getSetting('applescript_timeout_ms') ?? '10000')

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const controller = new AbortController()
    // Use res.on('close') to detect genuine client disconnect (not just end of request body)
    res.on('close', () => {
      if (!res.writableEnded) {
        controller.abort()
      }
    })

    try {
      for await (const event of executeAppleScript({ script, timeoutMs }, controller.signal)) {
        res.write('data: ' + JSON.stringify(event) + '\n\n')
      }
    } finally {
      res.end()
    }
  })

  return router
}
