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
    // Not in a session - simple text link style
    return (
      <button
        style={{
          padding: '4px 8px',
          backgroundColor: 'transparent',
          border: 'none',
          color: theme.accent,
          fontSize: '10px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onClick={onToggle}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = theme.textMain;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = theme.accent;
        }}
      >
        Connect Mobile
      </button>
    );
  }

  if (role === 'host') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Status display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Green dot when connected */}
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: isConnected ? theme.success : theme.off,
            boxShadow: isConnected ? `0 0 6px ${theme.success}` : 'none',
            transition: 'all 0.2s ease'
          }} />
          <span style={{
            fontSize: '10px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: isConnected ? theme.textMain : theme.textDim
          }}>
            {isConnected ? `Mobile (${viewerCount})` : 'Connecting...'}
          </span>
        </div>

        {/* QR button - subtle */}
        <button
          style={{
            padding: '3px 6px',
            backgroundColor: 'transparent',
            border: 'none',
            color: theme.textDim,
            fontSize: '9px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={onToggle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = theme.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = theme.textDim;
          }}
        >
          QR
        </button>

        {/* Disconnect button */}
        {isConnected && (
          <button
            style={{
              width: '16px',
              height: '16px',
              padding: 0,
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.textDim,
              fontSize: '10px',
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
            ✕
          </button>
        )}
      </div>
    );
  }

  if (role === 'viewer') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Green dot when connected */}
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: isConnected ? theme.success : theme.off,
          boxShadow: isConnected ? `0 0 6px ${theme.success}` : 'none',
          transition: 'all 0.2s ease'
        }} />
        <span style={{
          fontSize: '10px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          color: isConnected ? theme.textMain : theme.textDim
        }}>
          {isConnected ? 'Connected' : 'Connecting...'}
        </span>

        {/* Disconnect button */}
        {isConnected && (
          <button
            style={{
              width: '16px',
              height: '16px',
              padding: 0,
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.textDim,
              fontSize: '10px',
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
            ✕
          </button>
        )}
      </div>
    );
  }

  return null;
}

export default SessionStatus;
