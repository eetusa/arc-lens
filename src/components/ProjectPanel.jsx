import React, { useState, useEffect, useCallback } from 'react';
import { styles, theme } from '../styles';

/**
 * Single project phase selector component with granular item tracking
 * - Item chips are clickable to toggle completion
 * - Phase buttons show completion status (green when all items done)
 * - Sequential unlock: can only mark items if previous phase is complete
 */
const ProjectPhaseSelector = ({
  project,
  progress,
  onViewingChange,
  onItemToggle,
  onDone,
  dragState,
  onDragStart,
  onDragEnd
}) => {
  if (!project?.phases?.length) return null;

  const phases = project.phases;
  const maxPhase = Math.max(...phases.map(p => p.id));
  const doneValue = maxPhase + 1;

  // Current viewing phase (default to phase 1)
  const viewing = progress?.viewing || 1;
  const completed = progress?.completed || {};
  const isProjectDone = viewing > maxPhase;

  // Get data for currently viewed phase
  const currentPhaseData = phases.find(p => p.id === viewing);
  const viewingPhaseName = currentPhaseData?.name;
  const requirements = currentPhaseData?.requirements || [];
  const coinRequirements = currentPhaseData?.coinRequirements || [];

  // Check if a phase is complete (all requirements done)
  const isPhaseComplete = (phaseId) => {
    const phase = phases.find(p => p.id === phaseId);
    if (!phase) return false;

    const reqs = phase.requirements || [];
    const coinReqs = phase.coinRequirements || [];

    // Empty phase needs explicit "done" marker
    if (reqs.length === 0 && coinReqs.length === 0) {
      return !!completed[`${phaseId}:_done`];
    }

    return reqs.every(r => completed[`${phaseId}:${r.item}`]) &&
           coinReqs.every(r => completed[`${phaseId}:coin:${r.category}`]);
  };

  // Check if any phase after the given phase has completed items
  const hasCompletedItemsAfter = (phaseId) => {
    for (const phase of phases) {
      if (phase.id <= phaseId) continue;

      const reqs = phase.requirements || [];
      const coinReqs = phase.coinRequirements || [];

      // Check for empty phase done marker
      if (reqs.length === 0 && coinReqs.length === 0) {
        if (completed[`${phase.id}:_done`]) return true;
      }

      // Check regular items
      for (const r of reqs) {
        if (completed[`${phase.id}:${r.item}`]) return true;
      }
      // Check coin items
      for (const r of coinReqs) {
        if (completed[`${phase.id}:coin:${r.category}`]) return true;
      }
    }
    return false;
  };

  // Check if phase is unlocked (can toggle items)
  const isPhaseUnlocked = (phaseId) => {
    if (phaseId === 1) return true;
    return isPhaseComplete(phaseId - 1);
  };

  // Check if all phases are complete
  const isAllPhasesComplete = phases.every(p => isPhaseComplete(p.id));

  // Check if an item can be toggled (unlocked AND not locked by later completions)
  const canToggleItem = (phaseId, itemKey) => {
    if (!isPhaseUnlocked(phaseId)) return false;

    // If trying to unmark (item is currently completed), check if later phases have completions
    if (completed[itemKey] && hasCompletedItemsAfter(phaseId)) {
      return false;
    }
    return true;
  };

  // Handle mouse down on a chip - start drag and toggle
  const handleChipMouseDown = (phaseId, fullKey, e) => {
    e.preventDefault(); // Prevent text selection
    if (!canToggleItem(phaseId, fullKey)) return;

    const isCurrentlyCompleted = !!completed[fullKey];
    const action = isCurrentlyCompleted ? 'unmark' : 'mark';

    onDragStart(project.id, action);
    onItemToggle(project.id, fullKey);
  };

  // Handle mouse enter on a chip while dragging
  const handleChipMouseEnter = (phaseId, fullKey) => {
    if (!dragState.isDragging) return;
    if (dragState.projectId !== project.id) return;
    if (!canToggleItem(phaseId, fullKey)) return;

    const isCurrentlyCompleted = !!completed[fullKey];

    // Only toggle if current state doesn't match desired action
    if (dragState.action === 'mark' && !isCurrentlyCompleted) {
      onItemToggle(project.id, fullKey);
    } else if (dragState.action === 'unmark' && isCurrentlyCompleted) {
      onItemToggle(project.id, fullKey);
    }
  };

  // Chip styles
  const getChipStyle = (phaseId, itemKey, isCoin = false) => {
    const isCompleted = completed[itemKey];
    const isUnlocked = isPhaseUnlocked(phaseId);
    const canToggle = canToggleItem(phaseId, itemKey);

    const baseStyle = {
      fontSize: '9px',
      borderRadius: '3px',
      padding: '2px 5px',
      whiteSpace: 'nowrap',
      cursor: canToggle ? 'pointer' : 'not-allowed',
      transition: 'all 0.15s ease',
      userSelect: 'none'
    };

    if (isCoin) {
      // Coin chip styles
      if (isCompleted) {
        return {
          ...baseStyle,
          backgroundColor: '#1a3a1a',
          border: '1px solid #2a5a2a',
          color: '#8f8'
        };
      }
      return {
        ...baseStyle,
        backgroundColor: isUnlocked ? '#2a2518' : '#1a1a1a',
        border: `1px solid ${isUnlocked ? '#4a3a20' : '#2a2a2a'}`,
        color: isUnlocked ? '#ffd700' : '#999',
        opacity: isUnlocked ? 1 : 0.7
      };
    }

    // Regular item chip styles
    if (isCompleted) {
      return {
        ...baseStyle,
        backgroundColor: '#1a3a1a',
        border: '1px solid #2a5a2a',
        color: '#8f8'
      };
    }
    return {
      ...baseStyle,
      backgroundColor: isUnlocked ? '#252525' : '#1a1a1a',
      border: `1px solid ${isUnlocked ? '#333' : '#2a2a2a'}`,
      color: isUnlocked ? theme.text : '#999',
      opacity: isUnlocked ? 1 : 0.7
    };
  };

  // Phase button styles
  const getPhaseButtonStyle = (phaseId) => {
    const isViewing = viewing === phaseId;
    const isComplete = isPhaseComplete(phaseId);

    if (isComplete && isViewing) {
      // Selected + completed: brighter green
      return {
        backgroundColor: '#3a7a3a',
        color: '#aff',
        border: '1px solid #4a9a4a',
        fontWeight: '600'
      };
    }
    if (isComplete) {
      // Completed: green
      return {
        backgroundColor: '#2a5a2a',
        color: '#8f8',
        border: '1px solid #3a7a3a',
        fontWeight: '400'
      };
    }
    if (isViewing) {
      // Selected: accent color
      return {
        backgroundColor: theme.accent,
        color: '#fff',
        border: `1px solid ${theme.accent}`,
        fontWeight: '600'
      };
    }
    // Default
    return {
      backgroundColor: '#222',
      color: '#777',
      border: '1px solid #333',
      fontWeight: '400'
    };
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Project name */}
      <div style={{
        fontSize: '11px',
        color: theme.textDim,
        marginBottom: '6px',
        fontStyle: 'italic'
      }}>
        {project.name}
      </div>

      {/* Requirements for viewed phase */}
      {!isProjectDone && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '3px',
          marginBottom: '6px'
        }}>
          {/* Empty phase: show a "Done" tag */}
          {requirements.length === 0 && coinRequirements.length === 0 && (
            (() => {
              const fullKey = `${viewing}:_done`;
              const isCompleted = completed[fullKey];
              const isUnlocked = isPhaseUnlocked(viewing);
              const canToggle = canToggleItem(viewing, fullKey);
              const getTooltip = () => {
                if (!isUnlocked) return 'Complete previous phase first';
                if (isCompleted && !canToggle) return 'Cannot unmark - later phases have items marked';
                return `Click to ${isCompleted ? 'unmark' : 'mark'} phase as done`;
              };
              return (
                <span
                  style={getChipStyle(viewing, fullKey)}
                  title={getTooltip()}
                  onMouseDown={(e) => handleChipMouseDown(viewing, fullKey, e)}
                  onMouseEnter={() => handleChipMouseEnter(viewing, fullKey)}
                >
                  {isCompleted ? '✓ Done' : 'Mark Done'}
                </span>
              );
            })()
          )}
          {requirements.map((req, i) => {
            const fullKey = `${viewing}:${req.item}`;
            const isCompleted = completed[fullKey];
            const isUnlocked = isPhaseUnlocked(viewing);
            const canToggle = canToggleItem(viewing, fullKey);
            const getTooltip = () => {
              if (!isUnlocked) return `${req.item} - Complete previous phase first`;
              if (isCompleted && !canToggle) return `${req.item} - Cannot unmark, later phases have items marked`;
              return `${req.item} - Click to ${isCompleted ? 'unmark' : 'mark'} as done`;
            };
            return (
              <span
                key={i}
                style={getChipStyle(viewing, fullKey)}
                title={getTooltip()}
                onMouseDown={(e) => handleChipMouseDown(viewing, fullKey, e)}
                onMouseEnter={() => handleChipMouseEnter(viewing, fullKey)}
              >
                {req.item} <span style={{ color: isCompleted ? '#6d6' : theme.textMuted }}>×{req.amount}</span>
              </span>
            );
          })}
          {coinRequirements.map((req, i) => {
            const fullKey = `${viewing}:coin:${req.category}`;
            const isCompleted = completed[fullKey];
            const isUnlocked = isPhaseUnlocked(viewing);
            const canToggle = canToggleItem(viewing, fullKey);
            const getTooltip = () => {
              if (!isUnlocked) return `${req.category} - Complete previous phase first`;
              if (isCompleted && !canToggle) return `${req.category} - Cannot unmark, later phases have items marked`;
              return `${req.category} - Click to ${isCompleted ? 'unmark' : 'mark'} as done`;
            };
            return (
              <span
                key={`c-${i}`}
                style={getChipStyle(viewing, fullKey, true)}
                title={getTooltip()}
                onMouseDown={(e) => handleChipMouseDown(viewing, fullKey, e)}
                onMouseEnter={() => handleChipMouseEnter(viewing, fullKey)}
              >
                {req.category} <span style={{ opacity: 0.8 }}>×{(req.coinValue/1000).toFixed(0)}k</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Phase selector: all phases + Done */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px'
      }}>
        {phases.map((phase) => {
          const buttonStyle = getPhaseButtonStyle(phase.id);
          return (
            <button
              key={phase.id}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                ...buttonStyle
              }}
              onClick={() => onViewingChange(project.id, phase.id)}
              title={`${isPhaseComplete(phase.id) ? '✓ ' : ''}${phase.name}${viewing === phase.id ? ' (viewing)' : ''}`}
            >
              {phase.id}
            </button>
          );
        })}
        {/* Done button */}
        <button
          style={{
            padding: '4px 8px',
            fontSize: '10px',
            backgroundColor: isProjectDone ? '#2a5a2a' : (isAllPhasesComplete ? '#1a3a1a' : '#222'),
            color: isProjectDone ? '#8f8' : (isAllPhasesComplete ? '#6d6' : '#777'),
            border: `1px solid ${isProjectDone ? '#3a7a3a' : (isAllPhasesComplete ? '#2a5a2a' : '#333')}`,
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontWeight: isProjectDone ? '600' : '400',
            whiteSpace: 'nowrap'
          }}
          onClick={() => onDone(project.id, maxPhase)}
          title={isProjectDone ? 'Project completed' : (isAllPhasesComplete ? 'All phases complete - click to mark done' : 'Project not yet complete')}
        >
          ✓
        </button>
      </div>

      {/* Current phase label */}
      <div style={{
        marginTop: '4px',
        fontSize: '10px',
        color: theme.textMuted
      }}>
        {isProjectDone ? (
          <span style={{ color: '#8f8' }}>Completed</span>
        ) : (
          <>Working on: <span style={{ color: theme.accent }}>{viewingPhaseName}</span></>
        )}
      </div>
    </div>
  );
};

