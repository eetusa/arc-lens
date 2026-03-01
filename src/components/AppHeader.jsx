import React from 'react';
import { styles, theme } from '../styles';
import SessionStatus from './SessionStatus';

// Panel toggle component with LED indicator (defined outside render)
function PanelToggle({ isActive, label, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        backgroundColor: 'transparent',
        border: 'none',
        cursor: 'pointer',
        position: 'relative'
      }}
    >
      {/* LED indicator */}
      <div style={{
        width: '6px',
        height: '6px',
        borderRadius: '1px',
        backgroundColor: isActive ? theme.accent : '#2a2a2a',
        boxShadow: isActive
          ? `0 0 6px ${theme.accent}, 0 0 12px ${theme.accent}40`
          : 'inset 0 1px 2px rgba(0,0,0,0.5)',
        border: `1px solid ${isActive ? theme.accent : '#3a3a3a'}`,
        transition: 'all 0.2s ease'
      }} />
      {/* Label */}
      <span style={{
        fontSize: '10px',
        fontWeight: '600',
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: isActive ? theme.textMain : theme.textDim,
        fontFamily: '"Consolas", "Monaco", monospace',
        transition: 'color 0.2s ease'
      }}>
        {label}
      </span>
      {/* Active underline */}
      <div style={{
        position: 'absolute',
        bottom: '2px',
        left: '10px',
        right: '10px',
        height: '1px',
        backgroundColor: isActive ? theme.accent : 'transparent',
        boxShadow: isActive ? `0 0 4px ${theme.accent}` : 'none',
        transition: 'all 0.2s ease'
      }} />
    </button>
  );
}

/**
 * AppHeader - Full-width header with panel toggles for desktop layout
 */
