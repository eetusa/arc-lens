// src/workers/quest-ocr.js
// Extracts quest names from the QUESTS box when in PLAY tab

import { findBestMatch } from '../logic/string-utils.js';
import * as ort from 'onnxruntime-web';

export class QuestOCR {
  constructor() {
    this.ready = false;
    this.allQuestNames = [];

    // --- CONFIG ---
    // Search area for QUESTS header (left side of screen)
    this.SEARCH_X_PERCENT = 0.025;  // Start 2.5% from left for tighter crop
    this.SEARCH_Y_PERCENT = 0.065;  // Start below rainbow logo and top bar
    this.SEARCH_WIDTH_PERCENT = 0.175;  // 17.5% width
    this.SEARCH_HEIGHT_PERCENT = 0.65; // 65% height to show full quest names area in debug

    // QUESTS header icon color (yellow/orange diamond)
    // Strict filter to reject dark/brown false positives
    this.ICON_H_MIN = 15;   // Tighter hue range for yellow
    this.ICON_H_MAX = 45;
    this.ICON_S_MIN = 150;  // Higher saturation to reject browns (was 100)
    this.ICON_V_MIN = 180;  // Higher value to reject dark colors (was 120)

    // Quest text area (relative to found QUESTS header)
    this.QUEST_TEXT_X_OFFSET = 0.02;   // Offset from header X to text start
    this.QUEST_TEXT_WIDTH = 0.12;      // Width of quest text area
    this.QUEST_LINE_HEIGHT_PERCENT = 0.025; // Approximate height per quest line

    // Text detection settings
    this.MIN_TEXT_HEIGHT = 8;
    this.MAX_TEXT_HEIGHT = 30;

    // OCR target height (same as tooltip OCR)
    this.TARGET_HEIGHT = 72;
    this.MIN_WIDTH = 320;

    // --- MEMORY POOL ---
    this.searchMat = null;
    this.hsvMat = null;
    this.iconMask = null;
    this.roiMat = null;
    this.grayMat = null;
    this.binaryMat = null;
    this.debugMat = null;

    // Debounce: Don't re-OCR if we recently got results
    this.lastOcrTime = 0;
    this.OCR_COOLDOWN_MS = 2000; // Only OCR every 2 seconds
    this.lastDetectedQuests = [];

    // Busy flag to prevent concurrent OCR calls
    this.isBusy = false;

    // Stability tracking - require multiple confirmations before reducing quest count
    this.stableQuestCount = 0;
    this.questReductionConfirmations = 0;
    this.REDUCTION_CONFIRMATIONS_REQUIRED = 3; // Must see fewer quests 3 times to accept
  }

  async init(cv, questNames) {
    try {
      this.allQuestNames = questNames || [];

      this.searchMat = new cv.Mat();
      this.hsvMat = new cv.Mat();
      this.iconMask = new cv.Mat();
      this.roiMat = new cv.Mat();
      this.grayMat = new cv.Mat();
      this.binaryMat = new cv.Mat();
      this.debugMat = new cv.Mat();

      this.ready = true;
      console.log("QuestOCR: Ready with", this.allQuestNames.length, "quest names");
    } catch (e) {
      console.error("QuestOCR Init Error:", e);
    }
  }

  updateQuestNames(questNames) {
    this.allQuestNames = questNames || [];
  }

  // Reset detection state (for testing or when switching contexts)
  reset() {
    this.lastOcrTime = 0;
    this.lastDetectedQuests = [];
    this.isBusy = false;
    this.stableQuestCount = 0;
    this.questReductionConfirmations = 0;
  }

