import React, { useState } from 'react';
import { styles, theme } from '../styles';

// Hard-coded test data for "A Warm Place To Rest" quest
const QUEST_TIPS = {
  "A Warm Place To Rest": {
    steps: [
      "Locate the Abandoned Highway Camp",
      "Search for any signs of survivors",
      "Follow the red markers",
      "Inspect the grave"
    ]
  }
};

// Empty state content for when no tips are available
function QuestHelperEmptyState() {
  return (
    <div style={styles.questHelperEmpty}>
      No quest tips available for your active quests.
      <br /><br />
      <span style={{ fontSize: '11px', color: theme.textMuted }}>
        Tips will appear here when you have quests with available guides.
      </span>
    </div>
  );
}

// Quest Accordion Item
function QuestAccordionItem({ questName, tips, defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div style={styles.questAccordion}>
      <div
        style={styles.questAccordionHeader(isExpanded)}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span style={styles.questAccordionChevron(isExpanded)}>&#9658;</span>
        <span style={styles.questAccordionTitle}>{questName}</span>
      </div>
      {isExpanded && (
        <div style={styles.questAccordionBody}>
          <ul style={styles.questStepList}>
            {tips.steps.map((step, index) => (
              <li key={index} style={styles.questStep}>
                <span style={styles.questStepNumber}>{index + 1}</span>
                <span style={styles.questStepText}>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Desktop Panel Component (legacy floating card style)
function QuestHelperPanel({ activeQuests }) {
  // Filter to only show quests that have tips
  const questsWithTips = activeQuests.filter(q => QUEST_TIPS[q]);

  return (
    <div style={styles.questHelperPanel}>
      <div style={styles.questHelperHeader}>
        <span style={styles.questHelperTitle}>Quest Helper</span>
      </div>
      <div style={styles.questHelperContent}>
        {questsWithTips.length === 0 ? (
          <QuestHelperEmptyState />
        ) : (
          questsWithTips.map((questName, index) => (
            <QuestAccordionItem
              key={questName}
              questName={questName}
              tips={QUEST_TIPS[questName]}
              defaultExpanded={index === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Full-height Desktop Panel Component (new panel layout)
// Now renders content only - Panel wrapper is handled by parent
function QuestHelperFullPanel({ activeQuests }) {
  // Filter to only show quests that have tips
  const questsWithTips = activeQuests.filter(q => QUEST_TIPS[q]);

  return (
    <>
      <div style={styles.questHelperPanelHeader}>
        <h3 style={styles.questHelperPanelTitle}>Quest Helper</h3>
      </div>
      <div style={styles.questHelperPanelContent}>
        {questsWithTips.length === 0 ? (
          <QuestHelperEmptyState />
        ) : (
          questsWithTips.map((questName, index) => (
            <QuestAccordionItem
              key={questName}
              questName={questName}
              tips={QUEST_TIPS[questName]}
              defaultExpanded={index === 0}
            />
          ))
        )}

        {/* Map Placeholder - Future Feature */}
        <div style={styles.questHelperMapPlaceholder}>
          <div style={styles.questHelperMapPlaceholderText}>
            Map Coming Soon
          </div>
          <div style={{ fontSize: '10px', color: theme.textDim, marginTop: '8px' }}>
            Interactive quest locations will appear here
          </div>
        </div>
      </div>
    </>
  );
}

// Mobile Bottom Sheet Component
function QuestHelperBottomSheet({ activeQuests, isOpen, onClose }) {
  // Filter to only show quests that have tips
  const questsWithTips = activeQuests.filter(q => QUEST_TIPS[q]);

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          ...styles.bottomSheetOverlay,
          ...(isOpen && styles.bottomSheetOverlayVisible)
        }}
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div style={{
        ...styles.bottomSheet,
        ...(isOpen && styles.bottomSheetOpen)
      }}>
        <div style={styles.bottomSheetHandle}>
          <div style={styles.bottomSheetHandleBar} />
        </div>
        <div style={styles.bottomSheetHeader}>
          <span style={styles.bottomSheetTitle}>Quest Helper</span>
          <button style={styles.bottomSheetClose} onClick={onClose}>
            &times;
          </button>
        </div>
        <div style={styles.bottomSheetContent}>
          {questsWithTips.length === 0 ? (
            <QuestHelperEmptyState />
          ) : (
            questsWithTips.map((questName, index) => (
              <QuestAccordionItem
                key={questName}
                questName={questName}
                tips={QUEST_TIPS[questName]}
                defaultExpanded={index === 0}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

// Main QuestHelper export - handles both desktop and mobile
export default function QuestHelper({
  activeQuests = [],
  isEnabled = false,
  isMobile = false,
  isBottomSheetOpen = false,
  onBottomSheetClose = () => {},
  // New panel layout props
  useFullPanel = false
}) {
  if (!isEnabled) return null;

  // Mobile: render bottom sheet
  if (isMobile) {
    return (
      <QuestHelperBottomSheet
        activeQuests={activeQuests}
        isOpen={isBottomSheetOpen}
        onClose={onBottomSheetClose}
      />
    );
  }

  // Desktop with new panel layout (content only, Panel wrapper is parent)
  if (useFullPanel) {
    return <QuestHelperFullPanel activeQuests={activeQuests} />;
  }

  // Desktop: render legacy floating panel
  return <QuestHelperPanel activeQuests={activeQuests} />;
}

// Also export the toggle button for mobile
export function QuestHelperToggleButton({ onClick, hasAvailableTips = false }) {
  return (
    <button
      style={{
        ...styles.questHelperToggleButton,
        ...(hasAvailableTips && {
          backgroundColor: 'rgba(0, 120, 212, 0.1)',
          animation: 'pulse-glow 2s ease-in-out infinite'
        })
      }}
      onClick={onClick}
      title="Quest Helper"
    >
      ?
    </button>
  );
}

// Export the tips data for checking availability
export { QUEST_TIPS };
