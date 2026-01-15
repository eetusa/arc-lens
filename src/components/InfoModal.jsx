import { styles } from '../styles';

function InfoModal({ onClose }) {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.modalBackdrop} onClick={handleBackdropClick}>
      <div style={styles.modalContainer}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>ARC Lens</h2>
          <button style={styles.modalClose} onClick={onClose}>&times;</button>
        </div>

        <div style={styles.modalContent}>
          {/* What is this */}
          <div style={styles.modalSection}>
            <span style={styles.modalSectionTitle}>What is this?</span>
            <p style={{ margin: 0 }}>
              ARC Lens is a real-time inventory advisor for ARC Raiders.
              It analyzes items you hover over in your inventory and recommends
              whether to keep, sell, or recycle them based on your current game progress.
            </p>
          </div>

          {/* Mobile Companion - NEW FEATURE */}
          <div style={{
            ...styles.modalSection,
            background: 'linear-gradient(135deg, rgba(0, 191, 255, 0.1) 0%, rgba(0, 255, 128, 0.1) 100%)',
            border: '1px solid rgba(0, 191, 255, 0.3)',
            borderRadius: '8px',
            padding: '16px'
          }}>
            <span style={{
              ...styles.modalSectionTitle,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              Mobile Companion
              <span style={{
                fontSize: '10px',
                background: '#00bfff',
                color: '#000',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 'bold'
              }}>NEW</span>
            </span>
            <p style={{ margin: '0 0 12px 0' }}>
              Only have one monitor? Use your phone as a second screen!
              Join a session from your mobile device to see item recommendations
              in real-time while you play.
            </p>
            <div style={{ fontSize: '13px', color: '#a0a0a0' }}>
              <strong style={{ color: '#ccc' }}>How it works:</strong>
              <ol style={{ ...styles.modalList, marginTop: '8px', marginBottom: 0 }}>
                <li style={styles.modalListItem}>
                  Start a session on your PC with <strong>"START CAPTURE"</strong>
                </li>
                <li style={styles.modalListItem}>
                  Click <strong>"Connect Mobile"</strong> to display a QR code
                </li>
                <li style={styles.modalListItem}>
                  Scan the QR code with your phone, or enter the Session ID manually as a fallback
                </li>
                <li style={styles.modalListItem}>
                  Your phone will display recommendations as you hover over items on PC
                </li>
              </ol>
            </div>
          </div>

          {/* How to use */}
          <div style={styles.modalSection}>
            <span style={styles.modalSectionTitle}>How to use (Desktop)</span>
            <ol style={styles.modalList}>
              <li style={styles.modalListItem}>
                Click <strong>"START CAPTURE"</strong> and choose your ARC Raiders game window
              </li>
              <li style={styles.modalListItem}>
                Open your inventory in-game
              </li>
              <li style={styles.modalListItem}>
                Hover over items to see recommendations
              </li>
              <li style={styles.modalListItem}>
                Configure your station levels and active quests using the sidebar
                (click the <strong>&#8249;</strong> button on the right edge)
              </li>
            </ol>
          </div>

          {/* Understanding Verdicts */}
          <div style={styles.modalSection}>
            <span style={styles.modalSectionTitle}>Understanding Verdicts</span>
            <div style={{ marginTop: '10px' }}>
              <div style={{ marginBottom: '10px' }}>
                <span style={styles.verdictBadge('#00ff00')}>KEEP</span>
                <span>Item is needed for active quests or station upgrades</span>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <span style={styles.verdictBadge('#ffd700')}>SELL</span>
                <span>Item is worth more when sold directly</span>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <span style={styles.verdictBadge('#00bfff')}>RECYCLE</span>
                <span>Item gives better value when recycled</span>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <span style={styles.verdictBadge('#888888')}>PREFERENCE</span>
                <span>Personal choice based on your playstyle</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div style={styles.modalSection}>
            <span style={styles.modalSectionTitle}>Tips</span>
            <ul style={styles.modalList}>
              <li style={styles.modalListItem}>
                Keep your inventory panel open for continuous analysis
              </li>
              <li style={styles.modalListItem}>
                Set your station levels accurately for better recommendations
              </li>
              <li style={styles.modalListItem}>
                Add active quests to prevent accidentally selling needed materials
              </li>
              <li style={styles.modalListItem}>
                Use Priorities in the sidebar to flag specific items you want to track
              </li>
              <li style={styles.modalListItem}>
                Items with crafting utility will show what they can be used to craft
              </li>
            </ul>
          </div>

          {/* Privacy */}
          <div style={styles.modalSection}>
            <span style={styles.modalSectionTitle}>Privacy</span>
            <p style={{ margin: 0, color: '#999' }}>
              ARC Lens processes your screen capture locally in your browser - no images
              are ever sent to any server. When using Mobile Companion, only item analysis
              results (item names and recommendations) are transmitted via WebSocket to
              your connected devices. Your settings are saved in your browser's local storage.
            </p>
          </div>

          {/* Created By */}
          <div style={styles.modalSection}>
            <span style={styles.modalSectionTitle}>Created By</span>
            <div style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              color: '#a0a0a0',
              flexWrap: 'wrap'
            }}>
              <span>Built by Eetu Salli</span>
              <a
                href="https://www.linkedin.com/in/eetu-salli-8a2160232/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#0078d4',
                  textDecoration: 'none',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#00a9f2'}
                onMouseLeave={(e) => e.target.style.color = '#0078d4'}
              >
                LinkedIn
              </a>
              <span style={{ color: '#444' }}>•</span>
              <a
                href="https://github.com/eetusa"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#0078d4',
                  textDecoration: 'none',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#00a9f2'}
                onMouseLeave={(e) => e.target.style.color = '#0078d4'}
              >
                GitHub
              </a>
            </div>
          </div>

          {/* Data Attribution */}
          <div style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid #333',
            fontSize: '11px',
            color: '#666',
            lineHeight: '1.5'
          }}>
            <div style={{ marginBottom: '12px' }}>
              Game data partially provided by{' '}
              <a
                href="https://ardb.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#0078d4',
                  textDecoration: 'none',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#00a9f2'}
                onMouseLeave={(e) => e.target.style.color = '#0078d4'}
              >
                ardb.app
              </a>
            </div>
            <div>
              <strong style={{ color: '#888' }}>Disclaimer:</strong> ARC Lens is an independent fan-made project created by the community.
              It is not affiliated with, endorsed by, sponsored by, or officially connected to Embark Studios AB or the ARC Raiders game.
              All game-related content, names, and assets belong to their respective owners.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoModal;