  async detect(cv, srcMat, ocrSession, vocab, onQuestFound = null) {
    if (!this.ready || !srcMat) {
      return { detectedQuests: [], debug: null, questsHeaderFound: false };
    }

    // Busy check - prevent concurrent OCR calls
    if (this.isBusy) {
      console.log('QuestOCR: Skipping - already busy');
      return { detectedQuests: this.lastDetectedQuests, debug: null, fromCache: true, skippedBusy: true };
    }

    // Cooldown check
    const now = Date.now();
    if (now - this.lastOcrTime < this.OCR_COOLDOWN_MS) {
      return { detectedQuests: this.lastDetectedQuests, debug: null, fromCache: true };
    }

    this.isBusy = true;
    let searchView = null;
    let questAreaView = null;

    try {
      const h = srcMat.rows;
      const w = srcMat.cols;

      // --- 1. SEARCH FOR QUESTS HEADER ---
      // Define search area (left side of screen)
      const searchX = Math.floor(w * this.SEARCH_X_PERCENT);
      const searchY = Math.floor(h * this.SEARCH_Y_PERCENT);
      const searchW = Math.floor(w * this.SEARCH_WIDTH_PERCENT);
      const searchH = Math.floor(h * this.SEARCH_HEIGHT_PERCENT);

      if (searchW < 50 || searchH < 50) {
        return { detectedQuests: [], debug: null, questsHeaderFound: false };
      }

      const searchRect = new cv.Rect(searchX, searchY, searchW, searchH);
      searchView = srcMat.roi(searchRect);
      searchView.copyTo(this.searchMat);

      // Create debug image showing search area
      this.debugMat.create(this.searchMat.rows, this.searchMat.cols, cv.CV_8UC3);
      cv.cvtColor(this.searchMat, this.debugMat, cv.COLOR_RGBA2RGB);

      // --- 2. FIND QUESTS HEADER BY YELLOW DIAMOND ICON ---
      // Convert to HSV
      cv.cvtColor(this.searchMat, this.hsvMat, cv.COLOR_RGBA2RGB);
      cv.cvtColor(this.hsvMat, this.hsvMat, cv.COLOR_RGB2HSV);

      // Filter for yellow/orange color of QUESTS icon
      const lowerYellow = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
        new cv.Scalar(this.ICON_H_MIN, this.ICON_S_MIN, this.ICON_V_MIN, 0));
      const upperYellow = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
        new cv.Scalar(this.ICON_H_MAX, 255, 255, 0));

      cv.inRange(this.hsvMat, lowerYellow, upperYellow, this.iconMask);

      lowerYellow.delete();
      upperYellow.delete();

      // Find contours of yellow regions
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(this.iconMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // Look for QUESTS icon - small yellow diamond shape
      // Collect all potential icons, then find the best match
      const potentialIcons = [];

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        const area = rect.width * rect.height;

        // QUESTS icon should be roughly square (diamond)
        // Scale area range by resolution
        const scaleFactor = h / 1080;
        const minArea = 80 * scaleFactor * scaleFactor;
        const maxArea = 1500 * scaleFactor * scaleFactor;

        const aspectRatio = rect.width / rect.height;
        // QUESTS icon is a diamond - bounding box should be roughly square
        const isSquarish = aspectRatio > 0.7 && aspectRatio < 1.4;
        const isRightSize = area > minArea && area < maxArea;

        // Skip if too far right (first 25% of search area width)
        const isLeftAligned = rect.x < searchW * 0.25;

        // Draw ALL detected yellow regions for debugging
        cv.rectangle(this.debugMat,
          new cv.Point(rect.x, rect.y),
          new cv.Point(rect.x + rect.width, rect.y + rect.height),
          new cv.Scalar(128, 128, 0, 255), 1); // Olive for all detections

        if (isSquarish && isRightSize && isLeftAligned) {
          potentialIcons.push({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            area: area
          });

          // Draw potential icon on debug (yellow)
          cv.rectangle(this.debugMat,
            new cv.Point(rect.x, rect.y),
            new cv.Point(rect.x + rect.width, rect.y + rect.height),
            new cv.Scalar(255, 255, 0, 255), 2);
        }
        cnt.delete();
      }

      // Find the QUESTS icon
      let questsHeaderY = -1;
      let questsHeaderX = -1;

