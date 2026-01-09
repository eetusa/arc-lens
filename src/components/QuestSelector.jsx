import React, { useState, useMemo } from 'react';
import { styles, theme } from '../styles'; // Adjusted import path

const QuestSelector = ({ activeQuests, allQuests, onAdd, onRemove }) => {
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

  return (
    <div style={styles.questContainer}>
      <span style={styles.sectionTitle}>ACTIVE QUESTS</span>
      <div style={styles.inputWrapper}>
        <input
          style={{...styles.input, borderColor: isFocused ? theme.accent : theme.border}}
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
      
      <div style={styles.tagsContainer}>
        {activeQuests.map(quest => (
          <div key={quest} style={styles.tag}>
            {quest}
            <span style={styles.tagClose} onClick={() => onRemove(quest)}>×</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuestSelector;