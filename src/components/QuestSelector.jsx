import React, { useState, useMemo } from 'react';
import { styles, theme } from '../styles'; // Adjusted import path

const QuestSelector = ({
  activeQuests,
  allQuests,
  onAdd,
  onRemove,
  questAutoDetect = false,
  onQuestAutoDetectToggle,
  isInMainMenu = false,
  isInPlayTab = false,
  embedded = false
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];

    const lowerInput = inputValue.toLowerCase();
    const filtered = allQuests.filter(q => 
      q.toLowerCase().includes(lowerInput) && 
      !activeQuests.includes(q) 
    );

    filtered.sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(lowerInput);
      const bStarts = b.toLowerCase().startsWith(lowerInput);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });

    return filtered.slice(0, 5);
  }, [inputValue, allQuests, activeQuests]); 

  const handleAdd = (quest) => {
    onAdd(quest);
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

  // Get status message for auto-detect
  const getAutoDetectStatus = () => {
    if (!questAutoDetect) return null;
    if (isInPlayTab) return { text: "Reading quests...", color: theme.success };
    if (isInMainMenu) return { text: "Go to PLAY tab", color: theme.accent };
    return { text: "Waiting for main menu", color: theme.textDim };
  };

  const autoDetectStatus = getAutoDetectStatus();

  return (
    <div style={embedded ? {} : styles.questContainer}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        {!embedded && <span style={styles.sectionTitle}>Active Quests</span>}
        {onQuestAutoDetectToggle && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              userSelect: 'none'
            }}
            onClick={() => onQuestAutoDetectToggle(!questAutoDetect)}
          >
            <span style={{
              fontSize: '9px',
              color: questAutoDetect ? theme.accent : theme.textDim,
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }}>
              AUTO
            </span>
            <div style={{
              width: '28px',
              height: '14px',
              borderRadius: '7px',
              backgroundColor: questAutoDetect ? theme.accent : theme.cardBg,
              border: `1px solid ${questAutoDetect ? theme.accent : theme.border}`,
              position: 'relative',
              transition: 'all 0.2s'
            }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: questAutoDetect ? '#fff' : theme.textDim,
                position: 'absolute',
                top: '1px',
                left: questAutoDetect ? '15px' : '1px',
                transition: 'all 0.2s'
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Auto-detect status indicator */}
      {questAutoDetect && autoDetectStatus && (
        <div style={{
          fontSize: '10px',
          color: autoDetectStatus.color,
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: autoDetectStatus.color,
            animation: isInPlayTab ? 'pulse 1.5s ease-in-out infinite' : 'none'
          }} />
          {autoDetectStatus.text}
        </div>
      )}

      {/* Manual input - hidden when auto-detect is on */}
      {!questAutoDetect && (
        <div style={styles.inputWrapper}>
          <input
            style={{
              ...styles.input,
              border: `1px solid ${isFocused ? theme.accent : theme.border}`,
              fontSize: '11px',
              padding: '6px 8px'
            }}
            placeholder="Type quest name..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={handleKeyDown}
          />

          {isFocused && suggestions.length > 0 && (
            <div style={styles.dropdown}>
              {suggestions.map((quest, idx) => (
                <div key={quest} style={styles.suggestionItem(idx === 0)} onClick={() => handleAdd(quest)}>
                  {quest}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={styles.tagsContainer}>
        {activeQuests.map(quest => (
          <div key={quest} style={{
            ...styles.tag,
            // Show different style when auto-detected (use full border to avoid shorthand conflict)
            ...(questAutoDetect && {
              border: `1px solid ${theme.accent}`,
              backgroundColor: `${theme.accent}15`
            })
          }}>
            {quest}
            {/* Only show remove button when not auto-detecting */}
            {!questAutoDetect && (
              <span style={styles.tagClose} onClick={() => onRemove(quest)}>×</span>
            )}
          </div>
        ))}
        {activeQuests.length === 0 && questAutoDetect && (
          <span style={{ fontSize: '11px', color: theme.textDim, fontStyle: 'italic' }}>
            No quests detected yet
          </span>
        )}
      </div>
    </div>
  );
};

export default QuestSelector;