      if (potentialIcons.length > 0) {
        // Sort by Y position
        potentialIcons.sort((a, b) => a.y - b.y);

        // Take the lowest valid icon (QUESTS is usually below event boxes)
        // but not too low (must be in upper 80%)
        const maxValidY = searchH * 0.8;
        for (let i = potentialIcons.length - 1; i >= 0; i--) {
          if (potentialIcons[i].y < maxValidY) {
            questsHeaderY = potentialIcons[i].y;
            questsHeaderX = potentialIcons[i].x;

            // Mark selected icon in cyan
            cv.rectangle(this.debugMat,
              new cv.Point(potentialIcons[i].x, potentialIcons[i].y),
              new cv.Point(potentialIcons[i].x + potentialIcons[i].width, potentialIcons[i].y + potentialIcons[i].height),
              new cv.Scalar(0, 255, 255, 255), 3);
            break;
          }
        }
      }

      contours.delete();
      hierarchy.delete();

      if (questsHeaderY === -1) {
        // QUESTS header not found
        const finalDebug = new cv.Mat();
        cv.cvtColor(this.debugMat, finalDebug, cv.COLOR_RGB2RGBA);
        const debugBuffer = new Uint8ClampedArray(finalDebug.data).buffer.slice(0);
        const debugData = { width: finalDebug.cols, height: finalDebug.rows, buffer: debugBuffer };
        finalDebug.delete();

        return { detectedQuests: [], debug: debugData, questsHeaderFound: false };
      }

      // --- 3. CREATE SEPARATE ROI FOR QUEST NAMES (from ORIGINAL image) ---
      // Convert header position from search area coords to original image coords
      const headerYInOriginal = searchY + questsHeaderY;
      const headerRowHeight = Math.floor(h * 0.028); // Height of QUESTS header row

      // Find icon width for centering calculation
      const iconWidth = potentialIcons.length > 0 ?
        potentialIcons.find(i => i.y === questsHeaderY)?.width || 20 : 20;

      // Quest names ROI: starts below header, cuts from original image
      const rowHeight = Math.floor(h * 0.05544);
      const questNamesY = headerYInOriginal + headerRowHeight + Math.floor(rowHeight * 0.3);
      const questNamesX = searchX + questsHeaderX + Math.floor(iconWidth / 2);
      const questNamesW = Math.floor(w * 0.16);
      const questNamesH = Math.floor(h * 0.35);

      // Clamp to image bounds
      const clampedH = Math.min(questNamesH, h - questNamesY - 5);
      if (clampedH < 50 || questNamesW < 50) {
        const finalDebug = new cv.Mat();
        cv.cvtColor(this.debugMat, finalDebug, cv.COLOR_RGB2RGBA);
        const debugBuffer = new Uint8ClampedArray(finalDebug.data).buffer.slice(0);
        const debugData = { width: finalDebug.cols, height: finalDebug.rows, buffer: debugBuffer };
        finalDebug.delete();

        return { detectedQuests: [], debug: debugData, questsHeaderFound: true };
      }

      // Extract quest names area from ORIGINAL image
      const questNamesRect = new cv.Rect(questNamesX, questNamesY, questNamesW, clampedH);
      questAreaView = srcMat.roi(questNamesRect);
      questAreaView.copyTo(this.roiMat);

      // Draw quest names ROI on debug (translate to search area coords)
      const debugQuestY = questsHeaderY + headerRowHeight + Math.floor(rowHeight * 0.3);
      const debugQuestX = questsHeaderX + Math.floor(iconWidth / 2);
      const debugQuestH = Math.min(clampedH, this.debugMat.rows - debugQuestY - 1);
      if (debugQuestH > 0) {
        cv.rectangle(this.debugMat,
          new cv.Point(debugQuestX, debugQuestY),
          new cv.Point(debugQuestX + questNamesW, debugQuestY + debugQuestH),
          new cv.Scalar(0, 255, 0, 255), 2);
      }

      // --- 4. SLICE INTO FIXED ROWS ---
      const maxRows = 8;
      const questRows = [];

      // Colors for alternating row visualization
      const rowColors = [
        new cv.Scalar(255, 100, 100, 255),  // Red
        new cv.Scalar(100, 255, 100, 255),  // Green
        new cv.Scalar(100, 100, 255, 255),  // Blue
        new cv.Scalar(255, 255, 100, 255),  // Yellow
        new cv.Scalar(255, 100, 255, 255),  // Magenta
        new cv.Scalar(100, 255, 255, 255),  // Cyan
        new cv.Scalar(255, 180, 100, 255),  // Orange
        new cv.Scalar(180, 100, 255, 255),  // Purple
      ];

