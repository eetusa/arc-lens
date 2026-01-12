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

          {/* How to use */}
          <div style={styles.modalSection}>
            <span style={styles.modalSectionTitle}>How to use</span>
            <ol style={styles.modalList}>
              <li style={styles.modalListItem}>
                Click <strong>"SELECT WINDOW"</strong> and choose your ARC Raiders game window
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
              ARC Lens runs entirely in your browser. Your screen capture is processed locally
              and never leaves your device. No data is collected, stored, or sent to any server.
              Your settings are saved only in your browser's local storage.
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

          {/* Disclaimer */}
          <div style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid #333',
            fontSize: '11px',
            color: '#666',
            lineHeight: '1.5'
          }}>
            <strong style={{ color: '#888' }}>Disclaimer:</strong> ARC Lens is an independent fan-made project created by the community.
            It is not affiliated with, endorsed by, sponsored by, or officially connected to Embark Studios AB or the ARC Raiders game.
            All game-related content, names, and assets belong to their respective owners.
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoModal;
