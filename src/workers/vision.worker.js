// src/workers/vision.worker.js

import * as ort from 'onnxruntime-web';
import { TooltipFinder } from './tooltip-finder.js';
import { MenuChecker } from './menu-checker.js';
import { AdvisorEngine } from '../logic/advisor-engine.js';
import { findBestMatch } from '../logic/string-utils.js';

// --- GLOBAL STATE ---
ort.env.logLevel = 'error';

let cvReady = false;
let advisor = null;
let ocrSession = null;
let vocab = [];
let menuChecker = null;
let isOcrBusy = false;
let lastHeaderMat = null;
let inventoryOverride = false; // Debug override for menu detection
const mats = { src: null };

// OPTIMIZED: OffscreenCanvas for ImageBitmap processing
// This moves getImageData from main thread to worker thread
let workerCanvas = null;
let workerCtx = null;

// --- PERFORMANCE: Menu Detection Skip (Optimization A) ---
// When menu is confirmed open, skip expensive template matching for N frames
let menuCheckSkipCounter = 0;
const MENU_CHECK_SKIP_INTERVAL = 10; // Re-check every 10 frames (~166ms at 60fps)
let lastMenuState = false;

// --- PERFORMANCE: Adaptive Frame Skip (Optimization B) ---
// When tooltip is stable, progressively skip more frames
let consecutiveIdenticalFrames = 0;
let frameSkipCounter = 0;

// --- FIX: Track if menu was verified this cycle ---
// When we skip menu detection (optimization A), we need to re-verify
// if we detect a NEW item match to prevent garbage matches from HUD/sky
let menuCheckedThisCycle = false;

// NEW: Holds the last confirmed valid item (Image + Text)
// This serves as the "Latch" to prevent bad data from flickering in the UI.
let stableState = {
    analysis: null,
    buffer: null,
    width: 0,
    height: 0
};

// --- 1. INITIALIZATION ---
async function loadOpenCV() {
    if (self.cv) return;
    try {
        const response = await fetch('/opencv.js');
        const scriptText = await response.text();
        (0, eval)(scriptText);
        await waitForCV();
        await initSystems();
    } catch (e) {
        console.error("Worker Load Failed:", e);
    }
}

function waitForCV() {
    return new Promise((resolve) => {
        if (self.cv && self.cv.Mat) return resolve();
        self.Module = { onRuntimeInitialized: () => resolve() };
        const check = setInterval(() => {
            if (self.cv && self.cv.Mat) { clearInterval(check); resolve(); }
        }, 100);
    });
}

async function initSystems() {
    try {
        advisor = new AdvisorEngine();
        await advisor.init();

        // 1. Load Menu Header Template
        menuChecker = new MenuChecker();
        try {
            const resp = await fetch('/menu_header.png');
            const blob = await resp.blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
            const templateMat = new self.cv.Mat(bitmap.height, bitmap.width, self.cv.CV_8UC4);
            templateMat.data.set(imgData.data);
            menuChecker.init(self.cv, templateMat);
            templateMat.delete();
        } catch (err) { console.error("Menu Template Error", err); }

        // 2. Initialize ONNX (Standard Config)
        const root = self.location.origin;

        // 1. Point to the file you ACTUALLY have
        // We map the standard keys to your threaded file just to be safe, 
        // but primarily we set the threaded path.
        ort.env.wasm.wasmPaths = {
            'ort-wasm-simd-threaded.wasm': `${root}/ort-wasm-simd-threaded.wasm`,
            'ort-wasm-simd-threaded.jsep.wasm': `${root}/ort-wasm-simd-threaded.jsep.wasm`,
            'ort-wasm.wasm': `${root}/ort-wasm-simd-threaded.wasm`,
            'ort-wasm-simd.wasm': `${root}/ort-wasm-simd-threaded.wasm`
        };

        // 2. DISABLE THREADING (The "Magic Fix")
        // Even though it's a threaded binary, this forces it to run on the main thread
        // bypassing the need for headers.
        ort.env.wasm.numThreads = 1; 
        ort.env.wasm.proxy = false; 
        ort.env.wasm.simd = true; 

        const modelUrl = `${root}/en_PP-OCRv4_rec_infer.onnx`;
        
        ocrSession = await ort.InferenceSession.create(modelUrl, { 
            executionProviders: ['wasm'] 
        });
        // 3. LOAD & FIX DICTIONARY
        const vocabResp = await fetch('/en_dict.txt');
        const vocabText = await vocabResp.text();
        vocab = vocabText.split(/\r?\n/);
        
        cvReady = true;
        postMessage({ type: 'STATUS', payload: "System Ready (ONNX)" });
    } catch (e) {
        console.error("Init Failed", e);
    }
}