      // Slice ROI into rows
      for (let i = 0; i < maxRows; i++) {
        const rowY = i * rowHeight;
        if (rowY + rowHeight > clampedH) break;

        questRows.push({
          index: i,
          y: rowY,
          height: rowHeight
        });

        // Draw row slice on debug image
        const color = rowColors[i % rowColors.length];
        cv.rectangle(this.debugMat,
          new cv.Point(debugQuestX, debugQuestY + rowY),
          new cv.Point(debugQuestX + questNamesW, debugQuestY + rowY + rowHeight),
          color, 2);

        // Draw row number
        cv.putText(this.debugMat, String(i + 1),
          new cv.Point(debugQuestX + 5, debugQuestY + rowY + rowHeight - 5),
          cv.FONT_HERSHEY_SIMPLEX, 0.5, color, 1);
      }

      // --- 5. OCR EACH ROW ---
      const detectedQuests = [];

      for (const row of questRows) {
        if (!ocrSession) continue;

        // Extract row from quest names ROI
        const rowRect = new cv.Rect(0, row.y, this.roiMat.cols, row.height);
        if (rowRect.y + rowRect.height > this.roiMat.rows) continue;

        const rowView = this.roiMat.roi(rowRect);
        const rowMat = rowView.clone();
        rowView.delete();

        // Convert to grayscale for OCR
        const rowGray = new cv.Mat();
        cv.cvtColor(rowMat, rowGray, cv.COLOR_RGBA2GRAY);

        const tensor = this.preprocessForPaddle(cv, rowGray);
        rowMat.delete();
        rowGray.delete();

        if (!tensor) continue;

        try {
          const feeds = { x: tensor };
          const results = await ocrSession.run(feeds);
          const outputKey = ocrSession.outputNames[0];
          const outputTensor = results[outputKey];

          const rawText = this.decodeTensorOutput(outputTensor.data, outputTensor.dims, vocab);
          const cleanText = rawText.trim();

          if (cleanText.length >= 3) {
            const matchedQuest = findBestMatch(cleanText, this.allQuestNames);

            if (matchedQuest && !detectedQuests.includes(matchedQuest)) {
              detectedQuests.push(matchedQuest);

              // Call incremental callback if provided
              if (onQuestFound) {
                onQuestFound(matchedQuest, [...detectedQuests]);
              }

              // Draw matched row with thick green border
              cv.rectangle(this.debugMat,
                new cv.Point(debugQuestX + 2, debugQuestY + row.y + 2),
                new cv.Point(debugQuestX + questNamesW - 2, debugQuestY + row.y + row.height - 2),
                new cv.Scalar(0, 255, 0, 255), 3);
            }
          }
        } catch (e) {
          console.error(`Quest OCR error (row ${row.index + 1}):`, e);
        }
      }

      // Update cache with stability tracking
      this.lastOcrTime = now;

      // Be conservative about reducing quest count - require multiple confirmations
      const previousCount = this.lastDetectedQuests.length;
      const newCount = detectedQuests.length;

      if (newCount >= previousCount) {
        // Same or more quests - accept immediately
        this.lastDetectedQuests = detectedQuests;
        this.stableQuestCount = newCount;
        this.questReductionConfirmations = 0;
        console.log(`QuestOCR: Found ${newCount} quests (accepted)`);
      } else if (newCount === 0) {
        // Zero quests is likely a detection failure - keep previous results
        console.log(`QuestOCR: Found 0 quests but keeping previous ${previousCount} (likely detection failure)`);
        // Don't update lastDetectedQuests
      } else {
        // Fewer quests - require confirmation
        this.questReductionConfirmations++;
        console.log(`QuestOCR: Found ${newCount} quests (was ${previousCount}), confirmation ${this.questReductionConfirmations}/${this.REDUCTION_CONFIRMATIONS_REQUIRED}`);

        if (this.questReductionConfirmations >= this.REDUCTION_CONFIRMATIONS_REQUIRED) {
          // Confirmed reduction - accept
          this.lastDetectedQuests = detectedQuests;
          this.stableQuestCount = newCount;
          this.questReductionConfirmations = 0;
          console.log(`QuestOCR: Reduction confirmed, now ${newCount} quests`);
        }
        // Otherwise keep previous results
      }

