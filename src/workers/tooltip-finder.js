export const TooltipFinder = {
  /**
   * Scans the frame for the large white tooltip box.
   * Includes morphological cleanup to detach scrollbars.
   * DETECTS AND REMOVES "FOLDER TABS" ON TOP.
   * Returns { found: bool, crop: Mat (optional), bounds: Rect }
   */
  findTooltip: (cv, srcMat) => {
    // Declare all Mats outside try block to ensure safe cleanup
    let hsv = new cv.Mat();
    let mask = new cv.Mat();
    let hierarchy = new cv.Mat();
    let contours = new cv.MatVector();

    // Helper Mats for tab detection
    let roiMask = null;
    let rowSums = null;

    let kernel = null;
    let lowerWhite = null;
    let upperWhite = null;
    let roiView = null;

    try {
      // 1. Color Conversion
      if (srcMat.channels() === 4) {
        cv.cvtColor(srcMat, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
      } else {
        cv.cvtColor(srcMat, hsv, cv.COLOR_RGB2HSV);
      }

      // 2. Define Range
      lowerWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 200, 0]);
      upperWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [179, 50, 255, 255]);

      // 3. Create Mask
      cv.inRange(hsv, lowerWhite, upperWhite, mask);

      // --- SEPARATION FIX (Scrollbars) ---
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
      cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

      // 4. Find Contours
      cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestRect = null;
      let maxArea = 0;

      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        try {
          const area = cv.contourArea(cnt);

          if (area > 40000) {
            const rect = cv.boundingRect(cnt);

            if ((rect.width * rect.height) > 45000) {
              if (area > maxArea) {
                maxArea = area;
                bestRect = rect;
              }
            }
          }
        } finally {
          cnt.delete();
        }
      }

      if (bestRect) {
        // ============================================================
        //  NEW: FOLDER TAB DETECTION (Geometric Profile Analysis)
        // ============================================================
        
        // 1. Extract the binary mask for just the detected object
        roiMask = mask.roi(bestRect);
        
        // 2. Reduce 2D image to 1D vertical array (Sum of pixels per row)
        // Result is a Matrix with 1 column and N rows.
        rowSums = new cv.Mat();
        cv.reduce(roiMask, rowSums, 1, cv.REDUCE_SUM, cv.CV_32S);

        // 3. Find the maximum width (the "Main Body" width)
        // Note: Pixel values are 255 for white. 
        // Real Width = value / 255.
        const minMax = cv.minMaxLoc(rowSums);
        const maxWidthVal = minMax.maxVal; // This is (WidthInPixels * 255)

        // 4. Scan from top downwards to find the "shoulder"
        // We assume the tab is at the top. We look for the row where
        // the width becomes consistently close to the max width.
        
        let cutOffset = 0;
        
        // Only scan the top 35% of the height. 
        // If the tab is bigger than 35%, it's arguably part of the body.
        const scanLimit = Math.floor(bestRect.height * 0.35);
        
        // Threshold: If row is > 96% of max width, it is the body.
        // This allows for slight ragged edges or anti-aliasing.
        const bodyThreshold = maxWidthVal * 0.96; 

        for (let y = 0; y < scanLimit; y++) {
           const rowSum = rowSums.intAt(y, 0);
           
           if (rowSum > bodyThreshold) {
               // We hit the wide body!
               cutOffset = y;
               break;
           }
           // If we are here, we are still in the "narrow" tab area
        }

        // 5. Apply the cut if a tab was detected
        if (cutOffset > 0) {
            // Add a tiny buffer (e.g. 2px) to ensure we don't get the messy corner/edge
            const buffer = 2;
            const cleanCut = Math.min(cutOffset + buffer, bestRect.height - 1);
            
            bestRect.y += cleanCut;
            bestRect.height -= cleanCut;
        }

        // Clean up temp mats immediately
        roiMask.delete(); 
        rowSums.delete();
        roiMask = null; 
        rowSums = null;

        // ============================================================
        //  END NEW LOGIC
        // ============================================================

        // Create a View into the srcMat
        roiView = srcMat.roi(bestRect);
        const crop = roiView.clone();

        return { found: true, crop: crop, bounds: bestRect };
      }

      return { found: false, crop: null };

    } catch (err) {
      console.error("TooltipFinder Error:", err);
      return { found: false, crop: null };
    } finally {
      if (hsv) hsv.delete();
      if (mask) mask.delete();
      if (hierarchy) hierarchy.delete();
      if (contours) contours.delete();
      if (lowerWhite) lowerWhite.delete();
      if (upperWhite) upperWhite.delete();
      if (kernel) kernel.delete();
      if (roiView) roiView.delete();
      if (roiMask) roiMask.delete();
      if (rowSums) rowSums.delete();
    }
  }
};