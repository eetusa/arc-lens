import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { styles, theme } from '../styles';

const ItemSearcher = ({ allItems, onSelect, compact = false, embedded = false }) => {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const [, forceUpdate] = useState(0);

  // Force re-render on scroll to update dropdown position
  useEffect(() => {
    if (!isFocused) return;

    const handleScroll = () => forceUpdate(n => n + 1);

    // Listen on window and all scrollable ancestors
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isFocused]);

  // Calculate dropdown position from input ref (called during render)
  const getDropdownPos = () => {
    if (!inputRef.current) return { top: 0, left: 0, width: 0 };
    const rect = inputRef.current.getBoundingClientRect();
    return { top: rect.bottom, left: rect.left, width: rect.width };
  };

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
            ref={inputRef}
            style={{
              ...styles.input,
              borderColor: isFocused ? theme.accent : theme.border,
              width: '100%',
              padding: '10px 12px',
              fontSize: '16px'
            }}
            placeholder="Type item name..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={handleKeyDown}
          />

          {isFocused && suggestions.length > 0 && (() => {
            const pos = getDropdownPos();
            return createPortal(
              <div style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: pos.width,
                maxHeight: '150px',
                overflowY: 'auto',
                backgroundColor: '#1a1a1a',
                border: `1px solid ${theme.border}`,
                borderTop: 'none',
                zIndex: 1000,
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                borderRadius: '0 0 4px 4px'
              }}>
                {suggestions.map((item, idx) => (
                  <div
                    key={item.id}
                    style={styles.suggestionItem(idx === 0)}
                    onClick={() => handleSelect(item)}
                  >
                    {item.name}
                  </div>
                ))}
              </div>,
              document.body
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div style={embedded ? {} : styles.questContainer}>
      {!embedded && <span style={styles.sectionTitle}>Item Search</span>}
      <div style={styles.inputWrapper}>
        <input
          ref={inputRef}
          style={{
            ...styles.input,
            borderColor: isFocused ? theme.accent : theme.border,
            fontSize: '11px',
            padding: '6px 8px'
          }}
          placeholder="Type item name..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onKeyDown={handleKeyDown}
        />

        {isFocused && suggestions.length > 0 && (() => {
          const pos = getDropdownPos();
          return createPortal(
            <div style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: '150px',
              overflowY: 'auto',
              backgroundColor: '#1a1a1a',
              border: `1px solid ${theme.border}`,
              borderTop: 'none',
              zIndex: 1000,
              boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
              borderRadius: '0 0 4px 4px'
            }}>
              {suggestions.map((item, idx) => (
                <div
                  key={item.id}
                  style={styles.suggestionItem(idx === 0)}
                  onClick={() => handleSelect(item)}
                >
                  {item.name}
                </div>
              ))}
            </div>,
            document.body
          );
        })()}
      </div>

      <div style={{...styles.tagsContainer, marginTop: '8px', fontSize: '11px', color: theme.textMuted}}>
        Search for items to view detailed analysis
      </div>
    </div>
  );
};

export default ItemSearcher;
