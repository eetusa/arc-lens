/**
 * Global image preloader - loads all item images on app startup
 * Images are cached by the browser after first load
 */

let preloadStarted = false;
let preloadedCount = 0;
let totalCount = 0;

export function getPreloadStatus() {
  return { loaded: preloadedCount, total: totalCount };
}

export async function preloadAllItemImages() {
  // Only run once
  if (preloadStarted) return;
  preloadStarted = true;

  try {
    // Fetch item database to get all item IDs
    const response = await fetch('/items_db.json');
    const itemsDb = await response.json();
    const itemIds = Object.keys(itemsDb);
    totalCount = itemIds.length;

    console.log(`[ImagePreloader] Starting preload of ${totalCount} images...`);

    // Preload in batches to avoid overwhelming the browser
    const BATCH_SIZE = 20;
    const BATCH_DELAY = 50; // ms between batches

    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      const batch = itemIds.slice(i, i + BATCH_SIZE);

      // Load batch in parallel
      await Promise.all(batch.map(id => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            preloadedCount++;
            resolve();
          };
          img.onerror = () => {
            // Image doesn't exist, that's fine
            preloadedCount++;
            resolve();
          };
          img.src = `/images/${id}.webp`;
        });
      }));

      // Small delay between batches to keep UI responsive
      if (i + BATCH_SIZE < itemIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }

    console.log(`[ImagePreloader] Completed: ${preloadedCount}/${totalCount} images cached`);
  } catch (err) {
    console.error('[ImagePreloader] Failed to preload images:', err);
  }
}
