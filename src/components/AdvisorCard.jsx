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

// --- CRAFTING LIST (Unchanged) ---
function CraftingList({ options }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!options || options.length === 0) return null;

  const visibleOptions = isExpanded ? options : options.slice(0, 4);
  const remainingCount = options.length - 4;
  const showToggle = options.length > 4;

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', marginTop: '12px',
      borderTop: '1px solid #333', paddingTop: '8px', overflow: 'hidden'
    }}>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: '#00bcd4', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
          Crafting Utility
        </span>
        <span style={{ fontSize: '10px', color: '#666' }}>{options.length} Recipes</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visibleOptions.map((opt, i) => (
            <div key={i} style={{ fontSize: '13px', borderBottom: '1px solid #222', paddingBottom: '4px', lineHeight: '1.4' }}>
              <span style={{ color: '#e0e0e0' }}>• {opt.resultName}</span>
              <span style={{ color: opt.type === 'Direct' ? '#888' : '#d81b60', fontSize: '11px', marginLeft: '6px', fontStyle: 'italic' }}>
                 {opt.type ? `(${opt.type})` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
      {showToggle && (
        <div onClick={() => setIsExpanded(!isExpanded)}
          style={{ flexShrink: 0, textAlign: 'center', cursor: 'pointer', paddingTop: '8px', fontSize: '11px', color: '#42a5f5', backgroundColor: '#141414' }}>
          {isExpanded ? "Show Less ▲" : `+ ${remainingCount} more... ▼`}
        </div>
      )}
    </div>
  );
}

// --- PRIORITY BADGE ---
function PriorityBadge({ prioritization }) {
  if (!prioritization || !prioritization.isPrioritized) return null;

  const getMatchLabel = (matchType) => {
    switch (matchType) {
      case 'direct': return 'direct match';
      case 'craft-to': return 'crafts into';
      case 'recycle-to': return 'recycles into';
      default: return matchType;
    }
  };

  return (
    <div style={styles.priorityBadge}>
      <div style={styles.priorityBadgeHeader}>
        <span style={styles.priorityBadgeIcon}>★</span>
        <span style={styles.priorityBadgeTitle}>Prioritized</span>
      </div>
      <div style={styles.priorityBadgeList}>
        {prioritization.matches.map((match, i) => (
          <div key={i} style={styles.priorityBadgeItem}>
            • {match.targetItemName}{' '}
            <span style={styles.priorityMatchType}>({getMatchLabel(match.matchType)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MAIN CARD ---
export default function AdvisorCard({ analysis }) {
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
        <div style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '6px' }}>
            
            {/* Header */}
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '22px', color: titleColor }}>
                {meta.name}
              </h2>
              
              {/* --- METADATA UPDATED HERE --- */}
              <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginTop: '4px' }}>
                  {meta.type} 
                  {' • '} 
                  <span style={{ color: titleColor }}>{rarityLabel}</span>
                  {' • '}
                  <span style={{ color: '#bdbdbd' }}>Value: {economics.sellPrice.toLocaleString()}</span>
              </div>
              {/* ----------------------------- */}

            </div>

            {/* Verdict */}
            <div style={{
              backgroundColor: theme.bg, border: `1px solid ${theme.border}`, color: theme.text,
              borderRadius: '8px', padding: '12px', textAlign: 'center', marginBottom: '12px'
            }}>
              <div style={{ fontSize: '24px', fontWeight: '800' }}>{verdict.actionLabel}</div>
              {verdict.reason && <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>{verdict.reason}</div>}
            </div>

            {/* Requirements */}
            {demand.totalRequired > 0 && (
              <div style={{ backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '8px' }}>
                <div style={{ color: '#ef5350', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>Required For</div>
                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: '#ddd' }}>
                  {demand.quests.map((q, i) => (
                    <li key={`q-${i}`} style={{ marginBottom: '4px' }}>
                        <span style={{color: '#ffb74d'}}>[Q]</span> {q.title} (x{q.amount})
                    </li>
                  ))}
                  {demand.stations.map((s, i) => (
                    <li key={`s-${i}`} style={{ marginBottom: '4px' }}>
                        <span style={{color: '#42a5f5'}}>[B]</span>
                        {' '}{s.name} {s.tier ? <span style={{color: '#888'}}> (Lvl {s.tier})</span> : ''}
                        {' '}(x{s.amount})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Priority Badge */}
            <PriorityBadge prioritization={prioritization} />
        </div>
      </div>

      {/* --- BOTTOM SECTION --- */}
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <CraftingList options={utility.craftingOptions} />
      </div>
    </div>
  );
}