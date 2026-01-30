#!/usr/bin/env node
/**
 * Map Calibrator for ARC Raiders Maps
 *
 * Calculates coordinate transformation by detecting red markers in calibration images
 * and matching them to Metaforge quest coordinates.
 *
 * Workflow:
 * 1. User provides a map image with red dots placed at known quest locations
 * 2. User specifies which quest the red dots correspond to
 * 3. Tool detects red dot positions in the image
 * 4. Tool looks up Metaforge coordinates for that quest
 * 5. Tool calculates transformation parameters
 *
 * The transformation uses a linear model:
 *   pixelX = (lng - offsetX) * scaleX
 *   pixelY = (lat - offsetY) * scaleY
 *
 * Usage:
 *   node scripts/map-calibrator.js --help
 *   node scripts/map-calibrator.js --image <path> --quest <name>   # Calibrate from image
 *   node scripts/map-calibrator.js --quest <name>                  # Show quest coordinates
 *   node scripts/map-calibrator.js --verify <mapId>                # Verify calibration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METAFORGE_PATH = path.join(__dirname, '../public/metaforge_quests.json');
const MAPS_CONFIG_PATH = path.join(__dirname, '../public/maps.json');

// Load Metaforge quest data
function loadMetaforgeData() {
  try {
    const data = fs.readFileSync(METAFORGE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load metaforge_quests.json:', err.message);
    console.log('Run "node scripts/metaforge-scraper.js --scrape" first.');
    return null;
  }
}

// Load maps configuration
function loadMapsConfig() {
  try {
    if (fs.existsSync(MAPS_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(MAPS_CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load maps.json:', err.message);
  }
  return { maps: {} };
}

// Save maps configuration
function saveMapsConfig(config) {
  fs.writeFileSync(MAPS_CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Saved to: ${MAPS_CONFIG_PATH}`);
}

// Find quest markers by name (fuzzy match)
function findQuestMarkers(metaforgeData, questName) {
  const normalizedSearch = questName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const results = [];

  for (const [mapId, markers] of Object.entries(metaforgeData.questMarkers || {})) {
    for (const marker of markers) {
      const subcategory = (marker.subcategory || '').toLowerCase();
      const instanceName = (marker.instanceName || '').toLowerCase();

      if (subcategory.includes(normalizedSearch) ||
          instanceName.includes(questName.toLowerCase()) ||
          subcategory === normalizedSearch) {
        results.push({
          mapId,
          ...marker,
        });
      }
    }
  }

  return results;
}

// Detect red markers in an image using raw pixel analysis
async function detectRedMarkers(imagePath, saveDebug = false) {
  // Try to use sharp for image processing
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    console.error('Sharp not available. Install with: npm install sharp');
    console.log('\nAlternatively, provide pixel coordinates manually using --manual mode');
    return null;
  }

  console.log(`\nAnalyzing image: ${imagePath}`);

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  console.log(`Image dimensions: ${metadata.width} x ${metadata.height}`);

  // Get raw pixel data
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  console.log(`Channels: ${channels}`);

  // Find red pixels (high R, low G, low B)
  // Use strict thresholds to avoid picking up orange/brown UI elements
  const redPixels = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Bright red detection: R > 200, G < 60, B < 60
      // This is stricter to avoid orange/brown tones in the map UI
      if (r > 200 && g < 60 && b < 60) {
        redPixels.push({ x, y, r, g, b });
      }
    }
  }

  console.log(`Found ${redPixels.length} bright red pixels`);

  if (redPixels.length === 0) {
    console.log('\nNo red markers detected. Try adjusting detection thresholds or use --manual mode.');
    return { markers: [], metadata: { width, height } };
  }

  // Cluster nearby red pixels into markers (simple clustering)
  const markers = [];
  const clusterRadius = 20; // Pixels within this distance belong to same marker
  const visited = new Set();

  for (let i = 0; i < redPixels.length; i++) {
    if (visited.has(i)) continue;

    const cluster = [redPixels[i]];
    visited.add(i);

    // Find all pixels in this cluster
    for (let j = i + 1; j < redPixels.length; j++) {
      if (visited.has(j)) continue;

      const px = redPixels[j];
      const inCluster = cluster.some(cp =>
        Math.sqrt((cp.x - px.x) ** 2 + (cp.y - px.y) ** 2) < clusterRadius
      );

      if (inCluster) {
        cluster.push(px);
        visited.add(j);
      }
    }

    // Calculate cluster center
    if (cluster.length >= 5) { // Minimum pixels to count as a marker
      const centerX = cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length;
      const centerY = cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length;

      markers.push({
        x: Math.round(centerX),
        y: Math.round(centerY),
        pixelCount: cluster.length,
      });
    }
  }

  console.log(`Detected ${markers.length} markers:`);
  markers.forEach((m, i) => {
    console.log(`  Marker ${i + 1}: (${m.x}, ${m.y}) - ${m.pixelCount} pixels`);
  });

  // Save debug image with markers highlighted
  if (saveDebug && markers.length > 0) {
    await saveDebugImage(imagePath, markers, sharp);
  }

  return { markers, metadata: { width, height } };
}

// Save debug image with detected markers highlighted
async function saveDebugImage(imagePath, markers, sharp) {
  const debugPath = imagePath.replace(/\.[^.]+$/, '_debug.png');

  // Create SVG overlays for markers
  const circleRadius = 30;
  const svgCircles = markers.map((m, i) => {
    // Green circle with number
    return `
      <circle cx="${m.x}" cy="${m.y}" r="${circleRadius}" fill="none" stroke="lime" stroke-width="4"/>
      <circle cx="${m.x}" cy="${m.y}" r="${circleRadius + 15}" fill="none" stroke="lime" stroke-width="2"/>
      <text x="${m.x}" y="${m.y - circleRadius - 20}" fill="lime" font-size="40" font-weight="bold" text-anchor="middle">${i + 1}</text>
      <text x="${m.x}" y="${m.y + circleRadius + 45}" fill="lime" font-size="24" text-anchor="middle">(${m.x}, ${m.y})</text>
    `;
  }).join('');

  // Get image dimensions
  const metadata = await sharp(imagePath).metadata();

  const svg = `
    <svg width="${metadata.width}" height="${metadata.height}">
      ${svgCircles}
    </svg>
  `;

  await sharp(imagePath)
    .composite([{
      input: Buffer.from(svg),
      top: 0,
      left: 0,
    }])
    .toFile(debugPath);

  console.log(`\nDebug image saved: ${debugPath}`);
  return debugPath;
}

// Calculate transformation parameters from matched points
// Points format: [{ pixel: {x, y}, coord: {lat, lng} }, ...]
//
// Model: pixelX = coordLng * scaleX + offsetX
//        pixelY = coordLat * scaleY + offsetY
//
// Strategy:
// 1. Calculate SCALE from deltas between all point pairs (independent of offset)
// 2. Average the scales
// 3. Calculate OFFSET from each point using averaged scale
// 4. Average the offsets
// 5. Error reflects marker placement accuracy
function calculateTransform(points) {
  if (points.length < 2) {
    console.error('Need at least 2 reference points for calibration');
    return null;
  }

  // Step 1: Calculate scale from all point pairs
  const scalesX = [];
  const scalesY = [];

  console.log('\n=== Scale Calculations (from point pairs) ===');
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];

      const deltaPixelX = p2.pixel.x - p1.pixel.x;
      const deltaPixelY = p2.pixel.y - p1.pixel.y;
      const deltaLng = p2.coord.lng - p1.coord.lng;
      const deltaLat = p2.coord.lat - p1.coord.lat;

      // Only use pairs with sufficient coordinate difference
      if (Math.abs(deltaLng) > 10) {
        const sx = deltaPixelX / deltaLng;
        scalesX.push(sx);
        console.log(`  Pair ${i+1}-${j+1} scaleX: ${deltaPixelX} / ${deltaLng.toFixed(2)} = ${sx.toFixed(6)}`);
      }
      if (Math.abs(deltaLat) > 10) {
        const sy = deltaPixelY / deltaLat;
        scalesY.push(sy);
        console.log(`  Pair ${i+1}-${j+1} scaleY: ${deltaPixelY} / ${deltaLat.toFixed(2)} = ${sy.toFixed(6)}`);
      }
    }
  }

  if (scalesX.length === 0 || scalesY.length === 0) {
    console.error('Could not calculate scales - points may be too close together');
    return null;
  }

  // Step 2: Average the scales
  const avgScaleX = scalesX.reduce((a, b) => a + b, 0) / scalesX.length;
  const avgScaleY = scalesY.reduce((a, b) => a + b, 0) / scalesY.length;

  console.log(`\n=== Averaged Scales ===`);
  console.log(`  scaleX: ${avgScaleX.toFixed(6)} (from ${scalesX.length} pairs)`);
  console.log(`  scaleY: ${avgScaleY.toFixed(6)} (from ${scalesY.length} pairs)`);

  // Step 3: Calculate offset from each point using averaged scale
  const offsetsX = [];
  const offsetsY = [];

  console.log(`\n=== Offset Calculations (per point) ===`);
  for (const p of points) {
    // pixelX = coordLng * scaleX + offsetX
    // offsetX = pixelX - coordLng * scaleX
    const ox = p.pixel.x - p.coord.lng * avgScaleX;
    const oy = p.pixel.y - p.coord.lat * avgScaleY;
    offsetsX.push(ox);
    offsetsY.push(oy);
    console.log(`  "${p.markerName || 'Point'}": offsetX=${ox.toFixed(2)}, offsetY=${oy.toFixed(2)}`);
  }

  // Step 4: Average the offsets
  const avgOffsetX = offsetsX.reduce((a, b) => a + b, 0) / offsetsX.length;
  const avgOffsetY = offsetsY.reduce((a, b) => a + b, 0) / offsetsY.length;

  console.log(`\n=== Averaged Offsets ===`);
  console.log(`  offsetX: ${avgOffsetX.toFixed(6)}`);
  console.log(`  offsetY: ${avgOffsetY.toFixed(6)}`);

  return {
    scaleX: avgScaleX,
    scaleY: avgScaleY,
    offsetX: avgOffsetX,
    offsetY: avgOffsetY,
  };
}

// Convert lat/lng to pixels using transform
// Model: pixelX = lng * scaleX + offsetX, pixelY = lat * scaleY + offsetY
function coordsToPixels(lat, lng, transform) {
  const x = lng * transform.scaleX + transform.offsetX;
  const y = lat * transform.scaleY + transform.offsetY;
  return { x, y };
}

// Match detected markers with quest coordinates
// This assumes markers are in similar spatial arrangement
// Set allowSingle=true in multi mode to collect single points for combined calibration
function matchMarkersToCoords(detectedMarkers, questCoords, allowSingle = false) {
  if (detectedMarkers.length !== questCoords.length) {
    console.warn(`Warning: ${detectedMarkers.length} markers detected but ${questCoords.length} quest coordinates found.`);
    console.log('Will use the minimum of both for matching.');
  }

  const n = Math.min(detectedMarkers.length, questCoords.length);

  if (n < 2 && !allowSingle) {
    console.error('Need at least 2 points to calibrate');
    return null;
  }

  if (n === 0) {
    return null;
  }

  // Sort both by position to attempt matching
  // Sort markers by Y first (top to bottom), then X (left to right)
  const sortedMarkers = [...detectedMarkers].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 50) return a.y - b.y;
    return a.x - b.x;
  });

  // Sort quest coords similarly by lat (descending for Y), then lng
  const sortedCoords = [...questCoords].sort((a, b) => {
    if (Math.abs(a.lat - b.lat) > 50) return a.lat - b.lat; // Higher lat = lower on map typically
    return a.lng - b.lng;
  });

  // Create matched pairs
  const matched = [];
  for (let i = 0; i < n; i++) {
    matched.push({
      pixel: { x: sortedMarkers[i].x, y: sortedMarkers[i].y },
      coord: { lat: sortedCoords[i].lat, lng: sortedCoords[i].lng },
      markerName: sortedCoords[i].instanceName || sortedCoords[i].subcategory,
    });
  }

  console.log('\n=== Matched Points ===');
  matched.forEach((m, i) => {
    console.log(`  ${i + 1}. "${m.markerName}"`);
    console.log(`     Pixel: (${m.pixel.x}, ${m.pixel.y})`);
    console.log(`     Coord: (${m.coord.lat.toFixed(2)}, ${m.coord.lng.toFixed(2)})`);
  });

  return matched;
}

// Verify calibration against points
function verifyCalibration(transform, points) {
  console.log('\n=== Verification ===');
  let totalError = 0;

  for (const point of points) {
    const calculated = coordsToPixels(point.coord.lat, point.coord.lng, transform);
    const errorX = Math.abs(calculated.x - point.pixel.x);
    const errorY = Math.abs(calculated.y - point.pixel.y);
    const error = Math.sqrt(errorX * errorX + errorY * errorY);
    totalError += error;

    console.log(`"${point.markerName || 'Point'}":`);
    console.log(`  Expected pixel: (${point.pixel.x}, ${point.pixel.y})`);
    console.log(`  Calculated: (${calculated.x.toFixed(1)}, ${calculated.y.toFixed(1)})`);
    console.log(`  Error: ${error.toFixed(1)} pixels`);
  }

  const avgError = totalError / points.length;
  console.log(`\nAverage error: ${avgError.toFixed(1)} pixels`);
  return avgError;
}

// Parse manual point input: "pixelX,pixelY"
function parsePixelCoord(str) {
  const parts = str.split(',').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return { x: parts[0], y: parts[1] };
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
Map Calibrator for ARC Raiders

Detects red markers in calibration images and matches them to Metaforge
quest coordinates to calculate transformation parameters.

Usage:
  node scripts/map-calibrator.js --multi <mapId>                   Calibrate from ALL images (recommended)
  node scripts/map-calibrator.js --image <path> --quest <name>     Calibrate from single image
  node scripts/map-calibrator.js --quest <name>                    Show quest coordinates
  node scripts/map-calibrator.js --verify <mapId>                  Verify calibration
  node scripts/map-calibrator.js --show                            Show all map configs

Multi-image mode (recommended - combines all calibration images):
  node scripts/map-calibrator.js --multi dam

Single-image mode:
  node scripts/map-calibrator.js --image calibration/dam_keeping-the-memory.png --quest "keeping-the-memory"

Examples:
  # Calibrate all maps using all available images:
  node scripts/map-calibrator.js --multi dam
  node scripts/map-calibrator.js --multi spaceport
  node scripts/map-calibrator.js --multi buried-city
  node scripts/map-calibrator.js --multi blue-gate
  node scripts/map-calibrator.js --multi stella-montis
`);
    return;
  }

  const metaforgeData = loadMetaforgeData();
  if (!metaforgeData) return;

  // --quest: Show quest marker coordinates
  if (command === '--quest') {
    const questName = args.slice(1).join(' ');
    if (!questName) {
      console.error('Please provide a quest name');
      return;
    }

    const markers = findQuestMarkers(metaforgeData, questName);
    console.log(`\nFound ${markers.length} markers for "${questName}":\n`);

    // Group by map
    const byMap = {};
    for (const marker of markers) {
      if (!byMap[marker.mapId]) byMap[marker.mapId] = [];
      byMap[marker.mapId].push(marker);
    }

    for (const [mapId, mapMarkers] of Object.entries(byMap)) {
      console.log(`=== ${mapId} ===`);
      for (const marker of mapMarkers) {
        console.log(`  "${marker.instanceName || marker.subcategory}"`);
        console.log(`    lat: ${marker.lat}`);
        console.log(`    lng: ${marker.lng}`);
        console.log('');
      }
    }
  }

  // --image: Auto-detect red markers and calibrate
  else if (command === '--image') {
    const imagePath = args[1];
    const questIdx = args.indexOf('--quest');
    const questName = questIdx >= 0 ? args.slice(questIdx + 1).join(' ') : null;

    if (!imagePath || !questName) {
      console.error('Usage: --image <path> --quest <name>');
      return;
    }

    if (!fs.existsSync(imagePath)) {
      console.error(`Image not found: ${imagePath}`);
      return;
    }

    // Find quest markers
    const questMarkers = findQuestMarkers(metaforgeData, questName);
    if (questMarkers.length === 0) {
      console.error(`No markers found for quest "${questName}"`);
      return;
    }

    // Get map ID from first marker
    const mapId = questMarkers[0].mapId;
    console.log(`\nQuest "${questName}" is on map: ${mapId}`);
    console.log(`Found ${questMarkers.length} Metaforge coordinates`);

    // Detect red markers in image (with debug output)
    const detection = await detectRedMarkers(imagePath, true);
    if (!detection || !detection.markers || detection.markers.length === 0) {
      console.log('\nTry manual mode instead:');
      console.log(`  node scripts/map-calibrator.js --manual ${mapId} --quest "${questName}" --points "x1,y1" "x2,y2"`);
      return;
    }
    const detectedMarkers = detection.markers;

    // Match markers to coordinates
    const matched = matchMarkersToCoords(detectedMarkers, questMarkers);
    if (!matched) return;

    // Calculate transform
    const transform = calculateTransform(matched);
    if (!transform) return;

    console.log('\n=== Calculated Transform ===');
    console.log(`  scaleX: ${transform.scaleX.toFixed(6)}`);
    console.log(`  scaleY: ${transform.scaleY.toFixed(6)}`);
    console.log(`  offsetX: ${transform.offsetX.toFixed(6)}`);
    console.log(`  offsetY: ${transform.offsetY.toFixed(6)}`);

    // Verify
    verifyCalibration(transform, matched);

    // Get image dimensions from detection
    const dimensions = detection.metadata || { width: 4260, height: 3890 };

    // Save to maps.json
    const mapsConfig = loadMapsConfig();
    mapsConfig.maps[mapId] = {
      id: mapId,
      metaforgeId: mapId,
      name: getMapName(mapId),
      image: `/maps/${mapId}.jpg`,
      dimensions,
      transform: {
        scaleX: parseFloat(transform.scaleX.toFixed(6)),
        scaleY: parseFloat(transform.scaleY.toFixed(6)),
        offsetX: parseFloat(transform.offsetX.toFixed(6)),
        offsetY: parseFloat(transform.offsetY.toFixed(6)),
      },
      calibratedAt: new Date().toISOString(),
      calibrationQuest: questName,
      calibrationPoints: matched.length,
    };

    saveMapsConfig(mapsConfig);
    console.log(`\nMap "${mapId}" calibrated successfully!`);
  }

  // --multi: Calibrate using ALL images for a map
  else if (command === '--multi') {
    const mapId = args[1];
    if (!mapId) {
      console.error('Usage: --multi <mapId>');
      console.log('Available maps: dam, spaceport, buried-city, blue-gate, stella-montis');
      return;
    }

    // Find all calibration images for this map
    const calibrationDir = path.join(__dirname, '../calibration');
    if (!fs.existsSync(calibrationDir)) {
      console.error(`Calibration directory not found: ${calibrationDir}`);
      return;
    }

    const files = fs.readdirSync(calibrationDir);
    const mapImages = files.filter(f =>
      f.startsWith(`${mapId}_`) &&
      f.endsWith('.png') &&
      !f.includes('_debug')
    );

    if (mapImages.length === 0) {
      console.error(`No calibration images found for map "${mapId}"`);
      console.log(`Expected files like: ${mapId}_<quest-name>.png in calibration/`);
      return;
    }

    console.log(`\n=== Multi-Image Calibration for ${getMapName(mapId)} ===`);
    console.log(`Found ${mapImages.length} calibration image(s):`);
    mapImages.forEach(f => console.log(`  - ${f}`));

    // Collect all matched points from all images
    const allMatchedPoints = [];
    let dimensions = null;

    for (const imageFile of mapImages) {
      const imagePath = path.join(calibrationDir, imageFile);

      // Extract quest name from filename: mapId_quest-name.png
      const questSlug = imageFile.replace(`${mapId}_`, '').replace('.png', '');

      console.log(`\n--- Processing: ${imageFile} (quest: ${questSlug}) ---`);

      // Find quest markers
      const questMarkers = findQuestMarkers(metaforgeData, questSlug);
      if (questMarkers.length === 0) {
        console.log(`  Warning: No Metaforge markers found for quest "${questSlug}", skipping`);
        continue;
      }

      // Filter to only markers for this map
      const mapQuestMarkers = questMarkers.filter(m => m.mapId === mapId);
      if (mapQuestMarkers.length === 0) {
        console.log(`  Warning: No markers for "${questSlug}" on map "${mapId}", skipping`);
        continue;
      }

      console.log(`  Found ${mapQuestMarkers.length} Metaforge coordinate(s)`);

      // Detect red markers
      const detection = await detectRedMarkers(imagePath, true);
      if (!detection || !detection.markers || detection.markers.length === 0) {
        console.log(`  Warning: No red markers detected, skipping`);
        continue;
      }

      // Store dimensions from first image
      if (!dimensions && detection.metadata) {
        dimensions = detection.metadata;
      }

      console.log(`  Detected ${detection.markers.length} marker(s)`);

      // Match markers to coordinates (allow single points in multi mode)
      const matched = matchMarkersToCoords(detection.markers, mapQuestMarkers, true);
      if (matched && matched.length > 0) {
        console.log(`  Matched ${matched.length} point(s)`);
        allMatchedPoints.push(...matched);
      }
    }

    if (allMatchedPoints.length < 2) {
      console.error(`\nNeed at least 2 matched points total. Got ${allMatchedPoints.length}.`);
      return;
    }

    console.log(`\n=== Combined Calibration (${allMatchedPoints.length} points total) ===`);
    allMatchedPoints.forEach((p, i) => {
      console.log(`  ${i + 1}. "${p.markerName}"`);
      console.log(`     Pixel: (${p.pixel.x}, ${p.pixel.y})`);
      console.log(`     Coord: (${p.coord.lat.toFixed(2)}, ${p.coord.lng.toFixed(2)})`);
    });

    // Calculate transform from all points
    const transform = calculateTransform(allMatchedPoints);
    if (!transform) return;

    console.log('\n=== Calculated Transform ===');
    console.log(`  scaleX: ${transform.scaleX.toFixed(6)}`);
    console.log(`  scaleY: ${transform.scaleY.toFixed(6)}`);
    console.log(`  offsetX: ${transform.offsetX.toFixed(6)}`);
    console.log(`  offsetY: ${transform.offsetY.toFixed(6)}`);

    // Verify
    verifyCalibration(transform, allMatchedPoints);

    // Determine correct image extension
    const mapImageFiles = fs.readdirSync(path.join(__dirname, '../public/maps'));
    const actualMapImage = mapImageFiles.find(f => f.startsWith(mapId) && !f.includes('-lower') && !f.includes('-upper'));
    const imageExt = actualMapImage ? path.extname(actualMapImage) : '.png';

    // Save to maps.json
    const mapsConfig = loadMapsConfig();
    mapsConfig.maps[mapId] = {
      id: mapId,
      metaforgeId: mapId,
      name: getMapName(mapId),
      image: `/maps/${mapId}${imageExt}`,
      dimensions: dimensions || { width: 4260, height: 3890 },
      transform: {
        scaleX: parseFloat(transform.scaleX.toFixed(6)),
        scaleY: parseFloat(transform.scaleY.toFixed(6)),
        offsetX: parseFloat(transform.offsetX.toFixed(6)),
        offsetY: parseFloat(transform.offsetY.toFixed(6)),
      },
      calibratedAt: new Date().toISOString(),
      calibrationImages: mapImages.length,
      calibrationPoints: allMatchedPoints.length,
    };

    saveMapsConfig(mapsConfig);
    console.log(`\nMap "${mapId}" calibrated successfully with ${allMatchedPoints.length} points from ${mapImages.length} image(s)!`);
  }

  // --manual: Manual pixel input mode
  else if (command === '--manual') {
    const mapId = args[1];
    const questIdx = args.indexOf('--quest');
    const pointsIdx = args.indexOf('--points');

    if (!mapId || questIdx < 0) {
      console.error('Usage: --manual <mapId> --quest <name> --points "x1,y1" "x2,y2" ...');
      return;
    }

    const questName = args.slice(questIdx + 1, pointsIdx > questIdx ? pointsIdx : undefined).join(' ');

    // Parse pixel coordinates
    const pixelCoords = [];
    if (pointsIdx >= 0) {
      for (let i = pointsIdx + 1; i < args.length; i++) {
        if (args[i].startsWith('--')) break;
        const coord = parsePixelCoord(args[i]);
        if (coord) pixelCoords.push(coord);
      }
    }

    if (pixelCoords.length < 2) {
      console.error('Need at least 2 pixel coordinates');
      return;
    }

    // Find quest markers for this specific map
    const allMarkers = findQuestMarkers(metaforgeData, questName);
    const questMarkers = allMarkers.filter(m => m.mapId === mapId);

    if (questMarkers.length === 0) {
      console.error(`No markers found for quest "${questName}" on map "${mapId}"`);
      return;
    }

    console.log(`\nQuest "${questName}" on map "${mapId}"`);
    console.log(`Metaforge markers: ${questMarkers.length}`);
    console.log(`Provided pixels: ${pixelCoords.length}`);

    // Match provided pixels with quest coords
    const n = Math.min(pixelCoords.length, questMarkers.length);

    // Sort quest coords by lat (assuming you provided pixels in same order)
    const sortedCoords = [...questMarkers].sort((a, b) => a.lat - b.lat);

    const matched = [];
    for (let i = 0; i < n; i++) {
      matched.push({
        pixel: pixelCoords[i],
        coord: { lat: sortedCoords[i].lat, lng: sortedCoords[i].lng },
        markerName: sortedCoords[i].instanceName || sortedCoords[i].subcategory,
      });
    }

    console.log('\n=== Matched Points ===');
    matched.forEach((m, i) => {
      console.log(`  ${i + 1}. "${m.markerName}"`);
      console.log(`     Pixel: (${m.pixel.x}, ${m.pixel.y})`);
      console.log(`     Coord: (${m.coord.lat.toFixed(2)}, ${m.coord.lng.toFixed(2)})`);
    });

    // Calculate transform
    const transform = calculateTransform(matched);
    if (!transform) return;

    console.log('\n=== Calculated Transform ===');
    console.log(`  scaleX: ${transform.scaleX.toFixed(6)}`);
    console.log(`  scaleY: ${transform.scaleY.toFixed(6)}`);
    console.log(`  offsetX: ${transform.offsetX.toFixed(6)}`);
    console.log(`  offsetY: ${transform.offsetY.toFixed(6)}`);

    // Verify
    verifyCalibration(transform, matched);

    // Save to maps.json
    const mapsConfig = loadMapsConfig();
    mapsConfig.maps[mapId] = {
      id: mapId,
      metaforgeId: mapId,
      name: getMapName(mapId),
      image: `/maps/${mapId}.jpg`,
      dimensions: { width: 4260, height: 3890 }, // Default, can be updated
      transform: {
        scaleX: parseFloat(transform.scaleX.toFixed(6)),
        scaleY: parseFloat(transform.scaleY.toFixed(6)),
        offsetX: parseFloat(transform.offsetX.toFixed(6)),
        offsetY: parseFloat(transform.offsetY.toFixed(6)),
      },
      calibratedAt: new Date().toISOString(),
      calibrationQuest: questName,
      calibrationPoints: matched.length,
    };

    saveMapsConfig(mapsConfig);
    console.log(`\nMap "${mapId}" calibrated successfully!`);
  }

  // --verify: Verify existing calibration
  else if (command === '--verify') {
    const mapId = args[1];
    if (!mapId) {
      console.error('Please provide a map ID');
      return;
    }

    const mapsConfig = loadMapsConfig();
    const mapConfig = mapsConfig.maps[mapId];

    if (!mapConfig || !mapConfig.transform) {
      console.error(`Map "${mapId}" not calibrated.`);
      return;
    }

    console.log(`\nVerifying calibration for: ${mapId}`);
    console.log(`Transform: ${JSON.stringify(mapConfig.transform, null, 2)}`);

    // Get some quest markers for this map to show
    const questMarkers = metaforgeData.questMarkers[mapId] || [];
    console.log(`\nSample quest marker positions (first 10):`);

    for (const marker of questMarkers.slice(0, 10)) {
      const pixel = coordsToPixels(marker.lat, marker.lng, mapConfig.transform);
      console.log(`  "${marker.instanceName || marker.subcategory}":`);
      console.log(`    Coord: (${marker.lat.toFixed(2)}, ${marker.lng.toFixed(2)})`);
      console.log(`    Pixel: (${pixel.x.toFixed(0)}, ${pixel.y.toFixed(0)})`);
    }
  }

  // --show: Show all map configurations
  else if (command === '--show') {
    const mapsConfig = loadMapsConfig();
    console.log('\n=== Map Configurations ===');
    console.log(JSON.stringify(mapsConfig, null, 2));
  }

  else {
    console.error(`Unknown command: ${command}`);
    console.log('Use --help for usage information');
  }
}

// Get display name for map ID
function getMapName(mapId) {
  const names = {
    'dam': 'Dam Battlegrounds',
    'spaceport': 'The Spaceport',
    'buried-city': 'Buried City',
    'blue-gate': 'Blue Gate',
    'stella-montis': 'Stella Montis',
  };
  return names[mapId] || mapId;
}

main().catch(console.error);
