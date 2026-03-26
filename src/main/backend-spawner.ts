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
          reject(new Error(`Backend failed to start (exit code ${code})`))
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
