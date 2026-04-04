import { useState } from 'react'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

interface SourcesBlockProps {
  results: SearchResult[]
}

export function SourcesBlock({ results }: SourcesBlockProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setExpanded(e => !e)}>
        <span style={styles.icon}>🌐</span>
        <span style={styles.title}>Web Sources ({results.length})</span>
        <span style={styles.toggle}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={styles.body}>
          {results.map((r, i) => (
            <div key={i} style={styles.result}>
              <div
                style={styles.resultTitle}
                onClick={() => window.open(r.url, '_blank')}
              >
                {r.title}
              </div>
              <div style={styles.resultUrl}>{r.url}</div>
              <div style={styles.resultSnippet}>{r.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1c1c1e', border: '1px solid #3a3a3c',
    borderRadius: 8, marginBottom: 8, overflow: 'hidden', fontSize: 12,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#2c2c2e', padding: '6px 12px', cursor: 'pointer',
    borderBottom: '1px solid #3a3a3c',
  },
  icon: { fontSize: 13 },
  title: { color: '#f2f2f7', flex: 1, fontWeight: 500 },
  toggle: { color: '#636366', fontSize: 11 },
  body: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 10 },
  result: {},
  resultTitle: {
    color: '#0a84ff', cursor: 'pointer', fontWeight: 500,
    marginBottom: 2,
  },
  resultUrl: { color: '#636366', fontSize: 11, marginBottom: 2 },
  resultSnippet: { color: '#aeaeb2', lineHeight: 1.5 },
}
