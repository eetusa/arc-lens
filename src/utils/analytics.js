/**
 * Analytics utility for Umami tracking
 * Provides safe wrappers around window.umami with error handling
 */

/**
 * Check if Umami is loaded and available
 * @returns {boolean}
 */
export function isUmamiAvailable() {
  return typeof window !== 'undefined' &&
         typeof window.umami !== 'undefined' &&
         typeof window.umami.track === 'function';
}

/**
 * Track a custom event with optional data
 * @param {string} eventName - Name of the event
 * @param {object} eventData - Optional data object
 */
export function trackEvent(eventName, eventData = {}) {
  if (!isUmamiAvailable()) {
    // Silent fail - don't spam console in dev or if blocked
    return;
  }

  try {
    window.umami.track(eventName, eventData);
  } catch (error) {
    // Analytics should never break the app
    console.warn('Analytics tracking failed:', error);
  }
}

/**
 * Track item recognition event
 * @param {object} analysis - AdvisorAnalysis object
 */
export function trackItemRecognition(analysis) {
  if (!analysis || !analysis.meta || !analysis.verdict) {
    return;
  }

  const eventData = {
    item: analysis.meta.name,
    verdict: analysis.verdict.action, // "KEEP", "SELL", "RECYCLE", "PREFERENCE"
    itemType: analysis.meta.type,
    rarity: analysis.meta.rarity,
    isPrioritized: analysis.prioritization?.isPrioritized || false
  };

  trackEvent('item_recognized', eventData);
}

/**
 * Track session start (when capture begins)
 */
export function trackSessionStart() {
  trackEvent('session_start', {
    timestamp: Date.now()
  });
}

/**
 * Track session end (when capture stops)
 * @param {number} startTime - Session start timestamp
 */
export function trackSessionEnd(startTime) {
  const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  trackEvent('session_end', {
    duration_seconds: duration,
    timestamp: Date.now()
  });
}

/**
 * Track manual item search
 * @param {string} itemName - Name of manually searched item
 */
export function trackManualSearch(itemName) {
  trackEvent('manual_search', {
    item: itemName,
    timestamp: Date.now()
  });
}
