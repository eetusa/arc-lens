import React from 'react';
import { STATIONS_DATA } from '../logic/constants';
import { styles, theme } from '../styles';
import QuestSelector from './QuestSelector';
import PrioritySelector from './PrioritySelector';

const StationPanel = ({
  levels,
  onStationUpdate,
  activeQuests,
  allQuests,
  onQuestAdd,
  onQuestRemove,
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
  onClose
}) => {
  return (
    <div style={styles.sidebar(true)}>
      <div style={styles.sidebarHeader}>
        <span style={{fontSize: '12px', fontWeight:'bold', color: theme.textMain, letterSpacing: '1px'}}>ADVISOR CONFIG</span>
        <button onClick={onClose} style={{background:'none', border:'none', color: theme.textDim, cursor:'pointer', fontSize:'16px'}}>×</button>
      </div>
      
      <div style={styles.sidebarContent}>
        <span style={styles.sectionTitle}>STATION LEVELS</span>
        
        {STATIONS_DATA.map((station) => {
           const range = Array.from(
             { length: station.max - station.min + 1 }, 
             (_, i) => i + station.min
           );

           const currentVal = levels[station.id] !== undefined ? levels[station.id] : station.min;

           return (
             <div key={station.id} style={styles.stationRow}>
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

        <QuestSelector
          activeQuests={activeQuests}
          allQuests={allQuests}
          onAdd={onQuestAdd}
          onRemove={onQuestRemove}
        />

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
        />
      </div>
    </div>
  );
};

export default StationPanel;