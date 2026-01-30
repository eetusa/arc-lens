/**
 * Map Coordinate Utilities
 *
 * Transforms Metaforge lat/lng coordinates to pixel positions on map images
 * using calibrated transformation parameters.
 */

/**
 * Convert Metaforge coordinates (lat/lng) to pixel position
 * @param {number} lat - Metaforge latitude
 * @param {number} lng - Metaforge longitude
 * @param {Object} transform - Calibrated transform parameters
 * @returns {{x: number, y: number}} Pixel position
 */
export function coordsToPixels(lat, lng, transform) {
  const x = lng * transform.scaleX + transform.offsetX;
  const y = lat * transform.scaleY + transform.offsetY;
  return { x, y };
}

/**
 * Convert pixel position to Metaforge coordinates
 * @param {number} x - Pixel X
 * @param {number} y - Pixel Y
 * @param {Object} transform - Calibrated transform parameters
 * @returns {{lat: number, lng: number}} Metaforge coordinates
 */
export function pixelsToCoords(x, y, transform) {
  const lng = (x - transform.offsetX) / transform.scaleX;
  const lat = (y - transform.offsetY) / transform.scaleY;
  return { lat, lng };
}

/**
 * Calculate bounding box for a set of markers
 * @param {Array} markers - Array of markers with lat/lng
 * @param {Object} transform - Calibrated transform parameters
 * @param {number} padding - Padding in pixels
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
export function getMarkerBounds(markers, transform, padding = 50) {
  if (!markers || markers.length === 0) return null;

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const marker of markers) {
    const { x, y } = coordsToPixels(marker.lat, marker.lng, transform);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * Calculate zoom and pan to fit markers in view
 * @param {Array} markers - Array of markers with lat/lng
 * @param {Object} transform - Calibrated transform parameters
 * @param {number} viewWidth - Viewport width
 * @param {number} viewHeight - Viewport height
 * @returns {{zoom: number, panX: number, panY: number}}
 */
export function fitMarkersInView(markers, transform, viewWidth, viewHeight) {
  const bounds = getMarkerBounds(markers, transform, 100);
  if (!bounds) return { zoom: 1, panX: 0, panY: 0 };

  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;

  // Calculate zoom to fit bounds
  const zoomX = viewWidth / boundsWidth;
  const zoomY = viewHeight / boundsHeight;
  const zoom = Math.min(zoomX, zoomY, 2); // Cap at 2x zoom

  // Calculate center of bounds
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  // Calculate pan to center the bounds
  const panX = viewWidth / 2 - centerX * zoom;
  const panY = viewHeight / 2 - centerY * zoom;

  return { zoom, panX, panY };
}
