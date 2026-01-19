// src/workers/menu-checker.js

export class MenuChecker {
    constructor() {
        this.templateMat = null;
        this.ready = false;
        
        // --- CONFIG ---
        this.MATCH_THRESHOLD = 0.30; 
        this.PILL_ASPECT_RATIO_MIN = 2.0;
        this.PILL_WIDTH_MIN = 60; 
        this.PADDING = 6; 
        
        // Lowered threshold to catch anti-aliased/translucent white borders
        this.BINARY_THRESHOLD = 150; 

        // --- MEMORY POOL (Reused Mats) ---
        this.gray = null;
        this.edges = null;
        this.hierarchy = null;
        this.contours = null;
        this.mask = null;
        this.maskedGray = null;
        this.resultMat = null;
        this.debugMat = null;
        this.resizedPill = null;
    }

    init(cv, templateMat) {
        try {
            this.templateMat = new cv.Mat();
            
            // 1. Force Grayscale
            if (templateMat.channels() > 1) {
                cv.cvtColor(templateMat, this.templateMat, cv.COLOR_RGBA2GRAY);
            } else {
                templateMat.copyTo(this.templateMat);
            }
            
            // 2. Threshold the Template
            cv.threshold(this.templateMat, this.templateMat, this.BINARY_THRESHOLD, 255, cv.THRESH_BINARY);

            // 3. Initialize Memory Pool
            this.gray = new cv.Mat();
            this.edges = new cv.Mat();
            this.hierarchy = new cv.Mat();
            this.contours = new cv.MatVector();
            this.mask = new cv.Mat();
            this.maskedGray = new cv.Mat();
            this.resultMat = new cv.Mat();
            this.debugMat = new cv.Mat();
            this.resizedPill = new cv.Mat();

            this.ready = true;
            console.log("MenuChecker: Optimized & Ready.");
        } catch (e) {
            console.error("MenuChecker Init Error:", e);
        }
    }

