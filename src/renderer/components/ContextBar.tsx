import { contextPercent, contextColor } from '../lib/tokens'

interface Props {
  usedTokens: number
  contextWindow: number
}

function formatK(n: number): string {
  const k = n / 1000
  const rounded = Math.round(k * 10) / 10
  return rounded % 1 === 0 ? `${Math.floor(rounded)}k` : `${rounded}k`
}

export function ContextBar({ usedTokens, contextWindow }: Props) {
  const percent = contextPercent(usedTokens, contextWindow)
  const fillColor = contextColor(percent)

  return (
    <div style={styles.wrapper}>
      <span style={styles.label}>
        {formatK(usedTokens)} / {formatK(contextWindow)}
      </span>
      <div style={styles.barContainer}>
        <div
          style={{
            ...styles.barFill,
            width: `${percent}%`,
            background: fillColor,
          }}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    color: '#8e8e93',
    fontSize: 11,
  },
  barContainer: {
    background: '#3a3a3c',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.2s ease',
  },
}
