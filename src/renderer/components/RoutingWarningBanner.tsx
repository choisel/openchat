interface RoutingWarningBannerProps {
  onDismiss: () => void
}

export function RoutingWarningBanner({ onDismiss }: RoutingWarningBannerProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      background: '#ff9f0a',
      color: '#1c1c1e',
      fontSize: '13px',
      fontWeight: 500,
      lineHeight: 1.4,
    }}>
      <span>
        Auto routing is struggling — responses may use a fallback model. You can pin a model in the conversation settings.
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          marginLeft: '16px',
          flexShrink: 0,
          background: 'none',
          border: 'none',
          color: '#1c1c1e',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '0 4px',
          opacity: 0.7,
        }}
      >
        ×
      </button>
    </div>
  )
}
