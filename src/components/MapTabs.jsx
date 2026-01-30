import React from 'react';
import { theme } from '../styles';

/**
 * MapTabs - Tab selector for quests spanning multiple maps
 *
 * Props:
 * - maps: Array of map configs [{id, name}]
 * - activeMapId: Currently selected map ID
 * - onMapChange: Callback when map tab is clicked
 */
export default function MapTabs({ maps = [], activeMapId, onMapChange }) {
  if (maps.length <= 1) return null;

  return (
    <div style={tabStyles.container}>
      {maps.map(map => (
        <button
          key={map.id}
          style={{
            ...tabStyles.tab,
            ...(map.id === activeMapId && tabStyles.tabActive)
          }}
          onClick={() => onMapChange(map.id)}
        >
          {map.name}
        </button>
      ))}
    </div>
  );
}

const tabStyles = {
  container: {
    display: 'flex',
    gap: '4px',
    marginBottom: '8px',
    overflowX: 'auto',
    paddingBottom: '4px'
  },
  tab: {
    padding: '6px 12px',
    fontSize: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: theme.border,
    borderRadius: '4px',
    color: theme.textDim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease'
  },
  tabActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
    color: '#fff'
  }
};
