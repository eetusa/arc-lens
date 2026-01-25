#!/usr/bin/env node
/**
 * ARC Raiders Wiki Scraper Pipeline
 *
 * Scrapes item data from https://arcraiders.wiki and compares/updates
 * the local items_db.json database.
 *
 * Usage:
 *   node scripts/wiki-scraper.js --help           # Show all commands
 *   node scripts/wiki-scraper.js --list           # List all wiki items
 *   node scripts/wiki-scraper.js --compare        # Compare wiki vs local DB
 *   node scripts/wiki-scraper.js --scrape <name>  # Scrape single item
 *   node scripts/wiki-scraper.js --diff <name>    # Show diff between wiki and local
 *   node scripts/wiki-scraper.js --missing        # Show items missing from local DB
 *   node scripts/wiki-scraper.js --report         # Generate full comparison report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIKI_BASE = 'https://arcraiders.wiki/wiki';
const ITEMS_DB_PATH = path.join(__dirname, '../public/items_db.json');
const SCRAPED_CACHE_PATH = path.join(__dirname, '../.wiki-cache.json');
const REPORTS_DIR = path.join(__dirname, '../wiki-reports');
const BACKUPS_DIR = path.join(__dirname, '../backups');

// Ensure directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Ensure reports directory exists
function ensureReportsDir() {
  ensureDir(REPORTS_DIR);
}

// Rate limiting to be nice to the wiki
const DELAY_MS = 500;

// Known item categories and their wiki pages
const WIKI_ITEM_LISTS = {
  items: `${WIKI_BASE}/Items`,
  weapons: `${WIKI_BASE}/Weapons`,
  mods: `${WIKI_BASE}/Mods`,
  augments: `${WIKI_BASE}/Augments`,
  shields: `${WIKI_BASE}/Shields`,
  healing: `${WIKI_BASE}/Healing`,
  quickUse: `${WIKI_BASE}/Quick_Use`,
  grenades: `${WIKI_BASE}/Grenades`,
};

// Non-item pages to filter out (categories, NPCs, locations, quests, etc.)
const NON_ITEM_PAGES = new Set([
  // Categories
  'ARC', 'Ammo', 'Augments', 'Weapons', 'Shields', 'Mods', 'Healing',
  'Quick Use', 'Grenades', 'Traps', 'Items', 'Loot', 'Maps', 'Quests',
  'Skills', 'Raiders', 'Raider',
  // Locations
  'Dam Battlegrounds', 'The Spaceport', 'Buried City', 'The Blue Gate', 'Stella Montis',
  // NPCs/Traders
  'Celeste', 'Shani', 'Tian Wen', 'Apollo', 'Lance', 'Scrappy',
  // Stations
  'Gunsmith', 'Gear Bench', 'Refiner', 'Utility Station', 'Explosives Station',
  'Workbench', 'Workshop', 'Medical Lab', 'Practice Range',
  // Misc
  'Free Loadout', 'Coins', 'Integrated Binoculars', 'Integrated Shield Recharger',
]);

// Quest/non-item name patterns
const QUEST_PATTERNS = [
  /Security Code$/i,
  /Security Checkpoint Key$/i,
  /Control Tower Key$/i,
  /Utility Key$/i,
  /^Into The /i,
  /^Out Of /i,
  /^After /i,
  /Orders$/i,
  /Fray$/i,
  /Shadows$/i,
  /Prize$/i,
  /Signals$/i,
  /Salvage$/i,
  /Trifecta$/i,
  /Treasure$/i,
  /Skies$/i,
  /^View /i,
  /^\[/i,
  /^Weapon$/i,
  /^Weapon Mods$/i,
  /^Topside$/i,
];

// Helper: delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: fetch with error handling
async function fetchPage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.error(`Error fetching ${url}:`, err.message);
    return null;
  }
}

// Load local items database
function loadLocalDB() {
  try {
    const data = fs.readFileSync(ITEMS_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load items_db.json:', err.message);
    return {};
  }
}

// Load scraped cache
function loadCache() {
  try {
    if (fs.existsSync(SCRAPED_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(SCRAPED_CACHE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load cache:', err.message);
  }
  return { items: {}, lastUpdated: null };
}

// Save scraped cache
function saveCache(cache) {
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(SCRAPED_CACHE_PATH, JSON.stringify(cache, null, 2));
}

// Extract infobox HTML from page
function extractInfobox(html) {
  const match = html.match(/<table class="infobox[^"]*">([\s\S]*?)<\/table>/i);
  return match ? match[0] : null;
}

// Parse rarity from CSS class in infobox
function parseRarity(infobox) {
  // Look for gradient class (most reliable)
  const gradientMatch = infobox.match(/gradient-(common|uncommon|rare|epic|legendary)/i);
  if (gradientMatch) return gradientMatch[1].toLowerCase();

  // Fallback: data-tag class
  const tagMatch = infobox.match(/data-tag-(common|uncommon|rare|epic|legendary)/i);
  if (tagMatch) return tagMatch[1].toLowerCase();

  return null;
}

// Parse type from infobox data-tag with link-button
function parseType(infobox) {
  // Type is in a data-tag with link-button class, contains a link with title
  // e.g. <a href="/wiki/Weapons#Weapon_Types" title="Weapons">Battle Rifle</a>
  const linkButtonMatch = infobox.match(/<tr class="data-tag link-button[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  if (linkButtonMatch) return linkButtonMatch[1].trim().toLowerCase();

  // Fallback: plain text in data-tag (for materials)
  // e.g. <td colspan="2">Basic Material</td>
  const plainTagMatch = infobox.match(/<tr class="data-tag(?! icon)[^"]*"[^>]*>\s*<td[^>]*>([^<]+)<\/td>/i);
  if (plainTagMatch && !plainTagMatch[1].includes('Common') && !plainTagMatch[1].includes('Uncommon')) {
    return plainTagMatch[1].trim().toLowerCase();
  }

  return null;
}

// Parse sell price from infobox
// Structure: <tr class="data-sellprice ..."><td>...<span class="template-price">...<img>...NUMBER</span>
function parseSellPrice(infobox) {
  const row = infobox.match(/<tr[^>]*class="[^"]*data-sellprice[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
  if (!row) return null;

  // Extract all prices (weapons have multiple for each tier)
  const prices = [];
  const priceMatches = row[1].matchAll(/<span class="template-price">[\s\S]*?<\/span>(\d+(?:,\d+)*)/g);
  for (const match of priceMatches) {
    prices.push(parseInt(match[1].replace(/,/g, '')));
  }

  // Also try simpler pattern: just find numbers after the img in template-price
  if (prices.length === 0) {
    const simpleMatch = row[1].match(/template-price[\s\S]*?>(\d+(?:,\d+)*)</);
    if (simpleMatch) {
      prices.push(parseInt(simpleMatch[1].replace(/,/g, '')));
    }
  }

  return prices.length > 0 ? prices : null;
}

// Parse weight from infobox
// Structure: <tr class="data-weight ..."><td><div class="template-weight">...<span>0.1</span></div>
function parseWeight(infobox) {
  const row = infobox.match(/<tr[^>]*class="[^"]*data-weight[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
  if (!row) return null;

  // Weight is in a span inside template-weight div
  const weightMatch = row[1].match(/template-weight[\s\S]*?<span>([0-9.]+)/i);
  if (weightMatch) {
    return parseFloat(weightMatch[1]);
  }

  return null;
}

// Parse stack size from infobox
// Structure: <tr class="data-stackstize ..."><td>50</td>
function parseStackSize(infobox) {
  const row = infobox.match(/<tr[^>]*class="[^"]*data-stackstize[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
  if (!row) return null;

  // Stack size is directly in td
  const stackMatch = row[1].match(/<td[^>]*>(\d+)<\/td>/i);
  if (stackMatch) {
    return parseInt(stackMatch[1]);
  }

  return null;
}

// Parse weapon stats from infobox
function parseWeaponStats(infobox) {
  const stats = {};

  const statPatterns = [
    { key: 'damage', class: 'data-damage' },
    { key: 'fireRate', class: 'data-firerate' },
    { key: 'magSize', class: 'data-magsize' },
    { key: 'range', class: 'data-range' },
    { key: 'stability', class: 'data-stability' },
    { key: 'agility', class: 'data-agility' },
    { key: 'stealth', class: 'data-stealth' },
    { key: 'headshotMultiplier', class: 'data-headshotmultiplier' },
  ];

  for (const { key, class: cls } of statPatterns) {
    const row = infobox.match(new RegExp(`<tr[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/tr>`, 'i'));
    if (row) {
      const valueMatch = row[1].match(/<td[^>]*>([0-9.]+)/i);
      if (valueMatch) {
        stats[key] = parseFloat(valueMatch[1]);
      }
    }
  }

  return Object.keys(stats).length > 0 ? stats : null;
}

// Parse recycling table from page
// Structure: <h2 id="Recycling_&_Salvaging">...</h2>...<table class="wikitable">
function parseRecyclingTable(html) {
  // Find the recycling section
  const sectionMatch = html.match(/id="Recycling[^"]*"[\s\S]*?<table class="wikitable">([\s\S]*?)<\/table>/i);
  if (!sectionMatch) return null;

  const table = sectionMatch[1];
  const tiers = [];

  // Parse each row
  const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  for (const row of rows) {
    // Skip header row
    if (row.includes('<th')) continue;

    // Get tier name from first cell
    const tierMatch = row.match(/<td[^>]*>([^<]+(?:I{1,4}|IV|V)?)/i);
    if (!tierMatch) continue;

    const tierName = tierMatch[1].trim();

    // Get recycling results (3rd cell for tiered weapons)
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length >= 3) {
      const recycleCell = cells[2];
      const outputs = [];

      // Parse item links with amounts: "2× <a...>Metal Parts</a>"
      const itemMatches = recycleCell.matchAll(/(\d+)×?\s*<a[^>]*title="([^"]+)"/g);
      for (const match of itemMatches) {
        outputs.push({
          name: match[2],
          amount: parseInt(match[1])
        });
      }

      if (outputs.length > 0) {
        tiers.push({
          tier: tierName,
          recycleOutputs: outputs
        });
      }
    }
  }

  return tiers.length > 0 ? tiers : null;
}

// Parse simple recycling results for non-tiered items
// Format: "Item | Recycling results | Salvaging results" table
function parseSimpleRecycling(html) {
  // Find the recycling section - try multiple ID formats
  // Pages use various names: "Recycled_&_Salvaged_Material(s)", "Recycling_&_Salvaging", etc.
  let sectionMatch = html.match(/id="Recycled_&amp;_Salvaged_Materials?"[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!sectionMatch) {
    sectionMatch = html.match(/id="Recycling_&amp;_Salvaging"[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  }
  if (!sectionMatch) {
    sectionMatch = html.match(/id="Recycling[^"]*"[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  }
  if (!sectionMatch) return null;

  const table = sectionMatch[1];
  const outputs = [];

  // Parse each row
  const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  for (const row of rows) {
    // Skip header row
    if (row.includes('<th')) continue;

    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];

    // For simple items: column 0 = Item, column 1 = arrow, column 2 = Recycling results, column 3 = Salvaging
    // Check column 2 for recycling results
    if (cells.length >= 3) {
      const recycleCell = cells[2];

      // Parse item links with amounts: "2× <a...>Metal Parts</a>"
      const itemMatches = recycleCell.matchAll(/(\d+)×?\s*<a[^>]*title="([^"]+)"/g);
      for (const match of itemMatches) {
        outputs.push({
          name: match[2],
          amount: parseInt(match[1])
        });
      }
    }
  }

  return outputs.length > 0 ? outputs : null;
}

// Parse crafting requirements from page
function parseCraftingRequirements(html) {
  // Look for crafting section
  const sectionMatch = html.match(/id="Crafting"[\s\S]*?<table class="wikitable">([\s\S]*?)<\/table>/i);
  if (!sectionMatch) return null;

  const requirements = [];
  const table = sectionMatch[1];

  // Find rows with item links and amounts
  const itemMatches = table.matchAll(/(\d+)x?\s*<a[^>]*title="([^"]+)"/gi);
  for (const match of itemMatches) {
    requirements.push({
      name: match[2],
      amount: parseInt(match[1])
    });
  }

  return requirements.length > 0 ? requirements : null;
}

// Parse item data from wiki HTML
function parseItemPage(html, itemName) {
  const item = {
    name: itemName,
    wikiUrl: `${WIKI_BASE}/${encodeURIComponent(itemName.replace(/ /g, '_'))}`,
    scraped: new Date().toISOString(),
  };

  // Extract infobox
  const infobox = extractInfobox(html);
  if (!infobox) {
    console.warn(`  No infobox found for ${itemName}`);
    return item;
  }

  // Parse basic info from infobox
  const rarity = parseRarity(infobox);
  if (rarity) item.rarity = rarity;

  const type = parseType(infobox);
  if (type) item.type = type;

  const sellPrices = parseSellPrice(infobox);
  if (sellPrices) {
    item.value = sellPrices[0]; // First/base price
    if (sellPrices.length > 1) {
      item.tierPrices = sellPrices; // All tier prices for weapons
    }
  }

  const weight = parseWeight(infobox);
  if (weight !== null) item.weight = weight;

  const stackSize = parseStackSize(infobox);
  if (stackSize !== null) item.stackSize = stackSize;

  // Parse weapon stats if present
  const weaponStats = parseWeaponStats(infobox);
  if (weaponStats) item.weaponStats = weaponStats;

  // Parse recycling table (tiered weapons)
  const recyclingTiers = parseRecyclingTable(html);
  if (recyclingTiers) {
    item.recyclingByTier = recyclingTiers;
    // Also flatten to first tier for simple comparison
    if (recyclingTiers[0]) {
      item.recycleOutputs = recyclingTiers[0].recycleOutputs;
    }
  } else {
    // Try simple recycling format for non-tiered items
    const simpleRecycle = parseSimpleRecycling(html);
    if (simpleRecycle) {
      item.recycleOutputs = simpleRecycle;
    }
  }

  // Parse crafting requirements
  const craftReqs = parseCraftingRequirements(html);
  if (craftReqs) item.craftingRequirements = craftReqs;

  // Parse description from first paragraph
  const descMatch = html.match(/<p>(?:<b>[^<]+<\/b>\s*)?(?:is\s+)?([^<]{20,200})/i);
  if (descMatch) {
    item.description = descMatch[1].trim().replace(/\s+/g, ' ');
  }

  return item;
}

// Check if a title looks like a quest name
function isQuestName(title) {
  return QUEST_PATTERNS.some(pattern => pattern.test(title));
}

// Extract item links from a wiki page, filtering non-items
function extractItemLinks(html) {
  const items = new Set();

  // Match wiki links with titles
  const linkMatches = html.matchAll(/href="\/wiki\/([^"#]+)"[^>]*title="([^"]+)"/g);
  for (const match of linkMatches) {
    const urlName = match[1];
    const title = match[2];

    // Filter criteria
    if (urlName.includes(':')) continue; // Namespaced pages
    if (urlName.startsWith('Category')) continue;
    if (urlName.startsWith('Special')) continue;
    if (urlName.startsWith('File')) continue;
    if (urlName.startsWith('Template')) continue;
    if (urlName.includes('Main_Page')) continue;
    if (title.includes(':')) continue;
    if (title.length < 2 || title.length > 50) continue;
    if (NON_ITEM_PAGES.has(title)) continue;
    if (isQuestName(title)) continue;

    items.add(title);
  }

  return Array.from(items);
}

// Get all item names from wiki
async function getAllWikiItems() {
  console.log('Fetching item lists from wiki...');
  const allItems = new Set();

  for (const [category, url] of Object.entries(WIKI_ITEM_LISTS)) {
    console.log(`  Fetching ${category}...`);
    const html = await fetchPage(url);
    if (html) {
      const items = extractItemLinks(html);
      items.forEach(item => allItems.add(item));
      console.log(`    Found ${items.length} items`);
    }
    await delay(DELAY_MS);
  }

  return Array.from(allItems).sort();
}

// Compare wiki items with local database
function compareWithLocal(wikiItems, localDB) {
  const localNames = new Map();
  for (const item of Object.values(localDB)) {
    localNames.set(item.name.toLowerCase(), item);
  }

  const missing = [];
  const present = [];

  for (const wikiItem of wikiItems) {
    const localItem = localNames.get(wikiItem.toLowerCase());
    if (localItem) {
      present.push({ wiki: wikiItem, local: localItem });
    } else {
      // Check if it's a base weapon name (Ferro vs Ferro I, II, etc.)
      const tierMatch = localNames.get((wikiItem + ' I').toLowerCase());
      if (tierMatch) {
        present.push({ wiki: wikiItem, local: tierMatch, note: 'base weapon' });
      } else {
        missing.push(wikiItem);
      }
    }
  }

  return { missing, present };
}

// Scrape a single item
async function scrapeItem(itemName) {
  const url = `${WIKI_BASE}/${encodeURIComponent(itemName.replace(/ /g, '_'))}`;
  console.log(`Scraping: ${url}`);

  const html = await fetchPage(url);
  if (!html) return null;

  return parseItemPage(html, itemName);
}

// Generate item ID from name
function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Show diff between wiki and local item
function showItemDiff(wikiItem, localItem) {
  console.log('\n--- Field Comparison ---');

  const fields = ['type', 'rarity', 'value', 'weight', 'stackSize'];

  for (const field of fields) {
    const wikiVal = wikiItem[field];
    const localVal = localItem?.[field] ?? localItem?.raw?.[field];

    if (wikiVal === undefined && localVal === undefined) continue;

    const match = String(wikiVal).toLowerCase() === String(localVal).toLowerCase();
    const status = match ? '✓' : '✗';
    console.log(`  ${status} ${field}: wiki=${wikiVal ?? 'N/A'}, local=${localVal ?? 'N/A'}`);
  }

  // Compare recycle outputs
  if (wikiItem.recycleOutputs || localItem?.breaksInto) {
    console.log('\n  Recycle Outputs:');
    const wikiOutputs = wikiItem.recycleOutputs || [];
    const localOutputs = (localItem?.breaksInto || []).map(b => ({
      name: b.item?.name,
      amount: b.amount
    }));
    console.log(`    Wiki:  ${JSON.stringify(wikiOutputs)}`);
    console.log(`    Local: ${JSON.stringify(localOutputs)}`);
  }

  // Show weapon stats if present
  if (wikiItem.weaponStats) {
    console.log('\n  Weapon Stats (from wiki):');
    console.log(`    ${JSON.stringify(wikiItem.weaponStats)}`);
  }
}

// Compare recycle outputs between wiki and local
function compareRecycleOutputs(wikiOutputs, localOutputs) {
  const wikiMap = new Map((wikiOutputs || []).map(o => [o.name.toLowerCase(), o.amount]));
  const localMap = new Map((localOutputs || []).map(o => [o.name?.toLowerCase(), o.amount]));

  const differences = [];

  // Check wiki items
  for (const [name, amount] of wikiMap) {
    const localAmount = localMap.get(name);
    if (localAmount === undefined) {
      differences.push({ type: 'missing_local', item: name, wikiAmount: amount });
    } else if (localAmount !== amount) {
      differences.push({ type: 'amount_mismatch', item: name, wikiAmount: amount, localAmount });
    }
  }

  // Check local items not in wiki
  for (const [name, amount] of localMap) {
    if (name && !wikiMap.has(name)) {
      differences.push({ type: 'extra_local', item: name, localAmount: amount });
    }
  }

  return differences;
}

// Extract tier number from item name (e.g., "Anvil IV" -> 4, "Anvil I" -> 1)
function getTierFromName(name) {
  const match = name.match(/ (I{1,3}|IV)$/);
  if (!match) return null;
  const roman = match[1];
  const romanToNum = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4 };
  return romanToNum[roman] || null;
}

// Verify a single item's data against wiki
async function verifyItem(itemName, localItem) {
  // Detect tier for tiered items
  const tier = getTierFromName(localItem.name);
  const tierIndex = tier ? tier - 1 : 0;

  // Try exact item name first (some items like mods have separate pages per tier)
  let wikiItem = await scrapeItem(localItem.name);
  let usedExactName = !!wikiItem;

  // If exact name fails, try base name (for weapons with single page + tier table)
  if (!wikiItem && tier) {
    wikiItem = await scrapeItem(itemName);
  }

  if (!wikiItem) return null;

  const issues = [];

  // Get tier-specific value if available (only when using base name with tier table)
  let expectedValue = wikiItem.value;
  if (!usedExactName && tier && wikiItem.tierPrices && wikiItem.tierPrices[tierIndex] !== undefined) {
    expectedValue = wikiItem.tierPrices[tierIndex];
  }

  // Get tier-specific recycle outputs if available (only when using base name with tier table)
  let expectedRecycle = wikiItem.recycleOutputs || [];
  if (!usedExactName && tier && wikiItem.recyclingByTier && wikiItem.recyclingByTier[tierIndex]) {
    expectedRecycle = wikiItem.recyclingByTier[tierIndex].recycleOutputs || [];
  }

  // Compare basic fields
  if (expectedValue && localItem.value && expectedValue !== localItem.value) {
    issues.push({ field: 'value', wiki: expectedValue, local: localItem.value });
  }
  if (wikiItem.weight && localItem.weight && Math.abs(wikiItem.weight - localItem.weight) > 0.01) {
    issues.push({ field: 'weight', wiki: wikiItem.weight, local: localItem.weight });
  }
  if (wikiItem.stackSize && localItem.stackSize && wikiItem.stackSize !== localItem.stackSize) {
    issues.push({ field: 'stackSize', wiki: wikiItem.stackSize, local: localItem.stackSize });
  }
  if (wikiItem.rarity && localItem.rarity && wikiItem.rarity !== localItem.rarity) {
    issues.push({ field: 'rarity', wiki: wikiItem.rarity, local: localItem.rarity });
  }

  // Compare recycle outputs
  const localRecycle = (localItem.breaksInto || []).map(b => ({ name: b.item?.name, amount: b.amount }));
  const recycleDiffs = compareRecycleOutputs(expectedRecycle, localRecycle);
  if (recycleDiffs.length > 0) {
    issues.push({ field: 'recycleOutputs', differences: recycleDiffs });
  }

  return {
    name: itemName,
    localName: localItem.name,
    tier: tier,
    issues,
    wikiData: wikiItem,
  };
}

// Update local item with wiki data
function updateItemWithWikiData(localItem, wikiItem, localDB, options = {}) {
  const changes = [];

  // Detect tier for tiered items
  const tier = getTierFromName(localItem.name);
  const tierIndex = tier ? tier - 1 : 0;

  // Get tier-specific value if available
  let expectedValue = wikiItem.value;
  if (tier && wikiItem.tierPrices && wikiItem.tierPrices[tierIndex] !== undefined) {
    expectedValue = wikiItem.tierPrices[tierIndex];
  }

  // Get tier-specific recycle outputs if available
  let expectedRecycle = wikiItem.recycleOutputs || [];
  if (tier && wikiItem.recyclingByTier && wikiItem.recyclingByTier[tierIndex]) {
    expectedRecycle = wikiItem.recyclingByTier[tierIndex].recycleOutputs || [];
  }

  // Update basic fields if wiki has data
  if (options.updateValue && expectedValue && expectedValue !== localItem.value) {
    changes.push({ field: 'value', from: localItem.value, to: expectedValue });
    localItem.value = expectedValue;
  }

  if (options.updateWeight && wikiItem.weight && Math.abs((wikiItem.weight || 0) - (localItem.weight || 0)) > 0.01) {
    changes.push({ field: 'weight', from: localItem.weight, to: wikiItem.weight });
    localItem.weight = wikiItem.weight;
  }

  if (options.updateStackSize && wikiItem.stackSize && wikiItem.stackSize !== localItem.stackSize) {
    changes.push({ field: 'stackSize', from: localItem.stackSize, to: wikiItem.stackSize });
    localItem.stackSize = wikiItem.stackSize;
  }

  if (options.updateRarity && wikiItem.rarity && wikiItem.rarity !== localItem.rarity) {
    changes.push({ field: 'rarity', from: localItem.rarity, to: wikiItem.rarity });
    localItem.rarity = wikiItem.rarity;
  }

  // Update recycle outputs (breaksInto)
  if (options.updateRecycle && expectedRecycle && expectedRecycle.length > 0) {
    const currentRecycle = (localItem.breaksInto || []).map(b => ({
      name: b.item?.name?.toLowerCase(),
      amount: b.amount
    }));

    const wikiRecycleMap = new Map(expectedRecycle.map(o => [o.name.toLowerCase(), o.amount]));
    const localRecycleMap = new Map(currentRecycle.map(o => [o.name, o.amount]));

    let recycleChanged = false;
    const newBreaksInto = [...(localItem.breaksInto || [])];

    // Add missing items from wiki
    for (const [name, amount] of wikiRecycleMap) {
      if (!localRecycleMap.has(name)) {
        // Find the item in localDB to get full item data
        const targetItem = Object.values(localDB).find(i => i.name.toLowerCase() === name);
        if (targetItem) {
          newBreaksInto.push({
            item: {
              id: targetItem.id,
              name: targetItem.name,
              rarity: targetItem.rarity,
              type: targetItem.type,
              value: targetItem.value,
              icon: targetItem.icon,
            },
            amount: amount
          });
          changes.push({ field: 'breaksInto', action: 'add', item: name, amount });
          recycleChanged = true;
        }
      } else if (localRecycleMap.get(name) !== amount) {
        // Update amount if different
        const idx = newBreaksInto.findIndex(b => b.item?.name?.toLowerCase() === name);
        if (idx >= 0) {
          changes.push({ field: 'breaksInto', action: 'update', item: name, from: newBreaksInto[idx].amount, to: amount });
          newBreaksInto[idx].amount = amount;
          recycleChanged = true;
        }
      }
    }

    // Remove items that are in local but not in wiki (extra_local)
    for (const [name, amount] of localRecycleMap) {
      if (!wikiRecycleMap.has(name)) {
        const idx = newBreaksInto.findIndex(b => b.item?.name?.toLowerCase() === name);
        if (idx >= 0) {
          changes.push({ field: 'breaksInto', action: 'remove', item: name, amount });
          newBreaksInto.splice(idx, 1);
          recycleChanged = true;
        }
      }
    }

    if (recycleChanged) {
      localItem.breaksInto = newBreaksInto;
    }
  }

  return changes;
}

// Save the updated database
function saveLocalDB(db) {
  // Create backup first
  ensureDir(BACKUPS_DIR);
  const backupPath = path.join(BACKUPS_DIR, `items_db.backup-${Date.now()}.json`);
  const currentData = fs.readFileSync(ITEMS_DB_PATH, 'utf-8');
  fs.writeFileSync(backupPath, currentData);
  console.log(`Backup saved to: ${backupPath}`);

  // Save updated data
  fs.writeFileSync(ITEMS_DB_PATH, JSON.stringify(db, null, 4));
  console.log(`Updated database saved to: ${ITEMS_DB_PATH}`);
}

// Convert wiki scraped data to local DB format
function wikiToLocalFormat(wikiItem, localDB) {
  const id = generateId(wikiItem.name);

  const localItem = {
    id: id,
    name: wikiItem.name,
    updatedAt: new Date().toISOString(),
    foundIn: [],
    maps: [],
  };

  // Basic fields
  if (wikiItem.rarity) localItem.rarity = wikiItem.rarity;
  if (wikiItem.type) localItem.type = wikiItem.type;
  if (wikiItem.value) localItem.value = wikiItem.value;
  if (wikiItem.weight) localItem.weight = wikiItem.weight;
  if (wikiItem.stackSize) localItem.stackSize = wikiItem.stackSize;
  if (wikiItem.description) localItem.description = wikiItem.description;

  // Convert recycleOutputs to breaksInto format
  if (wikiItem.recycleOutputs && wikiItem.recycleOutputs.length > 0) {
    localItem.breaksInto = [];
    for (const output of wikiItem.recycleOutputs) {
      // Find the target item in localDB to get full item data
      const targetItem = Object.values(localDB).find(
        i => i.name.toLowerCase() === output.name.toLowerCase()
      );

      if (targetItem) {
        localItem.breaksInto.push({
          item: {
            id: targetItem.id,
            name: targetItem.name,
            rarity: targetItem.rarity,
            type: targetItem.type,
            value: targetItem.value,
            icon: targetItem.icon,
            foundIn: targetItem.foundIn,
            updatedAt: targetItem.updatedAt,
          },
          amount: output.amount
        });
      } else {
        // Create a placeholder for items we don't have yet
        localItem.breaksInto.push({
          item: {
            id: generateId(output.name),
            name: output.name,
          },
          amount: output.amount
        });
        console.log(`    Warning: Recycle output "${output.name}" not found in local DB`);
      }
    }
  }

  return localItem;
}

// Add a new item to the database from wiki data
async function addMissingItem(itemName, localDB) {
  console.log(`  Scraping "${itemName}"...`);

  const wikiItem = await scrapeItem(itemName);
  if (!wikiItem) {
    console.log(`    ✗ Could not fetch wiki data`);
    return null;
  }

  // Check if we got meaningful data
  if (!wikiItem.type && !wikiItem.rarity && !wikiItem.value) {
    console.log(`    ✗ No meaningful data found (might not be an item)`);
    return null;
  }

  const localItem = wikiToLocalFormat(wikiItem, localDB);
  const id = localItem.id;

  // Add to database
  localDB[id] = localItem;

  console.log(`    ✓ Added "${itemName}" (${wikiItem.type || 'unknown type'}, ${wikiItem.rarity || 'unknown rarity'})`);

  return localItem;
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
ARC Raiders Wiki Scraper Pipeline

Usage:
  node scripts/wiki-scraper.js --list            List all wiki items
  node scripts/wiki-scraper.js --compare         Compare wiki vs local DB
  node scripts/wiki-scraper.js --scrape <name>   Scrape single item
  node scripts/wiki-scraper.js --scrape-missing  Scrape items missing from local DB
  node scripts/wiki-scraper.js --missing         Show items missing from local DB
  node scripts/wiki-scraper.js --diff <name>     Show diff for single item
  node scripts/wiki-scraper.js --verify [name]   Verify item data against wiki (sample or specific)
  node scripts/wiki-scraper.js --full-report     Verify ALL items + show missing (comprehensive)
  node scripts/wiki-scraper.js --update <name>   Update single item from wiki
  node scripts/wiki-scraper.js --update-all      Update all items with issues (interactive)
  node scripts/wiki-scraper.js --add-missing     Add missing items from wiki to local DB
  node scripts/wiki-scraper.js --report          Generate comparison report (matching only)

Examples:
  node scripts/wiki-scraper.js --scrape "Metal Parts"
  node scripts/wiki-scraper.js --diff "Ferro"
  node scripts/wiki-scraper.js --verify "Ferro I"
  node scripts/wiki-scraper.js --update "Ferro I"    # Update single item
  node scripts/wiki-scraper.js --update-all          # Update all items with issues
  node scripts/wiki-scraper.js --add-missing         # Add missing items from wiki
  node scripts/wiki-scraper.js --compare
`);
    return;
  }

  const localDB = loadLocalDB();
  console.log(`Local DB has ${Object.keys(localDB).length} items\n`);

  if (command === '--list') {
    const wikiItems = await getAllWikiItems();
    console.log(`\nFound ${wikiItems.length} items on wiki:\n`);
    wikiItems.forEach(item => console.log(`  - ${item}`));
  }

  else if (command === '--compare') {
    const wikiItems = await getAllWikiItems();
    const { missing, present } = compareWithLocal(wikiItems, localDB);

    console.log(`\n=== Comparison Results ===`);
    console.log(`Wiki items: ${wikiItems.length}`);
    console.log(`Local items: ${Object.keys(localDB).length}`);
    console.log(`Matched: ${present.length}`);
    console.log(`Missing from local: ${missing.length}`);

    if (missing.length > 0) {
      console.log(`\nMissing items (first 30):`);
      missing.slice(0, 30).forEach(item => console.log(`  - ${item}`));
      if (missing.length > 30) {
        console.log(`  ... and ${missing.length - 30} more`);
      }
    }
  }

  else if (command === '--missing') {
    const wikiItems = await getAllWikiItems();
    const { missing } = compareWithLocal(wikiItems, localDB);

    console.log(`\n=== Items Missing from Local DB (${missing.length}) ===\n`);
    missing.forEach(item => console.log(item));
  }

  else if (command === '--scrape') {
    const itemName = args.slice(1).join(' ');
    if (!itemName) {
      console.error('Please provide an item name');
      return;
    }

    const item = await scrapeItem(itemName);
    if (item) {
      console.log('\n=== Scraped Data ===');
      console.log(JSON.stringify(item, null, 2));

      // Save to cache
      const cache = loadCache();
      const id = generateId(itemName);
      cache.items[id] = item;
      saveCache(cache);
      console.log(`\nSaved to cache as "${id}"`);
    }
  }

  else if (command === '--diff') {
    const itemName = args.slice(1).join(' ');
    if (!itemName) {
      console.error('Please provide an item name');
      return;
    }

    // Find in local DB (try exact match first, then with tier suffix)
    let localItem = Object.values(localDB).find(
      i => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (!localItem) {
      localItem = Object.values(localDB).find(
        i => i.name.toLowerCase() === (itemName + ' i').toLowerCase()
      );
    }

    // Scrape from wiki
    const wikiItem = await scrapeItem(itemName);

    console.log('\n=== Local Data ===');
    if (localItem) {
      console.log(JSON.stringify({
        id: localItem.id,
        name: localItem.name,
        type: localItem.type,
        rarity: localItem.rarity,
        value: localItem.value,
        weight: localItem.weight,
        stackSize: localItem.stackSize,
        breaksInto: localItem.breaksInto?.map(b => ({ name: b.item?.name, amount: b.amount })),
      }, null, 2));
    } else {
      console.log('NOT FOUND in local DB');
    }

    console.log('\n=== Wiki Data ===');
    if (wikiItem) {
      console.log(JSON.stringify(wikiItem, null, 2));
    } else {
      console.log('NOT FOUND on wiki');
    }

    if (wikiItem && localItem) {
      showItemDiff(wikiItem, localItem);
    }
  }

  else if (command === '--scrape-missing') {
    const wikiItems = await getAllWikiItems();
    const { missing } = compareWithLocal(wikiItems, localDB);

    console.log(`\nScraping ${missing.length} missing items...\n`);

    const cache = loadCache();
    let scraped = 0;
    let failed = 0;

    for (const itemName of missing) {
      const item = await scrapeItem(itemName);
      if (item && item.type) { // Only save if we got meaningful data
        const id = generateId(itemName);
        cache.items[id] = item;
        scraped++;
        console.log(`  ✓ ${itemName}`);
      } else {
        failed++;
        console.log(`  ✗ ${itemName} (no data)`);
      }
      await delay(DELAY_MS);
    }

    saveCache(cache);
    console.log(`\nDone! Scraped: ${scraped}, Failed/Skipped: ${failed}`);
    console.log(`Cache saved to: ${SCRAPED_CACHE_PATH}`);
  }

  else if (command === '--report') {
    const wikiItems = await getAllWikiItems();
    const { missing, present } = compareWithLocal(wikiItems, localDB);

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        wikiItems: wikiItems.length,
        localItems: Object.keys(localDB).length,
        matched: present.length,
        missingFromLocal: missing.length,
      },
      missingItems: missing,
      matchedItems: present.map(p => ({ wiki: p.wiki, local: p.local.name, note: p.note })),
    };

    ensureReportsDir();
    const reportPath = path.join(REPORTS_DIR, 'comparison-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n=== Report Summary ===`);
    console.log(`Wiki items: ${report.summary.wikiItems}`);
    console.log(`Local items: ${report.summary.localItems}`);
    console.log(`Matched: ${report.summary.matched}`);
    console.log(`Missing: ${report.summary.missingFromLocal}`);
    console.log(`\nReport saved to: ${reportPath}`);
  }

  else if (command === '--verify') {
    const itemName = args.slice(1).join(' ');

    if (itemName) {
      // Verify single item
      let localItem = Object.values(localDB).find(
        i => i.name.toLowerCase() === itemName.toLowerCase()
      );

      if (!localItem) {
        console.error(`Item "${itemName}" not found in local DB`);
        return;
      }

      // For tiered items, get wiki name without tier
      const wikiName = localItem.name.replace(/ (I{1,4}|IV|V)$/, '');

      console.log(`Verifying "${localItem.name}" against wiki "${wikiName}"...\n`);
      const result = await verifyItem(wikiName, localItem);

      if (!result) {
        console.log('Could not fetch wiki data');
        return;
      }

      if (result.issues.length === 0) {
        console.log('✓ No issues found - data matches wiki');
      } else {
        console.log(`✗ Found ${result.issues.length} issue(s):\n`);
        for (const issue of result.issues) {
          if (issue.field === 'recycleOutputs') {
            console.log(`  Recycle Outputs:`);
            for (const diff of issue.differences) {
              if (diff.type === 'missing_local') {
                console.log(`    - Missing: ${diff.item} (wiki has ${diff.wikiAmount}x)`);
              } else if (diff.type === 'extra_local') {
                console.log(`    - Extra in local: ${diff.item} (${diff.localAmount}x)`);
              } else if (diff.type === 'amount_mismatch') {
                console.log(`    - Amount mismatch: ${diff.item} (wiki: ${diff.wikiAmount}, local: ${diff.localAmount})`);
              }
            }
          } else {
            console.log(`  ${issue.field}: wiki=${issue.wiki}, local=${issue.local}`);
          }
        }
      }
    } else {
      // Verify all items - sample a subset for speed
      console.log('Verifying items against wiki (this may take a while)...\n');

      const allIssues = [];
      const itemsToCheck = Object.values(localDB).slice(0, 50); // Check first 50 for speed

      for (const localItem of itemsToCheck) {
        // Get wiki name (strip tier suffix for weapons)
        const wikiName = localItem.name.replace(/ (I{1,4}|IV|V)$/, '');

        process.stdout.write(`  Checking ${localItem.name}...`);
        const result = await verifyItem(wikiName, localItem);

        if (result && result.issues.length > 0) {
          allIssues.push(result);
          console.log(` ✗ ${result.issues.length} issue(s)`);
        } else if (result) {
          console.log(' ✓');
        } else {
          console.log(' (no wiki data)');
        }

        await delay(DELAY_MS);
      }

      console.log(`\n=== Verification Summary ===`);
      console.log(`Checked: ${itemsToCheck.length} items`);
      console.log(`Items with issues: ${allIssues.length}`);

      if (allIssues.length > 0) {
        ensureReportsDir();
        const reportPath = path.join(REPORTS_DIR, 'verification-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          itemsChecked: itemsToCheck.length,
          itemsWithIssues: allIssues.length,
          issues: allIssues.map(r => ({
            localName: r.localName,
            wikiName: r.name,
            issues: r.issues
          }))
        }, null, 2));
        console.log(`\nReport saved to: ${reportPath}`);
      }
    }
  }

  else if (command === '--update') {
    const itemName = args.slice(1).join(' ');
    if (!itemName) {
      console.error('Please provide an item name');
      return;
    }

    // Find local item
    const localItem = Object.values(localDB).find(
      i => i.name.toLowerCase() === itemName.toLowerCase()
    );

    if (!localItem) {
      console.error(`Item "${itemName}" not found in local DB`);
      return;
    }

    // Get wiki name (strip tier suffix for weapons)
    const wikiName = localItem.name.replace(/ (I{1,4}|IV|V)$/, '');

    console.log(`Updating "${localItem.name}" from wiki "${wikiName}"...\n`);

    const wikiItem = await scrapeItem(wikiName);
    if (!wikiItem) {
      console.error('Could not fetch wiki data');
      return;
    }

    // Apply all updates
    const changes = updateItemWithWikiData(localItem, wikiItem, localDB, {
      updateValue: true,
      updateWeight: true,
      updateStackSize: true,
      updateRarity: true,
      updateRecycle: true,
    });

    if (changes.length === 0) {
      console.log('✓ No changes needed - data already matches wiki');
    } else {
      console.log(`Applied ${changes.length} change(s):\n`);
      for (const change of changes) {
        if (change.field === 'breaksInto') {
          if (change.action === 'add') {
            console.log(`  + Added recycle output: ${change.item} (${change.amount}x)`);
          } else if (change.action === 'update') {
            console.log(`  ~ Updated recycle amount: ${change.item} (${change.from} → ${change.to})`);
          }
        } else {
          console.log(`  ~ ${change.field}: ${change.from} → ${change.to}`);
        }
      }

      // Save updated DB
      console.log('');
      saveLocalDB(localDB);
    }
  }

  else if (command === '--update-all') {
    console.log('Scanning for items with issues...\n');

    // First, verify items to find those with issues
    const itemsToUpdate = [];
    const allLocalItems = Object.values(localDB);

    // Check a sample or all items based on flag
    const checkAll = args.includes('--all');
    const itemsToCheck = checkAll ? allLocalItems : allLocalItems.slice(0, 100);

    console.log(`Checking ${itemsToCheck.length} items for issues...\n`);

    for (const localItem of itemsToCheck) {
      const wikiName = localItem.name.replace(/ (I{1,4}|IV|V)$/, '');

      process.stdout.write(`  Checking ${localItem.name}...`);
      const result = await verifyItem(wikiName, localItem);

      if (result && result.issues.length > 0) {
        itemsToUpdate.push({ localItem, wikiItem: result.wikiData, issues: result.issues });
        console.log(` ✗ ${result.issues.length} issue(s)`);
      } else if (result) {
        console.log(' ✓');
      } else {
        console.log(' (no wiki data)');
      }

      await delay(DELAY_MS);
    }

    if (itemsToUpdate.length === 0) {
      console.log('\n✓ No items need updating!');
      return;
    }

    console.log(`\n=== Found ${itemsToUpdate.length} items with issues ===\n`);

    // Show summary of changes to be made
    let totalChanges = 0;
    const changePreview = [];

    for (const { localItem, wikiItem, issues } of itemsToUpdate) {
      const itemChanges = [];
      for (const issue of issues) {
        if (issue.field === 'recycleOutputs') {
          for (const diff of issue.differences) {
            if (diff.type === 'missing_local') {
              itemChanges.push(`  + Add recycle: ${diff.item} (${diff.wikiAmount}x)`);
            } else if (diff.type === 'amount_mismatch') {
              itemChanges.push(`  ~ Fix recycle amount: ${diff.item}`);
            }
          }
        } else {
          itemChanges.push(`  ~ ${issue.field}: ${issue.local} → ${issue.wiki}`);
        }
      }
      if (itemChanges.length > 0) {
        changePreview.push({ name: localItem.name, changes: itemChanges });
        totalChanges += itemChanges.length;
      }
    }

    console.log('Changes to be applied:\n');
    for (const { name, changes } of changePreview.slice(0, 20)) {
      console.log(`${name}:`);
      changes.forEach(c => console.log(c));
      console.log('');
    }
    if (changePreview.length > 20) {
      console.log(`... and ${changePreview.length - 20} more items\n`);
    }

    console.log(`Total: ${totalChanges} changes across ${changePreview.length} items\n`);

    // Ask for confirmation (simple Y/N via readline isn't available in ESM easily, so we'll just proceed)
    console.log('Applying updates...\n');

    let updatedCount = 0;
    for (const { localItem, wikiItem } of itemsToUpdate) {
      const changes = updateItemWithWikiData(localItem, wikiItem, localDB, {
        updateValue: true,
        updateWeight: true,
        updateStackSize: true,
        updateRarity: true,
        updateRecycle: true,
      });

      if (changes.length > 0) {
        updatedCount++;
        console.log(`  ✓ Updated ${localItem.name} (${changes.length} changes)`);
      }
    }

    if (updatedCount > 0) {
      console.log('');
      saveLocalDB(localDB);

      // Generate update report
      ensureReportsDir();
      const reportPath = path.join(REPORTS_DIR, 'update-report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        itemsUpdated: updatedCount,
        changes: changePreview
      }, null, 2));
      console.log(`Update report saved to: ${reportPath}`);
    }
  }

  else if (command === '--full-report') {
    console.log('Generating full report (this will take a while)...\n');

    // Step 1: Get all wiki items to find missing ones
    console.log('Step 1: Fetching wiki item list...');
    const wikiItems = await getAllWikiItems();
    console.log(`  Found ${wikiItems.length} wiki items\n`);

    // Step 2: Find missing items
    console.log('Step 2: Finding missing items...');
    const localNames = Object.values(localDB).map(i => i.name.toLowerCase());
    const localBaseNames = Object.values(localDB).map(i =>
      i.name.replace(/ (I{1,4}|IV|V)$/, '').toLowerCase()
    );

    const missingItems = wikiItems.filter(wikiName => {
      const lower = wikiName.toLowerCase();
      return !localNames.includes(lower) && !localBaseNames.includes(lower);
    });
    console.log(`  Found ${missingItems.length} missing items\n`);

    // Step 3: Verify ALL local items
    console.log('Step 3: Verifying all local items against wiki...');
    const allIssues = [];
    const allLocalItems = Object.values(localDB);
    let checked = 0;
    let withIssues = 0;
    let noWikiData = 0;

    for (const localItem of allLocalItems) {
      checked++;
      if (checked % 50 === 0) {
        console.log(`  Progress: ${checked}/${allLocalItems.length} items checked...`);
      }

      const wikiName = localItem.name.replace(/ (I{1,4}|IV|V)$/, '');
      const result = await verifyItem(wikiName, localItem);

      if (result && result.issues.length > 0) {
        withIssues++;
        allIssues.push({
          localName: result.localName,
          wikiName: result.name,
          tier: result.tier,
          issues: result.issues
        });
      } else if (!result) {
        noWikiData++;
      }

      await delay(DELAY_MS);
    }

    console.log(`\n=== Full Report Summary ===`);
    console.log(`Local items: ${allLocalItems.length}`);
    console.log(`Wiki items: ${wikiItems.length}`);
    console.log(`Missing from local: ${missingItems.length}`);
    console.log(`Items verified: ${checked}`);
    console.log(`Items with issues: ${withIssues}`);
    console.log(`Items without wiki data: ${noWikiData}`);

    // Categorize issues
    const weightIssues = [];
    const valueIssues = [];
    const stackSizeIssues = [];
    const rarityIssues = [];
    const recycleIssues = [];

    for (const item of allIssues) {
      for (const issue of item.issues) {
        const entry = { item: item.localName, ...issue };
        if (issue.field === 'weight') weightIssues.push(entry);
        else if (issue.field === 'value') valueIssues.push(entry);
        else if (issue.field === 'stackSize') stackSizeIssues.push(entry);
        else if (issue.field === 'rarity') rarityIssues.push(entry);
        else if (issue.field === 'recycleOutputs') recycleIssues.push(entry);
      }
    }

    // Save comprehensive report
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        localItems: allLocalItems.length,
        wikiItems: wikiItems.length,
        missingFromLocal: missingItems.length,
        itemsWithIssues: withIssues,
        itemsWithoutWikiData: noWikiData,
      },
      missingItems: missingItems,
      issuesByCategory: {
        weight: weightIssues,
        value: valueIssues,
        stackSize: stackSizeIssues,
        rarity: rarityIssues,
        recycleOutputs: recycleIssues,
      },
      allIssues: allIssues,
    };

    ensureReportsDir();
    const reportPath = path.join(REPORTS_DIR, 'full-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nFull report saved to: ${reportPath}`);

    // Print summary
    console.log(`\n--- Issue Breakdown ---`);
    console.log(`Weight mismatches: ${weightIssues.length}`);
    console.log(`Value mismatches: ${valueIssues.length}`);
    console.log(`Stack size mismatches: ${stackSizeIssues.length}`);
    console.log(`Rarity mismatches: ${rarityIssues.length}`);
    console.log(`Recycle output issues: ${recycleIssues.length}`);
  }

  else if (command === '--add-missing') {
    console.log('Finding and adding missing items from wiki...\n');

    // Step 1: Get all wiki items
    console.log('Step 1: Fetching wiki item list...');
    const wikiItems = await getAllWikiItems();
    console.log(`  Found ${wikiItems.length} wiki items\n`);

    // Step 2: Find items that exist on wiki but not in local DB
    console.log('Step 2: Finding missing items...');
    const localNames = new Set(Object.values(localDB).map(i => i.name.toLowerCase()));
    const localBaseNames = new Set(Object.values(localDB).map(i =>
      i.name.replace(/ (I{1,3}|IV)$/, '').toLowerCase()
    ));

    // Filter to items that are completely missing (not just tiered variants)
    const missingItems = wikiItems.filter(wikiName => {
      const lower = wikiName.toLowerCase();
      // Not in local by exact name
      if (localNames.has(lower)) return false;
      // Not a base name for tiered items we have
      if (localBaseNames.has(lower)) return false;
      return true;
    });

    console.log(`  Found ${missingItems.length} missing items\n`);

    if (missingItems.length === 0) {
      console.log('✓ No missing items to add!');
      return;
    }

    console.log('Step 3: Adding missing items...\n');
    console.log('Missing items to add:');
    missingItems.forEach(name => console.log(`  - ${name}`));
    console.log('');

    let added = 0;
    let failed = 0;

    for (const itemName of missingItems) {
      const result = await addMissingItem(itemName, localDB);
      if (result) {
        added++;
      } else {
        failed++;
      }
      await delay(DELAY_MS);
    }

    console.log(`\n=== Summary ===`);
    console.log(`Added: ${added}`);
    console.log(`Failed/Skipped: ${failed}`);

    if (added > 0) {
      console.log('');
      saveLocalDB(localDB);
    }
  }

  else {
    console.error(`Unknown command: ${command}`);
    console.log('Use --help for usage information');
  }
}

main().catch(console.error);