    check(cv, srcMat) {
        if (!this.ready || !srcMat) return { isOpen: false, debug: null, score: 0 };

        let searchRoi = null;
        let pillMat = null; 

        try {
            const h = srcMat.rows;
            const w = srcMat.cols;

            // --- 1. SEARCH AREA ---
            // OPTIMIZED: Reduced from 60% to 40% width (menu header is always centered)
            // This reduces template matching cost by ~33%
            let x = Math.floor(w * 0.30);
            let y = 0;
            let roiW = Math.floor(w * 0.40);
            let roiH = Math.floor(h * 0.10); 

            let rect = new cv.Rect(x, y, roiW, roiH);
            searchRoi = srcMat.roi(rect);

            // --- 2. DEBUG VIEW (GENERATE IMMEDIATELY) ---
            // We create this NOW so if we fail, you can still see what we looked at.
            this.debugMat.create(searchRoi.rows, searchRoi.cols, cv.CV_8UC3);
            cv.cvtColor(searchRoi, this.debugMat, cv.COLOR_RGBA2RGB);

            // --- 3. GRAYSCALE ---
            this.gray.create(searchRoi.rows, searchRoi.cols, cv.CV_8UC1);
            cv.cvtColor(searchRoi, this.gray, cv.COLOR_RGBA2GRAY);

            // --- 4. THE "BRIGHTNESS GATE" (SAFER FAIL FAST) ---
            // Instead of counting pixels (which fails on thin lines), we check MAX brightness.
            // If the brightest pixel is dark grey (<100), it's definitely just a wall/mud.
            const minMax = cv.minMaxLoc(this.gray);
            if (minMax.maxVal < 100) {
                 // Too dark to contain white UI.
                 // Return the debug image so user sees the dark box, then exit.
                 return this.finalize(cv, false, 0, this.debugMat);
            }

            // --- 5. FIND CANDIDATE CONTOURS ---
            this.edges.create(this.gray.rows, this.gray.cols, cv.CV_8UC1);
            // Lower Canny threshold to catch thin/faint borders
            cv.Canny(this.gray, this.edges, 50, 150);

            cv.findContours(this.edges, this.contours, this.hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let bestPillRect = null;
            let bestCntIndex = -1;

            for (let i = 0; i < this.contours.size(); ++i) {
                let cnt = this.contours.get(i);
                
                // Lower area requirement slightly
                if (cv.contourArea(cnt) > 50) { 
                    let r = cv.boundingRect(cnt);
                    let aspect = r.width / r.height;
                    
                    if (aspect > this.PILL_ASPECT_RATIO_MIN && r.width > this.PILL_WIDTH_MIN) {
                        bestPillRect = r;
                        bestCntIndex = i;
                        cnt.delete();
                        break; 
                    }
                }
                cnt.delete(); 
            }

            if (!bestPillRect) {
                if (this.debug) console.log('No pill found');
                return this.finalize(cv, false, 0, this.debugMat);
            }

            if (this.debug) {
                console.log(`Pill found: ${bestPillRect.width}x${bestPillRect.height}, aspect: ${(bestPillRect.width/bestPillRect.height).toFixed(2)}`);
            }

            // --- 6. MATCHING LOGIC ---
            
            // Draw Candidate on Debug
            cv.rectangle(this.debugMat, 
                new cv.Point(bestPillRect.x, bestPillRect.y), 
                new cv.Point(bestPillRect.x + bestPillRect.width, bestPillRect.y + bestPillRect.height), 
                new cv.Scalar(255, 0, 0), 2);

            // Prepare Mask
            this.mask.create(this.gray.rows, this.gray.cols, cv.CV_8UC1);
            this.mask.setTo(new cv.Scalar(0)); 
            let colorWhite = new cv.Scalar(255);
            cv.drawContours(this.mask, this.contours, bestCntIndex, colorWhite, cv.FILLED);
            
            // Apply Mask
            this.maskedGray.create(this.gray.rows, this.gray.cols, cv.CV_8UC1);
            cv.bitwise_and(this.gray, this.gray, this.maskedGray, this.mask);

            // Crop
            let pX = Math.max(0, bestPillRect.x - this.PADDING);
            let pY = Math.max(0, bestPillRect.y - this.PADDING);
            let pW = Math.min(searchRoi.cols - pX, bestPillRect.width + (this.PADDING * 2));
            let pH = Math.min(searchRoi.rows - pY, bestPillRect.height + (this.PADDING * 2));
            
            let pillRect = new cv.Rect(pX, pY, pW, pH);
            pillMat = this.maskedGray.roi(pillRect);

            // Hybrid Resize/Scale Logic:
            // - Small size difference: upscale pill (preserves template quality)
            // - Large size difference: scale template down (avoids excessive distortion)
            let scaleX = 1.0;
            let scaleY = 1.0;
            let matToMatch = pillMat;
            let templateToUse = this.templateMat;

            const pillTooSmall = pillMat.cols < this.templateMat.cols || pillMat.rows < this.templateMat.rows;

            if (pillTooSmall) {
                // Calculate how much upscaling would be needed
                const upscaleW = this.templateMat.cols / pillMat.cols;
                const upscaleH = this.templateMat.rows / pillMat.rows;
                const maxUpscale = Math.max(upscaleW, upscaleH);

                if (maxUpscale <= 1.15) {
                    // Small difference (<15%): upscale pill to template size (original behavior)
                    let newW = Math.max(pillMat.cols, this.templateMat.cols);
                    let newH = Math.max(pillMat.rows, this.templateMat.rows);

                    scaleX = pillMat.cols / newW;
                    scaleY = pillMat.rows / newH;

                    this.resizedPill.create(newH, newW, cv.CV_8UC1);
                    cv.resize(pillMat, this.resizedPill, new cv.Size(newW, newH), 0, 0, cv.INTER_LINEAR);
                    matToMatch = this.resizedPill;

                    if (this.debug) {
                        console.log(`Upscaled pill: ${newW}x${newH} (factor: ${maxUpscale.toFixed(2)})`);
                    }
                } else {
                    // Large difference (>15%): scale template down to fit in pill
                    const maxTemplateW = pillMat.cols - 4;
                    const maxTemplateH = pillMat.rows - 4;
                    const scaleW = maxTemplateW / this.templateMat.cols;
                    const scaleH = maxTemplateH / this.templateMat.rows;
                    const scale = Math.min(scaleW, scaleH);

                    const newW = Math.round(this.templateMat.cols * scale);
                    const newH = Math.round(this.templateMat.rows * scale);

                    if (!this.scaledTemplate) {
                        this.scaledTemplate = new cv.Mat();
                    }
                    this.scaledTemplate.create(newH, newW, cv.CV_8UC1);
                    cv.resize(this.templateMat, this.scaledTemplate,
                             new cv.Size(newW, newH), 0, 0, cv.INTER_LINEAR);
                    templateToUse = this.scaledTemplate;

                    if (this.debug) {
                        console.log(`Scaled template down: ${newW}x${newH} (scale: ${scale.toFixed(2)})`);
                    }
                }
            }

            cv.threshold(matToMatch, matToMatch, this.BINARY_THRESHOLD, 255, cv.THRESH_BINARY);

            if (this.debug) {
                console.log(`matToMatch: ${matToMatch.cols}x${matToMatch.rows}, templateToUse: ${templateToUse.cols}x${templateToUse.rows}`);
            }

            let resultCols = matToMatch.cols - templateToUse.cols + 1;
            let resultRows = matToMatch.rows - templateToUse.rows + 1;
            this.resultMat.create(resultRows, resultCols, cv.CV_32FC1);

            cv.matchTemplate(matToMatch, templateToUse, this.resultMat, cv.TM_CCOEFF_NORMED);

            let matchVal = cv.minMaxLoc(this.resultMat).maxVal;
            let isMatch = (matchVal >= this.MATCH_THRESHOLD);

            if (isMatch) {
                // Draw Green Match Box
                let maxLoc = cv.minMaxLoc(this.resultMat).maxLoc;
                let relativeX = maxLoc.x * scaleX;
                let relativeY = maxLoc.y * scaleY;
                let drawX = pX + relativeX;
                let drawY = pY + relativeY;
                let drawW = templateToUse.cols * scaleX;
                let drawH = templateToUse.rows * scaleY;

                cv.rectangle(this.debugMat, 
                    new cv.Point(drawX, drawY), 
                    new cv.Point(drawX + drawW, drawY + drawH), 
                    new cv.Scalar(0, 255, 0), 2);
            }
            
            return this.finalize(cv, isMatch, matchVal, this.debugMat);

        } catch (e) {
            console.error("Menu Check Error:", e);
            return { isOpen: false, debug: null, score: 0 };
        } finally {
            if (searchRoi) searchRoi.delete();
            if (pillMat) pillMat.delete();
        }
    }

    finalize(cv, isOpen, score, debugMat) {
        // Convert to Buffer for Transfer
        let finalDebug = new cv.Mat();
        cv.cvtColor(debugMat, finalDebug, cv.COLOR_RGB2RGBA);
        const debugBuffer = new Uint8ClampedArray(finalDebug.data).buffer.slice(0);

        // Clean up the temp mat, but NOT the source debugMat (it's reused)
        finalDebug.delete();

        return {
            isOpen: isOpen,
            score: score,
            debug: {
                width: debugMat.cols,
                height: debugMat.rows,
                buffer: debugBuffer
            }
        };
    }
}