import { useEffect, useState, useRef, useCallback } from 'react';
import { styles, theme } from './styles';

// --- IMPORTS ---
import StationPanel from './components/StationPanel';
import AdvisorCard from './components/AdvisorCard';
import InfoModal from './components/InfoModal';
import RecycleTabs from './components/RecycleTabs';
import ItemSearcher from './components/ItemSearcher';
import SessionModal from './components/SessionModal';
import SessionStatus from './components/SessionStatus';
import SessionConnector from './components/SessionConnector';
import { usePersistentState } from './hooks/usePersistentState';
import { useVisionSystem } from './hooks/useVisionSystem';
import { useIsMobile } from './hooks/useIsMobile';
import { useSessionSync } from './hooks/useSessionSync';
import { useVersionTracking } from './hooks/useVersionTracking';
import { preloadAllItemImages } from './utils/imagePreloader';
import { AdvisorEngine } from './logic/advisor-engine';
import { trackManualSearch } from './utils/analytics';

function App() {
  // --- UI STATE ---
  const [showDebug, setShowDebug] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [inventoryOverride, setInventoryOverride] = useState(false);
  const [allQuestNames, setAllQuestNames] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [devPriorities, setDevPriorities] = useState([]);
  const [manualAnalysis, setManualAnalysis] = useState(null);

  // --- SESSION STATE ---
  const [sessionEnabled, setSessionEnabled] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isSessionHost, setIsSessionHost] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showSessionConnector, setShowSessionConnector] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [keepScreenAwake, setKeepScreenAwake] = useState(false);

  // --- REFS ---
  const advisorEngineRef = useRef(null);
  const wakeLockRef = useRef(null);
  const noSleepVideoRef = useRef(null);

  // --- HOOKS ---
  const isMobile = useIsMobile();

  const {
    stationLevels,
    setStationLevels,
    activeQuests,
    setActiveQuests,
    userPriorities,
    setUserPriorities,
    devPrioritiesEnabled,
    setDevPrioritiesEnabled,
    userPrioritiesEnabled,
    setUserPrioritiesEnabled
  } = usePersistentState();

  const {
    currentVersion,
    lastSeenVersion,
    showVersionNotification,
    markVersionSeen
  } = useVersionTracking();

  // First-time visitor (no version stored yet)
  const isFirstTimeVisitor = lastSeenVersion === null;

  // Priority settings object for vision system
  const prioritySettings = {
    devPrioritiesEnabled,
    userPrioritiesEnabled,
    userPriorities
  };

  // --- VISION SYSTEM HOOK ---
  const {
    videoRef,
    miniFeedCanvasRef,
    analyticsCanvasRef,
    ocrDebugRef,
    menuDebugRef,
    isStreaming,
    workerStatus,
    currentAnalysis,
    hasData,
    isAnalyzing,
    debugRawText,
    isInventoryOpen,
    startCapture
  } = useVisionSystem(stationLevels, activeQuests, prioritySettings, inventoryOverride, isMobile);

  // --- SESSION CALLBACKS ---
  const handleSessionEnded = useCallback((reason) => {
    // Reset session state
    setSessionEnabled(false);
    setSessionId(null);
    setIsSessionHost(false);
    setViewerCount(0);
  }, []);

  // --- SESSION SYNC HOOK ---
  const { isConnected, syncSettings, viewerCount: syncViewerCount } = useSessionSync({
    // State to sync
    stationLevels,
    activeQuests,
    userPriorities,
    devPrioritiesEnabled,
    userPrioritiesEnabled,
    currentAnalysis,
    manualAnalysis,
    isInventoryOpen,
    isStreaming,
    isAnalyzing,

    // Setters for incoming sync
    setStationLevels,
    setActiveQuests,
    setUserPriorities,
    setDevPrioritiesEnabled,
    setUserPrioritiesEnabled,
    setManualAnalysis,

    // Session config
    sessionId,
    isHost: isSessionHost,
    isEnabled: sessionEnabled,

    // Callbacks
    onSessionEnded: handleSessionEnded
  });

  // Update viewer count from session sync
  useEffect(() => {
    setViewerCount(syncViewerCount);
  }, [syncViewerCount]);

  // Mobile: Keep screen awake handler (user-triggered via toggle button)
  // Must be triggered by user gesture for iOS Safari compatibility
  const toggleKeepScreenAwake = useCallback(async () => {
    const newState = !keepScreenAwake;
    setKeepScreenAwake(newState);

    if (newState) {
      // Enable - try Wake Lock API first, fallback to video trick
      let wakeLockAcquired = false;

      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock active - screen will stay awake');
          wakeLockAcquired = true;

          wakeLockRef.current.addEventListener('release', () => {
            console.log('Wake Lock released');
            // Don't clear ref here - we'll handle re-acquisition in visibility change
          });
        } catch (err) {
          console.warn('Wake Lock request failed:', err.name, err.message);
        }
      }

      // Fallback: Create and play a tiny video loop (NoSleep.js technique)
      // This tricks iOS into thinking media is playing, preventing sleep
      if (!wakeLockAcquired) {
        console.log('Using video fallback for screen wake');
        if (!noSleepVideoRef.current) {
          const video = document.createElement('video');
          video.setAttribute('playsinline', '');
          video.setAttribute('muted', '');
          video.setAttribute('loop', '');
          video.style.position = 'absolute';
          video.style.left = '-9999px';
          video.style.width = '1px';
          video.style.height = '1px';
          // Tiny base64 encoded MP4 (1x1 pixel, ~100 bytes)
          video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAs1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0MiByMjQ3OSBkZDc5YTYxIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTYgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAwZYiEAD//8m+P5OXfBeLGOfKE3xkODvFZuBflHv/+VwJIta6cbpIo4ABLoKBaYTkTAAAC7m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAPoAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAgAAABhpb2RzAAAAABCAgIAHAE/QAAAAAiZzdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAPoAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAABgAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAJVbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAD6AAAAN8AVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAgBtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAHAc3RibAAAAKBzdHNkAAAAAAAAAAEAAACQYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAABAABAAQLQAAAAAABxhcGNuAAAAAAABAAAAAAAAAAAAAAAAEHBhc3AAAAABAAAAAQAAABhzdHRzAAAAAAAAAAEAAAAeAAAD6AAAAAxzdHNjAAAAAAAAAAAAAAASc3RzegAAAAAAAAAAAAAAHgAAAwAAAAAMc3RjbwAAAAAAAAAAAAAAAAQAAAAYc3RzcwAAAAAAAAABAAAAAAAAAABAAAABIHVkdGEAAAEYbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAraWxzdAAAACOpdG9vAAAAG2RhdGEAAAABAAAAAExhdmY1NC4yMC40';
          document.body.appendChild(video);
          noSleepVideoRef.current = video;
        }
        try {
          await noSleepVideoRef.current.play();
          console.log('Video fallback playing - screen should stay awake');
        } catch (err) {
          console.warn('Video fallback failed:', err);
        }
      }
    } else {
      // Disable - release wake lock and stop video
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          console.log('Wake Lock released');
        } catch (err) {
          // Ignore release errors
        }
        wakeLockRef.current = null;
      }
      if (noSleepVideoRef.current) {
        noSleepVideoRef.current.pause();
        console.log('Video fallback stopped');
      }
    }
  }, [keepScreenAwake]);

  // Re-acquire wake lock when page becomes visible (if keepScreenAwake is enabled)
  useEffect(() => {
    if (!keepScreenAwake || !isMobile) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('Page visible, checking wake lock status');
        // Try to re-acquire wake lock if it was released
        if ('wakeLock' in navigator && !wakeLockRef.current) {
          try {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
            console.log('Wake Lock re-acquired');
          } catch (err) {
            console.warn('Wake Lock re-acquisition failed:', err.name);
          }
        }
        // Ensure video fallback is still playing
        if (noSleepVideoRef.current && noSleepVideoRef.current.paused) {
          try {
            await noSleepVideoRef.current.play();
            console.log('Video fallback resumed');
          } catch (err) {
            // Ignore play errors
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [keepScreenAwake, isMobile]);

  // Cleanup wake lock when disconnecting from session
  useEffect(() => {
    if (!sessionEnabled || !isConnected) {
      // Session ended or disconnected - disable keep awake
      if (keepScreenAwake) {
        setKeepScreenAwake(false);
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
        if (noSleepVideoRef.current) {
          noSleepVideoRef.current.pause();
        }
      }
    }
  }, [sessionEnabled, isConnected, keepScreenAwake]);

  // Auto-close QR modal when a new viewer connects (not when modal opens with existing viewers)
  const prevViewerCountRef = useRef(syncViewerCount);
  useEffect(() => {
    const prevCount = prevViewerCountRef.current;
    prevViewerCountRef.current = syncViewerCount;

    // Only close if viewer count increased (new device joined)
    if (isSessionHost && syncViewerCount > prevCount && showSessionModal) {
      setShowSessionModal(false);
    }
  }, [isSessionHost, syncViewerCount, showSessionModal]);

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    // Initialize AdvisorEngine for manual item search
    const initAdvisor = async () => {
      advisorEngineRef.current = new AdvisorEngine();
      await advisorEngineRef.current.init();
      console.log("AdvisorEngine initialized for item search");
    };
    initAdvisor();

    // Load quest names
    fetch('/quests.json')
      .then(res => res.json())
      .then(data => setAllQuestNames(Object.keys(data)))
      .catch(e => console.error("Quest load error", e));

    // Load item names for priority selector
    fetch('/items_db.json')
      .then(res => res.json())
      .then(data => {
        const items = Object.values(data).map(item => ({
          id: item.id,
          name: item.name
        }));
        setAllItems(items);
      })
      .catch(e => console.error("Items load error", e));

    // Load developer priorities
    fetch('/priorities.json')
      .then(res => res.json())
      .then(data => setDevPriorities(data.priorities || []))
      .catch(e => console.error("Priorities load error", e));

    // Preload all item images in background
    preloadAllItemImages();
  }, []);

  // Update AdvisorEngine when priority settings change
  useEffect(() => {
    if (advisorEngineRef.current) {
      advisorEngineRef.current.updatePrioritySettings({
        devPrioritiesEnabled,
        userPrioritiesEnabled,
        userPriorities
      });
    }
  }, [devPrioritiesEnabled, userPrioritiesEnabled, userPriorities]);

  // Clear manual analysis when OCR detects a new item
  useEffect(() => {
    if (currentAnalysis) {
      setManualAnalysis(null);
    }
  }, [currentAnalysis]);

  // --- HANDLERS ---
  const handleClearManualAnalysis = () => {
    setManualAnalysis(null);
  };

  const handleStationUpdate = (name, level) => {
    const newLevels = { ...stationLevels, [name]: level };
    setStationLevels(newLevels);

    // Sync to connected devices
    if (sessionEnabled && isConnected) {
      syncSettings({ stationLevels: newLevels });
    }
  };
  const handleQuestAdd = (quest) => {
    if (!activeQuests.includes(quest)) {
      const newQuests = [...activeQuests, quest];
      setActiveQuests(newQuests);

      // Sync to connected devices
      if (sessionEnabled && isConnected) {
        syncSettings({ activeQuests: newQuests });
      }
    }
  };
  const handleQuestRemove = (quest) => {
    const newQuests = activeQuests.filter(q => q !== quest);
    setActiveQuests(newQuests);

    // Sync to connected devices
    if (sessionEnabled && isConnected) {
      syncSettings({ activeQuests: newQuests });
    }
  };

  // Handle manual item search
  const handleItemSelect = (itemName) => {
    if (!advisorEngineRef.current) {
      console.error("AdvisorEngine not ready");
      return;
    }

    const analysis = advisorEngineRef.current.analyzeItem(itemName, {
      activeQuestTitles: activeQuests,
      stationLevels: stationLevels
    });

    setManualAnalysis(analysis);

    // Track manual search event
    trackManualSearch(itemName);
  };

  // Priority handlers
  const handlePriorityAdd = (priority) => {
    if (!userPriorities.find(p => p.itemId === priority.itemId)) {
      const newPriorities = [...userPriorities, priority];
      setUserPriorities(newPriorities);

      // Sync to connected devices
      if (sessionEnabled && isConnected) {
        syncSettings({ userPriorities: newPriorities });
      }
    }
  };
  const handlePriorityRemove = (itemId) => {
    const newPriorities = userPriorities.filter(p => p.itemId !== itemId);
    setUserPriorities(newPriorities);

    // Sync to connected devices
    if (sessionEnabled && isConnected) {
      syncSettings({ userPriorities: newPriorities });
    }
  };
  const handlePriorityUpdate = (updatedPriority) => {
    const newPriorities = userPriorities.map(p =>
      p.itemId === updatedPriority.itemId ? updatedPriority : p
    );
    setUserPriorities(newPriorities);

    // Sync to connected devices
    if (sessionEnabled && isConnected) {
      syncSettings({ userPriorities: newPriorities });
    }
  };
  const TV_STATIC = `url('data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)" opacity="0.4"/%3E%3C/svg%3E')`;
  // --- RENDER ---
  return (
    <div style={{
    ...styles.container,
    // Use dynamic viewport height on mobile to handle address bar
    ...(isMobile && {
      height: '100dvh',
      justifyContent: 'flex-start',
      paddingTop: '70px' // Space for header area (brand + hamburger + connection status)
    }),
    backgroundImage: `
      ${TV_STATIC},
      radial-gradient(circle, rgba(60, 54, 65, 0.2) 10%, rgba(20, 27, 41, 1) 100%),
      url('/arclensbg1_cropped.avif')
    `,
    backgroundSize: '150px 150px, cover, cover', // Tiles the noise, covers the rest
    backgroundPosition: 'center',
    backgroundRepeat: 'repeat, no-repeat, no-repeat',
    backgroundBlendMode: 'overlay, normal, normal' // Blends the noise into the image
  }}>

      {/* BRAND MARK */}
      <div style={{
        ...styles.brandMark,
        ...(isMobile && { fontSize: '12px', top: '12px', left: '16px' })
      }}>ARC Lens</div>

      {/* MOBILE CONNECTION STATUS - Positioned in top area with proper spacing */}
      {isMobile && sessionEnabled && (
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 100
        }}>
          {/* Connection indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.border}`,
            borderRadius: '16px',
            fontSize: '10px',
            color: isConnected ? theme.textMain : theme.textDim,
            fontWeight: '600',
            letterSpacing: '0.5px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? theme.success : theme.off,
              boxShadow: isConnected ? `0 0 8px ${theme.success}` : 'inset 0 0 2px #000',
              border: `1px solid ${isConnected ? theme.success : '#444'}`
            }} />
            <span style={{ textTransform: 'uppercase' }}>
              {isConnected ? 'CONNECTED' : 'CONNECTING'}
            </span>
          </div>

          {/* Keep Screen Awake toggle - clear button affordance */}
          {isConnected && (
            <button
              onClick={toggleKeepScreenAwake}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 10px',
                backgroundColor: keepScreenAwake ? theme.accent : 'transparent',
                border: keepScreenAwake ? `1px solid ${theme.accent}` : `1px solid ${theme.accent}`,
                borderRadius: '16px',
                fontSize: '9px',
                color: keepScreenAwake ? '#fff' : theme.accent,
                fontWeight: '600',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              {keepScreenAwake ? 'SCREEN AWAKE: ON' : 'SCREEN AWAKE'}
            </button>
          )}
        </div>
      )}

      {/* STATUS BAR - Hidden on mobile */}
      {!isMobile && (
        <div style={styles.statusBar}>
        <div style={styles.ledContainer}>
            <div style={styles.led(isInventoryOpen, inventoryOverride)}></div>
            <span style={styles.ledText(isInventoryOpen)}>
                {inventoryOverride ? "OVERRIDE ACTIVE" : (isInventoryOpen ? "INVENTORY OPEN" : "INVENTORY CLOSED")}
            </span>
        </div>
        {/* Override button - debug mode only */}
        {showDebug && (
          <>
            <div style={{width:'1px', height:'14px', backgroundColor:'#333', margin:'0 10px'}}></div>
            <button
              style={styles.overrideButton(inventoryOverride)}
              onClick={() => setInventoryOverride(!inventoryOverride)}
              title="Force inventory detection to always be active"
            >
              {inventoryOverride ? 'DISABLE OVERRIDE' : 'FORCE OPEN'}
            </button>
          </>
        )}
        <div style={{width:'1px', height:'14px', backgroundColor:'#333', margin:'0 10px'}}></div>
        <span style={{color: theme.textDim}}>WORKER: {workerStatus.toUpperCase()}</span>
        <div style={{width:'1px', height:'14px', backgroundColor:'#333', margin:'0 10px'}}></div>
        <div style={styles.toggleLabel} onClick={() => setShowDebug(!showDebug)}>
            <div style={styles.switchTrack(showDebug)}>
                <div style={styles.switchKnob(showDebug)}></div>
            </div>
            <span style={styles.toggleText}>DEBUG VIEW</span>
        </div>
        <div style={{width:'1px', height:'14px', backgroundColor:'#333', margin:'0 10px'}}></div>
        <SessionStatus
          isConnected={isConnected}
          role={sessionEnabled ? (isSessionHost ? 'host' : 'viewer') : null}
          viewerCount={viewerCount}
          onToggle={() => {
            if (!sessionEnabled) {
              // Generate short session ID (12 digits, numbers only for easy mobile input)
              const newSessionId = Array.from(crypto.getRandomValues(new Uint32Array(3)))
                .map(n => (n % 10000).toString().padStart(4, '0'))
                .join('');
              setSessionId(newSessionId);
              setIsSessionHost(true);
              setSessionEnabled(true);
            }
            setShowSessionModal(true);
          }}
        />
      </div>
      )}

      {/* MOBILE HAMBURGER/CLOSE MENU */}
      {isMobile && (
        <button
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            zIndex: 60,
            padding: '8px'
          }}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? (
            <div style={{
              fontSize: '24px',
              color: theme.accent,
              lineHeight: '1',
              fontWeight: 'bold'
            }}>×</div>
          ) : (
            <>
              <div style={{width: '20px', height: '2px', backgroundColor: theme.accent, borderRadius: '2px'}}></div>
              <div style={{width: '20px', height: '2px', backgroundColor: theme.accent, borderRadius: '2px'}}></div>
              <div style={{width: '20px', height: '2px', backgroundColor: theme.accent, borderRadius: '2px'}}></div>
            </>
          )}
        </button>
      )}

      {/* SIDEBAR TOGGLE - Desktop only */}
      {!isMobile && (
        <div
          style={{
            ...(isFirstTimeVisitor ? styles.sidebarTogglePulsing : styles.sidebarToggle),
            right: sidebarOpen ? '300px' : '0'
          }}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <span style={{color: theme.accent, fontSize: '18px'}}>{sidebarOpen ? '›' : '‹'}</span>
        </div>
      )}

      {/* SIDEBAR (Modular Component) */}
      <div style={{
        ...styles.sidebar(sidebarOpen),
        ...(isMobile && {
          width: '85vw',
          right: sidebarOpen ? 0 : '-85vw',
          borderLeft: 'none',
          boxShadow: 'none'
        })
      }}>
        {sidebarOpen && (
          <StationPanel
            levels={stationLevels}
            onStationUpdate={handleStationUpdate}
            activeQuests={activeQuests}
            allQuests={allQuestNames}
            onQuestAdd={handleQuestAdd}
            onQuestRemove={handleQuestRemove}
            // Priority props
            userPriorities={userPriorities}
            devPriorities={devPriorities}
            allItems={allItems}
            onPriorityAdd={handlePriorityAdd}
            onPriorityRemove={handlePriorityRemove}
            onPriorityUpdate={handlePriorityUpdate}
            devPrioritiesEnabled={devPrioritiesEnabled}
            userPrioritiesEnabled={userPrioritiesEnabled}
            onDevPrioritiesToggle={setDevPrioritiesEnabled}
            onUserPrioritiesToggle={setUserPrioritiesEnabled}
            // Item search props
            onItemSelect={handleItemSelect}
            isMobile={isMobile}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

      {/* MOBILE: CONNECT TO DESKTOP BUTTON */}
      {isMobile && !sessionEnabled && (
        <button
          onClick={() => setShowSessionConnector(true)}
          style={{
            width: 'calc(100% - 32px)',
            maxWidth: '500px',
            marginTop: '4px',
            marginBottom: '12px',
            padding: '10px 16px',
            fontSize: '11px',
            backgroundColor: 'transparent',
            border: `1px solid ${theme.accent}`,
            borderRadius: '6px',
            color: theme.accent,
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            flexShrink: 0
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.backgroundColor = theme.accent;
            e.currentTarget.style.color = '#fff';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = theme.accent;
          }}
        >
          <span>◉</span>
          <span>Connect to Desktop</span>
        </button>
      )}

      {/* MOBILE ITEM SEARCH */}
      {isMobile && !sessionEnabled && (
        <div style={{
          width: 'calc(100% - 32px)',
          maxWidth: '500px',
          marginBottom: '12px',
          flexShrink: 0
        }}>
          <ItemSearcher
            allItems={allItems}
            onSelect={handleItemSelect}
            compact={true}
          />
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{
        ...styles.mainContentWrapper,
        ...(isMobile && {
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          padding: '0 16px',
          boxSizing: 'border-box',
          // Make scrollable on mobile so recycle tabs don't cause layout jumps
          flex: '1 1 auto',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: '60px', // Space for info button
          WebkitOverflowScrolling: 'touch'
        })
      }}>
        <div style={{
          ...styles.resultCard,
          ...(isMobile && {
            width: '100%',
            maxWidth: '500px',
            // Use calc to ensure card fits with space for info button
            height: 'auto',
            minHeight: '280px',
            maxHeight: 'calc(100dvh - 180px)',
            flex: '1 1 auto'
          })
        }}>
          {/* Hide image column on mobile */}
          {!isMobile && (
            <div style={styles.imageCol}>
                <canvas ref={analyticsCanvasRef} style={{...styles.cropCanvas, display: hasData ? 'block' : 'none'}} />
                {!hasData && <div style={{color: '#333', fontSize: '12px'}}>NO IMAGE</div>}
            </div>
          )}

          <div style={styles.infoCol}>
              {isAnalyzing && (
                  <div style={styles.loaderContainer}>
                      <div style={styles.spinner}></div>
                      <span style={styles.loadingText}>Analyzing</span>
                  </div>
              )}

              {!isStreaming && !manualAnalysis ? (
                  <div style={styles.placeholder}>
                      {!isMobile && (
                        <button
                          style={styles.button}
                          onClick={startCapture}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.accent;
                            e.currentTarget.style.color = '#fff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = theme.accent;
                          }}
                        >
                          START CAPTURE
                        </button>
                      )}
                      <div style={{fontSize:'12px', marginTop: isMobile ? '0' : '16px', color: theme.textMuted}}>
                        {isMobile ? 'Search for an item above to view detailed analysis' : 'Or use Item Search in the sidebar'}
                      </div>
                  </div>
              ) : !(currentAnalysis || manualAnalysis) ? (
                  <div style={styles.placeholder}>
                      {!isMobile && (
                        <>
                          <div style={{fontSize:'16px', color: theme.accent}}>Waiting for item...</div>
                          <div style={{fontSize:'12px'}}>Open Inventory & Hover Item</div>
                        </>
                      )}
                      <div style={{fontSize:'12px', marginTop: isMobile ? '0' : '8px', color: theme.textMuted}}>
                        {isMobile ? 'Search for an item above to view detailed analysis' : 'Or use Item Search in the sidebar'}
                      </div>
                  </div>
              ) : (
                  <div style={{
                      opacity: isAnalyzing ? 0.5 : 1,
                      transition: 'opacity 0.2s',
                      flex: 1,
                      height: '100%',
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      position: 'relative'
                  }}>
                      {/* Dismiss button for manual analysis when not streaming */}
                      {manualAnalysis && !isStreaming && (
                        <button
                          onClick={handleClearManualAnalysis}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            border: `1px solid ${theme.border}`,
                            backgroundColor: theme.cardBg,
                            color: theme.textMuted,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            lineHeight: '1',
                            zIndex: 100,
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = theme.accent;
                            e.target.style.color = '#fff';
                            e.target.style.borderColor = theme.accent;
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = theme.cardBg;
                            e.target.style.color = theme.textMuted;
                            e.target.style.borderColor = theme.border;
                          }}
                          title="Clear and show Select Window"
                        >
                          ×
                        </button>
                      )}
                      <AdvisorCard analysis={manualAnalysis || currentAnalysis} isMobile={isMobile} />
                  </div>
              )}
          </div>
        </div>

        {/* RECYCLE TABS - Shows what current item breaks into */}
        {(manualAnalysis || currentAnalysis) && (manualAnalysis || currentAnalysis).recycleOutputs && (manualAnalysis || currentAnalysis).recycleOutputs.length > 0 && (
          <RecycleTabs outputs={(manualAnalysis || currentAnalysis).recycleOutputs} isMobile={isMobile} />
        )}
      </div>

      <video ref={videoRef} style={{ display: 'none' }} autoPlay muted playsInline></video>

      {/* LIVE FEED */}
      <div style={{ ...styles.liveFeed, display: (isStreaming && showDebug) ? 'block' : 'none' }}>
          <canvas ref={miniFeedCanvasRef} style={{width:'100%', height:'100%', objectFit:'contain'}} />
      </div>

      {/* DEBUG FEEDS */}
      <div style={{ ...styles.menuDebugFeed, display: (isStreaming && showDebug) ? 'flex' : 'none' }}>
           <div style={{...styles.debugLabel, backgroundColor: '#d81b60'}}>MENU HEADER (DEBUG)</div>
           <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
               <canvas ref={menuDebugRef} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} />
           </div>
      </div>

      <div style={{ ...styles.ocrDebugFeed, display: (isStreaming && showDebug) ? 'flex' : 'none' }}>
          <div style={styles.debugLabel}>OCR INPUT (DEBUG)</div>
          <div style={{flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width: '100%', overflow:'hidden'}}>
              <canvas ref={ocrDebugRef} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} />
              <div style={styles.debugTextOverlay}>
                {debugRawText || "Waiting for text..."}
              </div>
          </div>
      </div>

      {/* INFO BUTTON */}
      <button
        style={{
          ...(showVersionNotification
            ? styles.infoButtonPulsing(isStreaming && showDebug)
            : styles.infoButton(isStreaming && showDebug)),
          ...(isMobile && {
            bottom: '16px',
            left: '16px',
            // Ensure button stays above safe area on iOS
            paddingBottom: 'env(safe-area-inset-bottom, 0px)'
          })
        }}
        onClick={() => setShowInfo(true)}
        title="About this app"
      >
        i
      </button>

      {/* INFO MODAL */}
      {showInfo && (
        <InfoModal
          onClose={() => setShowInfo(false)}
          currentVersion={currentVersion}
          isNewVersion={showVersionNotification}
          onVersionSeen={markVersionSeen}
        />
      )}

      {/* SESSION MODAL */}
      {showSessionModal && sessionId && (
        <SessionModal
          sessionId={sessionId}
          onClose={() => setShowSessionModal(false)}
        />
      )}

      {/* SESSION CONNECTOR (MOBILE) */}
      {showSessionConnector && (
        <SessionConnector
          onConnect={(id) => {
            setSessionId(id);
            setIsSessionHost(false);
            setSessionEnabled(true);
            setShowSessionConnector(false);
          }}
          onCancel={() => setShowSessionConnector(false)}
        />
      )}

      {/* DISCLAIMER */}
      {!isMobile && (
        <div style={styles.disclaimer}>
          ARC Lens is an independent fan project and is not affiliated with, endorsed by, or connected to Embark Studios or ARC Raiders.
        </div>
      )}

    </div>
  );
}

export default App;