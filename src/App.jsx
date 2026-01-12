import { useEffect, useState, useRef } from 'react';
import { styles, theme } from './styles';

// --- IMPORTS ---
import StationPanel from './components/StationPanel';
import AdvisorCard from './components/AdvisorCard';
import InfoModal from './components/InfoModal';
import RecycleTabs from './components/RecycleTabs';
import { usePersistentState } from './hooks/usePersistentState';
import { useVisionSystem } from './hooks/useVisionSystem';
import { preloadAllItemImages } from './utils/imagePreloader';
import { AdvisorEngine } from './logic/advisor-engine';

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

  // --- REFS ---
  const advisorEngineRef = useRef(null);

  // --- HOOKS ---
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
  } = useVisionSystem(stationLevels, activeQuests, prioritySettings, inventoryOverride);

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
    setStationLevels(prev => ({ ...prev, [name]: level }));
  };
  const handleQuestAdd = (quest) => {
    if (!activeQuests.includes(quest)) setActiveQuests(prev => [...prev, quest]);
  };
  const handleQuestRemove = (quest) => {
    setActiveQuests(prev => prev.filter(q => q !== quest));
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
  };

  // Priority handlers
  const handlePriorityAdd = (priority) => {
    if (!userPriorities.find(p => p.itemId === priority.itemId)) {
      setUserPriorities(prev => [...prev, priority]);
    }
  };
  const handlePriorityRemove = (itemId) => {
    setUserPriorities(prev => prev.filter(p => p.itemId !== itemId));
  };
  const handlePriorityUpdate = (updatedPriority) => {
    setUserPriorities(prev =>
      prev.map(p => p.itemId === updatedPriority.itemId ? updatedPriority : p)
    );
  };
  const TV_STATIC = `url('data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)" opacity="0.4"/%3E%3C/svg%3E')`;
  // --- RENDER ---
  return (
    <div style={{
    ...styles.container,
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
      <div style={styles.brandMark}>ARC Lens</div>

      {/* STATUS BAR */}
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
      </div>

      {/* SIDEBAR TOGGLE */}
      <div
        style={{...styles.sidebarToggle, right: sidebarOpen ? '300px' : '0'}}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <span style={{color: theme.accent, fontSize: '18px'}}>{sidebarOpen ? '›' : '‹'}</span>
      </div>

      {/* SIDEBAR (Modular Component) */}
      <div style={styles.sidebar(sidebarOpen)}>
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
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

      {/* MAIN CONTENT */}
      <div style={styles.mainContentWrapper}>
        <div style={styles.resultCard}>
          <div style={styles.imageCol}>
              <canvas ref={analyticsCanvasRef} style={{...styles.cropCanvas, display: hasData ? 'block' : 'none'}} />
              {!hasData && <div style={{color: '#333', fontSize: '12px'}}>NO IMAGE</div>}
          </div>

          <div style={styles.infoCol}>
              {isAnalyzing && (
                  <div style={styles.loaderContainer}>
                      <div style={styles.spinner}></div>
                      <span style={styles.loadingText}>Analyzing</span>
                  </div>
              )}

              {!isStreaming && !manualAnalysis ? (
                  <div style={styles.placeholder}>
                      <button style={styles.button} onClick={startCapture}>SELECT WINDOW</button>
                      <div style={{fontSize:'12px', marginTop: '16px', color: theme.textMuted}}>
                        Or use Item Search in the sidebar
                      </div>
                  </div>
              ) : !(currentAnalysis || manualAnalysis) ? (
                  <div style={styles.placeholder}>
                      <div style={{fontSize:'16px', color: theme.accent}}>Waiting for item...</div>
                      <div style={{fontSize:'12px'}}>Open Inventory & Hover Item</div>
                      <div style={{fontSize:'12px', marginTop: '8px', color: theme.textMuted}}>
                        Or use Item Search in the sidebar
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
                      <AdvisorCard analysis={manualAnalysis || currentAnalysis} />
                  </div>
              )}
          </div>
        </div>

        {/* RECYCLE TABS - Shows what current item breaks into */}
        {(manualAnalysis || currentAnalysis) && (manualAnalysis || currentAnalysis).recycleOutputs && (manualAnalysis || currentAnalysis).recycleOutputs.length > 0 && (
          <RecycleTabs outputs={(manualAnalysis || currentAnalysis).recycleOutputs} />
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
        style={styles.infoButton(isStreaming && showDebug)}
        onClick={() => setShowInfo(true)}
        title="About this app"
      >
        i
      </button>

      {/* INFO MODAL */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {/* DISCLAIMER */}
      <div style={styles.disclaimer}>
        ARC Lens is an independent fan project and is not affiliated with, endorsed by, or connected to Embark Studios or ARC Raiders.
      </div>

    </div>
  );
}

export default App;