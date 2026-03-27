import { useEffect, useRef, useState } from 'react'

interface CompactToastProps {
  onExpire: () => void
  onCancel: () => void
}

export function CompactToast({ onExpire, onCancel }: CompactToastProps) {
  const [countdown, setCountdown] = useState(5)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          // Fire on next tick to avoid state update during render
          setTimeout(() => onExpireRef.current(), 0)
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={styles.toast}>
      <span style={styles.text}>Auto-compacting in {countdown}s…</span>
      <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#2c2c2e',
    border: '1px solid #48484a',
    borderRadius: 10,
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    zIndex: 100,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    whiteSpace: 'nowrap',
  },
  text: {
    color: '#e5e5ea',
    fontSize: 13,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #636366',
    borderRadius: 8,
    color: '#aeaeb2',
    fontSize: 12,
    padding: '3px 10px',
    cursor: 'pointer',
  },
}
