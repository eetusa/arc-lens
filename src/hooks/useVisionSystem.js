import { useEffect, useRef, useState } from 'react';
import { trackSessionStart, trackSessionEnd, trackItemRecognition } from '../utils/analytics.js';

// NOTE: VisionWorker is dynamically imported only on desktop to prevent
// mobile browsers from loading WASM/SharedArrayBuffer code that can cause crashes

export function useVisionSystem(
  stationLevels,
  activeQuests,
  prioritySettings = {},
  inventoryOverride = false,
  isMobile = false,
  projectPhase = 0,
  questDetectionEnabled = false,
  onQuestsDetected = null
) {
  // --- REFS (Single Source of Truth for Loop) ---
  const videoRef = useRef(null);
  const miniFeedCanvasRef = useRef(null);
  const analyticsCanvasRef = useRef(null);
  const ocrDebugRef = useRef(null);
  const menuDebugRef = useRef(null);
  const mainMenuDebugRef = useRef(null);
  const playTabDebugRef = useRef(null);
  const workerRef = useRef(null);
  const isLooping = useRef(false);
  const offscreenRef = useRef(null);
  const scanDelayRef = useRef(1000);
  const inventoryOverrideRef = useRef(inventoryOverride);
  const questDetectionEnabledRef = useRef(questDetectionEnabled);
  const onQuestsDetectedRef = useRef(onQuestsDetected);
  const sessionStartTimeRef = useRef(null);

  // --- STATE ---
  const [isStreaming, setIsStreaming] = useState(false);
  const [workerStatus, setWorkerStatus] = useState("Initializing...");

  // CHANGED: Stores the AdvisorAnalysis object instead of HTML string
  const [currentAnalysis, setCurrentAnalysis] = useState(null);

  const [hasData, setHasData] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [debugRawText, setDebugRawText] = useState("");
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isInMainMenu, setIsInMainMenu] = useState(false);
  const [isInPlayTab, setIsInPlayTab] = useState(false);

  // Keep override ref in sync with prop
  useEffect(() => {
    inventoryOverrideRef.current = inventoryOverride;
    // When override is active, always use fast scanning
    if (inventoryOverride) {
      scanDelayRef.current = 0;
    }
  }, [inventoryOverride]);

  // Keep quest detection refs in sync with props
  useEffect(() => {
    questDetectionEnabledRef.current = questDetectionEnabled;
  }, [questDetectionEnabled]);

  useEffect(() => {
    onQuestsDetectedRef.current = onQuestsDetected;
  }, [onQuestsDetected]);

  // --- INTERNAL: HANDLE RESULTS ---
  const handleWorkerResult = (payload) => {
    // A. Inventory Logic
    if (typeof payload.isMenuOpen === 'boolean') {
      setIsInventoryOpen(payload.isMenuOpen);
      // Only use slow scanning if both actual detection is false AND override is off
      scanDelayRef.current = (payload.isMenuOpen || inventoryOverrideRef.current) ? 0 : 1000;
    }

    // B. Analytics Image (Canvas Drawing Only)
    if (payload.analytics) {
      // Note: We do NOT update 'currentAnalysis' here because the worker
      // sends 'analysis: null' in this payload while OCR is calculating.
      // We wait for 'RESULT_TEXT_UPDATE' for the data.

      if (analyticsCanvasRef.current && payload.analytics.buffer && payload.analytics.width > 0) {
        const anaCanvas = analyticsCanvasRef.current;
        setHasData(true);
        if (anaCanvas.width !== payload.analytics.width) anaCanvas.width = payload.analytics.width;
        if (anaCanvas.height !== payload.analytics.height) anaCanvas.height = payload.analytics.height;

        const anaCtx = anaCanvas.getContext('2d');
        anaCtx.putImageData(
          new ImageData(new Uint8ClampedArray(payload.analytics.buffer), payload.analytics.width, payload.analytics.height),
          0, 0
        );
      }
    }

    // C. OCR Debug
    if (payload.debug && ocrDebugRef.current) {
      const debugCanvas = ocrDebugRef.current;
      const { width, height, buffer } = payload.debug;
      if (width > 0 && buffer) {
        if (debugCanvas.width !== width) debugCanvas.width = width;
        if (debugCanvas.height !== height) debugCanvas.height = height;
        debugCanvas.getContext('2d').putImageData(
          new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0
        );
      }
    }

    // D. Menu Debug
    if (payload.menuDebug && menuDebugRef.current) {
      const menuCanvas = menuDebugRef.current;
      const { width, height, buffer } = payload.menuDebug;
      if (width > 0 && buffer) {
        if (menuCanvas.width !== width) menuCanvas.width = width;
        if (menuCanvas.height !== height) menuCanvas.height = height;
        menuCanvas.getContext('2d').putImageData(
          new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0
        );
      }
    }

    // E. Main Menu State
    if (typeof payload.isInMainMenu === 'boolean') {
      setIsInMainMenu(payload.isInMainMenu);
    }
    if (typeof payload.isInPlayTab === 'boolean') {
      setIsInPlayTab(payload.isInPlayTab);
    }

    // F. Main Menu Debug
    if (payload.mainMenuDebug && mainMenuDebugRef.current) {
      const mainMenuCanvas = mainMenuDebugRef.current;
      const { width, height, buffer } = payload.mainMenuDebug;
      if (width > 0 && buffer) {
        if (mainMenuCanvas.width !== width) mainMenuCanvas.width = width;
        if (mainMenuCanvas.height !== height) mainMenuCanvas.height = height;
        mainMenuCanvas.getContext('2d').putImageData(
          new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0
        );
      }
    }

    // G. Play Tab Debug
    if (payload.playTabDebug && playTabDebugRef.current) {
      const playTabCanvas = playTabDebugRef.current;
      const { width, height, buffer } = payload.playTabDebug;
      if (width > 0 && buffer) {
        if (playTabCanvas.width !== width) playTabCanvas.width = width;
        if (playTabCanvas.height !== height) playTabCanvas.height = height;
        playTabCanvas.getContext('2d').putImageData(
          new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0
        );
      }
    }
  };

  // --- INTERNAL: CAPTURE SINGLE FRAME ---
  // OPTIMIZED: Uses createImageBitmap instead of getImageData on main thread
  // This avoids CPU-GPU-CPU roundtrip and keeps canvas GPU-accelerated
  const captureSingleFrame = async () => {
    if (!videoRef.current || !workerRef.current || !isLooping.current) return;
    const video = videoRef.current;

    if (video.readyState >= 2) {
      const width = video.videoWidth;
      const height = video.videoHeight;

      // Draw Mini Feed
      if (miniFeedCanvasRef.current) {
        const miniCtx = miniFeedCanvasRef.current.getContext('2d');
        if (miniFeedCanvasRef.current.width !== width) {
          miniFeedCanvasRef.current.width = width;
          miniFeedCanvasRef.current.height = height;
        }
        miniCtx.drawImage(video, 0, 0);
      }

      // OPTIMIZED: Create ImageBitmap directly from video element
      // This is faster than drawing to canvas + getImageData
      // ImageBitmap is transferable, so zero-copy to worker
      const bitmap = await createImageBitmap(video);

      workerRef.current.postMessage({
        type: 'PROCESS_FRAME',
        payload: {
          width: width,
          height: height,
          bitmap: bitmap
        }
      }, [bitmap]); // Transfer ownership to worker

    } else {
      requestAnimationFrame(captureSingleFrame);
    }
  };

  // --- INTERNAL: Schedule next frame capture ---
  // OPTIMIZED: Uses requestVideoFrameCallback when available
  // This syncs with actual video frames instead of display refresh rate
  const scheduleNextFrame = () => {
    if (!isLooping.current) return;

    const video = videoRef.current;
    const delay = scanDelayRef.current;

    if (delay > 0) {
      // Slow scanning mode - use timeout
      setTimeout(() => {
        requestAnimationFrame(captureSingleFrame);
      }, delay);
    } else if (video && 'requestVideoFrameCallback' in video) {
      // Fast mode with requestVideoFrameCallback - sync with actual video frames
      video.requestVideoFrameCallback(() => {
        captureSingleFrame();
      });
    } else {
      // Fallback to requestAnimationFrame
      requestAnimationFrame(captureSingleFrame);
    }
  };

  // --- INIT WORKER & LISTENER ---
  useEffect(() => {
    // Device detection matching useAppMode.js logic:
    // - Phone-sized touch devices (<768px): Skip initialization (can't run game)
    // - Large touch devices (tablets, touchscreen laptops): Allow initialization
    // - Non-touch devices: Allow initialization
    const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    const screenWidth = window.screen?.width || window.innerWidth;
    const isPhoneSized = screenWidth < 768;

    // Only skip for phone-sized touch devices
    // Touchscreen laptops and tablets CAN use the vision system in Game mode
    if (isMobile || (isTouchDevice && isPhoneSized)) {
      setWorkerStatus("Mobile (Vision System Disabled)");
      return;
    }

    // Dynamically import worker only on desktop
    // This prevents mobile from loading WASM/SharedArrayBuffer code
    import('../workers/vision.worker.js?worker').then((module) => {
      const VisionWorker = module.default;

      try {
        workerRef.current = new VisionWorker();
      } catch (e) {
        console.error("Worker Instantiation Error:", e);
        return;
      }

      workerRef.current.onerror = (evt) => {
        setWorkerStatus(`Crashed: ${evt.message || "Unknown Error"}`);
      };

      workerRef.current.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'STATUS') setWorkerStatus(payload);

        if (type === 'OCR_STATUS') setIsAnalyzing(payload.isScanning);
        if (type === 'DEBUG_TEXT') setDebugRawText(payload);

        // CHANGED: Handle Object Update
        if (type === 'RESULT_TEXT_UPDATE') {
          // payload.analysis is the AdvisorAnalysis object
          if (payload.analysis) {
            setCurrentAnalysis(payload.analysis);

            // Track item recognition event
            trackItemRecognition(payload.analysis);
          }
        }

        // Handle detected quests from PLAY tab
        if (type === 'QUESTS_DETECTED') {
          if (onQuestsDetectedRef.current && payload.quests) {
            onQuestsDetectedRef.current(payload.quests);
          }
        }

        // Handle main menu state updates
        if (type === 'MAIN_MENU_STATE') {
          if (typeof payload.isInMainMenu === 'boolean') {
            setIsInMainMenu(payload.isInMainMenu);
          }
          if (typeof payload.isInPlayTab === 'boolean') {
            setIsInPlayTab(payload.isInPlayTab);
          }
        }

        if (type === 'RESULT') {
          handleWorkerResult(payload);

          // --- LOOP TRIGGER ---
          scheduleNextFrame();
        }
      };
    }).catch((err) => {
      console.error("Failed to load vision worker:", err);
      setWorkerStatus("Failed to load vision system");
    });
  }, [isMobile]);

  // --- DATA SYNC ---
  // Merged the two useEffects into one for cleaner logic
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_USER_STATE',
        payload: {
          stationLevels: stationLevels || {},
          activeQuestTitles: activeQuests || [],
          // Priority settings
          devPrioritiesEnabled: prioritySettings.devPrioritiesEnabled ?? true,
          userPrioritiesEnabled: prioritySettings.userPrioritiesEnabled ?? true,
          userPriorities: prioritySettings.userPriorities || [],
          // Inventory override for debug mode
          inventoryOverride: inventoryOverride,
          // Project phase
          projectPhase: projectPhase || 0,
          // Quest auto-detection
          questDetectionEnabled: questDetectionEnabled
        }
      });
    }
  }, [stationLevels, activeQuests, prioritySettings, inventoryOverride, projectPhase, questDetectionEnabled]);

  // --- START CAPTURE ACTION ---
  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always", frameRate: { max: 20 } }, audio: false
      });

      // --- NEW: DETECT STOP SHARING ---
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.onended = () => {
        console.log("Screen share ended by user.");
        stopCapture();
      };

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();

        setIsStreaming(true);
        isLooping.current = true;
        setWorkerStatus("Scanning...");

        // Track session start
        sessionStartTimeRef.current = Date.now();
        trackSessionStart();

        requestAnimationFrame(captureSingleFrame);
      }
    } catch (err) { 
        console.error("Error starting screen capture:", err); 
        // Handle case where user cancels the browser picker immediately
        stopCapture();
    }
  };

  const stopCapture = () => {
    // 1. Stop the loop
    isLooping.current = false;

    // Track session end before clearing state
    if (sessionStartTimeRef.current) {
      trackSessionEnd(sessionStartTimeRef.current);
      sessionStartTimeRef.current = null;
    }

    // 2. Clear video source
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // 3. Reset UI State
    setIsStreaming(false);
    setWorkerStatus("Idle");
    setHasData(false);
    setCurrentAnalysis(null);
    setDebugRawText("");
    setIsInventoryOpen(false);
    setIsInMainMenu(false);
    setIsInPlayTab(false);

    // Optional: Clear canvases visually if you want a complete wipe
    if (analyticsCanvasRef.current) {
      const ctx = analyticsCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, analyticsCanvasRef.current.width, analyticsCanvasRef.current.height);
    }
  };

  return {
    // Refs
    videoRef,
    miniFeedCanvasRef,
    analyticsCanvasRef,
    ocrDebugRef,
    menuDebugRef,
    mainMenuDebugRef,
    playTabDebugRef,

    // State
    isStreaming,
    workerStatus,
    currentAnalysis, // <--- Returns object now, not HTML
    hasData,
    isAnalyzing,
    debugRawText,
    isInventoryOpen: isInventoryOpen || inventoryOverride, // Effective state (actual OR override)
    isInMainMenu,
    isInPlayTab,

    // Actions
    startCapture
  };
}