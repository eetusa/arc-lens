#!/usr/bin/env node
/**
 * Lower Map Calibrator
 *
 * Calibrates lower map variants by using markers placed at the same
 * in-game positions on both upper and lower map images.
 *
 * Process:
 * 1. Detect red markers on upper map image
 * 2. Convert upper pixels to game coordinates using existing transform
 * 3. Detect red markers on lower map image
 * 4. Calculate lowerTransform from coordinates + lower pixels
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPS_CONFIG_PATH = path.join(__dirname, '../public/maps.json');
const CALIBRATION_DIR = path.join(__dirname, '../calibration');

// Load maps configuration
function loadMapsConfig() {
  try {
    return JSON.parse(fs.readFileSync(MAPS_CONFIG_PATH, 'utf-8'));
  } catch (err) {
    console.error('Failed to load maps.json:', err.message);
    return { maps: {} };
  }
}

// Save maps configuration
function saveMapsConfig(config) {
  fs.writeFileSync(MAPS_CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Saved to: ${MAPS_CONFIG_PATH}`);
}

// Convert pixel coordinates to game coordinates using a transform
function pixelsToCoords(pixelX, pixelY, transform) {
  // Reverse of: pixelX = lng * scaleX + offsetX
  // So: lng = (pixelX - offsetX) / scaleX
  const lng = (pixelX - transform.offsetX) / transform.scaleX;
  const lat = (pixelY - transform.offsetY) / transform.scaleY;
  return { lat, lng };
}

// Calculate transform from points (pixels + coords)
function calculateTransform(points) {
  // points = [{ pixelX, pixelY, lat, lng }, ...]
  // We need at least 2 points to solve for scaleX, scaleY, offsetX, offsetY

  if (points.length < 2) {
    console.error('Need at least 2 points to calculate transform');
    return null;
  }

  // Using first two points to solve:
  // pixelX = lng * scaleX + offsetX
  // pixelY = lat * scaleY + offsetY

  const p1 = points[0];
  const p2 = points[1];

  // Solve for scaleX: (p1.pixelX - p2.pixelX) = (p1.lng - p2.lng) * scaleX
  const scaleX = (p1.pixelX - p2.pixelX) / (p1.lng - p2.lng);
  const offsetX = p1.pixelX - p1.lng * scaleX;

  const scaleY = (p1.pixelY - p2.pixelY) / (p1.lat - p2.lat);
  const offsetY = p1.pixelY - p1.lat * scaleY;

  return { scaleX, scaleY, offsetX, offsetY };
}

// Detect red markers in an image
async function detectRedMarkers(imagePath, saveDebug = true) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    console.error('Sharp not available. Install with: npm install sharp');
    return null;
  }

  console.log(`\nAnalyzing: ${path.basename(imagePath)}`);

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  console.log(`  Dimensions: ${metadata.width} x ${metadata.height}`);

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // Find red pixels
  const redPixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Bright red detection
      if (r > 200 && g < 60 && b < 60) {
        redPixels.push({ x, y });
      }
    }
  }

  console.log(`  Found ${redPixels.length} red pixels`);

  if (redPixels.length === 0) {
    return { markers: [], width, height };
  }

  // Cluster red pixels into markers using flood-fill style clustering
  const markers = [];
  const clusterRadius = 50; // Larger radius to catch full marker circles
  const visited = new Set();

  // First pass: group nearby pixels
  const clusters = [];
  for (let i = 0; i < redPixels.length; i++) {
    if (visited.has(i)) continue;

    const cluster = [redPixels[i]];
    visited.add(i);
    const queue = [i];

    while (queue.length > 0) {
      const current = queue.shift();
      const currentPixel = redPixels[current];

      for (let j = 0; j < redPixels.length; j++) {
        if (visited.has(j)) continue;

        const dx = redPixels[j].x - currentPixel.x;
        const dy = redPixels[j].y - currentPixel.y;
        if (Math.sqrt(dx * dx + dy * dy) < clusterRadius) {
          cluster.push(redPixels[j]);
          visited.add(j);
          queue.push(j);
        }
      }
    }

    clusters.push(cluster);
  }

  // Calculate centroids for each cluster
  for (const cluster of clusters) {
    const sumX = cluster.reduce((a, p) => a + p.x, 0);
    const sumY = cluster.reduce((a, p) => a + p.y, 0);
    markers.push({
      x: Math.round(sumX / cluster.length),
      y: Math.round(sumY / cluster.length),
      pixelCount: cluster.length
    });
  }

  // Second pass: merge markers that are still close together (within 100px)
  const mergeRadius = 100;
  const mergedMarkers = [];
  const markerVisited = new Set();

  for (let i = 0; i < markers.length; i++) {
    if (markerVisited.has(i)) continue;

    let totalX = markers[i].x * markers[i].pixelCount;
    let totalY = markers[i].y * markers[i].pixelCount;
    let totalPixels = markers[i].pixelCount;
    markerVisited.add(i);

    for (let j = i + 1; j < markers.length; j++) {
      if (markerVisited.has(j)) continue;

      const dx = markers[j].x - markers[i].x;
      const dy = markers[j].y - markers[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < mergeRadius) {
        totalX += markers[j].x * markers[j].pixelCount;
        totalY += markers[j].y * markers[j].pixelCount;
        totalPixels += markers[j].pixelCount;
        markerVisited.add(j);
      }
    }

    mergedMarkers.push({
      x: Math.round(totalX / totalPixels),
      y: Math.round(totalY / totalPixels),
      pixelCount: totalPixels
    });
  }

  // Sort by position (top-left to bottom-right) for consistent ordering
  mergedMarkers.sort((a, b) => (a.y + a.x) - (b.y + b.x));

  console.log(`  Detected ${mergedMarkers.length} markers:`);
  mergedMarkers.forEach((m, i) => {
    console.log(`    ${i + 1}. (${m.x}, ${m.y}) - ${m.pixelCount} pixels`);
  });

  // Save debug image with markers drawn
  if (saveDebug && mergedMarkers.length > 0) {
    const debugPath = imagePath.replace(/\.(png|jpg|jpeg)$/i, '_debug.png');
    await saveDebugImage(sharp, imagePath, mergedMarkers, width, height, debugPath);
    console.log(`  Debug image saved: ${path.basename(debugPath)}`);
  }

  return { markers: mergedMarkers, width, height };
}

// Save debug image with detected markers highlighted
async function saveDebugImage(sharp, imagePath, markers, width, height, outputPath) {
  // Create SVG overlay with marker circles and labels
  const markerRadius = 30;
  const svgCircles = markers.map((m, i) => `
    <circle cx="${m.x}" cy="${m.y}" r="${markerRadius}" fill="none" stroke="#00ff00" stroke-width="4"/>
    <circle cx="${m.x}" cy="${m.y}" r="${markerRadius + 8}" fill="none" stroke="#000000" stroke-width="2"/>
    <rect x="${m.x - 15}" y="${m.y - 15}" width="30" height="30" fill="#00ff00"/>
    <text x="${m.x}" y="${m.y + 8}" font-size="24" font-weight="bold" text-anchor="middle" fill="#000000">${i + 1}</text>
  `).join('');

  const svgOverlay = `
    <svg width="${width}" height="${height}">
      ${svgCircles}
    </svg>
  `;

  await sharp(imagePath)
    .composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0
    }])
    .png()
    .toFile(outputPath);
}

// Calibrate a single map's lower variant
async function calibrateLowerMap(mapId, mapsConfig) {
  const mapConfig = mapsConfig.maps[mapId];
  if (!mapConfig) {
    console.error(`Map "${mapId}" not found in config`);
    return null;
  }

  if (!mapConfig.transform) {
    console.error(`Map "${mapId}" has no transform - calibrate upper map first`);
    return null;
  }

  if (!mapConfig.lowerImage) {
    console.error(`Map "${mapId}" has no lowerImage configured`);
    return null;
  }

  const upperPath = path.join(CALIBRATION_DIR, `${mapId}___markers.png`);
  const lowerPath = path.join(CALIBRATION_DIR, `${mapId}___markers-lower.png`);

  if (!fs.existsSync(upperPath)) {
    console.error(`Upper calibration image not found: ${upperPath}`);
    return null;
  }

  if (!fs.existsSync(lowerPath)) {
    console.error(`Lower calibration image not found: ${lowerPath}`);
    return null;
  }

  console.log(`\n=== Calibrating ${mapId} lower map ===`);

  // Detect markers on both images
  const upperResult = await detectRedMarkers(upperPath);
  const lowerResult = await detectRedMarkers(lowerPath);

  if (!upperResult || !lowerResult) {
    return null;
  }

  if (upperResult.markers.length < 2) {
    console.error(`Need at least 2 markers on upper map, found ${upperResult.markers.length}`);
    return null;
  }

  if (lowerResult.markers.length < 2) {
    console.error(`Need at least 2 markers on lower map, found ${lowerResult.markers.length}`);
    return null;
  }

  if (upperResult.markers.length !== lowerResult.markers.length) {
    console.error(`Marker count mismatch: upper=${upperResult.markers.length}, lower=${lowerResult.markers.length}`);
    return null;
  }

  // Convert upper pixel positions to game coordinates
  const points = [];
  for (let i = 0; i < upperResult.markers.length; i++) {
    const upperMarker = upperResult.markers[i];
    const lowerMarker = lowerResult.markers[i];

    // Upper pixels -> game coords using existing transform
    const coords = pixelsToCoords(upperMarker.x, upperMarker.y, mapConfig.transform);

    points.push({
      pixelX: lowerMarker.x,
      pixelY: lowerMarker.y,
      lat: coords.lat,
      lng: coords.lng
    });

    console.log(`\n  Point ${i + 1}:`);
    console.log(`    Upper pixel: (${upperMarker.x}, ${upperMarker.y})`);
    console.log(`    Game coords: lat=${coords.lat.toFixed(2)}, lng=${coords.lng.toFixed(2)}`);
    console.log(`    Lower pixel: (${lowerMarker.x}, ${lowerMarker.y})`);
  }

  // Calculate lower transform
  const lowerTransform = calculateTransform(points);

  if (!lowerTransform) {
    return null;
  }

  console.log(`\n  Lower transform:`);
  console.log(`    scaleX: ${lowerTransform.scaleX.toFixed(6)}`);
  console.log(`    scaleY: ${lowerTransform.scaleY.toFixed(6)}`);
  console.log(`    offsetX: ${lowerTransform.offsetX.toFixed(6)}`);
  console.log(`    offsetY: ${lowerTransform.offsetY.toFixed(6)}`);

  // Verify accuracy
  console.log(`\n  Verification:`);
  let totalError = 0;
  for (const point of points) {
    const calcX = point.lng * lowerTransform.scaleX + lowerTransform.offsetX;
    const calcY = point.lat * lowerTransform.scaleY + lowerTransform.offsetY;
    const errorX = Math.abs(calcX - point.pixelX);
    const errorY = Math.abs(calcY - point.pixelY);
    const error = Math.sqrt(errorX * errorX + errorY * errorY);
    totalError += error;
    console.log(`    Point: expected (${point.pixelX}, ${point.pixelY}), calculated (${calcX.toFixed(1)}, ${calcY.toFixed(1)}), error: ${error.toFixed(2)}px`);
  }
  console.log(`    Average error: ${(totalError / points.length).toFixed(2)}px`);

  return lowerTransform;
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Lower Map Calibrator

Calibrates lower map variants using marker images.

Usage:
  node scripts/calibrate-lower-maps.js <mapId>    Calibrate specific map
  node scripts/calibrate-lower-maps.js --all      Calibrate all maps with lower variants

Examples:
  node scripts/calibrate-lower-maps.js blue-gate
  node scripts/calibrate-lower-maps.js --all

Required files in ./calibration/:
  <mapId>___markers.png        Upper map with red markers
  <mapId>___markers-lower.png  Lower map with same markers
`);
    return;
  }

  const mapsConfig = loadMapsConfig();

  if (args[0] === '--all') {
    // Calibrate all maps with lower variants
    const mapsWithLower = Object.keys(mapsConfig.maps).filter(
      id => mapsConfig.maps[id].lowerImage
    );

    console.log(`Maps with lower variants: ${mapsWithLower.join(', ')}`);

    for (const mapId of mapsWithLower) {
      const lowerTransform = await calibrateLowerMap(mapId, mapsConfig);
      if (lowerTransform) {
        mapsConfig.maps[mapId].lowerTransform = lowerTransform;
      }
    }

    saveMapsConfig(mapsConfig);
  } else {
    const mapId = args[0];
    const lowerTransform = await calibrateLowerMap(mapId, mapsConfig);

    if (lowerTransform) {
      mapsConfig.maps[mapId].lowerTransform = lowerTransform;
      saveMapsConfig(mapsConfig);
    }
  }
}

main().catch(console.error);
