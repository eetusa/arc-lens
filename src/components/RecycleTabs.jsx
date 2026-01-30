import React, { useState, useEffect } from 'react';
import { styles, theme } from '../styles';

// Rarity colors (toned down for backgrounds)
const RARITY_BG_COLORS = {
  legendary: 'rgba(255, 198, 0, 0.25)',   // Gold
  epic:      'rgba(204, 48, 153, 0.25)',  // Pink/Magenta
  rare:      'rgba(0, 169, 242, 0.25)',   // Blue
  uncommon:  'rgba(38, 191, 87, 0.25)',   // Green
  common:    'rgba(108, 108, 108, 0.2)'   // Gray
};

// Priority color (purple) - used when item is prioritized
const PRIORITY_BG_COLOR = 'rgba(156, 39, 176, 0.35)';
const PRIORITY_BORDER_COLOR = '#9c27b0';

/**
 * RecycleTabs - Shows recycle outputs as icon tabs
 * Images are preloaded globally by imagePreloader.js on app startup
 *
 * @param {array} outputs - Array of { id, name, amount, rarity, isPrioritized } objects
 * @param {boolean} isMobile - Whether to render in mobile layout
 * @param {boolean} horizontal - Whether to render horizontally (for panel layout)
 */
const RecycleTabs = ({ outputs = [], isMobile = false, horizontal = false }) => {
  const [failedImages, setFailedImages] = useState(new Set());
  const [selectedTab, setSelectedTab] = useState(null);

  // Dismiss tooltip when tapping anywhere else
  // Must be called before any early returns to follow React hooks rules
  useEffect(() => {
    if (!isMobile || !selectedTab) return;

    const handleDocumentClick = () => setSelectedTab(null);
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [isMobile, selectedTab]);

  if (!outputs || outputs.length === 0) {
    return null;
  }

  const handleImageError = (id) => {
    setFailedImages(prev => new Set([...prev, id]));
  };

  const handleTabTap = (e, id) => {
    if (isMobile) {
      e.stopPropagation();
      setSelectedTab(selectedTab === id ? null : id);
    }
  };

  const getBackgroundColor = (output) => {
    // Priority takes precedence over rarity
    if (output.isPrioritized) {
      return PRIORITY_BG_COLOR;
    }
    const rarity = (output.rarity || 'common').toLowerCase();
    return RARITY_BG_COLORS[rarity] || RARITY_BG_COLORS.common;
  };

  const getBorderColor = (output) => {
    if (output.isPrioritized) {
      return PRIORITY_BORDER_COLOR;
    }
    return 'transparent';
  };

  // Determine container style based on layout mode
  const getContainerStyle = () => {
    if (isMobile) {
      return {
        position: 'relative',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: '6px',
        width: '100%',
        paddingBottom: '8px'
      };
    }
    if (horizontal) {
      return styles.recycleSectionHorizontal;
    }
    return styles.recycleTabsContainer;
  };

  const containerStyle = getContainerStyle();

  return (
    <div style={containerStyle}>
      {/* Label for mobile */}
      {isMobile && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '70px',
          padding: '0 8px',
          fontSize: '9px',
          fontWeight: 'bold',
          color: '#00bcd4',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          flexShrink: 0
        }}>
          Recycles Into
        </div>
      )}
      {/* Label for horizontal desktop */}
      {horizontal && !isMobile && (
        <span style={styles.recycleSectionLabel}>Recycles Into</span>
      )}
      {outputs.map((output, index) => {
        const imagePath = `/images/${output.id}.webp`;
        const hasImage = !failedImages.has(output.id);
        const backgroundColor = getBackgroundColor(output);
        const borderColor = getBorderColor(output);

        const tooltipText = `${output.name}${output.isPrioritized ? ' ★' : ''}`;

        // Determine tab style based on layout mode
        const getTabStyle = () => {
          if (isMobile) {
            return {
              position: 'relative',
              width: '52px',
              minWidth: '52px',
              height: '52px',
              backgroundColor: styles.recycleTab(index).backgroundColor,
              border: styles.recycleTab(index).border,
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              boxSizing: 'border-box',
              flexShrink: 0
            };
          }
          if (horizontal) {
            return styles.recycleTabHorizontal;
          }
          return styles.recycleTab(index);
        };

        const tabStyle = getTabStyle();

        const isSelected = selectedTab === output.id;

        return (
          <div
            key={output.id}
            style={tabStyle}
            className="recycle-tab"
            onClick={(e) => handleTabTap(e, output.id)}
          >
            {/* Mobile tap tooltip */}
            {isMobile && isSelected && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '4px',
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                whiteSpace: 'nowrap',
                zIndex: 100
              }}>
                {tooltipText}
              </div>
            )}
            {/* Desktop hover tooltip */}
            {!isMobile && (
              <div style={{
                position: 'absolute',
                // For horizontal layout, show tooltip above; for vertical, show to the left
                ...(horizontal ? {
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '8px'
                } : {
                  right: '100%',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  marginRight: '8px'
                }),
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                whiteSpace: 'nowrap',
                opacity: 0,
                pointerEvents: 'none',
                transition: 'opacity 0.1s',
                zIndex: 100
              }} className="recycle-tooltip">
                {tooltipText}
              </div>
            )}
            <div style={{...styles.recycleTabInner, pointerEvents: 'none'}}>
              {/* Colored background square */}
              <div style={{
                position: 'absolute',
                inset: '2px',
                backgroundColor,
                borderRadius: '4px',
                border: output.isPrioritized ? `1px solid ${borderColor}` : 'none',
                boxShadow: output.isPrioritized ? `0 0 6px ${borderColor}` : 'none'
              }} />

              {hasImage ? (
                <img
                  src={imagePath}
                  alt={output.name}
                  style={{...styles.recycleTabImage, position: 'relative', zIndex: 1}}
                  onError={() => handleImageError(output.id)}
                  loading="eager"
                />
              ) : (
                <div style={{...styles.recycleTabPlaceholder, position: 'relative', zIndex: 1, backgroundColor: 'transparent', border: 'none'}}>
                  <span style={styles.recycleTabPlaceholderText}>
                    {output.name.substring(0, 3).toUpperCase()}
                  </span>
                </div>
              )}
              <div style={{...styles.recycleTabQuantity, zIndex: 2}}>
                {output.amount}x
              </div>
            </div>
            {/* Priority star indicator */}
            {output.isPrioritized && (
              <div style={{
                position: 'absolute',
                top: '2px',
                right: '4px',
                color: '#FFD700',
                fontSize: '11px',
                textShadow: '0 0 4px rgba(255, 215, 0, 0.9), 0 0 8px rgba(255, 165, 0, 0.6)',
                pointerEvents: 'none'
              }}>
                ★
              </div>
            )}
            {/* Desktop: Always show name below image (except in horizontal mode) */}
            {!isMobile && !horizontal && (
              <div style={{...styles.recycleTabNameDesktop, pointerEvents: 'none'}}>
                {output.name}
              </div>
            )}
            {/* Horizontal mode: Show truncated name */}
            {horizontal && !isMobile && (
              <div style={{
                fontSize: '8px',
                lineHeight: '1.2',
                color: theme.textDim,
                textAlign: 'center',
                marginTop: '2px',
                width: '48px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                pointerEvents: 'none'
              }}>
                {output.name}
              </div>
            )}
            {/* Mobile fallback: Show name only for items without images */}
            {isMobile && !hasImage && (
              <div style={{...styles.recycleTabName, pointerEvents: 'none'}}>
                {output.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RecycleTabs;
