import React, { useState, useEffect } from 'react';
import { PROJECT_PHASES } from '../logic/constants';
import { styles, theme } from '../styles';

const ProjectPanel = ({
  projectPhase,
  onPhaseUpdate,
  projectData
}) => {
  const projectName = projectData?.currentProject?.name || 'Current Project';

  return (
    <div style={{ marginBottom: '20px' }}>
      <span style={styles.sectionTitle}>PROJECT PHASE</span>

      {/* Project name */}
      <div style={{
        fontSize: '11px',
        color: theme.textDim,
        marginBottom: '10px',
        fontStyle: 'italic'
      }}>
        {projectName}
      </div>

      {/* Phase selector */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px'
      }}>
        {PROJECT_PHASES.map((phase) => (
          <button
            key={phase.id}
            style={{
              padding: '4px 8px',
              fontSize: '10px',
              backgroundColor: projectPhase === phase.id ? theme.accent : '#222',
              color: projectPhase === phase.id ? '#fff' : '#777',
              border: `1px solid ${projectPhase === phase.id ? theme.accent : '#333'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontWeight: projectPhase === phase.id ? '600' : '400',
              whiteSpace: 'nowrap'
            }}
            onClick={() => onPhaseUpdate(phase.id)}
            title={phase.id === 0 ? 'Not started' : `Completed ${phase.name}`}
          >
            {phase.id === 0 ? '0' : phase.id}
          </button>
        ))}
      </div>

      {/* Current phase label */}
      <div style={{
        marginTop: '8px',
        fontSize: '10px',
        color: theme.textMuted
      }}>
        {projectPhase === 0 ? (
          'Not started - All phases will be tracked'
        ) : projectPhase === 6 ? (
          'Project completed - No items tracked'
        ) : (
          <>
            Completed: <span style={{ color: theme.accent }}>{PROJECT_PHASES[projectPhase]?.name}</span>
            {' → Tracking items for remaining phases'}
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectPanel;
