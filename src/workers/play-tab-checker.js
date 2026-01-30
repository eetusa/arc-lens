// src/workers/play-tab-checker.js
// Detects if the PLAY tab is active when in main menu

export class PlayTabChecker {
  constructor() {
    this.ready = false;

    // --- CONFIG ---
    // Yellow color for the big PLAY button (bottom right of screen)
    // Strict hue range to avoid false positives from white or light yellow
    this.YELLOW_H_MIN = 20;   // Tighter hue range (was 15)
    this.YELLOW_H_MAX = 30;   // Tighter hue range (was 35)
    this.YELLOW_S_MIN = 180;  // Higher saturation min to reject whites (was 150)
    this.YELLOW_S_MAX = 255;
    this.YELLOW_V_MIN = 180;
    this.YELLOW_V_MAX = 255;

    // Detection threshold - percentage of ROI that must be yellow
    this.MIN_YELLOW_PERCENT = 0.92; // 92% of ROI must be yellow

    // ROI configuration - bottom right area where PLAY button appears
    this.ROI_X_PERCENT = 0.913;     // Start at 91.3% from left
    this.ROI_Y_PERCENT = 0.761;     // Start at 76.1% from top
    this.ROI_WIDTH_PERCENT = 0.049; // 4.9% width (zoomed in 7% from each side)
    this.ROI_HEIGHT_PERCENT = 0.071; // 7.1% height

    // --- MEMORY POOL ---
    this.roiMat = null;
    this.hsvMat = null;
    this.mask = null;
    this.debugMat = null;
  }

  init(cv) {
    try {
      this.roiMat = new cv.Mat();
      this.hsvMat = new cv.Mat();
      this.mask = new cv.Mat();
      this.debugMat = new cv.Mat();

      this.ready = true;
      console.log("PlayTabChecker: Ready");
    } catch (e) {
      console.error("PlayTabChecker Init Error:", e);
    }
  }

  check(cv, srcMat) {
    if (!this.ready || !srcMat) {
      return { isPlayTab: false, debug: null };
    }

    let roiView = null;

    try {
      const h = srcMat.rows;
      const w = srcMat.cols;

      // --- 1. DEFINE ROI (header area, left side where tabs are) ---
      const roiX = Math.floor(w * this.ROI_X_PERCENT);
      const roiY = Math.floor(h * this.ROI_Y_PERCENT);
      const roiW = Math.floor(w * this.ROI_WIDTH_PERCENT);
      const roiH = Math.floor(h * this.ROI_HEIGHT_PERCENT);

      if (roiW < 20 || roiH < 10) {
        return { isPlayTab: false, debug: null };
      }

      const rect = new cv.Rect(roiX, roiY, roiW, roiH);
      roiView = srcMat.roi(rect);
      roiView.copyTo(this.roiMat);

      // --- 2. CREATE DEBUG IMAGE ---
      this.debugMat.create(this.roiMat.rows, this.roiMat.cols, cv.CV_8UC3);
      cv.cvtColor(this.roiMat, this.debugMat, cv.COLOR_RGBA2RGB);

      // --- 3. CONVERT TO HSV ---
      if (this.roiMat.channels() === 4) {
        cv.cvtColor(this.roiMat, this.hsvMat, cv.COLOR_RGBA2RGB);
        cv.cvtColor(this.hsvMat, this.hsvMat, cv.COLOR_RGB2HSV);
      } else {
        cv.cvtColor(this.roiMat, this.hsvMat, cv.COLOR_RGB2HSV);
      }

      // --- 4. FILTER FOR YELLOW/GOLD COLOR ---
      const lowerYellow = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
        new cv.Scalar(this.YELLOW_H_MIN, this.YELLOW_S_MIN, this.YELLOW_V_MIN, 0));
      const upperYellow = new cv.Mat(this.hsvMat.rows, this.hsvMat.cols, this.hsvMat.type(),
        new cv.Scalar(this.YELLOW_H_MAX, this.YELLOW_S_MAX, this.YELLOW_V_MAX, 0));

      cv.inRange(this.hsvMat, lowerYellow, upperYellow, this.mask);

      // --- 5. COUNT YELLOW PIXELS AND CALCULATE PERCENTAGE ---
      const yellowPixelCount = cv.countNonZero(this.mask);
      const totalPixels = this.mask.rows * this.mask.cols;
      const yellowPercent = yellowPixelCount / totalPixels;
      const isPlayTab = yellowPercent >= this.MIN_YELLOW_PERCENT;

      // Draw yellow mask on debug image for visualization
      const yellowOverlay = new cv.Mat();
      cv.cvtColor(this.mask, yellowOverlay, cv.COLOR_GRAY2RGB);
      yellowOverlay.copyTo(this.debugMat, this.mask);
      yellowOverlay.delete();

      // Draw status border
      const borderColor = isPlayTab ? new cv.Scalar(0, 255, 0, 255) : new cv.Scalar(255, 0, 0, 255);
      cv.rectangle(this.debugMat,
        new cv.Point(0, 0),
        new cv.Point(this.debugMat.cols - 1, this.debugMat.rows - 1),
        borderColor, 2);

      // --- 7. PREPARE DEBUG OUTPUT ---
      const finalDebug = new cv.Mat();
      cv.cvtColor(this.debugMat, finalDebug, cv.COLOR_RGB2RGBA);
      const debugBuffer = new Uint8ClampedArray(finalDebug.data).buffer.slice(0);

      const debugData = {
        width: finalDebug.cols,
        height: finalDebug.rows,
        buffer: debugBuffer
      };

      finalDebug.delete();
      lowerYellow.delete();
      upperYellow.delete();

      return {
        isPlayTab: isPlayTab,
        yellowPixelCount: yellowPixelCount,
        yellowPercent: yellowPercent,
        debug: debugData
      };

    } catch (e) {
      console.error("PlayTabChecker Error:", e);
      return { isPlayTab: false, debug: null };
    } finally {
      if (roiView) roiView.delete();
    }
  }

  destroy() {
    if (this.roiMat) this.roiMat.delete();
    if (this.hsvMat) this.hsvMat.delete();
    if (this.mask) this.mask.delete();
    if (this.debugMat) this.debugMat.delete();
    this.ready = false;
  }
}
