import { useEffect, useRef, useState } from 'react'

interface ConfirmationModalProps {
  type: 'shell' | 'applescript'
  command: string
  onConfirm: (addToAllowlist: boolean) => void
  onCancel: () => void
}

export function ConfirmationModal({ type, command, onConfirm, onCancel }: ConfirmationModalProps) {
  const [addToAllowlist, setAddToAllowlist] = useState(true)
  const modalRef = useRef<HTMLDivElement>(null)
  const onCancelRef = useRef(onCancel)

  useEffect(() => { onCancelRef.current = onCancel })

  useEffect(() => {
    modalRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const titleId = 'confirmation-modal-title'
  const title = type === 'shell' ? 'Run Shell Command' : 'Run AppleScript'

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div
        ref={modalRef}
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div id={titleId} style={styles.title}>{title}</div>

        <div style={styles.warning}>This will execute code on your system.</div>

        <pre style={styles.commandBlock}>{command}</pre>

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={addToAllowlist}
            onChange={e => setAddToAllowlist(e.target.checked)}
            style={styles.checkbox}
          />
          <span style={styles.checkboxLabel}>Add to allowlist</span>
        </label>

        <div style={styles.buttons}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={styles.runBtn} onClick={() => onConfirm(addToAllowlist)}>Run</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: '#2c2c2e',
    borderRadius: 12,
    padding: '24px',
    width: 480,
    maxWidth: '90vw',
    border: '1px solid #3a3a3c',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  title: {
    color: '#e5e5ea',
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 12,
  },
  warning: {
    color: '#ff9f0a',
    fontSize: 13,
    marginBottom: 14,
  },
  commandBlock: {
    background: '#1c1c1e',
    border: '1px solid #3a3a3c',
    borderRadius: 8,
    padding: '12px 14px',
    color: '#e5e5ea',
    fontSize: 12,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    margin: '0 0 16px',
    maxHeight: 200,
    overflowY: 'auto',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    marginBottom: 20,
  },
  checkbox: {
    accentColor: '#636366',
    width: 15,
    height: 15,
    cursor: 'pointer',
  },
  checkboxLabel: {
    color: '#aeaeb2',
    fontSize: 13,
  },
  buttons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #636366',
    borderRadius: 8,
    color: '#aeaeb2',
    fontSize: 13,
    padding: '7px 18px',
    cursor: 'pointer',
  },
  runBtn: {
    background: '#636366',
    border: 'none',
    borderRadius: 8,
    color: '#e5e5ea',
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 18px',
    cursor: 'pointer',
  },
}
