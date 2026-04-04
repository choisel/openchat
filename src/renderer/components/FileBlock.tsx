import { useState } from 'react'
import hljs from 'highlight.js'

interface FileBlockProps {
  filename: string
  language: string
  content: string
}

const LINE_THRESHOLD = 20

export function FileBlock({ filename, language, content }: FileBlockProps) {
  const lines = content.split('\n')
  const isLong = lines.length > LINE_THRESHOLD
  const [expanded, setExpanded] = useState(!isLong)

  const highlighted = (() => {
    try {
      return hljs.highlight(content, { language }).value
    } catch {
      return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  })()

  const displayContent = expanded
    ? highlighted
    : (() => {
        try {
          return hljs.highlight(lines.slice(0, LINE_THRESHOLD).join('\n'), { language }).value
        } catch {
          return lines.slice(0, LINE_THRESHOLD).join('\n')
        }
      })()

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setExpanded(e => !e)}>
        <span style={styles.icon}>📄</span>
        <span style={styles.filename}>{filename}</span>
        <span style={styles.lang}>{language}</span>
        {isLong && (
          <span style={styles.toggle}>{expanded ? '▲ collapse' : '▼ expand'}</span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <pre style={styles.pre}>
          <code
            className={`hljs language-${language}`}
            dangerouslySetInnerHTML={{ __html: displayContent }}
          />
        </pre>
        {!expanded && isLong && (
          <div style={styles.fadeOverlay} onClick={() => setExpanded(true)}>
            <span style={styles.expandHint}>Click to expand ({lines.length} lines)</span>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#141414', border: '1px solid #3a3a3c',
    borderRadius: 8, marginBottom: 8, overflow: 'hidden',
    fontSize: 12,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#2c2c2e', padding: '6px 12px', cursor: 'pointer',
    borderBottom: '1px solid #3a3a3c',
  },
  icon: { fontSize: 13 },
  filename: { color: '#f2f2f7', flex: 1, fontWeight: 500 },
  lang: { color: '#636366', fontSize: 11 },
  toggle: { color: '#0a84ff', fontSize: 11 },
  pre: {
    margin: 0, padding: '12px', overflowX: 'auto',
    maxHeight: 300, overflowY: 'auto',
  },
  fadeOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 48,
    background: 'linear-gradient(transparent, #141414)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    paddingBottom: 6, cursor: 'pointer',
  },
  expandHint: { color: '#0a84ff', fontSize: 11 },
}
