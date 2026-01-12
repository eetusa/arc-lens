import React, { useState, useMemo } from 'react';
import { styles, theme } from '../styles';

const ItemSearcher = ({ allItems, onSelect, compact = false }) => {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];

    const lowerInput = inputValue.toLowerCase();
    const filtered = allItems.filter(item =>
      item.name.toLowerCase().includes(lowerInput)
    );

    // Sort by: starts-with match first, then alphabetical
    filtered.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(lowerInput);
      const bStarts = b.name.toLowerCase().startsWith(lowerInput);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    });

    return filtered.slice(0, 5);
  }, [inputValue, allItems]);

  const handleSelect = (item) => {
    onSelect(item.name);
    setInputValue("");
  };

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === 'Tab') && inputValue) {
      if (suggestions.length > 0) {
        e.preventDefault();
        handleSelect(suggestions[0]);
      }
    }
  };

  if (compact) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
        <span style={{fontSize: '11px', fontWeight: 'bold', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px'}}>
          ITEM SEARCH
        </span>
        <div style={{position: 'relative'}}>
          <input
            style={{
              ...styles.input,
              borderColor: isFocused ? theme.accent : theme.border,
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px'
            }}
            placeholder="Type item name..."
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
                  onClick={() => handleSelect(item)}
                >
                  {item.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.questContainer}>
      <span style={styles.sectionTitle}>ITEM SEARCH</span>
      <div style={styles.inputWrapper}>
        <input
          style={{...styles.input, borderColor: isFocused ? theme.accent : theme.border}}
          placeholder="Type item name..."
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
                onClick={() => handleSelect(item)}
              >
                {item.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{...styles.tagsContainer, marginTop: '8px', fontSize: '11px', color: theme.textMuted}}>
        Search for items to view detailed analysis
      </div>
    </div>
  );
};

export default ItemSearcher;
