import React, { useState, useEffect } from 'react';
import { STATIONS_DATA } from '../logic/constants';
import { styles, theme } from '../styles';
import QuestSelector from './QuestSelector';
import ItemSearcher from './ItemSearcher';
import PrioritySelector from './PrioritySelector';
import ProjectPanel from './ProjectPanel';

// Collapsible section wrapper with slide animation
const CollapsibleSection = ({ id, title, children, defaultExpanded = true, isComplete = false }) => {
  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem(`section_${id}`);
      return saved !== null ? JSON.parse(saved) : defaultExpanded;
    } catch {
      return defaultExpanded;
    }
  });

  useEffect(() => {
    localStorage.setItem(`section_${id}`, JSON.stringify(expanded));
  }, [id, expanded]);

  return (
    <div style={styles.sidebarSection}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          marginBottom: '8px'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{
          ...styles.sectionTitle,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {title}
          {isComplete && (
            <span style={{
              color: '#8f8',
              fontSize: '11px',
              fontWeight: 'normal'
            }}>✓</span>
          )}
        </span>
        <span style={{
          color: theme.textDim,
          fontSize: '14px',
          fontWeight: 'bold',
          width: '18px',
          textAlign: 'center'
        }}>
          {expanded ? '−' : '+'}
        </span>
      </div>
      <div style={{
        overflow: 'hidden',
        transition: 'max-height 0.25s ease, opacity 0.2s ease',
        maxHeight: expanded ? '1000px' : '0',
        opacity: expanded ? 1 : 0
      }}>
        {children}
      </div>
    </div>
  );
};