      // --- 6. PREPARE DEBUG OUTPUT ---
      const finalDebug = new cv.Mat();
      cv.cvtColor(this.debugMat, finalDebug, cv.COLOR_RGB2RGBA);
      const debugBuffer = new Uint8ClampedArray(finalDebug.data).buffer.slice(0);

      const debugData = {
        width: finalDebug.cols,
        height: finalDebug.rows,
        buffer: debugBuffer
      };

      finalDebug.delete();

      return {
        detectedQuests: this.lastDetectedQuests, // Return stable results, not raw
        debug: debugData,
        questsHeaderFound: true,
        fromCache: false
      };

    } catch (e) {
      console.error("QuestOCR Error:", e);
      return { detectedQuests: this.lastDetectedQuests, debug: null, questsHeaderFound: false };
    } finally {
      this.isBusy = false;
      if (searchView) searchView.delete();
      if (questAreaView) questAreaView.delete();
    }
  }

  mergeTextRegions(regions) {
    if (regions.length === 0) return [];

    const lines = [];
    let currentLine = null;
    const Y_THRESHOLD = 10; // Pixels to consider same line

    for (const region of regions) {
      if (!currentLine) {
        currentLine = { ...region };
        continue;
      }

      // Check if region is on same line (similar Y)
      if (Math.abs(region.y - currentLine.y) <= Y_THRESHOLD) {
        // Merge into current line
        const newX = Math.min(currentLine.x, region.x);
        const newRight = Math.max(currentLine.x + currentLine.width, region.x + region.width);
        const newY = Math.min(currentLine.y, region.y);
        const newBottom = Math.max(currentLine.y + currentLine.height, region.y + region.height);

        currentLine.x = newX;
        currentLine.y = newY;
        currentLine.width = newRight - newX;
        currentLine.height = newBottom - newY;
      } else {
        // Start new line
        lines.push(currentLine);
        currentLine = { ...region };
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  preprocessForPaddle(cv, srcMat) {
    try {
      // Invert (white text -> black on white for OCR)
      const inverted = new cv.Mat();
      cv.bitwise_not(srcMat, inverted);

      // Resize to target height
      const ratio = srcMat.cols / srcMat.rows;
      let newW = Math.floor(this.TARGET_HEIGHT * ratio);
      const resized = new cv.Mat();
      cv.resize(inverted, resized, new cv.Size(newW, this.TARGET_HEIGHT), 0, 0, cv.INTER_LINEAR);
      inverted.delete();

      // Pad to minimum width
      const padW = Math.max(this.MIN_WIDTH, newW);
      const padded = new cv.Mat(this.TARGET_HEIGHT, padW, cv.CV_8UC1, new cv.Scalar(255));
      const roi = padded.roi(new cv.Rect(0, 0, newW, this.TARGET_HEIGHT));
      resized.copyTo(roi);
      roi.delete();
      resized.delete();

      // Create tensor
      const count = padW * this.TARGET_HEIGHT;
      const floatArr = new Float32Array(3 * count);
      const data = padded.data;

      for (let i = 0; i < count; i++) {
        const val = data[i];
        const norm = (val / 127.5) - 1.0;
        floatArr[i] = norm;
        floatArr[count + i] = norm;
        floatArr[2 * count + i] = norm;
      }

      padded.delete();

      return new ort.Tensor('float32', floatArr, [1, 3, this.TARGET_HEIGHT, padW]);
    } catch (e) {
      console.error("QuestOCR preprocess error:", e);
      return null;
    }
  }

  decodeTensorOutput(outputData, dims, vocab) {
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

  destroy() {
    if (this.searchMat) this.searchMat.delete();
    if (this.hsvMat) this.hsvMat.delete();
    if (this.iconMask) this.iconMask.delete();
    if (this.roiMat) this.roiMat.delete();
    if (this.grayMat) this.grayMat.delete();
    if (this.binaryMat) this.binaryMat.delete();
    if (this.debugMat) this.debugMat.delete();
    this.ready = false;
  }
}
