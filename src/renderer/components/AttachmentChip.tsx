import type { AttachmentData } from '../api-client'

interface AttachmentChipProps {
  attachment: AttachmentData
  onRemove: () => void
  isVisionWarning?: boolean
}

function typeIcon(type: AttachmentData['type']): string {
  switch (type) {
    case 'text': return '📄'
    case 'pdf': return '📕'
    case 'pdf-unreadable': return '⚠'
    case 'image': return '🖼'
    default: return '📎'
  }
}

export function AttachmentChip({ attachment, onRemove, isVisionWarning }: AttachmentChipProps) {
  const isWarning = attachment.type === 'pdf-unreadable' || isVisionWarning

  return (
    <div style={{ ...styles.chip, ...(isWarning ? styles.warningChip : {}) }}>
      <span style={styles.icon}>{typeIcon(attachment.type)}</span>
      <span style={styles.name}>{attachment.filename}</span>
      {isVisionWarning && (
        <span style={styles.warningLabel} title="Model may not support images">vision?</span>
      )}
      {attachment.type === 'pdf-unreadable' && (
        <span style={styles.warningLabel}>unreadable</span>
      )}
      <button style={styles.removeBtn} onClick={onRemove} title="Remove">×</button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: '#3a3a3c', borderRadius: 6,
    padding: '3px 8px', fontSize: 12, color: '#f2f2f7',
    border: '1px solid #48484a',
  },
  warningChip: {
    background: '#3a2500', border: '1px solid #ff9f0a',
  },
  icon: { fontSize: 13 },
  name: { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  warningLabel: { color: '#ff9f0a', fontSize: 11 },
  removeBtn: {
    background: 'none', border: 'none', color: '#8e8e93',
    cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px',
  },
}
