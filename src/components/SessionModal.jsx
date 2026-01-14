import { QRCodeSVG } from 'qrcode.react';

function SessionModal({ sessionId, onClose }) {
  // Format session ID as XXXX-XXXX-XXXX for display
  const displaySessionId = sessionId
    .toUpperCase()
    .match(/.{1,4}/g)
    .join('-');

  const qrData = JSON.stringify({
    type: 'arclens-session',
    sessionId,
    url: `${window.location.origin}/join/${sessionId}`
  });

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px'
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px', color: '#fff' }}>
            Connect Mobile Device
          </h2>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '28px',
              cursor: 'pointer',
              padding: '0',
              lineHeight: '1'
            }}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* QR Code Section */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px'
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: '#bbb' }}>
            Scan this QR code with your mobile device:
          </p>
          <div
            style={{
              padding: '16px',
              backgroundColor: '#fff',
              borderRadius: '12px'
            }}
          >
            <QRCodeSVG value={qrData} size={200} level="M" includeMargin={false} />
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '24px 0',
            color: '#666'
          }}
        >
          <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }} />
          <span style={{ fontSize: '12px' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }} />
        </div>

        {/* Manual Entry Section */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: '#bbb' }}>
            Enter this session ID manually:
          </p>
          <div
            style={{
              padding: '12px 24px',
              backgroundColor: '#2a2a2a',
              borderRadius: '8px',
              border: '1px solid #444',
              fontFamily: 'monospace',
              fontSize: '20px',
              letterSpacing: '2px',
              color: '#00bcd4',
              fontWeight: 'bold'
            }}
          >
            {displaySessionId}
          </div>
        </div>

        {/* Instructions */}
        <div
          style={{
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#0d0d0d',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#888',
            lineHeight: '1.6'
          }}
        >
          <strong style={{ color: '#bbb' }}>Instructions:</strong>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>Open ARC Lens on your mobile device</li>
            <li>Tap "Connect to Desktop"</li>
            <li>Scan QR code or enter session ID</li>
            <li>Your mobile will display real-time analysis</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default SessionModal;