loadOpenCV();

// --- 2. MESSAGE HANDLING ---
self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'UPDATE_USER_STATE' && advisor) {
        advisor.userProgress = payload;
        // Update priority settings in the advisor engine
        advisor.updatePrioritySettings({
            devPrioritiesEnabled: payload.devPrioritiesEnabled,
            userPrioritiesEnabled: payload.userPrioritiesEnabled,
            userPriorities: payload.userPriorities
        });
        // Update inventory override state
        inventoryOverride = payload.inventoryOverride || false;
        return;
    }
    if (!cvReady) return;
    if (type === 'PROCESS_FRAME') processFrame(payload);
};

// --- 3. MAIN LOOP ---
async function processFrame({ width, height, buffer, bitmap }) {
    let analyticsData = null;
    let debugData = null;

    // Reset menu verification flag for this cycle
    menuCheckedThisCycle = false;

    try {
        if (!self.cv || !self.cv.Mat) return;

        // OPTIMIZED: Handle ImageBitmap input (moves getImageData to worker thread)
        let pixelBuffer = buffer;
        if (bitmap) {
            // Initialize or resize worker canvas
            if (!workerCanvas || workerCanvas.width !== width || workerCanvas.height !== height) {
                workerCanvas = new OffscreenCanvas(width, height);
                workerCtx = workerCanvas.getContext('2d', { willReadFrequently: true });
            }
            // Draw bitmap and extract pixel data (now happens off main thread!)
            workerCtx.drawImage(bitmap, 0, 0);
            const imageData = workerCtx.getImageData(0, 0, width, height);
            pixelBuffer = imageData.data.buffer;
            bitmap.close(); // Release the bitmap
        }

        if (mats.src === null) mats.src = new self.cv.Mat(height, width, self.cv.CV_8UC4);
        else if (mats.src.rows !== height || mats.src.cols !== width) {
            mats.src.delete();
            mats.src = new self.cv.Mat(height, width, self.cv.CV_8UC4);
        }
        mats.src.data.set(new Uint8Array(pixelBuffer));

        let isMenuOpen = false;
        let menuDebugData = null;

        // --- OPTIMIZATION A: Skip menu detection while menu is open ---
        // Menu closing requires user action (pressing key/clicking), so we can
        // tolerate ~166ms detection delay (10 frames at 60fps)
        if (menuChecker && menuChecker.ready) {
            if (lastMenuState && menuCheckSkipCounter < MENU_CHECK_SKIP_INTERVAL) {
                // Menu was open last frame - skip expensive template matching
                menuCheckSkipCounter++;
                isMenuOpen = true;
                menuDebugData = null; // No debug data when skipping
            } else {
                // Either menu was closed, or we've reached the re-check interval
                const result = menuChecker.check(self.cv, mats.src);
                isMenuOpen = result.isOpen;
                menuDebugData = result.debug;
                menuCheckedThisCycle = true; // Mark that we verified menu this cycle

                // Update state tracking
                if (isMenuOpen !== lastMenuState) {
                    menuCheckSkipCounter = 0; // Reset on state change
                } else if (isMenuOpen) {
                    menuCheckSkipCounter = 0; // Reset counter after re-check
                }
                lastMenuState = isMenuOpen;
            }
        }

        // Skip processing if menu is not open AND override is not active
        if (!isMenuOpen && !inventoryOverride) {
            // Clear stable state when menu closes so we don't show old items later
            stableState = { analysis: null, buffer: null, width: 0, height: 0 };
            // Reset adaptive skip counters when menu closes
            consecutiveIdenticalFrames = 0;
            frameSkipCounter = 0;

            const transfers = [];
            if (menuDebugData && menuDebugData.buffer) transfers.push(menuDebugData.buffer);
            postMessage({ type: 'RESULT', payload: { isMenuOpen: false, analytics: null, debug: null, menuDebug: menuDebugData } }, transfers);
            return;
        }

        // If override is active, treat as menu open for processing
        const effectiveMenuOpen = isMenuOpen || inventoryOverride;

        const tooltipResult = TooltipFinder.findTooltip(self.cv, mats.src);

        if (tooltipResult.found) {
            const crop = tooltipResult.crop;
            const rows = crop.rows;
            const cols = crop.cols;

            // Strict ROI Calculation
            const topRatio = 0.11;
            let rawStart = Math.floor(cols * topRatio);
            const minHeightCut = Math.floor(rows * 0.04);
            const maxHeightCut = Math.floor(rows * 0.25);
            const yStart = Math.min(Math.max(rawStart, minHeightCut), maxHeightCut);
            const bottomRatio = 0.21;
            let yEnd = Math.floor(cols * bottomRatio);
            yEnd = Math.min(yEnd, rows);
            if (yEnd < yStart + 15) yEnd = Math.min(yStart + 15, rows);

            const roiHeight = yEnd - yStart;
            const xStart = Math.floor(cols * 0.05);
            const roiWidth = Math.floor(cols * 0.90);

            if (roiHeight > 0 && roiWidth > 0) {
                const headerRect = new self.cv.Rect(xStart, yStart, roiWidth, roiHeight);
                const headerRoiWindow = crop.roi(headerRect);
                const headerRoi = headerRoiWindow.clone(); // Clone is MUST
                headerRoiWindow.delete();

                const checkMat = new self.cv.Mat();
                self.cv.cvtColor(headerRoi, checkMat, self.cv.COLOR_RGBA2GRAY);
                const isSame = areImagesIdentical(self.cv, checkMat, lastHeaderMat);

                // --- OPTIMIZATION B: Adaptive frame skip for stable tooltips ---
                // When tooltip hasn't changed, progressively increase skip interval
                // This reduces CPU load when user isn't moving mouse over items
                if (isSame) {
                    consecutiveIdenticalFrames++;
                    checkMat.delete();

                    // Adaptive backoff: skip more frames when tooltip is very stable
                    // After 5 identical frames: skip every 2nd frame
                    // After 10 identical frames: skip every 3rd frame
                    // After 20 identical frames: skip every 4th frame
                    let skipThreshold = 1;
                    if (consecutiveIdenticalFrames >= 20) {
                        skipThreshold = 4;
                    } else if (consecutiveIdenticalFrames >= 10) {
                        skipThreshold = 3;
                    } else if (consecutiveIdenticalFrames >= 5) {
                        skipThreshold = 2;
                    }

                    frameSkipCounter++;
                    if (frameSkipCounter < skipThreshold) {
                        // Skip this frame entirely - early exit
                        headerRoi.delete();
                        crop.delete();
                        const transfers = [];
                        if (menuDebugData && menuDebugData.buffer) transfers.push(menuDebugData.buffer);
                        postMessage({ type: 'RESULT', payload: { isMenuOpen: effectiveMenuOpen, analytics: null, debug: null, menuDebug: menuDebugData } }, transfers);
                        return;
                    }
                    frameSkipCounter = 0;
                } else {
                    // Tooltip changed - reset adaptive skip counters
                    consecutiveIdenticalFrames = 0;
                    frameSkipCounter = 0;
                    isOcrBusy = true;
                    if (lastHeaderMat) lastHeaderMat.delete();
                    lastHeaderMat = checkMat.clone();

                    // Debug Image (Send exactly what we see)
                    const debugBuffer = new Uint8ClampedArray(headerRoi.data).buffer.slice(0);
                    debugData = { width: headerRoi.cols, height: headerRoi.rows, buffer: debugBuffer };

                    // CAPTURE CANDIDATE FOR STABLE STATE
                    // We must clone the crop buffer now because 'crop' will be deleted shortly.
                    const candidateMat = crop.clone();
                    const candidateBuffer = new Uint8ClampedArray(candidateMat.data).buffer.slice(0);
                    const candidateProps = { 
                        width: candidateMat.cols, 
                        height: candidateMat.rows, 
                        buffer: candidateBuffer 
                    };
                    candidateMat.delete();

                    runOcr(headerRoi, candidateProps).then(({ analysis, rawText, didUpdate }) => {
                        // Only notify UI if stableState was actually updated
                        if (didUpdate) {
                            postMessage({ type: 'RESULT_TEXT_UPDATE', payload: { analysis, rawText } });
                        }
                        isOcrBusy = false;
                        postMessage({ type: 'DEBUG_TEXT', payload: rawText });
                    }).catch(e => {
                        console.error("ONNX Fail", e);
                        isOcrBusy = false;
                    });
                    checkMat.delete();
                }
                headerRoi.delete();
            }

            // --- LATCHING LOGIC APPLIED HERE ---
            // We do NOT send 'crop'. We send 'stableState' if it exists.
            if (stableState.analysis && stableState.buffer) {
                // IMPORTANT: We must send a COPY of the buffer. 
                // If we send stableState.buffer directly in the transfer list, it gets detached 
                // and becomes length 0 for the next frame.
                const bufferCopy = stableState.buffer.slice(0);

                analyticsData = { 
                    width: stableState.width, 
                    height: stableState.height, 
                    buffer: bufferCopy, 
                    analysis: stableState.analysis 
                };
            }
            
            crop.delete();
        } else {
            // Tooltip not found - reset adaptive skip counters
            consecutiveIdenticalFrames = 0;
            frameSkipCounter = 0;
            if (lastHeaderMat) { lastHeaderMat.delete(); lastHeaderMat = null; }
        }

        const transferList = [];
        if (analyticsData) transferList.push(analyticsData.buffer); // Transferring the copy
        if (debugData) transferList.push(debugData.buffer);
        if (menuDebugData) transferList.push(menuDebugData.buffer);

        postMessage({
            type: 'RESULT',
            payload: { isMenuOpen: effectiveMenuOpen, analytics: analyticsData, debug: debugData, menuDebug: menuDebugData }
        }, transferList);

    } catch (err) {
        console.error("Process Error", err);
        isOcrBusy = false;
    }
}

