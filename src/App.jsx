import { useEffect, useState } from 'react';
import { styles, theme } from './styles';

// --- IMPORTS ---
import StationPanel from './components/StationPanel';
import AdvisorCard from './components/AdvisorCard'; // <--- NEW IMPORT
import { usePersistentState } from './hooks/usePersistentState';
import { useVisionSystem } from './hooks/useVisionSystem';

function App() {
  // --- UI STATE ---
  const [showDebug, setShowDebug] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allQuestNames, setAllQuestNames] = useState([]);

  // --- HOOKS ---
  const { 
    stationLevels, 
    setStationLevels, 
    activeQuests, 
    setActiveQuests 
  } = usePersistentState();

  // --- VISION SYSTEM HOOK ---
  const {
    videoRef,
    miniFeedCanvasRef,
    analyticsCanvasRef,
    ocrDebugRef,
    menuDebugRef,
    isStreaming,
    workerStatus,
    currentAnalysis, // <--- CHANGED: Using object instead of HTML string
    hasData,
    isAnalyzing,
    debugRawText,
    isInventoryOpen,
    startCapture
  } = useVisionSystem(stationLevels, activeQuests);

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    fetch('/quests.json')
      .then(res => res.json())
      .then(data => setAllQuestNames(Object.keys(data)))
      .catch(e => console.error("Quest load error", e));
  }, []);

  // --- HANDLERS ---
  const handleStationUpdate = (name, level) => {
    setStationLevels(prev => ({ ...prev, [name]: level }));
  };
  const handleQuestAdd = (quest) => {
    if (!activeQuests.includes(quest)) setActiveQuests(prev => [...prev, quest]);
  };
  const handleQuestRemove = (quest) => {
    setActiveQuests(prev => prev.filter(q => q !== quest));
  };

  // --- RENDER ---
  return (
    <div style={styles.container}>
      
      {/* STATUS BAR */}
      <div style={styles.statusBar}>
        <div style={styles.ledContainer}>
            <div style={styles.led(isInventoryOpen)}></div>
            <span style={styles.ledText(isInventoryOpen)}>
                {isInventoryOpen ? "INVENTORY OPEN" : "INVENTORY CLOSED"}
            </span>
        </div>
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
        style={{...styles.sidebarToggle, right: sidebarOpen ? '320px' : '0'}} 
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
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

      {/* MAIN CONTENT */}
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

            {!isStreaming ? (
                <div style={styles.placeholder}>
                    <button style={styles.button} onClick={startCapture}>SELECT WINDOW</button>
                </div>
            ) : !currentAnalysis ? ( // <--- CHECK OBJECT HERE
                <div style={styles.placeholder}>
                    <div style={{fontSize:'16px', color: theme.accent}}>Waiting for item...</div>
                    <div style={{fontSize:'12px'}}>Open Inventory & Hover Item</div>
                </div>
            ) : (
                <div style={{ 
                    opacity: isAnalyzing ? 0.5 : 1, 
                    transition: 'opacity 0.2s',
                    /* CRITICAL FIXES START */
                    flex: 1,                // Grow to fill infoCol
                    height: '100%',         // Force explicit height context
                    minHeight: 0,           // Allow flex shrinking
                    display: 'flex',        // Pass flex context down
                    flexDirection: 'column',
                    overflow: 'hidden'      // Hard clip anything spilling out
                    /* CRITICAL FIXES END */
                }}>
                    <AdvisorCard analysis={currentAnalysis} />
                </div>
            )}
        </div>
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

    </div>
  );
}

export default App;