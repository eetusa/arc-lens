import { useEffect, useRef, useState } from 'react';
import VisionWorker from '../workers/vision.worker.js?worker';

export function useVisionSystem(stationLevels, activeQuests) {
  // --- REFS (Single Source of Truth for Loop) ---
  const videoRef = useRef(null);
  const miniFeedCanvasRef = useRef(null);
  const analyticsCanvasRef = useRef(null);
  const ocrDebugRef = useRef(null);
  const menuDebugRef = useRef(null);
  const workerRef = useRef(null);
  const isLooping = useRef(false);
  const offscreenRef = useRef(null);
  const scanDelayRef = useRef(1000);

  // --- STATE ---
  const [isStreaming, setIsStreaming] = useState(false);
  const [workerStatus, setWorkerStatus] = useState("Initializing...");
  
  // CHANGED: Stores the AdvisorAnalysis object instead of HTML string
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  
  const [hasData, setHasData] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [debugRawText, setDebugRawText] = useState("");
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);

  // --- INTERNAL: HANDLE RESULTS ---
  const handleWorkerResult = (payload) => {
    // A. Inventory Logic
    if (typeof payload.isMenuOpen === 'boolean') {
      setIsInventoryOpen(payload.isMenuOpen);
      scanDelayRef.current = payload.isMenuOpen ? 0 : 1000;
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
  };

  // --- INTERNAL: CAPTURE SINGLE FRAME ---
  const captureSingleFrame = () => {
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

      // Prepare Offscreen Canvas
      if (!offscreenRef.current) {
        offscreenRef.current = new OffscreenCanvas(width, height);
      }
      const offscreen = offscreenRef.current;
      if (offscreen.width !== width || offscreen.height !== height) {
        offscreen.width = width;
        offscreen.height = height;
      }

      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);

      workerRef.current.postMessage({
        type: 'PROCESS_FRAME',
        payload: {
          width: imageData.width,
          height: imageData.height,
          buffer: imageData.data.buffer
        }
      }, [imageData.data.buffer]);

    } else {
      requestAnimationFrame(captureSingleFrame);
    }
  };

  // --- INIT WORKER & LISTENER ---
  useEffect(() => {
    try {
      workerRef.current = new VisionWorker();
    } catch (e) {
      console.error("Worker Instantiation Error:", e);
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
        if (payload.analysis) setCurrentAnalysis(payload.analysis);
      }

      if (type === 'RESULT') {
        handleWorkerResult(payload);

        // --- LOOP TRIGGER ---
        if (isLooping.current) {
          if (scanDelayRef.current > 0) {
            setTimeout(() => {
              requestAnimationFrame(captureSingleFrame);
            }, scanDelayRef.current);
          } else {
            requestAnimationFrame(captureSingleFrame);
          }
        }
      }
    };
  }, []);

  // --- DATA SYNC ---
  // Merged the two useEffects into one for cleaner logic
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_USER_STATE',
        payload: {
          stationLevels: stationLevels || {},
          activeQuestTitles: activeQuests || []
        }
      });
    }
  }, [stationLevels, activeQuests]);

  // --- START CAPTURE ACTION ---
  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" }, audio: false
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
    
    // State
    isStreaming,
    workerStatus,
    currentAnalysis, // <--- Returns object now, not HTML
    hasData,
    isAnalyzing,
    debugRawText,
    isInventoryOpen,
    
    // Actions
    startCapture
  };
}