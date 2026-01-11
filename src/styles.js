export const theme = {
  bg: '#0a0a0a',
  cardBg: '#141414',
  border: '#333',
  accent: '#0078d4',
  textMain: '#e0e0e0',
  textDim: '#666',
  success: '#00ff00',
  off: '#333333',
  glow: '0 0 20px rgba(0, 120, 212, 0.15)'
};


export const styles = {
  // --- BRANDING ---
  brandMark: {
    position: 'absolute',
    top: '16px',
    left: '20px',
    fontSize: '14px',
    fontWeight: '600',
    letterSpacing: '2px',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    userSelect: 'none',
    zIndex: 5
  },
  container: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    margin: 0, padding: 0, boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', backgroundColor: theme.bg,
    color: theme.textMain, fontFamily: '"Segoe UI", Roboto, Helvetica, sans-serif',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
  },
  mainContentWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch'
  },
  resultCard: {
    display: 'flex',
    width: '700px',
    height: '500px', // Slightly taller to breathe
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.border}`,
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    position: 'relative',
    zIndex: 10
  },
  infoCol: {
    flex: 1,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    // CRITICAL FIX: explicit overflow hidden helps, but flex child behavior is key
    overflow: 'hidden',
    position: 'relative'
  },
  imageCol: {
    flex: '0 0 300px', backgroundColor: '#000', display: 'flex',
    alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${theme.border}`,
    position: 'relative'
  },
  loaderContainer: {
    position: 'absolute', top: '15px', right: '15px',
    display: 'flex', alignItems: 'center', gap: '8px',
    zIndex: 20, pointerEvents: 'none'
  },
  spinner: {
    width: '14px', height: '14px', border: `2px solid ${theme.cardBg}`,
    borderTop: `2px solid ${theme.accent}`, borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  loadingText: {
    fontSize: '10px', color: theme.accent, fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: '0.5px'
  },
  placeholder: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', width: '100%', height: '100%', color: theme.textDim, gap: '15px'
  },
  cropCanvas: {
    maxWidth: '90%', maxHeight: '90%', objectFit: 'contain',
    boxShadow: theme.glow, border: '1px solid #333'
  },
  liveFeed: {
    position: 'absolute', bottom: '20px', right: '20px',
    width: '240px', height: '135px',
    backgroundColor: '#000', border: `1px solid ${theme.border}`,
    borderRadius: '8px', overflow: 'hidden', opacity: 0.8, zIndex: 5
  },
  ocrDebugFeed: {
    position: 'absolute', bottom: '20px', left: '20px',
    width: '240px', height: '135px',
    backgroundColor: '#000', border: `1px solid ${theme.accent}`,
    borderRadius: '8px', overflow: 'hidden', zIndex: 5,
    display: 'flex', flexDirection: 'column'
  },
  debugLabel: {
    backgroundColor: theme.accent, color: 'white', fontSize: '10px',
    padding: '2px 0', textAlign: 'center', fontWeight: 'bold'
  },
  statusBar: {
    position: 'absolute', top: '40px', display: 'flex', gap: '20px',
    alignItems: 'center', padding: '8px 20px', backgroundColor: theme.cardBg,
    borderRadius: '20px', border: `1px solid ${theme.border}`,
    fontSize: '12px', fontWeight: '600', letterSpacing: '0.5px'
  },
  // --- NEW LED STYLES ---
  ledContainer: {
    display: 'flex', alignItems: 'center', gap: '8px'
  },
  led: (isOn, isOverride = false) => {
    const color = isOverride ? '#ff9800' : (isOn ? theme.success : theme.off);
    const glowColor = isOverride ? '#ff9800' : theme.success;
    return {
      width: '10px', height: '10px', borderRadius: '50%',
      backgroundColor: color,
      boxShadow: (isOn || isOverride) ? `0 0 10px ${glowColor}` : 'inset 0 0 3px #000',
      border: `1px solid ${(isOn || isOverride) ? color : '#444'}`,
      transition: 'all 0.2s ease'
    };
  },
  ledText: (isOn) => ({
    color: isOn ? theme.textMain : theme.textDim,
    fontSize: '11px', fontWeight: 'bold'
  }),
  overrideButton: (isActive) => ({
    fontSize: '9px',
    padding: '4px 8px',
    backgroundColor: isActive ? '#ff9800' : 'transparent',
    border: `1px solid ${isActive ? '#ff9800' : theme.border}`,
    color: isActive ? '#000' : theme.textDim,
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.2s ease'
  }),
  // -----------------------
  button: {
    marginTop: '20px', backgroundColor: theme.accent, color: 'white',
    border: 'none', padding: '12px 24px', borderRadius: '6px',
    fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: theme.glow
  },
  debugTextOverlay: {
    position: 'absolute', bottom: 0, left: 0, width: '100%',
    maxHeight: '60px', backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#00ff00', fontSize: '9px', fontFamily: 'Consolas, Monaco, monospace',
    padding: '4px', overflowY: 'auto', whiteSpace: 'pre-wrap',
    boxSizing: 'border-box', borderTop: `1px solid ${theme.border}`
  },
  menuDebugFeed: {
    position: 'absolute', bottom: '160px', left: '20px',
    width: '240px', height: '60px',
    backgroundColor: '#000', border: `1px solid #d81b60`,
    borderRadius: '8px', overflow: 'hidden', zIndex: 5,
    display: 'flex', flexDirection: 'column'
  },
  toggleLabel: {
    display: 'flex', alignItems: 'center', gap: '8px',
    cursor: 'pointer', userSelect: 'none'
  },
  switchTrack: (isOn) => ({
    position: 'relative', width: '36px', height: '18px',
    backgroundColor: isOn ? theme.accent : '#333',
    borderRadius: '10px', transition: 'background-color 0.2s ease',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
  }),
  switchKnob: (isOn) => ({
    position: 'absolute', top: '2px',
    left: isOn ? '20px' : '2px', // Slide logic
    width: '14px', height: '14px',
    backgroundColor: '#fff', borderRadius: '50%',
    transition: 'left 0.2s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
  }),
  toggleText: {
    fontSize: '11px', fontWeight: 'bold', color: theme.textDim, textTransform: 'uppercase'
  },
  sidebarToggle: {
    position: 'absolute', top: '50%', right: '0',
    transform: 'translateY(-50%)',
    width: '24px', height: '40px', // Smaller toggle
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.border}`,
    borderRight: 'none',
    borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px',
    cursor: 'pointer', zIndex: 40,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '-2px 0 10px rgba(0,0,0,0.5)',
    transition: 'right 0.3s ease'
  },
  sidebar: (isOpen) => ({
    position: 'absolute', top: 0, right: isOpen ? 0 : '-300px', // Slightly narrower
    width: '300px', height: '100%',
    backgroundColor: 'rgba(15, 15, 15, 0.96)',
    backdropFilter: 'blur(5px)',
    borderLeft: `1px solid ${theme.border}`,
    zIndex: 50,
    transition: 'right 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
    display: 'flex', flexDirection: 'column',
    boxShadow: '-10px 0 30px rgba(0,0,0,0.8)'
  }),
  sidebarHeader: {
    padding: '12px 16px', borderBottom: `1px solid ${theme.border}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  sidebarContent: {
    padding: '16px', overflowY: 'auto', flex: 1
  },
  // --- COMPACT ROW LAYOUT ---
  stationRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom: '1px solid #222' // Subtle separator
  },
  stationLabel: {
    fontSize: '11px', color: theme.textDim, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: '0.5px'
  },
  levelSelector: {
    display: 'flex', gap: '2px'
  },
  levelBtn: (isActive) => ({
    width: '22px', height: '22px', // Fixed small square
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: isActive ? theme.accent : '#222',
    color: isActive ? '#fff' : '#555',
    border: `1px solid ${isActive ? theme.accent : '#333'}`,
    borderRadius: '3px',
    cursor: 'pointer', fontSize: '10px', fontWeight: 'bold',
    transition: 'all 0.1s ease',
    padding: 0
  }),
  // --- QUEST SELECTOR STYLES ---
  questContainer: {
    marginTop: '20px',
    borderTop: '1px solid #333',
    paddingTop: '15px',
    position: 'relative' // Important for absolute dropdown positioning
  },
  sectionTitle: {
    fontSize: '11px', color: theme.textMain, fontWeight: 'bold',
    letterSpacing: '1px', marginBottom: '10px', display: 'block'
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: '10px'
  },
  input: {
    width: '100%',
    backgroundColor: '#111',
    border: `1px solid ${theme.border}`,
    color: theme.textMain,
    padding: '8px 10px',
    fontSize: '12px',
    borderRadius: '4px',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  dropdown: {
    position: 'absolute',
    top: '100%', left: 0, width: '100%',
    maxHeight: '150px', overflowY: 'auto',
    backgroundColor: '#1a1a1a',
    border: `1px solid ${theme.border}`,
    borderTop: 'none',
    zIndex: 100,
    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
    borderRadius: '0 0 4px 4px'
  },
  suggestionItem: (isHighlight) => ({
    padding: '8px 10px',
    fontSize: '11px',
    cursor: 'pointer',
    backgroundColor: isHighlight ? '#222' : 'transparent',
    color: isHighlight ? theme.accent : theme.textDim,
    borderBottom: '1px solid #222'
  }),
  tagsContainer: {
    display: 'flex', flexWrap: 'wrap', gap: '6px'
  },
  tag: {
    display: 'flex', alignItems: 'center',
    backgroundColor: 'rgba(0, 120, 212, 0.1)',
    border: `1px solid ${theme.accent}`,
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '10px',
    color: theme.textMain
  },
  tagClose: {
    marginLeft: '6px',
    cursor: 'pointer',
    color: theme.accent,
    fontWeight: 'bold',
    fontSize: '12px',
    lineHeight: '1'
  },
  // --- PRIORITY STYLES ---
  priorityContainer: {
    marginTop: '20px',
    borderTop: `1px solid ${theme.border}`,
    paddingTop: '15px'
  },
  priorityToggles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px'
  },
  priorityToggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  priorityToggleText: {
    fontSize: '11px',
    color: theme.textDim
  },
  priorityCheckbox: {
    width: '14px',
    height: '14px',
    accentColor: theme.accent,
    cursor: 'pointer'
  },
  priorityAddSection: {
    marginBottom: '12px'
  },
  priorityOptions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px'
  },
  priorityOptionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer'
  },
  priorityOptionText: {
    fontSize: '10px',
    color: theme.textDim
  },
  priorityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '12px'
  },
  priorityItem: {
    backgroundColor: 'rgba(156, 39, 176, 0.1)',
    border: '1px solid #9c27b0',
    borderRadius: '6px',
    padding: '8px 10px'
  },
  priorityItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  priorityItemName: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: theme.textMain
  },
  priorityStar: {
    color: '#9c27b0',
    marginRight: '4px'
  },
  priorityItemRemove: {
    cursor: 'pointer',
    color: '#9c27b0',
    fontWeight: 'bold',
    fontSize: '14px',
    lineHeight: '1'
  },
  priorityItemFlags: {
    display: 'flex',
    gap: '6px'
  },
  priorityFlag: (active) => ({
    fontSize: '9px',
    padding: '1px 4px',
    borderRadius: '2px',
    backgroundColor: active ? 'rgba(156, 39, 176, 0.3)' : 'transparent',
    color: active ? '#ce93d8' : theme.textDim,
    border: `1px solid ${active ? '#9c27b0' : theme.border}`
  }),
  // --- PRIORITY BADGE IN ADVISOR CARD ---
  priorityBadge: {
    marginTop: '12px',
    padding: '10px',
    backgroundColor: 'rgba(156, 39, 176, 0.15)',
    border: '1px solid #9c27b0',
    borderRadius: '6px',
    boxShadow: '0 0 10px rgba(156, 39, 176, 0.2)'
  },
  priorityBadgeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px'
  },
  priorityBadgeIcon: {
    color: '#ce93d8',
    fontSize: '14px'
  },
  priorityBadgeTitle: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#ce93d8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  priorityBadgeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  priorityBadgeItem: {
    fontSize: '10px',
    color: theme.textDim,
    paddingLeft: '8px'
  },
  priorityMatchType: {
    color: '#9c27b0',
    fontStyle: 'italic'
  },
  // --- INFO BUTTON & MODAL ---
  infoButton: (debugVisible) => ({
    position: 'absolute',
    bottom: debugVisible ? '240px' : '20px',
    left: '20px',
    width: '32px',
    height: '32px',
    minWidth: '32px',
    minHeight: '32px',
    padding: 0,
    boxSizing: 'border-box',
    borderRadius: '50%',
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.border}`,
    color: theme.accent,
    fontSize: '18px',
    fontWeight: 'bold',
    fontStyle: 'italic',
    fontFamily: 'Georgia, serif',
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
  }),
  // --- SHARED MODAL STYLES ---
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200
  },
  // --- INFO MODAL STYLES ---
  modalContainer: {
    width: '500px',
    maxHeight: '80vh',
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: theme.textMain,
    margin: 0
  },
  modalClose: {
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    padding: 0,
    boxSizing: 'border-box',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.border}`,
    color: theme.textDim,
    fontSize: '18px',
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease'
  },
  modalContent: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
    fontSize: '13px',
    lineHeight: '1.6',
    color: theme.textMain
  },
  modalSection: {
    marginBottom: '20px'
  },
  modalSectionTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: theme.accent,
    marginBottom: '8px',
    display: 'block'
  },
  modalList: {
    margin: '8px 0',
    paddingLeft: '20px'
  },
  modalListItem: {
    marginBottom: '6px',
    color: theme.textDim
  },
  verdictBadge: (color) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 'bold',
    backgroundColor: color,
    color: '#000',
    marginRight: '8px'
  }),
  // --- PRIORITY MODAL STYLES ---
  priorityModalContainer: {
    width: '450px',
    maxHeight: '70vh',
    backgroundColor: theme.cardBg,
    border: '1px solid #9c27b0',
    borderRadius: '12px',
    boxShadow: '0 0 30px rgba(156, 39, 176, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  priorityModalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #9c27b0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(156, 39, 176, 0.1)'
  },
  priorityModalTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#ce93d8',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  priorityModalClose: {
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    padding: 0,
    boxSizing: 'border-box',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    border: '1px solid #9c27b0',
    color: '#ce93d8',
    fontSize: '18px',
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  priorityModalContent: {
    padding: '16px',
    overflowY: 'auto',
    flex: 1
  },
  priorityModalAddSection: {
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: `1px solid ${theme.border}`
  },
  priorityModalAddOptions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '10px',
    flexWrap: 'wrap'
  },
  priorityModalAddLabel: {
    fontSize: '11px',
    color: theme.textDim
  },
  priorityModalEmpty: {
    textAlign: 'center',
    color: theme.textDim,
    fontSize: '13px',
    padding: '30px 20px'
  },
  priorityModalList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  priorityModalItem: {
    backgroundColor: 'rgba(156, 39, 176, 0.08)',
    border: '1px solid rgba(156, 39, 176, 0.3)',
    borderRadius: '8px',
    padding: '12px'
  },
  priorityModalItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  priorityModalItemName: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: theme.textMain
  },
  priorityModalItemRemove: {
    cursor: 'pointer',
    color: '#9c27b0',
    fontWeight: 'bold',
    fontSize: '16px',
    lineHeight: 1,
    padding: '2px 6px',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  },
  priorityModalItemFlags: {
    display: 'flex',
    gap: '16px'
  },
  priorityModalFlagLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer'
  },
  priorityModalFlagText: (active) => ({
    fontSize: '11px',
    color: active ? '#ce93d8' : theme.textDim
  }),
  // View/Edit buttons for sidebar
  priorityRowWithButton: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  priorityViewButton: {
    fontSize: '10px',
    padding: '3px 8px',
    backgroundColor: 'transparent',
    border: '1px solid #9c27b0',
    color: '#ce93d8',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  // Quick glance list in sidebar
  priorityQuickList: {
    marginTop: '8px',
    marginLeft: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  priorityQuickItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px',
    padding: '4px 8px',
    backgroundColor: 'rgba(156, 39, 176, 0.08)',
    borderRadius: '4px',
    borderLeft: '2px solid #9c27b0'
  },
  priorityQuickName: {
    color: '#ce93d8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    marginRight: '8px'
  },
  priorityQuickFlags: {
    display: 'flex',
    gap: '3px',
    flexShrink: 0
  },
  priorityQuickFlag: {
    fontSize: '9px',
    fontWeight: 'bold',
    color: '#9c27b0',
    backgroundColor: 'rgba(156, 39, 176, 0.2)',
    padding: '1px 4px',
    borderRadius: '2px'
  },
  // --- RECYCLE TABS STYLES ---
  recycleTabsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginLeft: '-1px', // Overlap with card border
    paddingTop: '20px'
  },
  recycleTab: (index) => ({
    position: 'relative',
    width: '60px',
    minHeight: '60px',
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.border}`,
    borderLeft: 'none',
    borderTopRightRadius: '8px',
    borderBottomRightRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    boxSizing: 'border-box',
    transition: 'all 0.2s ease',
    cursor: 'default',
    boxShadow: '4px 2px 10px rgba(0,0,0,0.3)'
  }),
  recycleTabInner: {
    position: 'relative',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  recycleTabImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain'
  },
  recycleTabPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: `1px dashed ${theme.border}`,
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  recycleTabPlaceholderText: {
    fontSize: '10px',
    fontWeight: 'bold',
    color: theme.textDim,
    textAlign: 'center'
  },
  recycleTabQuantity: {
    position: 'absolute',
    bottom: '-2px',
    right: '-2px',
    backgroundColor: theme.accent,
    color: '#fff',
    fontSize: '9px',
    fontWeight: 'bold',
    padding: '1px 4px',
    borderRadius: '3px',
    minWidth: '16px',
    textAlign: 'center'
  },
  recycleTabName: {
    fontSize: '8px',
    color: theme.textDim,
    textAlign: 'center',
    marginTop: '2px',
    maxWidth: '56px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }
};
