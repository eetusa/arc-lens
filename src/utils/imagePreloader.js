/**
 * Global image preloader - loads item images on app startup
 * Uses manifest to only load images that actually exist (no 404 spam)
 * Images are cached by the browser after first load
 *
 * NOTE: Skipped on mobile devices to reduce memory pressure
 */

/**
 * Simple mobile detection for preloader
 * Checks touch capability and screen size
 */
function isMobileDevice() {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const smallScreen = window.innerWidth <= 768;
  return hasTouch && smallScreen;
}

let preloadStarted = false;
let preloadedCount = 0;
let totalCount = 0;

// Set of image IDs that exist (populated from manifest)
let existingImages = new Set();

export function getPreloadStatus() {
  return { loaded: preloadedCount, total: totalCount };
}

/**
 * Check if an image exists for a given item ID
 * @param {string} itemId - The item ID to check
 * @returns {boolean} - True if image exists
 */
export function hasImage(itemId) {
  return existingImages.has(itemId);
}

export async function preloadAllItemImages() {
  // Only run once
  if (preloadStarted) return;
  preloadStarted = true;

  // Skip preloading on mobile to reduce memory pressure
  if (isMobileDevice()) {
    console.log('[ImagePreloader] Skipped on mobile device');
    return;
  }

  try {
    // Fetch manifest of existing images (generated at build time)
    const response = await fetch('/image-manifest.json');
    const manifest = await response.json();
    const imageIds = manifest.images || [];

    // Populate the set for quick lookups
    existingImages = new Set(imageIds);
    totalCount = imageIds.length;

    console.log(`[ImagePreloader] Starting preload of ${totalCount} images...`);

    // Preload in batches to avoid overwhelming the browser
    const BATCH_SIZE = 20;
    const BATCH_DELAY = 50; // ms between batches

    for (let i = 0; i < imageIds.length; i += BATCH_SIZE) {
      const batch = imageIds.slice(i, i + BATCH_SIZE);

      // Load batch in parallel
      await Promise.all(batch.map(id => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            preloadedCount++;
            resolve();
          };
          img.onerror = () => {
            // Shouldn't happen since we use manifest, but handle gracefully
            preloadedCount++;
            resolve();
          };
          img.src = `/images/${id}.webp`;
        });
      }));

      // Small delay between batches to keep UI responsive
      if (i + BATCH_SIZE < imageIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }

    console.log(`[ImagePreloader] Completed: ${preloadedCount}/${totalCount} images cached`);
  } catch (err) {
    console.error('[ImagePreloader] Failed to preload images:', err);
  }
}
