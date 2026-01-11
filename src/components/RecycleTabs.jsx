import React, { useState } from 'react';
import { styles } from '../styles';

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
 * RecycleTabs - Shows recycle outputs as icon tabs on the right side of the main card
 * Images are preloaded globally by imagePreloader.js on app startup
 *
 * @param {array} outputs - Array of { id, name, amount, rarity, isPrioritized } objects
 */
const RecycleTabs = ({ outputs = [] }) => {
  const [failedImages, setFailedImages] = useState(new Set());

  if (!outputs || outputs.length === 0) {
    return null;
  }

  const handleImageError = (id) => {
    setFailedImages(prev => new Set([...prev, id]));
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

  return (
    <div style={styles.recycleTabsContainer}>
      {outputs.map((output, index) => {
        const imagePath = `/images/${output.id}.webp`;
        const hasImage = !failedImages.has(output.id);
        const backgroundColor = getBackgroundColor(output);
        const borderColor = getBorderColor(output);

        const tooltipText = `${output.name}${output.isPrioritized ? ' ★' : ''}`;

        return (
          <div
            key={output.id}
            style={styles.recycleTab(index)}
            className="recycle-tab"
          >
            {/* Instant tooltip */}
            <div style={{
              position: 'absolute',
              right: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              marginRight: '8px',
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
            {/* Show name below for items without images */}
            {!hasImage && (
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
