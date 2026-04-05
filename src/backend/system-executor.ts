import { spawn } from 'child_process'

export type ExecutorEvent =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'exit'; data: string }

function killProcessGroup(pid: number | undefined, sig: NodeJS.Signals) {
  if (pid == null) return
  try {
    // Negative PID targets the entire process group
    process.kill(-pid, sig)
  } catch {
    // Process may already be gone
  }
}

function runProcess(
  cmd: string,
  args: string[],
  spawnOpts: { cwd?: string },
  opts: { timeoutMs: number },
  signal: AbortSignal
): AsyncIterable<ExecutorEvent> {
  // detached: true creates a new process group so we can kill all children
  const proc = spawn(cmd, args, { ...spawnOpts, detached: true })

  async function* generate(): AsyncGenerator<ExecutorEvent> {
    // Promise-queue: events are pushed here, consumers wait on a promise
    const queue: ExecutorEvent[] = []
    let resolveWaiter: (() => void) | null = null
    let done = false

    function push(event: ExecutorEvent) {
      queue.push(event)
      if (resolveWaiter) {
        const r = resolveWaiter
        resolveWaiter = null
        r()
      }
    }

    function waitForEvent(): Promise<void> {
      if (queue.length > 0) return Promise.resolve()
      return new Promise<void>(r => { resolveWaiter = r })
    }

    let killTimer: ReturnType<typeof setTimeout> | null = null
    let termSent = false

    function sendTerm() {
      if (termSent) return
      termSent = true
      killProcessGroup(proc.pid, 'SIGTERM')
      killTimer = setTimeout(() => {
        killProcessGroup(proc.pid, 'SIGKILL')
      }, 2000)
    }

    // Timeout
    const timeoutHandle = setTimeout(() => {
      sendTerm()
    }, opts.timeoutMs)

    // AbortSignal
    if (signal.aborted) {
      sendTerm()
    } else {
      signal.addEventListener('abort', sendTerm, { once: true })
    }

    // Wire up process events
    proc.stdout?.on('data', (chunk: Buffer) => push({ type: 'stdout', data: chunk.toString() }))
    proc.stderr?.on('data', (chunk: Buffer) => push({ type: 'stderr', data: chunk.toString() }))
    proc.on('close', (code: number | null) => {
      clearTimeout(timeoutHandle)
      if (killTimer !== null) clearTimeout(killTimer)
      signal.removeEventListener('abort', sendTerm)
      push({ type: 'exit', data: String(code ?? -1) })
      done = true
      if (resolveWaiter) {
        const r = resolveWaiter
        resolveWaiter = null
        r()
      }
    })

    // Consume events until done
    while (true) {
      await waitForEvent()
      while (queue.length > 0) {
        yield queue.shift()!
      }
      if (done && queue.length === 0) break
    }
  }

  return generate()
}

export function executeShell(
  opts: { command: string; workingDir: string; timeoutMs: number },
  signal: AbortSignal
): AsyncIterable<ExecutorEvent> {
  return runProcess('sh', ['-c', opts.command], { cwd: opts.workingDir }, { timeoutMs: opts.timeoutMs }, signal)
}

export function executeAppleScript(
  opts: { script: string; timeoutMs: number },
  signal: AbortSignal
): AsyncIterable<ExecutorEvent> {
  return runProcess('osascript', ['-e', opts.script], {}, { timeoutMs: opts.timeoutMs }, signal)
}