function areImagesIdentical(cv, newMat, oldMat) {
    if (!oldMat || oldMat.isDeleted()) return false;
    if (newMat.cols !== oldMat.cols || newMat.rows !== oldMat.rows) return false;
    let diff = new cv.Mat();
    cv.absdiff(newMat, oldMat, diff);
    const changedPixels = cv.countNonZero(diff);
    diff.delete();
    return (changedPixels / (newMat.rows * newMat.cols)) < 0.01;
}

function preprocessForPaddle(cv, srcMat) {
    // 72px works best across both 1080p and 1440p resolutions
    // Combined with i/l/1 homoglyphs in string matching for Roman numerals
    const targetH = 72;
    const minW = 320;

    // 1. GRAYSCALE
    let gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

    // NOTE: Erosion removed - it was causing thin characters like "I" in Roman numerals
    // to merge together, making "III" indistinguishable from "II"

    // 2. INVERT
    let inverted = new cv.Mat();
    cv.bitwise_not(gray, inverted);
    gray.delete();

    // 3. STRETCH
    const stretchFactor = 1.2;
    const ratio = inverted.cols / inverted.rows;
    let newW = Math.floor(targetH * ratio * stretchFactor);

    // 4. RESIZE
    let resized = new cv.Mat();
    cv.resize(inverted, resized, new cv.Size(newW, targetH), 0, 0, cv.INTER_LINEAR);

    // 5. PAD
    const padW = Math.max(minW, newW);
    let padded = new cv.Mat(targetH, padW, cv.CV_8UC1, new cv.Scalar(255));
    let roi = padded.roi(new cv.Rect(0, 0, newW, targetH));
    resized.copyTo(roi);

    // Cleanup
    inverted.delete();
    roi.delete();
    resized.delete();

    // 6. TENSOR
    const count = padW * targetH;
    const floatArr = new Float32Array(3 * count);
    const data = padded.data;

    for (let i = 0; i < count; i++) {
        let val = data[i];
        const norm = (val / 127.5) - 1.0;
        floatArr[i] = norm;
        floatArr[count + i] = norm;
        floatArr[2 * count + i] = norm;
    }

    padded.delete();
    return new ort.Tensor('float32', floatArr, [1, 3, targetH, padW]);
}

