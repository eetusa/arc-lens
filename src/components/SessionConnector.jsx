import { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

function SessionConnector({ onConnect, onCancel }) {
  const [mode, setMode] = useState('choose'); // 'choose' | 'scan' | 'manual'
  const [sessionId, setSessionId] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanning = async () => {
    setMode('scan');
    setIsScanning(true);
    setError('');

    try {
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          try {
            const data = JSON.parse(decodedText);
            if (data.type === 'arclens-session' && data.sessionId) {
              stopScanning();
              onConnect(data.sessionId);
            }
          } catch (e) {
            // Not valid ARC Lens QR code
            setError('Invalid QR code. Please scan an ARC Lens session QR code.');
          }
        },
        () => {
          // Ignore scan errors (happens frequently during scanning)
        }
      );
    } catch (err) {
      console.error('QR Scanner error:', err);
      setError('Camera access denied. Please enable camera permissions and try again.');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleManualConnect = () => {
    // Clean session ID (remove dashes)
    const cleaned = sessionId.replace(/-/g, '').toLowerCase();

    if (cleaned.length !== 12) {
      setError('Invalid session ID format. Expected: XXXX-XXXX-XXXX');
      return;
    }

    // Reconstruct UUID format (simplified - server will handle validation)
    onConnect(cleaned);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      stopScanning();
      onCancel();
    }
  };

  // Choose Mode
  if (mode === 'choose') {
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
            maxWidth: '400px',
            width: '90%'
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
              Connect to Desktop
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
              onClick={onCancel}
            >
              &times;
            </button>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '16px',
                backgroundColor: '#00bcd4',
                border: 'none',
                borderRadius: '8px',
                color: '#000',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
              }}
              onClick={startScanning}
            >
              <span style={{ fontSize: '24px' }}>📷</span>
              Scan QR Code
            </button>

            <button
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '16px',
                backgroundColor: '#1a1a1a',
                border: '1px solid #444',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
              }}
              onClick={() => setMode('manual')}
            >
              <span style={{ fontSize: '24px' }}>⌨️</span>
              Enter Session ID
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Scan Mode
  if (mode === 'scan') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
      >
        <div
          style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}
          >
            <h2 style={{ margin: 0, fontSize: '20px', color: '#fff' }}>Scan QR Code</h2>
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
              onClick={() => {
                stopScanning();
                setMode('choose');
              }}
            >
              &times;
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#b71c1c',
                border: '1px solid #ef5350',
                borderRadius: '8px',
                color: '#ffebee',
                fontSize: '14px',
                marginBottom: '16px'
              }}
            >
              {error}
            </div>
          )}

          {/* QR Reader */}
          <div
            id="qr-reader"
            style={{
              width: '100%',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#000'
            }}
          />

          {/* Instructions */}
          <p
            style={{
              marginTop: '16px',
              fontSize: '13px',
              color: '#888',
              textAlign: 'center',
              marginBottom: 0
            }}
          >
            Point your camera at the QR code displayed on your desktop
          </p>
        </div>
      </div>
    );
  }

  // Manual Entry Mode
  if (mode === 'manual') {
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
            maxWidth: '400px',
            width: '90%'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}
          >
            <h2 style={{ margin: 0, fontSize: '20px', color: '#fff' }}>Enter Session ID</h2>
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
              onClick={() => setMode('choose')}
            >
              &times;
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#b71c1c',
                border: '1px solid #ef5350',
                borderRadius: '8px',
                color: '#ffebee',
                fontSize: '14px',
                marginBottom: '16px'
              }}
            >
              {error}
            </div>
          )}

          {/* Input Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label style={{ fontSize: '14px', color: '#bbb' }}>
              Session ID (format: XXXX-XXXX-XXXX)
            </label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value.toUpperCase())}
              placeholder="A1B2-C3D4-E5F6"
              maxLength={14}
              style={{
                padding: '12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '18px',
                fontFamily: 'monospace',
                letterSpacing: '2px',
                textAlign: 'center'
              }}
            />

            <button
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                backgroundColor: '#00bcd4',
                border: 'none',
                borderRadius: '8px',
                color: '#000',
                fontWeight: '600',
                cursor: 'pointer'
              }}
              onClick={handleManualConnect}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default SessionConnector;
