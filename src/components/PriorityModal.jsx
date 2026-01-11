import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { styles, theme } from '../styles';

/**
 * PriorityModal - View developer priorities or edit user priorities
 *
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Close handler
 * @param {string} mode - 'view' for developer list, 'edit' for user list
 * @param {array} priorities - List of priorities to display
 * @param {array} allItems - All items for autocomplete (edit mode only)
 * @param {function} onAdd - Add priority handler (edit mode only)
 * @param {function} onRemove - Remove priority handler (edit mode only)
 * @param {function} onUpdate - Update priority handler (edit mode only)
 */
const PriorityModal = ({
  isOpen,
  onClose,
  mode = 'view',
  priorities = [],
  allItems = [],
  onAdd,
  onRemove,
  onUpdate
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [newPriority, setNewPriority] = useState({
    direct: true,
    craftTo: false,
    recycleTo: false
  });

  const isEditMode = mode === 'edit';
  const title = isEditMode ? 'My Priorities' : 'Default Priorities';

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Get item IDs that are already in priorities
  const existingIds = useMemo(() =>
    new Set(priorities.map(p => p.itemId)),
    [priorities]
  );

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!inputValue.trim() || !isEditMode) return [];

    const lowerInput = inputValue.toLowerCase();
    const filtered = allItems.filter(item =>
      item.name.toLowerCase().includes(lowerInput) &&
      !existingIds.has(item.id)
    );

    filtered.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(lowerInput);
      const bStarts = b.name.toLowerCase().startsWith(lowerInput);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    });

    return filtered.slice(0, 5);
  }, [inputValue, allItems, existingIds, isEditMode]);

  const handleAdd = (item) => {
    if (!newPriority.direct && !newPriority.craftTo && !newPriority.recycleTo) {
      return;
    }
    onAdd?.({
      itemId: item.id,
      itemName: item.name,
      direct: newPriority.direct,
      craftTo: newPriority.craftTo,
      recycleTo: newPriority.recycleTo
    });
    setInputValue("");
  };

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === 'Tab') && inputValue) {
      if (suggestions.length > 0) {
        e.preventDefault();
        handleAdd(suggestions[0]);
      }
    }
  };

  const handleToggleFlag = (itemId, flag) => {
    const priority = priorities.find(p => p.itemId === itemId);
    if (!priority) return;

    const updated = { ...priority, [flag]: !priority[flag] };

    // Ensure at least one flag is enabled
    if (!updated.direct && !updated.craftTo && !updated.recycleTo) {
      return;
    }

    onUpdate?.(updated);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div style={styles.modalBackdrop} onClick={handleBackdropClick}>
      <div style={styles.priorityModalContainer}>
        <div style={styles.priorityModalHeader}>
          <h2 style={styles.priorityModalTitle}>
            <span style={styles.priorityStar}>★</span> {title}
          </h2>
          <button style={styles.priorityModalClose} onClick={onClose}>×</button>
        </div>

        <div style={styles.priorityModalContent}>
          {/* Add new item section (edit mode only) */}
          {isEditMode && (
            <div style={styles.priorityModalAddSection}>
              <div style={styles.inputWrapper}>
                <input
                  style={{ ...styles.input, borderColor: isFocused ? '#9c27b0' : theme.border }}
                  placeholder="Search item to add..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                  onKeyDown={handleKeyDown}
                />

                {isFocused && suggestions.length > 0 && (
                  <div style={styles.dropdown}>
                    {suggestions.map((item, idx) => (
                      <div
                        key={item.id}
                        style={styles.suggestionItem(idx === 0)}
                        onClick={() => handleAdd(item)}
                      >
                        {item.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.priorityModalAddOptions}>
                <span style={styles.priorityModalAddLabel}>New item flags:</span>
                <label style={styles.priorityOptionLabel}>
                  <input
                    type="checkbox"
                    checked={newPriority.direct}
                    onChange={() => setNewPriority(p => ({ ...p, direct: !p.direct }))}
                    style={styles.priorityCheckbox}
                  />
                  <span style={styles.priorityOptionText}>Direct</span>
                </label>
                <label style={styles.priorityOptionLabel}>
                  <input
                    type="checkbox"
                    checked={newPriority.craftTo}
                    onChange={() => setNewPriority(p => ({ ...p, craftTo: !p.craftTo }))}
                    style={styles.priorityCheckbox}
                  />
                  <span style={styles.priorityOptionText}>Craft</span>
                </label>
                <label style={styles.priorityOptionLabel}>
                  <input
                    type="checkbox"
                    checked={newPriority.recycleTo}
                    onChange={() => setNewPriority(p => ({ ...p, recycleTo: !p.recycleTo }))}
                    style={styles.priorityCheckbox}
                  />
                  <span style={styles.priorityOptionText}>Recycle</span>
                </label>
              </div>
            </div>
          )}

          {/* Priorities list */}
          {priorities.length === 0 ? (
            <div style={styles.priorityModalEmpty}>
              {isEditMode
                ? 'No priorities yet. Search for items above to add them.'
                : 'No developer priorities configured.'}
            </div>
          ) : (
            <div style={styles.priorityModalList}>
              {priorities.map(priority => (
                <div key={priority.itemId} style={styles.priorityModalItem}>
                  <div style={styles.priorityModalItemHeader}>
                    <span style={styles.priorityModalItemName}>
                      {priority.itemName}
                    </span>
                    {isEditMode && (
                      <span
                        style={styles.priorityModalItemRemove}
                        onClick={() => onRemove?.(priority.itemId)}
                      >
                        ×
                      </span>
                    )}
                  </div>
                  <div style={styles.priorityModalItemFlags}>
                    {isEditMode ? (
                      <>
                        <label style={styles.priorityModalFlagLabel}>
                          <input
                            type="checkbox"
                            checked={priority.direct}
                            onChange={() => handleToggleFlag(priority.itemId, 'direct')}
                            style={styles.priorityCheckbox}
                          />
                          <span style={styles.priorityModalFlagText(priority.direct)}>Direct</span>
                        </label>
                        <label style={styles.priorityModalFlagLabel}>
                          <input
                            type="checkbox"
                            checked={priority.craftTo}
                            onChange={() => handleToggleFlag(priority.itemId, 'craftTo')}
                            style={styles.priorityCheckbox}
                          />
                          <span style={styles.priorityModalFlagText(priority.craftTo)}>Craft</span>
                        </label>
                        <label style={styles.priorityModalFlagLabel}>
                          <input
                            type="checkbox"
                            checked={priority.recycleTo}
                            onChange={() => handleToggleFlag(priority.itemId, 'recycleTo')}
                            style={styles.priorityCheckbox}
                          />
                          <span style={styles.priorityModalFlagText(priority.recycleTo)}>Recycle</span>
                        </label>
                      </>
                    ) : (
                      <>
                        {priority.direct && <span style={styles.priorityFlag(true)}>Direct</span>}
                        {priority.craftTo && <span style={styles.priorityFlag(true)}>Craft</span>}
                        {priority.recycleTo && <span style={styles.priorityFlag(true)}>Recycle</span>}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PriorityModal;
