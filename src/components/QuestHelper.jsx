import React, { useState, useMemo, useEffect } from 'react';
import { styles, theme } from '../styles';
import MapViewer from './MapViewer';
import MapTabs from './MapTabs';
import useQuestData from '../hooks/useQuestData';

// Hard-coded test data for "A Warm Place To Rest" quest
const QUEST_TIPS = {
  "A Warm Place To Rest": {
    steps: [
      "Locate the Abandoned Highway Camp",
      "Search for any signs of survivors",
      "Follow the red markers",
      "Inspect the grave"
    ]
  }
};

// Empty state content for when no quests are active
function QuestHelperEmptyState() {
  return (
    <div style={styles.questHelperEmpty}>
      No active quests selected.
      <br /><br />
      <span style={{ fontSize: '11px', color: theme.textMuted }}>
        Select quests in the sidebar to see their map locations.
      </span>
    </div>
  );
}

// Quest Accordion Item (used in legacy panel and mobile)
function QuestAccordionItem({ questName, tips, defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div style={styles.questAccordion}>
      <div
        style={styles.questAccordionHeader(isExpanded)}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span style={styles.questAccordionChevron(isExpanded)}>&#9658;</span>
        <span style={styles.questAccordionTitle}>{questName}</span>
      </div>
      {isExpanded && (
        <div style={styles.questAccordionBody}>
          <ul style={styles.questStepList}>
            {tips.steps.map((step, index) => (
              <li key={index} style={styles.questStep}>
                <span style={styles.questStepNumber}>{index + 1}</span>
                <span style={styles.questStepText}>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Compact Quest Tab
function QuestTab({ questName, isSelected, hasMapData, onClick }) {
  return (
    <button
      style={{
        ...compactStyles.questTab,
        ...(isSelected && compactStyles.questTabSelected),
        ...(!hasMapData && compactStyles.questTabNoData)
      }}
      onClick={onClick}
      title={questName}
    >
      <span style={compactStyles.questTabText}>{questName}</span>
      {hasMapData && <span style={compactStyles.questTabDot} />}
    </button>
  );
}

// Compact Marker Chip
function MarkerChip({ marker, index, isSelected, onClick }) {
  // Extract short label from instanceName
  const label = marker.label
    ? marker.label.replace(/^[^-]+ - /, '') // Remove quest prefix
    : `Location ${index + 1}`;

  return (
    <button
      style={{
        ...compactStyles.markerChip,
        ...(isSelected && compactStyles.markerChipSelected)
      }}
      onClick={onClick}
      title={marker.label || `Location ${index + 1}`}
    >
      <span style={compactStyles.markerChipNumber}>{index + 1}</span>
      <span style={compactStyles.markerChipLabel}>{label}</span>
    </button>
  );
}

const compactStyles = {
  questTab: {
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '500',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: theme.border,
    borderRadius: '4px',
    color: theme.textDim,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    maxWidth: '140px',
    transition: 'all 0.15s ease'
  },
  questTabSelected: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
    color: '#fff'
  },
  questTabNoData: {
    opacity: 0.5
  },
  questTabText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  questTabDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: 'currentColor',
    flexShrink: 0
  },
  markerChip: {
    padding: '3px 8px',
    fontSize: '10px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: theme.border,
    borderRadius: '12px',
    color: theme.textDim,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s ease'
  },
  markerChipSelected: {
    backgroundColor: 'rgba(0, 120, 212, 0.2)',
    borderColor: theme.accent,
    color: theme.textMain
  },
  markerChipNumber: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: theme.accent,
    color: '#fff',
    fontSize: '9px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  markerChipLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '120px'
  }
};

// Desktop Panel Component (legacy floating card style)
function QuestHelperPanel({ activeQuests }) {
  // Filter to only show quests that have tips
  const questsWithTips = activeQuests.filter(q => QUEST_TIPS[q]);

  return (
    <div style={styles.questHelperPanel}>
      <div style={styles.questHelperHeader}>
        <span style={styles.questHelperTitle}>Quest Helper</span>
      </div>
      <div style={styles.questHelperContent}>
        {questsWithTips.length === 0 ? (
          <QuestHelperEmptyState />
        ) : (
          questsWithTips.map((questName, index) => (
            <QuestAccordionItem
              key={questName}
              questName={questName}
              tips={QUEST_TIPS[questName]}
              defaultExpanded={index === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Full-height Desktop Panel Component (new panel layout)
// Now renders content only - Panel wrapper is handled by parent
function QuestHelperFullPanel({ activeQuests }) {
  // Load quest map data
  const { getMarkersForQuest, getMapsForQuest, getMapConfig, getQuestDetails, isLoading } = useQuestData();

  // Selected quest for map display
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [activeMapId, setActiveMapId] = useState(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [showRewards, setShowRewards] = useState(false);

  // Pre-compute marker counts for each quest
  const questMarkerCounts = useMemo(() => {
    const counts = {};
    for (const quest of activeQuests) {
      const markers = getMarkersForQuest(quest);
      counts[quest] = markers.length;
    }
    return counts;
  }, [activeQuests, getMarkersForQuest]);

  // Auto-select first quest with markers when quests change
  useEffect(() => {
    if (activeQuests.length === 0) {
      setSelectedQuest(null);
      return;
    }

    // If current selection is still valid, keep it
    if (selectedQuest && activeQuests.includes(selectedQuest)) {
      return;
    }

    // Select first quest with map markers, or just first quest
    const questWithMarkers = activeQuests.find(q => questMarkerCounts[q] > 0);
    setSelectedQuest(questWithMarkers || activeQuests[0]);
  }, [activeQuests, selectedQuest, questMarkerCounts]);

  // Get markers and maps for the selected quest
  const questMarkers = useMemo(() =>
    selectedQuest ? getMarkersForQuest(selectedQuest) : [],
    [selectedQuest, getMarkersForQuest]
  );
  const questMaps = useMemo(() =>
    selectedQuest ? getMapsForQuest(selectedQuest) : [],
    [selectedQuest, getMapsForQuest]
  );

  // Get detailed quest info (objectives, rewards)
  const questDetails = useMemo(() =>
    selectedQuest ? getQuestDetails(selectedQuest) : null,
    [selectedQuest, getQuestDetails]
  );

  // Set active map when quest changes
  useEffect(() => {
    if (questMaps.length > 0 && !questMaps.find(m => m.id === activeMapId)) {
      setActiveMapId(questMaps[0].id);
    }
  }, [questMaps, activeMapId]);

  // Get current map config and filtered markers
  const currentMapConfig = activeMapId ? getMapConfig(activeMapId) : null;
  const filteredMarkers = questMarkers.filter(m => m.mapId === activeMapId);

  // Handle quest selection
  const handleQuestClick = (questName) => {
    setSelectedQuest(questName);
    setSelectedMarkerId(null);
  };

  // State for focusing on a marker (triggers pan/zoom)
  const [focusMarkerId, setFocusMarkerId] = useState(null);

  // Handle clicking a marker in the legend - focus map on it
  const handleLegendMarkerClick = (marker) => {
    setSelectedMarkerId(marker.id);
    setFocusMarkerId(marker.id);
    // Clear focus after a moment so it can be re-triggered
    setTimeout(() => setFocusMarkerId(null), 100);
  };

  return (
    <>
      <div style={styles.questHelperPanelHeader}>
        <h3 style={styles.questHelperPanelTitle}>Quest Helper</h3>
      </div>
      <div style={sectionStyles.panelContent}>
        {activeQuests.length === 0 ? (
          <QuestHelperEmptyState />
        ) : (
          <>
            {/* Quest Tabs - Compact horizontal row */}
            <div style={sectionStyles.questTabsRow}>
              {activeQuests.map((questName) => (
                <QuestTab
                  key={questName}
                  questName={questName}
                  isSelected={questName === selectedQuest}
                  hasMapData={questMarkerCounts[questName] > 0}
                  onClick={() => handleQuestClick(questName)}
                />
              ))}
            </div>

            {/* Objectives Section */}
            {questDetails?.objectives && questDetails.objectives.length > 0 && (
              <div style={sectionStyles.objectivesSection}>
                <div style={sectionStyles.objectivesHeader}>
                  <span style={sectionStyles.sectionLabel}>Objectives</span>
                  {questDetails.rewards && questDetails.rewards.length > 0 && (
                    <button
                      style={sectionStyles.rewardsToggle}
                      onClick={() => setShowRewards(!showRewards)}
                    >
                      {showRewards ? 'Hide Rewards' : 'Show Rewards'}
                    </button>
                  )}
                </div>
                <ul style={sectionStyles.objectivesList}>
                  {questDetails.objectives.map((obj) => (
                    <li key={obj.id} style={sectionStyles.objectiveItem}>
                      <span style={sectionStyles.objectiveText}>{obj.text}</span>
                    </li>
                  ))}
                </ul>
                {showRewards && questDetails.rewards && (
                  <div style={sectionStyles.rewardsSection}>
                    <span style={sectionStyles.sectionLabel}>Rewards</span>
                    <div style={sectionStyles.rewardsList}>
                      {questDetails.rewards.map((reward, idx) => (
                        <span key={idx} style={sectionStyles.rewardItem}>
                          {reward.amount > 1 ? `${reward.amount}× ` : ''}{reward.item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Map Section */}
            <div style={sectionStyles.mapSection}>
              {isLoading ? (
                <div style={styles.questHelperMapPlaceholder}>
                  <div style={{ fontSize: '11px', color: theme.textDim }}>
                    Loading map data...
                  </div>
                </div>
              ) : !selectedQuest ? (
                <div style={styles.questHelperMapPlaceholder}>
                  <div style={styles.questHelperMapPlaceholderText}>
                    Select a quest above
                  </div>
                </div>
              ) : questMarkers.length === 0 ? (
                <div style={styles.questHelperMapPlaceholder}>
                  <div style={styles.questHelperMapPlaceholderText}>
                    No map markers
                  </div>
                  <div style={{ fontSize: '10px', color: theme.textDim, marginTop: '8px' }}>
                    Locations not yet mapped for this quest
                  </div>
                </div>
              ) : (
                <div style={sectionStyles.mapContainer}>
                  {/* Map tabs (if multiple maps) */}
                  <MapTabs
                    maps={questMaps}
                    activeMapId={activeMapId}
                    onMapChange={(mapId) => {
                      setActiveMapId(mapId);
                      setSelectedMarkerId(null);
                    }}
                  />

                  {/* Marker chips - compact wrapped row */}
                  <div style={sectionStyles.markerChipsRow}>
                    {filteredMarkers.map((marker, idx) => (
                      <MarkerChip
                        key={marker.id}
                        marker={marker}
                        index={idx}
                        isSelected={marker.id === selectedMarkerId}
                        onClick={() => handleLegendMarkerClick(marker)}
                      />
                    ))}
                  </div>

                  {/* Map viewer */}
                  <MapViewer
                    mapConfig={currentMapConfig}
                    markers={filteredMarkers}
                    selectedMarkerId={selectedMarkerId}
                    focusMarkerId={focusMarkerId}
                    onMarkerClick={(marker) => {
                      setSelectedMarkerId(marker.id);
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const sectionStyles = {
  panelContent: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column'
  },
  questTabsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginBottom: '12px',
    flexShrink: 0
  },
  markerChipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginBottom: '8px',
    flexShrink: 0
  },
  objectivesSection: {
    marginBottom: '12px',
    padding: '8px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
    flexShrink: 0
  },
  objectivesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px'
  },
  sectionLabel: {
    fontSize: '9px',
    color: theme.textDim,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  rewardsToggle: {
    fontSize: '9px',
    color: theme.accent,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0
  },
  objectivesList: {
    margin: 0,
    padding: 0,
    paddingLeft: '16px',
    listStyle: 'disc',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  objectiveItem: {
    fontSize: '12px',
    color: theme.textMain,
    paddingLeft: '4px'
  },
  objectiveText: {
    display: 'block'
  },
  rewardsSection: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: `1px solid ${theme.border}`
  },
  rewardsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px'
  },
  rewardItem: {
    fontSize: '10px',
    color: theme.textDim,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  mapSection: {
    borderTop: `1px solid ${theme.border}`,
    paddingTop: '12px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0
  },
  mapContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0
  }
};

// Mobile Bottom Sheet Component
function QuestHelperBottomSheet({ activeQuests, isOpen, onClose }) {
  // Filter to only show quests that have tips
  const questsWithTips = activeQuests.filter(q => QUEST_TIPS[q]);

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          ...styles.bottomSheetOverlay,
          ...(isOpen && styles.bottomSheetOverlayVisible)
        }}
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div style={{
        ...styles.bottomSheet,
        ...(isOpen && styles.bottomSheetOpen)
      }}>
        <div style={styles.bottomSheetHandle}>
          <div style={styles.bottomSheetHandleBar} />
        </div>
        <div style={styles.bottomSheetHeader}>
          <span style={styles.bottomSheetTitle}>Quest Helper</span>
          <button style={styles.bottomSheetClose} onClick={onClose}>
            &times;
          </button>
        </div>
        <div style={styles.bottomSheetContent}>
          {questsWithTips.length === 0 ? (
            <QuestHelperEmptyState />
          ) : (
            questsWithTips.map((questName, index) => (
              <QuestAccordionItem
                key={questName}
                questName={questName}
                tips={QUEST_TIPS[questName]}
                defaultExpanded={index === 0}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

// Main QuestHelper export - handles both desktop and mobile
export default function QuestHelper({
  activeQuests = [],
  isEnabled = false,
  isMobile = false,
  isBottomSheetOpen = false,
  onBottomSheetClose = () => {},
  // New panel layout props
  useFullPanel = false
}) {
  if (!isEnabled) return null;

  // Mobile: render bottom sheet
  if (isMobile) {
    return (
      <QuestHelperBottomSheet
        activeQuests={activeQuests}
        isOpen={isBottomSheetOpen}
        onClose={onBottomSheetClose}
      />
    );
  }

  // Desktop with new panel layout (content only, Panel wrapper is parent)
  if (useFullPanel) {
    return <QuestHelperFullPanel activeQuests={activeQuests} />;
  }

  // Desktop: render legacy floating panel
  return <QuestHelperPanel activeQuests={activeQuests} />;
}

// Also export the toggle button for mobile
export function QuestHelperToggleButton({ onClick, hasAvailableTips = false }) {
  return (
    <button
      style={{
        ...styles.questHelperToggleButton,
        ...(hasAvailableTips && {
          backgroundColor: 'rgba(0, 120, 212, 0.1)',
          animation: 'pulse-glow 2s ease-in-out infinite'
        })
      }}
      onClick={onClick}
      title="Quest Helper"
    >
      ?
    </button>
  );
}

// Export the tips data for checking availability
export { QUEST_TIPS };
