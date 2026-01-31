#!/usr/bin/env node
/**
 * Metaforge API Scraper for ARC Raiders Quest Markers
 *
 * Fetches map marker data from the Metaforge API for all game maps.
 * Extracts quest-related markers with coordinates for map display.
 *
 * API Endpoint:
 *   https://metaforge.app/api/game-map-data?mapID={mapID}&tableID=arc_map_data
 *
 * Map IDs:
 *   - dam (Dam Battlegrounds)
 *   - spaceport (The Spaceport)
 *   - buried-city (Buried City)
 *   - blue-gate (Blue Gate)
 *   - stella-montis (Stella Montis)
 *
 * Usage:
 *   node scripts/metaforge-scraper.js --help           # Show commands
 *   node scripts/metaforge-scraper.js --scrape         # Scrape all maps
 *   node scripts/metaforge-scraper.js --scrape dam     # Scrape single map
 *   node scripts/metaforge-scraper.js --categories     # List all categories found
 *   node scripts/metaforge-scraper.js --quests         # Show quest markers only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'https://metaforge.app/api/game-map-data';
const TABLE_ID = 'arc_map_data';
const OUTPUT_PATH = path.join(__dirname, '../public/metaforge_quests.json');
const FULL_DATA_PATH = path.join(__dirname, '../.metaforge-cache.json');

// Rate limiting
const DELAY_MS = 500;

// Map configurations
const MAPS = {
  dam: {
    id: 'dam',
    name: 'Dam Battlegrounds',
    metaforgeId: 'dam',
  },
  spaceport: {
    id: 'spaceport',
    name: 'The Spaceport',
    metaforgeId: 'spaceport',
  },
  'buried-city': {
    id: 'buried-city',
    name: 'Buried City',
    metaforgeId: 'buried-city',
  },
  'blue-gate': {
    id: 'blue-gate',
    name: 'Blue Gate',
    metaforgeId: 'blue-gate',
  },
  'stella-montis': {
    id: 'stella-montis',
    name: 'Stella Montis',
    metaforgeId: 'stella-montis',
  },
};

// Helper: delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch map data from Metaforge API
async function fetchMapData(mapId) {
  const url = `${API_BASE}?mapID=${mapId}&tableID=${TABLE_ID}`;
  console.log(`  Fetching: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  Failed to fetch ${mapId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.allData || [];
  } catch (err) {
    console.error(`  Error fetching ${mapId}:`, err.message);
    return null;
  }
}

// Analyze categories in the data
function analyzeCategories(allData) {
  const categories = new Map();
  const subcategories = new Map();

  for (const marker of allData) {
    const cat = marker.category || 'unknown';
    const subcat = marker.subcategory || 'unknown';
    const key = `${cat}/${subcat}`;

    categories.set(cat, (categories.get(cat) || 0) + 1);
    subcategories.set(key, (subcategories.get(key) || 0) + 1);
  }

  return { categories, subcategories };
}

// Filter for quest-related markers
function filterQuestMarkers(allData) {
  return allData.filter(marker => {
    // Look for quest category
    if (marker.category === 'quests') return true;

    // Look for quest-related subcategories or instance names
    const subcat = (marker.subcategory || '').toLowerCase();
    const name = (marker.instanceName || '').toLowerCase();

    if (subcat.includes('quest')) return true;
    if (name.includes('quest')) return true;

    // Look for objective-related markers
    if (subcat.includes('objective')) return true;
    if (subcat.includes('photograph')) return true;
    if (subcat.includes('deliver')) return true;

    return false;
  });
}

// Filter for location markers (POIs)
function filterLocationMarkers(allData) {
  return allData.filter(marker => {
    return marker.category === 'locations' ||
           marker.category === 'poi' ||
           (marker.instanceName && marker.instanceName.length > 0);
  });
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
Metaforge API Scraper for ARC Raiders

Usage:
  node scripts/metaforge-scraper.js --scrape           Scrape all maps
  node scripts/metaforge-scraper.js --scrape <mapId>   Scrape single map
  node scripts/metaforge-scraper.js --categories       List all categories
  node scripts/metaforge-scraper.js --quests           Show quest markers
  node scripts/metaforge-scraper.js --locations        Show location markers
  node scripts/metaforge-scraper.js --sample <mapId>   Show sample markers

Map IDs: dam, spaceport, buried-city, blue-gate, stella-montis

Examples:
  node scripts/metaforge-scraper.js --scrape
  node scripts/metaforge-scraper.js --scrape dam
  node scripts/metaforge-scraper.js --categories
  node scripts/metaforge-scraper.js --sample dam
`);
    return;
  }

  if (command === '--scrape') {
    const specificMap = args[1];
    const mapsToScrape = specificMap ? { [specificMap]: MAPS[specificMap] } : MAPS;

    if (specificMap && !MAPS[specificMap]) {
      console.error(`Unknown map: ${specificMap}`);
      console.log(`Available maps: ${Object.keys(MAPS).join(', ')}`);
      return;
    }

    console.log('Scraping Metaforge map data...\n');

    const allMapData = {};
    const questMarkers = {};
    const locationMarkers = {};

    for (const [mapKey, mapConfig] of Object.entries(mapsToScrape)) {
      console.log(`\n=== ${mapConfig.name} (${mapKey}) ===`);

      const data = await fetchMapData(mapConfig.metaforgeId);
      if (!data) {
        console.log(`  Skipped due to error`);
        continue;
      }

      console.log(`  Total markers: ${data.length}`);

      // Analyze categories
      const { categories, subcategories } = analyzeCategories(data);
      console.log(`  Categories: ${[...categories.entries()].map(([k, v]) => `${k}(${v})`).join(', ')}`);

      // Store full data
      allMapData[mapKey] = data;

      // Extract quest markers
      const quests = filterQuestMarkers(data);
      if (quests.length > 0) {
        questMarkers[mapKey] = quests;
        console.log(`  Quest markers: ${quests.length}`);
      }

      // Extract location markers
      const locations = filterLocationMarkers(data);
      if (locations.length > 0) {
        locationMarkers[mapKey] = locations;
        console.log(`  Location markers: ${locations.length}`);
      }

      await delay(DELAY_MS);
    }

    // Save full data cache
    fs.writeFileSync(FULL_DATA_PATH, JSON.stringify({
      scrapedAt: new Date().toISOString(),
      maps: allMapData,
    }, null, 2));
    console.log(`\nFull data saved to: ${FULL_DATA_PATH}`);

    // Save quest markers
    const questOutput = {
      scrapedAt: new Date().toISOString(),
      questMarkers,
      locationMarkers,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(questOutput, null, 2));
    console.log(`Quest/location data saved to: ${OUTPUT_PATH}`);

    // Summary
    console.log(`\n=== Summary ===`);
    let totalQuests = 0;
    let totalLocations = 0;
    for (const [mapKey, markers] of Object.entries(questMarkers)) {
      console.log(`  ${mapKey}: ${markers.length} quest markers`);
      totalQuests += markers.length;
    }
    for (const [mapKey, markers] of Object.entries(locationMarkers)) {
      console.log(`  ${mapKey}: ${markers.length} location markers`);
      totalLocations += markers.length;
    }
    console.log(`\nTotal: ${totalQuests} quest markers, ${totalLocations} location markers`);
  }

  else if (command === '--categories') {
    console.log('Analyzing categories across all maps...\n');

    const globalCategories = new Map();
    const globalSubcategories = new Map();

    for (const [mapKey, mapConfig] of Object.entries(MAPS)) {
      console.log(`Fetching ${mapConfig.name}...`);
      const data = await fetchMapData(mapConfig.metaforgeId);

      if (data) {
        const { categories, subcategories } = analyzeCategories(data);

        for (const [cat, count] of categories) {
          globalCategories.set(cat, (globalCategories.get(cat) || 0) + count);
        }
        for (const [subcat, count] of subcategories) {
          globalSubcategories.set(subcat, (globalSubcategories.get(subcat) || 0) + count);
        }
      }

      await delay(DELAY_MS);
    }

    console.log('\n=== Categories ===');
    const sortedCats = [...globalCategories.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sortedCats) {
      console.log(`  ${cat}: ${count}`);
    }

    console.log('\n=== Subcategories (top 30) ===');
    const sortedSubcats = [...globalSubcategories.entries()].sort((a, b) => b[1] - a[1]);
    for (const [subcat, count] of sortedSubcats.slice(0, 30)) {
      console.log(`  ${subcat}: ${count}`);
    }
  }

  else if (command === '--quests') {
    console.log('Finding quest markers across all maps...\n');

    for (const [mapKey, mapConfig] of Object.entries(MAPS)) {
      console.log(`\n=== ${mapConfig.name} ===`);
      const data = await fetchMapData(mapConfig.metaforgeId);

      if (data) {
        const quests = filterQuestMarkers(data);
        console.log(`Found ${quests.length} quest markers:`);

        for (const marker of quests) {
          console.log(`  - ${marker.instanceName || marker.subcategory}`);
          console.log(`    Category: ${marker.category}/${marker.subcategory}`);
          console.log(`    Coords: lat=${marker.lat}, lng=${marker.lng}`);
        }
      }

      await delay(DELAY_MS);
    }
  }

  else if (command === '--locations') {
    console.log('Finding location markers across all maps...\n');

    for (const [mapKey, mapConfig] of Object.entries(MAPS)) {
      console.log(`\n=== ${mapConfig.name} ===`);
      const data = await fetchMapData(mapConfig.metaforgeId);

      if (data) {
        const locations = filterLocationMarkers(data);
        console.log(`Found ${locations.length} location markers:`);

        // Group by category
        const byCategory = {};
        for (const marker of locations) {
          const key = `${marker.category}/${marker.subcategory}`;
          if (!byCategory[key]) byCategory[key] = [];
          byCategory[key].push(marker);
        }

        for (const [key, markers] of Object.entries(byCategory)) {
          console.log(`\n  ${key} (${markers.length}):`);
          for (const marker of markers.slice(0, 5)) {
            console.log(`    - ${marker.instanceName || '(unnamed)'} @ (${marker.lat.toFixed(2)}, ${marker.lng.toFixed(2)})`);
          }
          if (markers.length > 5) {
            console.log(`    ... and ${markers.length - 5} more`);
          }
        }
      }

      await delay(DELAY_MS);
    }
  }

  else if (command === '--sample') {
    const mapId = args[1] || 'dam';

    if (!MAPS[mapId]) {
      console.error(`Unknown map: ${mapId}`);
      return;
    }

    console.log(`Fetching sample data from ${MAPS[mapId].name}...\n`);

    const data = await fetchMapData(mapId);
    if (!data) {
      console.log('Failed to fetch data');
      return;
    }

    console.log(`Total markers: ${data.length}\n`);

    // Show sample of each category
    const { categories } = analyzeCategories(data);

    for (const [cat] of categories) {
      const samples = data.filter(m => m.category === cat).slice(0, 3);
      console.log(`\n=== Category: ${cat} ===`);
      for (const sample of samples) {
        console.log(JSON.stringify(sample, null, 2));
      }
    }
  }

  else {
    console.error(`Unknown command: ${command}`);
    console.log('Use --help for usage information');
  }
}

main().catch(console.error);
