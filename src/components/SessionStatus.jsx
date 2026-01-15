const theme = {
  cardBg: '#141414',
  border: '#333',
  accent: '#0078d4',
  textMain: '#e0e0e0',
  textDim: '#666',
  success: '#00ff00',
  off: '#333333'
};

function SessionStatus({ isConnected, role, viewerCount, onToggle, onDisconnect }) {
  if (role === null) {
    // Not in a session (role is null when sessionEnabled is false)
    return (
      <button
        style={{
          padding: '6px 12px',
          backgroundColor: 'transparent',
          border: `1px solid ${theme.accent}`,
          borderRadius: '4px',
          color: theme.accent,
          fontSize: '11px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s'
        }}
        onClick={onToggle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.accent;
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = theme.accent;
        }}
      >
        <span>◉</span>
        <span>Connect Mobile</span>
      </button>
    );
  }

  if (role === 'host') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isConnected ? theme.success : theme.off,
              boxShadow: isConnected ? `0 0 10px ${theme.success}` : 'inset 0 0 3px #000',
              border: `1px solid ${isConnected ? theme.success : '#444'}`,
              transition: 'all 0.2s ease'
            }}
          />
          <span style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: isConnected ? theme.textMain : theme.textDim
          }}>
            {isConnected ? `MOBILE (${viewerCount})` : 'CONNECTING...'}
          </span>
          {/* Disconnect button - right next to MOBILE text */}
          {isConnected && (
            <button
              style={{
                width: '18px',
                height: '18px',
                padding: 0,
                marginLeft: '2px',
                backgroundColor: 'transparent',
                border: 'none',
                color: theme.textDim,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s'
              }}
              onClick={onDisconnect}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ff4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.textDim;
              }}
              title="Disconnect session"
            >
              ⏻
            </button>
          )}
        </div>
        <button
          style={{
            padding: '4px 10px',
            backgroundColor: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            color: theme.textDim,
            fontSize: '9px',
            fontWeight: 'bold',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={onToggle}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = theme.accent;
            e.currentTarget.style.color = theme.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = theme.border;
            e.currentTarget.style.color = theme.textDim;
          }}
        >
          Show QR
        </button>
      </div>
    );
  }

  if (role === 'viewer') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: isConnected ? theme.success : theme.off,
            boxShadow: isConnected ? `0 0 10px ${theme.success}` : 'inset 0 0 3px #000',
            border: `1px solid ${isConnected ? theme.success : '#444'}`,
            transition: 'all 0.2s ease'
          }}
        />
        <span style={{
          fontSize: '11px',
          fontWeight: 'bold',
          color: isConnected ? theme.textMain : theme.textDim
        }}>
          {isConnected ? 'CONNECTED' : 'CONNECTING...'}
        </span>
        {/* Disconnect button - right next to CONNECTED text */}
        {isConnected && (
          <button
            style={{
              width: '18px',
              height: '18px',
              padding: 0,
              marginLeft: '2px',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.textDim,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s'
            }}
            onClick={onDisconnect}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ff4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = theme.textDim;
            }}
            title="Disconnect"
          >
            ⏻
          </button>
        )}
      </div>
    );
  }

  return null;
}

export default SessionStatus;
