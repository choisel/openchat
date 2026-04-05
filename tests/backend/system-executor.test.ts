import { describe, it, expect } from 'vitest'
import { executeShell } from '../../src/backend/system-executor'

async function collect(iter: AsyncIterable<{ type: string; data: string }>) {
  const events: { type: string; data: string }[] = []
  for await (const event of iter) {
    events.push(event)
  }
  return events
}

describe('executeShell', () => {
  it('echo command produces stdout events', async () => {
    const controller = new AbortController()
    const events = await collect(
      executeShell(
        { command: 'echo hello', workingDir: '/tmp', timeoutMs: 5000 },
        controller.signal
      )
    )

    const stdoutEvents = events.filter(e => e.type === 'stdout')
    expect(stdoutEvents.length).toBeGreaterThan(0)
    const allStdout = stdoutEvents.map(e => e.data).join('')
    expect(allStdout).toContain('hello')

    const exitEvent = events.find(e => e.type === 'exit')
    expect(exitEvent).toBeDefined()
  })

  it('command writing to stderr produces stderr events', async () => {
    const controller = new AbortController()
    const events = await collect(
      executeShell(
        { command: 'echo error-message >&2', workingDir: '/tmp', timeoutMs: 5000 },
        controller.signal
      )
    )

    const stderrEvents = events.filter(e => e.type === 'stderr')
    expect(stderrEvents.length).toBeGreaterThan(0)
    const allStderr = stderrEvents.map(e => e.data).join('')
    expect(allStderr).toContain('error-message')
  })

  it('exit event is emitted with correct exit code', async () => {
    const controller = new AbortController()
    const events = await collect(
      executeShell(
        { command: 'exit 42', workingDir: '/tmp', timeoutMs: 5000 },
        controller.signal
      )
    )

    const exitEvent = events.find(e => e.type === 'exit')
    expect(exitEvent).toBeDefined()
    expect(exitEvent!.data).toBe('42')
  })

  it('AbortSignal kills a long-running process and produces an exit event', async () => {
    const controller = new AbortController()

    const iterPromise = collect(
      executeShell(
        { command: 'sleep 60', workingDir: '/tmp', timeoutMs: 10000 },
        controller.signal
      )
    )

    // Abort after 100ms
    setTimeout(() => controller.abort(), 100)

    const start = Date.now()
    const events = await iterPromise
    const elapsed = Date.now() - start

    const exitEvent = events.find(e => e.type === 'exit')
    expect(exitEvent).toBeDefined()
    // Should exit well before the 60s sleep completes
    expect(elapsed).toBeLessThan(5000)
    // Exit code should be non-zero (killed)
    expect(exitEvent!.data).not.toBe('0')
  }, 10000)

  it('SIGKILL fires within 2.5s if process ignores SIGTERM', async () => {
    const controller = new AbortController()

    // This shell command ignores SIGTERM
    const iterPromise = collect(
      executeShell(
        { command: 'trap "" TERM; sleep 60', workingDir: '/tmp', timeoutMs: 10000 },
        controller.signal
      )
    )

    // Abort immediately
    setTimeout(() => controller.abort(), 50)

    const start = Date.now()
    const events = await iterPromise
    const elapsed = Date.now() - start

    const exitEvent = events.find(e => e.type === 'exit')
    expect(exitEvent).toBeDefined()
    // SIGTERM + 2s SIGKILL fallback, should complete within 2.5s from abort
    expect(elapsed).toBeLessThan(3500)
  }, 10000)

  it('timeout fires and kills the process', async () => {
    const controller = new AbortController()

    const start = Date.now()
    const events = await collect(
      executeShell(
        { command: 'sleep 60', workingDir: '/tmp', timeoutMs: 300 },
        controller.signal
      )
    )
    const elapsed = Date.now() - start

    const exitEvent = events.find(e => e.type === 'exit')
    expect(exitEvent).toBeDefined()
    // Should finish well within 60s — timeout at 300ms + 2s kill = ~2.3s max
    expect(elapsed).toBeLessThan(5000)
    expect(exitEvent!.data).not.toBe('0')
  }, 10000)
})
