import React, { useState } from 'react';
import { theme } from '../styles';

/**
 * DebugPanel - Full-width bottom panel for debug views
 *
 * Usage:
 * <DebugPanel isVisible={showDebug}>
 *   <DebugPanel.Item label="LIVE FEED" status="active">
 *     <canvas ref={canvasRef} />
 *   </DebugPanel.Item>
 * </DebugPanel>
 */

// Status colors
const STATUS_COLORS = {
  active: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  idle: theme.border
};

// Individual debug item component
function DebugItem({ label, status = 'idle', children, flex = 1 }) {
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.idle;

  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      border: `1px solid ${statusColor}`,
      borderRadius: '4px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      flex,
      minWidth: '150px',
      height: '100%'
    }}>
      {/* Label header */}
      <div style={{
        fontSize: '10px',
        fontFamily: '"Consolas", "Monaco", monospace',
        fontWeight: '600',
        letterSpacing: '0.5px',
        padding: '4px 8px',
        color: '#fff',
        backgroundColor: statusColor,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {label}
      </div>
      {/* Content area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '4px',
        position: 'relative'
      }}>
        {children}
      </div>
    </div>
  );
}

// Text overlay for debug items (e.g., OCR text)
function DebugOverlay({ children }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '4px',
      left: '4px',
      right: '4px',
      fontSize: '10px',
      fontFamily: '"Consolas", "Monaco", monospace',
      color: theme.accent,
      backgroundColor: 'rgba(0,0,0,0.85)',
      padding: '4px 6px',
      borderRadius: '2px',
      maxHeight: '60px',
      overflow: 'auto',
      wordBreak: 'break-word'
    }}>
      {children}
    </div>
  );
}

// Main DebugPanel component
export default function DebugPanel({ isVisible, children }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Toggle bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '4px'
      }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            backgroundColor: 'rgba(10, 10, 10, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${theme.border}`,
            borderRadius: '4px 4px 0 0',
            borderBottom: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title={isExpanded ? 'Collapse debug panel' : 'Expand debug panel'}
        >
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: theme.accent,
            boxShadow: `0 0 8px ${theme.accent}`
          }} />
          <span style={{
            fontSize: '11px',
            fontFamily: '"Consolas", "Monaco", monospace',
            fontWeight: '600',
            letterSpacing: '1px',
            color: theme.textMain,
            textTransform: 'uppercase'
          }}>
            DEBUG PANEL
          </span>
          <span style={{
            fontSize: '12px',
            color: theme.textDim,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}>
            ▲
          </span>
        </button>
      </div>

      {/* Expanded panel - full width, substantial height, glass effect */}
      <div style={{
        backgroundColor: 'rgba(10, 10, 10, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${theme.border}`,
        padding: isExpanded ? '12px' : '0',
        height: isExpanded ? '280px' : '0',
        overflow: 'hidden',
        transition: 'height 0.3s ease, padding 0.3s ease',
        display: 'flex',
        gap: '12px'
      }}>
        {children}
      </div>
    </div>
  );
}

// Attach sub-components
DebugPanel.Item = DebugItem;
DebugPanel.Overlay = DebugOverlay;