export default function AppHeader({
  isInventoryOpen,
  inventoryOverride,
  onInventoryOverrideToggle,
  workerStatus,
  showDebug,
  onDebugToggle,
  isStreaming,
  onStartCapture,
  onStopCapture,
  configPanelOpen,
  onConfigPanelToggle,
  advisorPanelOpen,
  onAdvisorPanelToggle,
  questPanelOpen,
  onQuestPanelToggle,
  sessionEnabled,
  isSessionHost,
  isConnected,
  viewerCount,
  onSessionToggle,
  onSessionDisconnect,
  onInfoClick,
  showVersionNotification,
  patchInfo
}) {
  // Header divider
  const divider = {
    width: '1px',
    height: '20px',
    backgroundColor: theme.border,
    margin: '0 4px'
  };

  // Determine status text and color
  const isActive = isInventoryOpen || inventoryOverride;
  const isReady = workerStatus?.includes('Ready');
  const statusText = inventoryOverride ? 'OVERRIDE' : (isInventoryOpen ? 'INV' : 'READY');
  const statusColor = inventoryOverride ? '#ff9800' : (isInventoryOpen ? theme.success : theme.textDim);
  // LED is on when: inventory active, override active, or system ready (not loading)
  const ledOn = isActive || isReady;

  return (
    <header style={{
      ...styles.header,
      position: 'relative'  // For absolute centering of panel toggles
    }}>
      {/* LEFT SECTION - Brand + Status + Capture */}
      <div style={styles.headerLeft}>
        {/* Brand + inline status LED */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            ...styles.headerBrand,
            fontFamily: '"Consolas", "Monaco", monospace'
          }}>ARC Lens</span>

          {/* Inline status LED */}
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '1px',
            backgroundColor: ledOn ? (isActive ? statusColor : theme.accent) : '#2a2a2a',
            boxShadow: ledOn
              ? `0 0 6px ${isActive ? statusColor : theme.accent}, 0 0 12px ${isActive ? statusColor : theme.accent}40`
              : 'inset 0 1px 2px rgba(0,0,0,0.5)',
            border: `1px solid ${ledOn ? (isActive ? statusColor : theme.accent) : '#3a3a3a'}`
          }} />

          {/* Status text */}
          <span style={{
            fontSize: '10px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: statusColor
          }}>
            {statusText}
          </span>
        </div>

        {/* Override button - debug mode only */}
        {showDebug && (
          <button
            style={{
              ...styles.overrideButton(inventoryOverride),
              fontSize: '9px'
            }}
            onClick={onInventoryOverrideToggle}
            title="Force inventory detection"
          >
            {inventoryOverride ? 'OFF' : 'FORCE'}
          </button>
        )}

        <div style={divider} />

        {/* Capture Button - Primary Action */}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStopCapture}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 16px',
              backgroundColor: 'rgba(20, 20, 20, 0.95)',
              border: '1px solid #b71c1c',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease, background-color 0.2s ease',
              boxShadow: '0 0 12px rgba(183, 28, 28, 0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
            }}
            title="Stop screen capture"
          >
            {/* Recording LED - square, pulsing red */}
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '1px',
              backgroundColor: '#f44336',
              boxShadow: '0 0 8px #f44336, 0 0 16px rgba(244, 67, 54, 0.5)',
              animation: 'pulse-glow 1s ease-in-out infinite'
            }} />
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: '"Consolas", "Monaco", monospace',
              letterSpacing: '1px',
              color: '#f44336',
              textTransform: 'uppercase'
            }}>
              Stop
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartCapture}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 16px',
              backgroundColor: 'rgba(20, 20, 20, 0.95)',
              border: `1px solid ${theme.accent}`,
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease, background-color 0.2s ease',
              boxShadow: `0 0 12px rgba(0, 120, 212, 0.3), inset 0 1px 0 rgba(255,255,255,0.05)`
            }}
            title="Start screen capture"
          >
            {/* Ready LED - circle, accent blue, pulsing */}
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: theme.accent,
              boxShadow: `0 0 6px ${theme.accent}, 0 0 12px rgba(0, 120, 212, 0.4)`,
              animation: 'pulse-glow 2s ease-in-out infinite'
            }} />
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: '"Consolas", "Monaco", monospace',
              letterSpacing: '1px',
              color: '#fff',
              textTransform: 'uppercase'
            }}>
              Start
            </span>
          </button>
        )}
      </div>

      {/* CENTER SECTION - Panel Toggles (absolutely centered) */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        backgroundColor: 'rgba(0,0,0,0.3)',
        border: `1px solid ${theme.border}`,
        borderRadius: '2px'
      }}>
        <PanelToggle
          isActive={configPanelOpen}
          label="Config"
          onClick={onConfigPanelToggle}
          title="Toggle config panel [C]"
        />
        <div style={{ width: '1px', height: '16px', backgroundColor: theme.border }} />
        <PanelToggle
          isActive={advisorPanelOpen}
          label="Advisor"
          onClick={onAdvisorPanelToggle}
          title="Toggle advisor panel [A]"
        />
        <div style={{ width: '1px', height: '16px', backgroundColor: theme.border }} />
        <PanelToggle
          isActive={questPanelOpen}
          label="Quest"
          onClick={onQuestPanelToggle}
          title="Toggle quest panel [Q]"
        />
      </div>

      {/* RIGHT SECTION - Session, Debug, Info */}
      <div style={styles.headerRight}>
        <SessionStatus
          isConnected={isConnected}
          role={sessionEnabled ? (isSessionHost ? 'host' : 'viewer') : null}
          viewerCount={viewerCount}
          onToggle={onSessionToggle}
          onDisconnect={onSessionDisconnect}
        />

        <div style={divider} />

        {/* Debug Toggle */}
        <div style={styles.toggleLabel} onClick={onDebugToggle}>
          <div style={styles.switchTrack(showDebug)}>
            <div style={styles.switchKnob(showDebug)}></div>
          </div>
          <span style={styles.toggleText}>DBG</span>
        </div>

        {patchInfo && (
          <>
            <div style={divider} />
            <span
              title={`Game patch: ${patchInfo.name ? `${patchInfo.name} ` : ''}${patchInfo.version}`}
              style={{
                fontSize: '9px',
                fontWeight: '600',
                fontFamily: '"Consolas", "Monaco", monospace',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: theme.textDim,
                whiteSpace: 'nowrap',
                userSelect: 'none'
              }}
            >
              {patchInfo.name ? `${patchInfo.name} · ${patchInfo.version}` : `Patch · ${patchInfo.version}`}
            </span>
          </>
        )}

        <div style={divider} />

        {/* Info Button - Simple (i) circle at far right */}
        <button
          onClick={onInfoClick}
          style={{
            width: '24px',
            height: '24px',
            minWidth: '24px',
            minHeight: '24px',
            padding: 0,
            boxSizing: 'border-box',
            borderRadius: '50%',
            backgroundColor: 'transparent',
            border: `1px solid ${showVersionNotification ? theme.accent : theme.border}`,
            color: showVersionNotification ? theme.accent : theme.textDim,
            fontSize: '14px',
            fontWeight: 'bold',
            fontStyle: 'italic',
            fontFamily: 'Georgia, serif',
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            ...(showVersionNotification && {
              animation: 'pulse-glow 1.5s ease-in-out infinite'
            })
          }}
          title="About & Changelog"
          onMouseEnter={(e) => {
            if (!showVersionNotification) {
              e.currentTarget.style.borderColor = theme.accent;
              e.currentTarget.style.color = theme.accent;
            }
          }}
          onMouseLeave={(e) => {
            if (!showVersionNotification) {
              e.currentTarget.style.borderColor = theme.border;
              e.currentTarget.style.color = theme.textDim;
            }
          }}
        >
          i
        </button>
      </div>
    </header>
  );
}