function decodeTensorOutput(outputData, dims) {
    const [batch, timeStep, vocabSize] = dims;
    let sb = [];
    let prevIndex = -1;

    for (let t = 0; t < timeStep; t++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        const offset = t * vocabSize;
        
        for (let v = 0; v < vocabSize; v++) {
            const val = outputData[offset + v];
            if (val > maxVal) { maxVal = val; maxIdx = v; }
        }

        if (maxIdx !== prevIndex && maxIdx !== 0 && maxIdx !== (vocabSize - 1)) {
             if (vocab[maxIdx]) sb.push(vocab[maxIdx]);
        }
        prevIndex = maxIdx;
    }
    return sb.join('');
}

async function runOcr(cvMat, candidateImage) {
    try {
        if (!ocrSession || !cvMat) return { analysis: null, rawText: "", didUpdate: false };

        const inputTensor = preprocessForPaddle(self.cv, cvMat);
        const feeds = { x: inputTensor };
        const results = await ocrSession.run(feeds);
        const outputKey = ocrSession.outputNames[0];
        const outputTensor = results[outputKey];
        
        const rawText = decodeTensorOutput(outputTensor.data, outputTensor.dims);
        const cleanText = rawText.trim();

        if (cleanText.length < 2) return { analysis: null, rawText: "...", didUpdate: false };

        const allItemNames = Object.values(advisor.db.items).map(i => i.name);
        const matchName = findBestMatch(cleanText, allItemNames);

        // --- UPDATED LOGIC: Update State ONLY on Match ---
        if (matchName) {
            const analysis = advisor.analyzeItem(matchName, advisor.userProgress);

            // --- FIX: Redundant menu check for NEW matches ---
            // If this is a DIFFERENT item than what we had before, and we haven't
            // verified the menu this cycle, do a redundant check to prevent
            // garbage matches from HUD/sky when menu was actually closed
            const previousItemName = stableState.analysis?.meta?.name;
            const isNewMatch = matchName !== previousItemName;

            if (isNewMatch && !menuCheckedThisCycle) {
                // Do redundant menu verification
                if (menuChecker && menuChecker.ready && mats.src) {
                    const verifyResult = menuChecker.check(self.cv, mats.src);
                    menuCheckedThisCycle = true; // Mark as checked now

                    if (!verifyResult.isOpen) {
                        // Menu is NOT open - this is likely a garbage match
                        // Don't update stableState, don't notify UI
                        console.log(`Redundant menu check failed for "${matchName}" - ignoring garbage match`);
                        return { analysis, rawText: cleanText, didUpdate: false };
                    }
                }
            }

            // Latch the stable state
            stableState.analysis = analysis;
            stableState.width = candidateImage.width;
            stableState.height = candidateImage.height;
            stableState.buffer = candidateImage.buffer; // Store the master buffer

            return { analysis, rawText: cleanText, didUpdate: true };
        }
        
        // If no match found, we do NOT update stableState.
        // We return false for 'didUpdate' so the UI thread knows not to flash text.
        const errorAnalysis = advisor.analyzeItem(cleanText, advisor.userProgress);
        return { analysis: errorAnalysis, rawText: cleanText, didUpdate: false };

    } catch (e) {
        // Fallback for catastrophic failure
        console.error("OCR Run Error", e);
        return { analysis: null, rawText: "ERR", didUpdate: false };
    }
}