const StationPanel = ({
  levels,
  onStationUpdate,
  activeQuests,
  allQuests,
  onQuestAdd,
  onQuestRemove,
  // Quest auto-detect props
  questAutoDetect,
  onQuestAutoDetectToggle,
  isInMainMenu,
  isInPlayTab,
  // Priority props
  userPriorities,
  devPriorities,
  allItems,
  onPriorityAdd,
  onPriorityRemove,
  onPriorityUpdate,
  devPrioritiesEnabled,
  userPrioritiesEnabled,
  onDevPrioritiesToggle,
  onUserPrioritiesToggle,
  // Project props
  projectProgress,
  projectData,
  onProjectViewingChange,
  onProjectItemToggle,
  onProjectDone,
  // Item search props
  onItemSelect,
  isMobile,
  onClose,
  hideHeader = false,
  // Companion mode props
  isCompanionMode,
  canToggleMode,
  onModeToggle,
  sessionConnected
}) => {
  // Check if all stations are at max level
  const allStationsMaxed = STATIONS_DATA.every(station => {
    const currentVal = levels[station.id] !== undefined ? levels[station.id] : station.min;
    return currentVal === station.max;
  });

  // Check if all projects are 100% complete
  const allProjectsComplete = (() => {
    const projects = projectData?.projects || [];
    if (projects.length === 0) return false;

    return projects.every(project => {
      const progress = projectProgress[project.id];
      if (!progress) return false;

      const phases = project.phases || [];
      const maxPhase = Math.max(...phases.map(p => p.id));
      const completed = progress.completed || {};

      // Check if viewing is beyond max phase (explicitly marked done)
      if (progress.viewing > maxPhase) return true;

      // Check if all phases are complete
      return phases.every(phase => {
        const reqs = phase.requirements || [];
        const coinReqs = phase.coinRequirements || [];

        // Empty phase needs explicit "done" marker
        if (reqs.length === 0 && coinReqs.length === 0) {
          return !!completed[`${phase.id}:_done`];
        }

        return reqs.every(r => completed[`${phase.id}:${r.item}`]) &&
               coinReqs.every(r => completed[`${phase.id}:coin:${r.category}`]);
      });
    });
  })();

  return (
    <>
      {!hideHeader && (
        <div style={styles.sidebarHeader}>
          <span style={{fontSize: '12px', fontWeight:'bold', color: theme.textMain, letterSpacing: '1px'}}>ADVISOR CONFIG</span>
          {!isMobile && (
            <button onClick={onClose} style={{background:'none', border:'none', color: theme.textDim, cursor:'pointer', fontSize:'16px'}}>×</button>
          )}
        </div>
      )}

      <div style={{
        ...styles.sidebarContent,
        ...(isMobile && {
          padding: '16px 16px 16px 12px'
        })
      }}>
        {/* STATIONS SECTION */}
        <CollapsibleSection id="stations" title="Station Levels" isComplete={allStationsMaxed}>
          {STATIONS_DATA.map((station, index) => {
             const range = Array.from(
               { length: station.max - station.min + 1 },
               (_, i) => i + station.min
             );
             const currentVal = levels[station.id] !== undefined ? levels[station.id] : station.min;

             return (
               <div key={station.id} style={{
                 ...styles.stationRow,
                 marginBottom: index === STATIONS_DATA.length - 1 ? 0 : '6px',
                 paddingBottom: index === STATIONS_DATA.length - 1 ? 0 : '6px',
                 borderBottom: index === STATIONS_DATA.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)'
               }}>
                 <div style={styles.stationLabel}>{station.id}</div>
                 <div style={styles.levelSelector}>
                   {range.map(lvl => (
                     <button
                       key={lvl}
                       style={styles.levelBtn(currentVal === lvl)}
                       onClick={() => onStationUpdate(station.id, lvl)}
                     >{lvl}</button>
                   ))}
                 </div>
               </div>
             );
          })}
        </CollapsibleSection>

        {/* PROJECT SECTION */}
        <CollapsibleSection id="projects" title="Projects" isComplete={allProjectsComplete}>
          <ProjectPanel
            projectProgress={projectProgress}
            onViewingChange={onProjectViewingChange}
            onItemToggle={onProjectItemToggle}
            onDone={onProjectDone}
            projectData={projectData}
            embedded={true}
          />
        </CollapsibleSection>

        {/* QUESTS SECTION */}
        <CollapsibleSection id="quests" title="Active Quests">
          <QuestSelector
            activeQuests={activeQuests}
            allQuests={allQuests}
            onAdd={onQuestAdd}
            onRemove={onQuestRemove}
            questAutoDetect={questAutoDetect}
            onQuestAutoDetectToggle={onQuestAutoDetectToggle}
            isInMainMenu={isInMainMenu}
            isInPlayTab={isInPlayTab}
            embedded={true}
          />
        </CollapsibleSection>

        {/* ITEM SEARCH - Desktop only */}
        {!isMobile && (
          <CollapsibleSection id="itemSearch" title="Item Search">
            <ItemSearcher
              allItems={allItems}
              onSelect={onItemSelect}
              embedded={true}
            />
          </CollapsibleSection>
        )}

        {/* PRIORITIES SECTION */}
        <CollapsibleSection id="priorities" title="Priorities">
          <PrioritySelector
            userPriorities={userPriorities || []}
            devPriorities={devPriorities || []}
            allItems={allItems || []}
            onAdd={onPriorityAdd}
            onRemove={onPriorityRemove}
            onUpdate={onPriorityUpdate}
            devEnabled={devPrioritiesEnabled}
            userEnabled={userPrioritiesEnabled}
            onDevToggle={onDevPrioritiesToggle}
            onUserToggle={onUserPrioritiesToggle}
            embedded={true}
          />
        </CollapsibleSection>

        {/* MODE SECTION - Show companion toggle when applicable */}
        {canToggleMode && !sessionConnected && (
          <div style={{
            ...styles.sidebarSection,
            marginTop: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{
                fontSize: '10px',
                color: theme.textDim,
                fontWeight: '600',
                letterSpacing: '1px',
                textTransform: 'uppercase'
              }}>
                Companion Mode
              </span>
              <div style={styles.toggleLabel} onClick={onModeToggle}>
                <div style={styles.switchTrack(isCompanionMode)}>
                  <div style={styles.switchKnob(isCompanionMode)}></div>
                </div>
              </div>
            </div>
            <p style={{
              fontSize: '10px',
              color: theme.textDim,
              margin: '8px 0 0 0',
              lineHeight: '1.4'
            }}>
              {isCompanionMode
                ? 'Companion mode active. Connect to a PC session to receive item analysis.'
                : 'Enable to use this device as a companion display.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default StationPanel;
