import { useCallback, useEffect, useRef, useState } from 'react'
import { runAppleScript, addPermission, ExecutorEvent } from '../api-client'
import { ConfirmationModal } from './ConfirmationModal'

interface AppleScriptBlockProps {
  script: string
}

type Phase = 'idle' | 'confirming' | 'running' | 'done'

interface OutputLine {
  text: string
  kind: 'stdout' | 'stderr'
}

function getLabel(script: string): string {
  const trimmed = script.trimStart()
  return trimmed.startsWith('shortcuts run') || script.includes('shortcuts run')
    ? 'Shortcut'
    : 'AppleScript'
}

function extractAppName(script: string): string {
  return script.match(/tell application "([^"]+)"/i)?.[1] ?? script.split('\n')[0]
}

export function AppleScriptBlock({ script }: AppleScriptBlockProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [output, setOutput] = useState<OutputLine[]>([])
  const [exitCode, setExitCode] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  const label = getLabel(script)

  // Auto-scroll to bottom when new output lines arrive
  useEffect(() => {
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [output])

  const streamOutput = useCallback(async (confirmed: boolean) => {
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('running')
    setOutput([])
    setExitCode(null)

    try {
      for await (const event of runAppleScript(script, confirmed, controller.signal)) {
        if ('requiresConfirmation' in event) {
          // Should not happen when confirmed=true, but guard anyway
          break
        }
        const e = event as ExecutorEvent
        if (e.type === 'stdout' || e.type === 'stderr') {
          setOutput(prev => [...prev, { text: e.data, kind: e.type as 'stdout' | 'stderr' }])
        } else if (e.type === 'exit') {
          const code = parseInt(e.data, 10)
          setExitCode(isNaN(code) ? 0 : code)
          setPhase('done')
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setPhase('done')
      } else {
        setOutput(prev => [...prev, { text: String(err), kind: 'stderr' }])
        setPhase('done')
      }
    } finally {
      abortRef.current = null
    }
  }, [script])

  const handleRun = useCallback(async () => {
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const gen = runAppleScript(script, undefined, controller.signal)
      const first = await gen.next()

      if (first.done) {
        setPhase('done')
        return
      }

      if ('requiresConfirmation' in first.value && first.value.requiresConfirmation) {
        abortRef.current = null
        setPhase('confirming')
        return
      }

      // No confirmation needed — process first event then continue streaming
      setPhase('running')
      setOutput([])
      setExitCode(null)

      const processEvent = (event: ExecutorEvent | { requiresConfirmation: true }) => {
        if ('requiresConfirmation' in event) return
        const e = event as ExecutorEvent
        if (e.type === 'stdout' || e.type === 'stderr') {
          setOutput(prev => [...prev, { text: e.data, kind: e.type as 'stdout' | 'stderr' }])
        } else if (e.type === 'exit') {
          const code = parseInt(e.data, 10)
          setExitCode(isNaN(code) ? 0 : code)
          setPhase('done')
        }
      }

      processEvent(first.value)

      for await (const event of gen) {
        processEvent(event)
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setOutput(prev => [...prev, { text: String(err), kind: 'stderr' }])
      }
      setPhase('done')
      abortRef.current = null
    }
  }, [script])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleConfirm = useCallback(async (addToAllowlist: boolean) => {
    if (addToAllowlist) {
      try {
        await addPermission('applescript', extractAppName(script))
      } catch (e) {
        console.error('[AppleScriptBlock] addPermission failed:', e)
      }
    }
    await streamOutput(true)
  }, [script, streamOutput])

  const handleCancel = useCallback(() => {
    setPhase('idle')
  }, [])

  const showOutput = output.length > 0 || exitCode !== null

  return (
    <>
      {phase === 'confirming' && (
        <ConfirmationModal
          type="applescript"
          command={script}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.label}>{label}</span>
            <pre style={styles.scriptPreview}>{script}</pre>
          </div>
          <div style={styles.actions}>
            {phase === 'running' ? (
              <button style={styles.stopBtn} onClick={handleStop}>Stop</button>
            ) : (
              <button style={styles.runBtn} onClick={handleRun}>Run</button>
            )}
          </div>
        </div>

        {showOutput && (
          <div ref={outputRef} style={styles.outputArea}>
            {output.map((line, i) => (
              <div
                key={i}
                style={line.kind === 'stderr' ? styles.stderrLine : styles.stdoutLine}
              >
                {line.text}
              </div>
            ))}
            {exitCode !== null && (
              <div style={styles.exitLine}>[Exit: {exitCode}]</div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#2c2c2e',
    border: '1px solid #3a3a3c',
    borderRadius: 10,
    overflow: 'hidden',
    margin: '6px 0',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #3a3a3c',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    display: 'block',
    color: '#636366',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  scriptPreview: {
    margin: 0,
    color: '#e5e5ea',
    fontFamily: 'monospace',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  actions: {
    flexShrink: 0,
    paddingTop: 2,
  },
  runBtn: {
    background: '#636366',
    border: 'none',
    borderRadius: 6,
    color: '#e5e5ea',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 14px',
    cursor: 'pointer',
  },
  stopBtn: {
    background: 'transparent',
    border: '1px solid #ff9f0a',
    borderRadius: 6,
    color: '#ff9f0a',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 14px',
    cursor: 'pointer',
  },
  outputArea: {
    background: '#1c1c1e',
    padding: '10px 14px',
    maxHeight: 320,
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 1.5,
  },
  stdoutLine: {
    color: '#e5e5ea',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  stderrLine: {
    color: '#ff9f0a',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  exitLine: {
    color: '#8e8e93',
    marginTop: 6,
    fontSize: 11,
  },
}
