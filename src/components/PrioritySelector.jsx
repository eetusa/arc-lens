import React, { useState } from 'react';
import { styles } from '../styles';
import PriorityModal from './PriorityModal';

const PrioritySelector = ({
  userPriorities,
  devPriorities,
  allItems,
  onAdd,
  onRemove,
  onUpdate,
  devEnabled,
  userEnabled,
  onDevToggle,
  onUserToggle
}) => {
  const [showDevModal, setShowDevModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  return (
    <div style={styles.priorityContainer}>
      <span style={styles.sectionTitle}>PRIORITIES</span>

      {/* Default Priorities Row */}
      <div style={styles.priorityRowWithButton}>
        <label style={styles.priorityToggleLabel}>
          <input
            type="checkbox"
            checked={devEnabled}
            onChange={(e) => onDevToggle(e.target.checked)}
            style={styles.priorityCheckbox}
          />
          <span style={styles.priorityToggleText}>Default Priorities</span>
        </label>
        <button
          style={styles.priorityViewButton}
          onClick={() => setShowDevModal(true)}
        >
          View
        </button>
      </div>

      {/* User Priorities Row */}
      <div style={styles.priorityRowWithButton}>
        <label style={styles.priorityToggleLabel}>
          <input
            type="checkbox"
            checked={userEnabled}
            onChange={(e) => onUserToggle(e.target.checked)}
            style={styles.priorityCheckbox}
          />
          <span style={styles.priorityToggleText}>
            My Priorities
            {userPriorities.length > 0 && (
              <span style={{ color: '#9c27b0', marginLeft: '6px' }}>
                ({userPriorities.length})
              </span>
            )}
          </span>
        </label>
        <button
          style={styles.priorityViewButton}
          onClick={() => setShowUserModal(true)}
        >
          Edit
        </button>
      </div>

      {/* Quick glance list of user priorities */}
      {userPriorities.length > 0 && (
        <div style={styles.priorityQuickList}>
          {userPriorities.map(p => (
            <div key={p.itemId} style={styles.priorityQuickItem}>
              <span style={styles.priorityQuickName}>{p.itemName}</span>
              <span style={styles.priorityQuickFlags}>
                {p.direct && <span style={styles.priorityQuickFlag}>D</span>}
                {p.craftTo && <span style={styles.priorityQuickFlag}>C</span>}
                {p.recycleTo && <span style={styles.priorityQuickFlag}>R</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Default Priorities Modal (read-only) */}
      <PriorityModal
        isOpen={showDevModal}
        onClose={() => setShowDevModal(false)}
        mode="view"
        priorities={devPriorities || []}
      />

      {/* User Priorities Modal (editable) */}
      <PriorityModal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        mode="edit"
        priorities={userPriorities}
        allItems={allItems}
        onAdd={onAdd}
        onRemove={onRemove}
        onUpdate={onUpdate}
      />
    </div>
  );
};

export default PrioritySelector;
