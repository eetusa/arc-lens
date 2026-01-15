import React, { useState } from 'react';
import { styles } from '../styles';

const COLORS = {
  success: { bg: '#1b5e20', border: '#4caf50', text: '#e8f5e9' },
  warning: { bg: '#f57f17', border: '#fdd835', text: '#fffde7' },
  danger:  { bg: '#b71c1c', border: '#ef5350', text: '#ffebee' },
  info:    { bg: '#0d47a1', border: '#29b6f6', text: '#e1f5fe' },
  neutral: { bg: '#212121', border: '#616161', text: '#bdbdbd' }
};

const RARITY_COLORS = {
  legendary: '#FFC600',
  epic:      '#CC3099',
  rare:      '#00A9F2',
  uncommon:  '#26BF57',
  common:    '#6C6C6C'
};

// --- CRAFTING LIST ---
function CraftingList({ options, isMobile = false }) {
  // Start collapsed on mobile to save space
  const [isExpanded, setIsExpanded] = useState(!isMobile);

  if (!options || options.length === 0) return null;

  // On mobile, show fewer items by default
  const defaultVisibleCount = isMobile ? 2 : 4;
  const visibleOptions = isExpanded ? options : options.slice(0, defaultVisibleCount);
  const remainingCount = options.length - defaultVisibleCount;
  const showToggle = options.length > defaultVisibleCount;

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', marginTop: isMobile ? '8px' : '12px',
      borderTop: '1px solid #333', paddingTop: '8px', overflow: 'hidden'
    }}>
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: isExpanded ? '8px' : '0',
          cursor: 'pointer',
          padding: '4px 0'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span style={{ color: '#00bcd4', fontSize: isMobile ? '10px' : '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
          Crafting Utility {!isExpanded && `(${options.length})`}
        </span>
        <span style={{ fontSize: '10px', color: '#42a5f5' }}>
          {isExpanded ? '▲ Hide' : '▼ Show'}
        </span>
      </div>
      {isExpanded && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '4px' : '6px' }}>
              {visibleOptions.map((opt, i) => (
                <div key={i} style={{ fontSize: isMobile ? '11px' : '13px', borderBottom: '1px solid #222', paddingBottom: '4px', lineHeight: '1.4' }}>
                  <span style={{ color: '#e0e0e0' }}>• {opt.resultName}</span>
                  <span style={{ color: opt.type === 'Direct' ? '#888' : '#d81b60', fontSize: isMobile ? '9px' : '11px', marginLeft: '4px', fontStyle: 'italic' }}>
                    {opt.type ? `(${opt.type})` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {showToggle && (
            <div onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              style={{ flexShrink: 0, textAlign: 'center', cursor: 'pointer', paddingTop: '8px', fontSize: isMobile ? '10px' : '11px', color: '#42a5f5', backgroundColor: '#141414' }}>
              {`+ ${remainingCount} more...`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- PRIORITY BADGE ---
function PriorityBadge({ prioritization, isMobile = false }) {
  if (!prioritization || !prioritization.isPrioritized) return null;

  const getMatchLabel = (matchType) => {
    switch (matchType) {
      case 'direct': return 'direct';
      case 'craft-to': return 'crafts into';
      case 'recycle-to': return 'recycles into';
      default: return matchType;
    }
  };

  return (
    <div style={{
      ...styles.priorityBadge,
      marginTop: isMobile ? '8px' : '12px',
      padding: isMobile ? '8px' : '10px'
    }}>
      <div style={styles.priorityBadgeHeader}>
        <span style={{ ...styles.priorityBadgeIcon, fontSize: isMobile ? '12px' : '14px' }}>★</span>
        <span style={{ ...styles.priorityBadgeTitle, fontSize: isMobile ? '10px' : '11px' }}>Prioritized</span>
      </div>
      <div style={styles.priorityBadgeList}>
        {prioritization.matches.map((match, i) => (
          <div key={i} style={{ ...styles.priorityBadgeItem, fontSize: isMobile ? '9px' : '10px' }}>
            • {match.targetItemName}{' '}
            <span style={styles.priorityMatchType}>({getMatchLabel(match.matchType)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MAIN CARD ---
export default function AdvisorCard({ analysis, isMobile = false }) {
  if (!analysis) return null;

  // Destructure economics here to access sellPrice
  const { verdict, meta, demand, utility, economics, prioritization } = analysis;
  const theme = COLORS[verdict.colorToken] || COLORS.neutral;

  // Rarity Setup
  const rarityKey = (meta.rarity || 'common').toLowerCase();
  const titleColor = RARITY_COLORS[rarityKey] || RARITY_COLORS.common;
  const rarityLabel = rarityKey.charAt(0).toUpperCase() + rarityKey.slice(1);

  return (
    <div style={{ display: 'grid', height: '100%', width: '100%', gridTemplateRows: 'auto 1fr', overflow: 'hidden' }}>

      {/* --- TOP SECTION --- */}
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxHeight: isMobile ? '200px' : '280px', overflowY: 'auto', paddingRight: '6px' }}>

            {/* Header */}
            <div style={{ borderBottom: '1px solid #333', paddingBottom: isMobile ? '6px' : '8px', marginBottom: isMobile ? '8px' : '12px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '22px', color: titleColor }}>
                {meta.name}
              </h2>

              {/* Metadata row */}
              <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#888', textTransform: 'uppercase', marginTop: '4px' }}>
                  {meta.type}
                  {' • '}
                  <span style={{ color: titleColor }}>{rarityLabel}</span>
                  {' • '}
                  <span style={{ color: '#bdbdbd' }}>Value: {economics.sellPrice.toLocaleString()}</span>
              </div>

            </div>

            {/* Verdict */}
            <div style={{
              backgroundColor: theme.bg, border: `1px solid ${theme.border}`, color: theme.text,
              borderRadius: '8px', padding: isMobile ? '10px' : '12px', textAlign: 'center', marginBottom: isMobile ? '8px' : '12px'
            }}>
              <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '800' }}>{verdict.actionLabel}</div>
              {verdict.reason && <div style={{ fontSize: isMobile ? '11px' : '13px', opacity: 0.9, marginTop: '4px' }}>{verdict.reason}</div>}
            </div>

            {/* Requirements */}
            {demand.totalRequired > 0 && (
              <div style={{ backgroundColor: '#2a2a2a', padding: isMobile ? '10px' : '12px', borderRadius: '8px' }}>
                <div style={{ color: '#ef5350', fontSize: isMobile ? '10px' : '11px', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Required For</div>
                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: isMobile ? '11px' : '13px', color: '#ddd' }}>
                  {demand.quests.map((q, i) => (
                    <li key={`q-${i}`} style={{ marginBottom: '3px' }}>
                        <span style={{color: '#ffb74d'}}>[Q]</span> {q.title} (x{q.amount})
                    </li>
                  ))}
                  {demand.stations.map((s, i) => (
                    <li key={`s-${i}`} style={{ marginBottom: '3px' }}>
                        <span style={{color: '#42a5f5'}}>[B]</span>
                        {' '}{s.name} {s.tier ? <span style={{color: '#888'}}> (Lvl {s.tier})</span> : ''}
                        {' '}(x{s.amount})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Priority Badge */}
            <PriorityBadge prioritization={prioritization} isMobile={isMobile} />
        </div>
      </div>

      {/* --- BOTTOM SECTION --- */}
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <CraftingList options={utility.craftingOptions} isMobile={isMobile} />
      </div>
    </div>
  );
}