const ProjectPanel = ({
  projectProgress,
  onViewingChange,
  onItemToggle,
  onDone,
  projectData,
  embedded = false
}) => {
  const projects = (projectData?.projects || []).filter(p => p.active !== false);

  // Drag state for click-and-drag selection
  const [dragState, setDragState] = useState({
    isDragging: false,
    projectId: null,
    action: null // 'mark' or 'unmark'
  });

  const handleDragStart = useCallback((projectId, action) => {
    setDragState({ isDragging: true, projectId, action });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ isDragging: false, projectId: null, action: null });
  }, []);

  // Global mouseup listener to end drag
  useEffect(() => {
    const handleMouseUp = () => {
      if (dragState.isDragging) {
        handleDragEnd();
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [dragState.isDragging, handleDragEnd]);

  if (projects.length === 0) {
    return (
      <div style={embedded ? {} : { marginBottom: '20px' }}>
        {!embedded && <span style={styles.sectionTitle}>Projects</span>}
        <div style={{ fontSize: '11px', color: theme.textMuted }}>
          No project data available
        </div>
      </div>
    );
  }

  return (
    <div style={embedded ? {} : { marginBottom: '20px' }}>
      {!embedded && <span style={styles.sectionTitle}>Projects</span>}

      {projects.map(project => (
        <ProjectPhaseSelector
          key={project.id}
          project={project}
          progress={projectProgress[project.id]}
          onViewingChange={onViewingChange}
          onItemToggle={onItemToggle}
          onDone={onDone}
          dragState={dragState}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
};

export default ProjectPanel;
