import { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

function SessionConnector({ onConnect, onCancel }) {
  const [mode, setMode] = useState('choose'); // 'choose' | 'scan' | 'manual'
  const [part1, setPart1] = useState('');
  const [part2, setPart2] = useState('');
  const [part3, setPart3] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);
  const input1Ref = useRef(null);
  const input2Ref = useRef(null);
  const input3Ref = useRef(null);

  // Initialize scanner when mode changes to 'scan'
  useEffect(() => {
    if (mode !== 'scan') return;

    const initScanner = async () => {
      setIsScanning(true);
      setError('');

      // Wait for DOM to render
      await new Promise(resolve => setTimeout(resolve, 100));

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

        // Provide helpful error messages based on the error type
        let errorMessage = 'Unable to access camera. ';

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMessage += 'Please enable camera permissions in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (err.message && err.message.includes('not found')) {
          errorMessage += 'Camera initialization failed. Please try manual entry instead.';
        } else {
          errorMessage += 'Please use manual entry instead.';
        }

        setError(errorMessage);
        setIsScanning(false);
      }
    };

    initScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [mode, onConnect]);

  const startScanning = () => {
    setMode('scan');
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleInputChange = (value, part, setPart, nextRef) => {
    // Only allow digits
    const digitsOnly = value.replace(/\D/g, '');

    // Limit to 4 digits
    const limited = digitsOnly.slice(0, 4);

    setPart(limited);

    // Auto-focus next input when current is filled
    if (limited.length === 4 && nextRef?.current) {
      nextRef.current.focus();
    }
  };

  // Handle paste: distribute digits across all three inputs
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const digitsOnly = pastedText.replace(/\D/g, '');

    if (digitsOnly.length === 0) return;

    // Distribute across the three parts
    const newPart1 = digitsOnly.slice(0, 4);
    const newPart2 = digitsOnly.slice(4, 8);
    const newPart3 = digitsOnly.slice(8, 12);

    setPart1(newPart1);
    setPart2(newPart2);
    setPart3(newPart3);

    // Focus the appropriate input based on what was filled
    if (newPart3.length > 0) {
      input3Ref.current?.focus();
    } else if (newPart2.length > 0) {
      input2Ref.current?.focus();
    } else if (newPart1.length === 4) {
      input2Ref.current?.focus();
    }
  };

  const handleKeyDown = (e, part, setPart, prevRef) => {
    // Handle backspace: if current field is empty, go to previous field
    if (e.key === 'Backspace' && part === '' && prevRef?.current) {
      prevRef.current.focus();
    }
  };

  const handleManualConnect = () => {
    // Combine all three parts
    const combined = part1 + part2 + part3;

    if (combined.length !== 12) {
      setError('Please enter all 12 digits');
      return;
    }

    // Validate it's all digits (should always be true due to input validation)
    if (!/^\d+$/.test(combined)) {
      setError('Session ID must contain only numbers');
      return;
    }

    onConnect(combined);
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

          {/* Error Message with Manual Entry Fallback */}
          {error && (
            <div style={{ marginBottom: '16px' }}>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#b71c1c',
                  border: '1px solid #ef5350',
                  borderRadius: '8px',
                  color: '#ffebee',
                  fontSize: '14px',
                  marginBottom: '12px'
                }}
              >
                {error}
              </div>
              <button
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#0078d4',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  stopScanning();
                  setMode('manual');
                }}
              >
                Use Manual Entry Instead
              </button>
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
              Session ID (12 digits)
            </label>

            {/* Three-part input with hyphens */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              justifyContent: 'center'
            }}>
              <input
                ref={input1Ref}
                type="text"
                inputMode="numeric"
                value={part1}
                onChange={(e) => handleInputChange(e.target.value, part1, setPart1, input2Ref)}
                onKeyDown={(e) => handleKeyDown(e, part1, setPart1, null)}
                onPaste={handlePaste}
                placeholder="1234"
                maxLength={4}
                autoComplete="off"
                style={{
                  width: '80px',
                  padding: '12px 8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '20px',
                  fontFamily: 'monospace',
                  letterSpacing: '3px',
                  textAlign: 'center'
                }}
              />

              <span style={{
                color: '#666',
                fontSize: '24px',
                fontWeight: 'bold',
                userSelect: 'none'
              }}>-</span>

              <input
                ref={input2Ref}
                type="text"
                inputMode="numeric"
                value={part2}
                onChange={(e) => handleInputChange(e.target.value, part2, setPart2, input3Ref)}
                onKeyDown={(e) => handleKeyDown(e, part2, setPart2, input1Ref)}
                onPaste={handlePaste}
                placeholder="5678"
                maxLength={4}
                autoComplete="off"
                style={{
                  width: '80px',
                  padding: '12px 8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '20px',
                  fontFamily: 'monospace',
                  letterSpacing: '3px',
                  textAlign: 'center'
                }}
              />

              <span style={{
                color: '#666',
                fontSize: '24px',
                fontWeight: 'bold',
                userSelect: 'none'
              }}>-</span>

              <input
                ref={input3Ref}
                type="text"
                inputMode="numeric"
                value={part3}
                onChange={(e) => handleInputChange(e.target.value, part3, setPart3, null)}
                onKeyDown={(e) => handleKeyDown(e, part3, setPart3, input2Ref)}
                onPaste={handlePaste}
                placeholder="9012"
                maxLength={4}
                autoComplete="off"
                style={{
                  width: '80px',
                  padding: '12px 8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '20px',
                  fontFamily: 'monospace',
                  letterSpacing: '3px',
                  textAlign: 'center'
                }}
              />
            </div>

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
