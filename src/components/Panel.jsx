import React, { useState, useRef, useCallback, useEffect } from 'react';
import { theme } from '../styles';

/**
 * Generic Panel Component
 *
 * Features:
 * - Smooth open/close animations
 * - Resizable width via drag handle
 * - Configurable position (left/right)
 * - Persisted width in localStorage
 *
 * @param {string} id - Unique panel identifier (used for localStorage key)
 * @param {boolean} isOpen - Whether the panel is visible
 * @param {string} position - 'left' or 'right'
 * @param {number} defaultWidth - Default width in pixels
 * @param {number} minWidth - Minimum allowed width
 * @param {number} maxWidth - Maximum allowed width
 * @param {function} onWidthChange - Callback when width changes (for persistence)
 * @param {number} width - Controlled width (from parent/localStorage)
 * @param {React.ReactNode} children - Panel content
 */
export default function Panel({
  id,
  isOpen,
  position = 'left',
  defaultWidth = 280,
  minWidth = 200,
  maxWidth = 500,
  width: controlledWidth,
  onWidthChange,
  children,
  style = {},
  glass = false // Enable glass/blur effect
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [localWidth, setLocalWidth] = useState(controlledWidth || defaultWidth);
  const panelRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Use controlled width if provided, otherwise local state
  const width = controlledWidth !== undefined ? controlledWidth : localWidth;

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const delta = position === 'left'
      ? e.clientX - startXRef.current
      : startXRef.current - e.clientX;

    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));

    if (onWidthChange) {
      onWidthChange(newWidth);
    } else {
      setLocalWidth(newWidth);
    }
  }, [isDragging, position, minWidth, maxWidth, onWidthChange]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [isDragging]);

  // Global mouse listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Track hover state for resize handle
  const [isHovered, setIsHovered] = useState(false);

  // Resize handle component with visible grip indicator
  const ResizeHandle = () => (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '16px',
        cursor: 'col-resize',
        zIndex: 10,
        // Position on opposite side of panel position
        ...(position === 'left' ? { right: '-8px' } : { left: '-8px' }),
        // Visual indicator
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* Visible grip pill with dots */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '12px 4px',
        borderRadius: '6px',
        backgroundColor: isDragging
          ? 'rgba(0, 120, 212, 0.4)'
          : isHovered
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(255, 255, 255, 0.08)',
        border: `1px solid ${isDragging ? theme.accent : isHovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
        transition: 'all 0.15s ease',
        boxShadow: isDragging ? `0 0 8px ${theme.accent}` : 'none'
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: isDragging ? theme.accent : '#888',
            opacity: isDragging ? 1 : isHovered ? 0.9 : 0.6,
            transition: 'all 0.15s ease'
          }} />
        ))}
      </div>
    </div>
  );

  // Glass effect styles
  const glassStyles = glass ? {
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)' // Safari support
  } : {};

  return (
    <div
      ref={panelRef}
      style={{
        position: 'relative',
        width: isOpen ? `${width}px` : '0px',
        minWidth: isOpen ? `${width}px` : '0px',
        height: '100%',
        overflow: 'hidden',
        transition: isDragging
          ? 'none'
          : 'width 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
        // Border on inner edge
        ...(position === 'left'
          ? { borderRight: isOpen ? `1px solid ${theme.border}` : 'none' }
          : { borderLeft: isOpen ? `1px solid ${theme.border}` : 'none' }
        ),
        ...glassStyles,
        ...style
      }}
    >
      {/* Panel content - only render when open for performance */}
      <div style={{
        width: `${width}px`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.2s ease',
        transitionDelay: isOpen ? '0.1s' : '0s'
      }}>
        {children}
      </div>

      {/* Resize handle - only when open */}
      {isOpen && <ResizeHandle />}
    </div>
  );
}

/**
 * Center Panel Component
 *
 * The flexible center panel that fills remaining space.
 * Optionally constrained when both side panels are hidden.
 */
export function CenterPanel({
  isOpen,
  hasLeftPanel,
  hasRightPanel,
  maxWidth = 900,
  children,
  style = {}
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '24px',
        boxSizing: 'border-box',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.3s ease',
        // Center content with max-width when no side panels
        ...(!hasLeftPanel && !hasRightPanel && {
          maxWidth: `${maxWidth}px`,
          margin: '0 auto',
          width: '100%'
        }),
        ...style
      }}
    >
      {children}
    </div>
  );
}
