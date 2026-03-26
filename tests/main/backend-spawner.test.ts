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
