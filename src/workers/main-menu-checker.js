// src/workers/main-menu-checker.js
// Detects main menu state via rainbow stripes in top-left corner

export class MainMenuChecker {
  constructor() {
    this.ready = false;

    // --- CONFIG ---
    // Rainbow stripe color definitions in HSV space
    // OpenCV uses H: 0-180 (not 0-360), S: 0-255, V: 0-255
    this.RAINBOW_COLORS = [
      { name: 'red', hMin: 0, hMax: 10, hMin2: 165, hMax2: 180 },
      { name: 'yellow', hMin: 20, hMax: 35 },
      { name: 'green', hMin: 40, hMax: 70 },
      { name: 'cyan', hMin: 80, hMax: 100 }
    ];

    // Minimum pixels per color to consider a valid detection
    this.MIN_PIXELS_PER_COLOR = 30;

    // Saturation and Value thresholds (filter out grays/dark areas)
    this.MIN_SATURATION = 80;
    this.MIN_VALUE = 100;

    // ROI configuration (percentage of frame)
    this.ROI_WIDTH_PERCENT = 0.03;  // 3% of width
    this.ROI_HEIGHT_PERCENT = 0.08; // 8% of height (to catch the vertical stripe)
    this.ROI_X_OFFSET_PERCENT = 0.005; // Small offset from edge
    this.ROI_Y_OFFSET_PERCENT = 0.01;  // Small offset from top

    // --- MEMORY POOL ---
    this.roiMat = null;
    this.hsvMat = null;
    this.mask = null;
    this.debugMat = null;
  }

  init(cv) {
    try {
      // Initialize reusable mats
      this.roiMat = new cv.Mat();
      this.hsvMat = new cv.Mat();
      this.mask = new cv.Mat();
      this.debugMat = new cv.Mat();

      this.ready = true;
      console.log("MainMenuChecker: Ready");
    } catch (e) {
      console.error("MainMenuChecker Init Error:", e);
    }
  }

  check(cv, srcMat) {
    if (!this.ready || !srcMat) {
      return { isMainMenu: false, debug: null };
    }

    let roiView = null;

    try {
      const h = srcMat.rows;
      const w = srcMat.cols;

      // --- 1. DEFINE ROI (top-left corner) ---
      const roiX = Math.floor(w * this.ROI_X_OFFSET_PERCENT);
      const roiY = Math.floor(h * this.ROI_Y_OFFSET_PERCENT);
      const roiW = Math.floor(w * this.ROI_WIDTH_PERCENT);
      const roiH = Math.floor(h * this.ROI_HEIGHT_PERCENT);

      if (roiW < 10 || roiH < 10) {
        return { isMainMenu: false, debug: null };
      }

      const rect = new cv.Rect(roiX, roiY, roiW, roiH);
      roiView = srcMat.roi(rect);
      roiView.copyTo(this.roiMat);

      // --- 2. CONVERT TO HSV ---
      if (this.roiMat.channels() === 4) {
        cv.cvtColor(this.roiMat, this.hsvMat, cv.COLOR_RGBA2RGB);
        cv.cvtColor(this.hsvMat, this.hsvMat, cv.COLOR_RGB2HSV);
      } else {
        cv.cvtColor(this.roiMat, this.hsvMat, cv.COLOR_RGB2HSV);
      }

      // --- 3. COUNT PIXELS FOR EACH RAINBOW COLOR ---
      const colorCounts = {};
      let detectedColors = 0;

      // Create debug visualization
      this.debugMat.create(this.roiMat.rows, this.roiMat.cols, cv.CV_8UC3);
      cv.cvtColor(this.roiMat, this.debugMat, cv.COLOR_RGBA2RGB);

      for (const color of this.RAINBOW_COLORS) {
        let pixelCount = 0;

        // Create mask for this color range using cv.Scalar
        const lowerBound = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
          new cv.Scalar(color.hMin, this.MIN_SATURATION, this.MIN_VALUE, 0));
        const upperBound = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
          new cv.Scalar(color.hMax, 255, 255, 0));

        cv.inRange(this.hsvMat, lowerBound, upperBound, this.mask);
        pixelCount = cv.countNonZero(this.mask);

        // Handle red's wraparound (two ranges)
        if (color.hMin2 !== undefined) {
          const lowerBound2 = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
            new cv.Scalar(color.hMin2, this.MIN_SATURATION, this.MIN_VALUE, 0));
          const upperBound2 = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
            new cv.Scalar(color.hMax2, 255, 255, 0));

          const mask2 = new cv.Mat();
          cv.inRange(this.hsvMat, lowerBound2, upperBound2, mask2);
          pixelCount += cv.countNonZero(mask2);

          // Combine masks for debug visualization
          cv.bitwise_or(this.mask, mask2, this.mask);

          lowerBound2.delete();
          upperBound2.delete();
          mask2.delete();
        }

        colorCounts[color.name] = pixelCount;

        if (pixelCount >= this.MIN_PIXELS_PER_COLOR) {
          detectedColors++;

          // Draw detected color on debug image
          const debugColor = this.getDebugColor(cv, color.name);
          const colorMask = this.mask.clone();

          // Create colored overlay for detected pixels
          const overlay = new cv.Mat(this.debugMat.rows, this.debugMat.cols, cv.CV_8UC3, debugColor);
          overlay.copyTo(this.debugMat, colorMask);

          colorMask.delete();
          overlay.delete();
        }

        lowerBound.delete();
        upperBound.delete();
      }

      // --- 4. DETERMINE IF MAIN MENU ---
      // Require at least 3 out of 4 rainbow colors to be detected
      const isMainMenu = detectedColors >= 3;

      // --- 5. PREPARE DEBUG OUTPUT ---
      let debugData = null;
      if (this.debugMat.cols > 0 && this.debugMat.rows > 0) {
        // Add detection status text indicator via color border
        const borderColor = isMainMenu ? new cv.Scalar(0, 255, 0, 255) : new cv.Scalar(255, 0, 0, 255);
        cv.rectangle(this.debugMat,
          new cv.Point(0, 0),
          new cv.Point(this.debugMat.cols - 1, this.debugMat.rows - 1),
          borderColor, 2);

        // Convert to RGBA for transfer
        const finalDebug = new cv.Mat();
        cv.cvtColor(this.debugMat, finalDebug, cv.COLOR_RGB2RGBA);
        const debugBuffer = new Uint8ClampedArray(finalDebug.data).buffer.slice(0);

        debugData = {
          width: finalDebug.cols,
          height: finalDebug.rows,
          buffer: debugBuffer
        };

        finalDebug.delete();
      }

      return {
        isMainMenu: isMainMenu,
        colorCounts: colorCounts,
        detectedColors: detectedColors,
        debug: debugData
      };

    } catch (e) {
      console.error("MainMenuChecker Error:", e);
      return { isMainMenu: false, debug: null };
    } finally {
      if (roiView) roiView.delete();
    }
  }

  getDebugColor(cv, colorName) {
    // Return bright versions for debug visualization as cv.Scalar
    const colors = {
      red: [255, 0, 0, 255],
      yellow: [255, 255, 0, 255],
      green: [0, 255, 0, 255],
      cyan: [0, 255, 255, 255]
    };
    const c = colors[colorName] || [255, 255, 255, 255];
    return new cv.Scalar(c[0], c[1], c[2], c[3]);
  }

  destroy() {
    if (this.roiMat) this.roiMat.delete();
    if (this.hsvMat) this.hsvMat.delete();
    if (this.mask) this.mask.delete();
    if (this.debugMat) this.debugMat.delete();
    this.ready = false;
  }
}
