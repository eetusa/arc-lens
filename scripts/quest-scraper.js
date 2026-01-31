#!/usr/bin/env node
/**
 * ARC Raiders Wiki Quest Scraper
 *
 * Scrapes quest data from https://arcraiders.wiki including:
 *   - Quest giver, locations, objectives, rewards
 *   - Previous/next quest relationships
 *   - Granted items
 *
 * Data Sources:
 *   - https://arcraiders.wiki/wiki/Quests - Bulk quest list (3 tabs)
 *   - Individual quest pages for detailed data
 *
 * Usage:
 *   node scripts/quest-scraper.js --help           # Show all commands
 *   node scripts/quest-scraper.js --list           # List all quests from wiki
 *   node scripts/quest-scraper.js --scrape-all     # Scrape all quests
 *   node scripts/quest-scraper.js --scrape <name>  # Scrape single quest
 *   node scripts/quest-scraper.js --compare        # Compare wiki vs local
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIKI_BASE = 'https://arcraiders.wiki/wiki';
const QUESTS_DB_PATH = path.join(__dirname, '../public/quests_detailed.json');
const QUESTS_SIMPLE_PATH = path.join(__dirname, '../public/quests.json');
const SCRAPED_CACHE_PATH = path.join(__dirname, '../.quest-cache.json');

// Rate limiting to be nice to the wiki
const DELAY_MS = 500;

// Quest categories matching wiki tabs
const QUEST_CATEGORIES = {
  main: 'Main Quests',
  bluegate: 'Blue Gate Introduction',
  stella: 'Stella Montis Introduction',
};

// Quest givers (traders)
const QUEST_GIVERS = ['Shani', 'Celeste', 'Tian Wen', 'Apollo', 'Lance', 'Scrappy'];

// Maps in the game
const GAME_MAPS = [
  'Dam Battlegrounds',
  'The Spaceport',
  'Buried City',
  'Blue Gate',
  'Stella Montis',
];

// Map location aliases
const LOCATION_ALIASES = {
  'Dam': 'Dam Battlegrounds',
  'Spaceport': 'The Spaceport',
  'Any': null, // Special case - quest can be done anywhere
};

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

// Decode HTML entities
function decodeHtmlEntities(str) {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Generate quest ID from name
function generateQuestId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Load local quests database
function loadLocalDB() {
  try {
    if (fs.existsSync(QUESTS_DB_PATH)) {
      const data = fs.readFileSync(QUESTS_DB_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load quests_detailed.json:', err.message);
  }
  return { quests: {}, lastUpdated: null };
}

// Save local quests database
function saveLocalDB(db) {
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(QUESTS_DB_PATH, JSON.stringify(db, null, 2));
  console.log(`Saved to: ${QUESTS_DB_PATH}`);
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
  return { quests: {}, lastUpdated: null };
}

// Save scraped cache
function saveCache(cache) {
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(SCRAPED_CACHE_PATH, JSON.stringify(cache, null, 2));
}

// Parse the main Quests page to get all quest names
async function getAllQuestNames() {
  console.log('Fetching quest list from wiki...');
  const url = `${WIKI_BASE}/Quests`;
  const html = await fetchPage(url);

  if (!html) {
    console.error('Failed to fetch quests page');
    return [];
  }

  const quests = [];

  // Find all quest links in the tabber content
  // Quest links are in the format: <a href="/wiki/Quest_Name" title="Quest Name">Quest Name</a>
  const questLinkRegex = /<a[^>]*href="\/wiki\/([^"]+)"[^>]*title="([^"]+)"[^>]*>([^<]+)<\/a>/gi;

  // Also track which category each quest belongs to by finding tabber sections
  let currentCategory = 'main';

  // Split by tabber tabs to identify categories
  const tabberMatch = html.match(/<div class="tabber[^"]*">([\s\S]*?)<\/div>\s*<\/div>/i);

  if (tabberMatch) {
    // Process each tab
    const tabContent = tabberMatch[1];

    // Find tab panels
    const tabPanels = tabContent.matchAll(/<article[^>]*data-title="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gi);

    for (const panel of tabPanels) {
      const tabTitle = panel[1];
      const content = panel[2];

      // Determine category from tab title
      if (tabTitle.includes('Main')) {
        currentCategory = 'main';
      } else if (tabTitle.includes('Blue Gate')) {
        currentCategory = 'bluegate';
      } else if (tabTitle.includes('Stella')) {
        currentCategory = 'stella';
      }

      // Find all quest links in this tab's content
      const linkMatches = content.matchAll(questLinkRegex);
      for (const match of linkMatches) {
        const urlPath = match[1];
        const title = decodeHtmlEntities(match[2]);

        // Filter out non-quest pages
        if (urlPath.includes(':')) continue; // Namespaced
        if (urlPath.includes('Category')) continue;
        if (QUEST_GIVERS.includes(title)) continue; // Skip NPC names
        if (GAME_MAPS.includes(title)) continue; // Skip map names
        if (title.length < 3) continue;

        // Check if this looks like a quest (has quest-related context)
        // Look for the context around the link
        const contextRegex = new RegExp(`<tr[^>]*>[\\s\\S]*?${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?<\\/tr>`, 'i');
        const hasTableContext = contextRegex.test(content);

        if (hasTableContext || !quests.find(q => q.name === title)) {
          // Avoid duplicates
          if (!quests.find(q => q.name === title)) {
            quests.push({
              name: title,
              category: currentCategory,
              wikiPath: urlPath,
            });
          }
        }
      }
    }
  }

  // Fallback: if tabber parsing failed, just get all quest-like links
  if (quests.length === 0) {
    console.log('  Tabber parsing failed, using fallback method...');

    // Look for links inside wikitable rows
    const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = html.matchAll(tableRowRegex);

    for (const row of rows) {
      const rowContent = row[1];

      // Skip header rows
      if (rowContent.includes('<th')) continue;

      // Get the first link in the row (likely the quest name)
      const firstLinkMatch = rowContent.match(/<a[^>]*href="\/wiki\/([^"]+)"[^>]*title="([^"]+)"/i);
      if (firstLinkMatch) {
        const title = decodeHtmlEntities(firstLinkMatch[2]);

        // Filter
        if (QUEST_GIVERS.includes(title)) continue;
        if (GAME_MAPS.includes(title)) continue;
        if (title.length < 3) continue;

        if (!quests.find(q => q.name === title)) {
          quests.push({
            name: title,
            category: 'main',
            wikiPath: firstLinkMatch[1],
          });
        }
      }
    }
  }

  console.log(`  Found ${quests.length} quests`);
  return quests;
}

// Parse bulk quest data from the Quests page tables
async function parseQuestsPageTables() {
  console.log('Parsing quest tables from wiki...');
  const url = `${WIKI_BASE}/Quests`;
  const html = await fetchPage(url);

  if (!html) {
    console.error('Failed to fetch quests page');
    return [];
  }

  const quests = [];

  // Parse table rows
  // Table structure: Quest Name | Quest Giver | Required Locations | Objectives | Rewards
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [...html.matchAll(tableRowRegex)];

  for (const row of rows) {
    const rowContent = row[1];

    // Skip header rows
    if (rowContent.includes('<th')) continue;

    // Extract cells
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [...rowContent.matchAll(cellRegex)].map(m => m[1]);

    if (cells.length < 5) continue;

    // Parse quest name from first cell
    const nameMatch = cells[0].match(/<a[^>]*title="([^"]+)"/i);
    if (!nameMatch) continue;

    const questName = decodeHtmlEntities(nameMatch[1]);

    // Skip non-quest entries
    if (QUEST_GIVERS.includes(questName)) continue;
    if (GAME_MAPS.includes(questName)) continue;

    // Parse quest giver from second cell
    const giverMatch = cells[1].match(/<a[^>]*title="([^"]+)"/i);
    const questGiver = giverMatch ? decodeHtmlEntities(giverMatch[1]) : null;

    // Parse required locations from third cell
    const locationMatches = cells[2].matchAll(/<a[^>]*title="([^"]+)"/gi);
    const locations = [];
    for (const match of locationMatches) {
      const loc = decodeHtmlEntities(match[1]);
      if (GAME_MAPS.includes(loc) || loc === 'Any') {
        locations.push(loc);
      }
    }
    // Also check for plain text "Any"
    if (cells[2].includes('Any') && locations.length === 0) {
      locations.push('Any');
    }

    // Parse objectives from fourth cell (simple text extraction)
    const objectivesText = cells[3]
      .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    // Split objectives by semicolons or numbered patterns
    const objectives = objectivesText
      .split(/[;]|\d+\.\s+/)
      .map(o => o.trim())
      .filter(o => o.length > 0);

    // Parse rewards from fifth cell
    const rewards = [];
    const rewardRegex = /(\d+)×?\s*<a[^>]*title="([^"]+)"/gi;
    const rewardMatches = cells[4].matchAll(rewardRegex);
    for (const match of rewardMatches) {
      rewards.push({
        amount: parseInt(match[1]),
        item: decodeHtmlEntities(match[2]),
      });
    }

    // Also check for items without amounts (just "1")
    const singleRewardRegex = /<a[^>]*title="([^"]+)"[^>]*>[^<]+<\/a>/gi;
    const singleMatches = cells[4].matchAll(singleRewardRegex);
    for (const match of singleMatches) {
      const itemName = decodeHtmlEntities(match[1]);
      // Check if this item was already added with an amount
      if (!rewards.find(r => r.item === itemName)) {
        rewards.push({ amount: 1, item: itemName });
      }
    }

    quests.push({
      name: questName,
      questGiver,
      requiredMaps: locations,
      objectivesSummary: objectives,
      rewards,
    });
  }

  console.log(`  Parsed ${quests.length} quests from tables`);
  return quests;
}

// Parse individual quest page for detailed data
async function scrapeQuestPage(questName) {
  const urlName = questName.replace(/ /g, '_');
  const url = `${WIKI_BASE}/${encodeURIComponent(urlName)}`;

  console.log(`  Scraping: ${questName}`);
  const html = await fetchPage(url);

  if (!html) {
    return null;
  }

  const quest = {
    id: generateQuestId(questName),
    name: questName,
    wikiUrl: url,
    scrapedAt: new Date().toISOString(),
  };

  // Extract infobox
  const infoboxMatch = html.match(/<table class="infobox[^"]*">([\s\S]*?)<\/table>/i);

  if (infoboxMatch) {
    const infobox = infoboxMatch[1];

    // Parse quest giver
    for (const giver of QUEST_GIVERS) {
      if (infobox.includes(`title="${giver}"`)) {
        quest.questGiver = giver;
        break;
      }
    }

    // Parse quest giver icon
    const iconMatch = infobox.match(/src="([^"]*traders[^"]*\.(?:webp|png))"/i);
    if (iconMatch) {
      quest.questGiverIcon = iconMatch[1];
    }

    // Parse locations from data-location row
    const locationRow = infobox.match(/<tr[^>]*class="[^"]*data-location[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
    if (locationRow) {
      const locations = [];
      const locMatches = locationRow[1].matchAll(/<a[^>]*title="([^"]+)"/gi);
      for (const match of locMatches) {
        const loc = decodeHtmlEntities(match[1]);
        locations.push(loc);
      }
      if (locations.length > 0) {
        quest.requiredMaps = locations;
      }
    }

    // Parse previous quest
    const prevRow = infobox.match(/<tr[^>]*class="[^"]*data-previous[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
    if (prevRow) {
      const prevMatch = prevRow[1].match(/<a[^>]*title="([^"]+)"/i);
      if (prevMatch) {
        quest.previousQuest = decodeHtmlEntities(prevMatch[1]);
      }
    }

    // Parse next quest
    const nextRow = infobox.match(/<tr[^>]*class="[^"]*data-next[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
    if (nextRow) {
      const nextMatch = nextRow[1].match(/<a[^>]*title="([^"]+)"/i);
      if (nextMatch) {
        quest.nextQuest = decodeHtmlEntities(nextMatch[1]);
      }
    }
  }

  // Parse objectives section
  // Try multiple heading patterns
  let objectivesHtml = null;

  // Pattern 1: span with id inside h2
  const pattern1 = html.match(/<h2[^>]*>\s*<span[^>]*id="Objectives"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i);
  if (pattern1) objectivesHtml = pattern1[1];

  // Pattern 2: Simple h2 with "Objectives" text
  if (!objectivesHtml) {
    const pattern2 = html.match(/<h2[^>]*>Objectives<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i);
    if (pattern2) objectivesHtml = pattern2[1];
  }

  // Pattern 3: mw-headline span
  if (!objectivesHtml) {
    const pattern3 = html.match(/<span[^>]*class="mw-headline"[^>]*id="Objectives"[^>]*>[\s\S]*?<\/span>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i);
    if (pattern3) objectivesHtml = pattern3[1];
  }

  // Pattern 4: Look for the objectives section by finding heading that contains "Objectives"
  if (!objectivesHtml) {
    const pattern4 = html.match(/<h2[^>]*>[\s\S]*?Objectives[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i);
    if (pattern4) objectivesHtml = pattern4[1];
  }

  if (objectivesHtml) {
    const objectives = [];

    // Parse list items (both ul/li and plain li)
    const liMatches = objectivesHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    let objId = 1;

    for (const match of liMatches) {
      let text = match[1]
        .replace(/<[^>]+>/g, ' ')  // Remove HTML
        .replace(/\s+/g, ' ')      // Normalize whitespace
        .trim();

      text = decodeHtmlEntities(text);

      if (text.length > 0) {
        const objective = {
          id: objId++,
          text: text,
          type: guessObjectiveType(text),
        };

        // Try to extract item name if it's a deliver/find objective
        const itemMatch = text.match(/(?:deliver|find|bring|collect|get|grab)\s+(?:a\s+)?(?:\d+\s*)?([A-Z][^,.]+)/i);
        if (itemMatch) {
          objective.item = itemMatch[1].trim();
        }

        // Try to extract amount
        const amountMatch = text.match(/(\d+)\s*(?:x\s+)?(?:[A-Z])/i);
        if (amountMatch) {
          objective.amount = parseInt(amountMatch[1]);
        }

        // Try to extract location
        for (const map of GAME_MAPS) {
          if (text.includes(map)) {
            objective.map = map;
            break;
          }
        }

        // Look for specific locations mentioned
        const locationMatch = text.match(/(?:at|on|in|near|to)\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\s*[,.]|$)/i);
        if (locationMatch) {
          objective.location = locationMatch[1].trim();
        }

        objectives.push(objective);
      }
    }

    if (objectives.length > 0) {
      quest.objectives = objectives;
    }
  }

  // Parse granted items - try multiple patterns
  let grantedHtml = null;

  const grantedPatterns = [
    /<h2[^>]*>\s*<span[^>]*id="Granted_Items"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i,
    /<h2[^>]*>Granted Items<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i,
    /<h2[^>]*>[\s\S]*?Granted[\s\S]*?Items[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i,
  ];

  for (const pattern of grantedPatterns) {
    const match = html.match(pattern);
    if (match) {
      grantedHtml = match[1];
      break;
    }
  }

  if (grantedHtml) {
    const grantedItems = [];

    // Parse items with amounts: "5× Item Name" or just "Item Name"
    const itemRegex = /(\d+)×?\s*<a[^>]*title="([^"]+)"/gi;
    const matches = grantedHtml.matchAll(itemRegex);

    for (const match of matches) {
      grantedItems.push({
        amount: parseInt(match[1]),
        item: decodeHtmlEntities(match[2]),
      });
    }

    if (grantedItems.length > 0) {
      quest.grantedItems = grantedItems;
    }
  }

  // Parse rewards - try multiple patterns
  let rewardsHtml = null;

  const rewardsPatterns = [
    /<h2[^>]*>\s*<span[^>]*id="Rewards"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i,
    /<h2[^>]*>Rewards<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i,
    /<h2[^>]*>[\s\S]*?Rewards[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|<div class="navbox|$)/i,
  ];

  for (const pattern of rewardsPatterns) {
    const match = html.match(pattern);
    if (match) {
      rewardsHtml = match[1];
      break;
    }
  }

  if (rewardsHtml) {
    const rewards = [];

    // Pattern 1: Items with title attribute - e.g., 1× <a title="Item Name">
    const titleRegex = /(\d+)\s*[×x]?\s*<a[^>]*title="([^"]+)"/gi;
    for (const match of rewardsHtml.matchAll(titleRegex)) {
      const item = decodeHtmlEntities(match[2]);
      rewards.push({
        amount: parseInt(match[1]),
        item: item,
        type: guessRewardType(item),
      });
    }

    // Pattern 2: Items in list format - e.g., <li>1x <a href="...">Item Name</a></li>
    // This is the most common format on the wiki
    const listItemRegex = /<li>\s*(\d+)\s*[×x]\s*<a[^>]*>([^<]+)<\/a>/gi;
    for (const match of rewardsHtml.matchAll(listItemRegex)) {
      const item = decodeHtmlEntities(match[2].trim());
      // Avoid duplicates if title pattern already matched
      if (!rewards.some(r => r.item === item)) {
        rewards.push({
          amount: parseInt(match[1]),
          item: item,
          type: guessRewardType(item),
        });
      }
    }

    // Pattern 3: Inline format without list - e.g., 1x <a href="...">Item Name</a>
    const inlineRegex = /(\d+)\s*[×x]\s*<a[^>]*>([^<]+)<\/a>/gi;
    for (const match of rewardsHtml.matchAll(inlineRegex)) {
      const item = decodeHtmlEntities(match[2].trim());
      // Avoid duplicates
      if (!rewards.some(r => r.item === item)) {
        rewards.push({
          amount: parseInt(match[1]),
          item: item,
          type: guessRewardType(item),
        });
      }
    }

    // Pattern 4: Link followed by text - e.g., <li><a href="...">Hullcracker</a> Blueprint</li>
    const linkWithSuffixRegex = /<li>\s*<a[^>]*>([^<]+)<\/a>\s*([^<\n]+?)\s*<\/li>/gi;
    for (const match of rewardsHtml.matchAll(linkWithSuffixRegex)) {
      const linkText = decodeHtmlEntities(match[1].trim());
      const suffix = match[2].trim();
      // Skip if this looks like coins (handled separately)
      if (linkText.toLowerCase() === 'coins') continue;
      const item = suffix ? `${linkText} ${suffix}` : linkText;
      if (!rewards.some(r => r.item === item)) {
        rewards.push({
          amount: 1,
          item: item,
          type: guessRewardType(item),
        });
      }
    }

    // Pattern 5: Plain text list items (no links, no amounts) - e.g., <li>Backpack Charm (Succulent)</li>
    const plainTextRegex = /<li>([^<]+)<\/li>/gi;
    for (const match of rewardsHtml.matchAll(plainTextRegex)) {
      const text = decodeHtmlEntities(match[1].trim());
      // Skip if it looks like a number prefix or coins
      if (/^\d+\s*[×x]/.test(text)) continue;
      if (text.toLowerCase().includes('coin')) continue;
      // Skip very short text (likely noise)
      if (text.length < 3) continue;
      if (!rewards.some(r => r.item === text)) {
        rewards.push({
          amount: 1,
          item: text,
          type: guessRewardType(text),
        });
      }
    }

    // Pattern 6: Coins in template-price span - e.g., <span class="template-price">...<a title="Coins">...</a>...1,000</span>
    const templatePriceRegex = /<span[^>]*class="template-price"[^>]*>[\s\S]*?<a[^>]*(?:title="Coins"|href="[^"]*\/Coins")[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/span>[\s\S]*?(\d+(?:,\d+)?)/i;
    const templatePriceMatch = rewardsHtml.match(templatePriceRegex);
    if (templatePriceMatch && !rewards.some(r => r.item === 'Coins')) {
      rewards.push({
        amount: parseInt(templatePriceMatch[1].replace(/,/g, '')),
        item: 'Coins',
        type: 'coins',
      });
    }

    // Pattern 7: Coins where amount is AFTER simple anchor - e.g., <a>Coins</a> 1,000
    if (!rewards.some(r => r.item === 'Coins')) {
      const coinsAfterRegex = /<a[^>]*>Coins<\/a>\s*(\d+(?:,\d+)?)/i;
      const coinsAfterMatch = rewardsHtml.match(coinsAfterRegex);
      if (coinsAfterMatch) {
        rewards.push({
          amount: parseInt(coinsAfterMatch[1].replace(/,/g, '')),
          item: 'Coins',
          type: 'coins',
        });
      }
    }

    // Pattern 8: Coins where amount is BEFORE - e.g., 1,000 Coins or 1,000× Coins
    if (!rewards.some(r => r.item === 'Coins')) {
      const coinMatch = rewardsHtml.match(/(\d+(?:,\d+)?)\s*(?:[×x]?\s*)?(?:Coins?|<img[^>]*coins)/i);
      if (coinMatch) {
        rewards.push({
          amount: parseInt(coinMatch[1].replace(/,/g, '')),
          item: 'Coins',
          type: 'coins',
        });
      }
    }

    // Pattern 9: Fallback - look for template-price span content like ">1,000</span>"
    if (!rewards.some(r => r.item === 'Coins')) {
      // The template-price often has the number right before closing </span>
      const fallbackMatch = rewardsHtml.match(/<span[^>]*class="template-price"[^>]*>[\s\S]*?>(\d+(?:,\d+)?)<\/span>/i);
      if (fallbackMatch) {
        rewards.push({
          amount: parseInt(fallbackMatch[1].replace(/,/g, '')),
          item: 'Coins',
          type: 'coins',
        });
      }
    }

    if (rewards.length > 0) {
      quest.rewards = rewards;
    }
  }

  return quest;
}

// Guess objective type from text
function guessObjectiveType(text) {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('photograph') || lowerText.includes('take a photo') || lowerText.includes('snap')) {
    return 'photograph';
  }
  if (lowerText.includes('deliver') || lowerText.includes('bring') || lowerText.includes('hand over')) {
    return 'deliver';
  }
  if (lowerText.includes('find') || lowerText.includes('locate') || lowerText.includes('search')) {
    return 'locate';
  }
  if (lowerText.includes('interact') || lowerText.includes('use') || lowerText.includes('activate')) {
    return 'interact';
  }
  if (lowerText.includes('kill') || lowerText.includes('defeat') || lowerText.includes('eliminate')) {
    return 'kill';
  }
  if (lowerText.includes('reach') || lowerText.includes('go to') || lowerText.includes('visit')) {
    return 'reach';
  }
  if (lowerText.includes('collect') || lowerText.includes('gather') || lowerText.includes('loot')) {
    return 'collect';
  }

  return 'unknown';
}

// Guess reward type from item name
function guessRewardType(itemName) {
  const lowerName = itemName.toLowerCase();

  if (lowerName.includes('outfit') || lowerName.includes('skin') || lowerName.includes('cosmetic')) {
    return 'outfit';
  }
  if (lowerName.includes('coin')) {
    return 'coins';
  }
  if (lowerName.includes('key')) {
    return 'key';
  }
  if (lowerName.includes('ammo')) {
    return 'ammo';
  }

  return 'item';
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
ARC Raiders Wiki Quest Scraper

Usage:
  node scripts/quest-scraper.js --list           List all quests from wiki
  node scripts/quest-scraper.js --scrape-all     Scrape all quests in detail
  node scripts/quest-scraper.js --scrape <name>  Scrape single quest
  node scripts/quest-scraper.js --compare        Compare wiki vs local quests.json
  node scripts/quest-scraper.js --bulk           Parse bulk data from quest tables

Examples:
  node scripts/quest-scraper.js --list
  node scripts/quest-scraper.js --scrape "The League"
  node scripts/quest-scraper.js --scrape-all
  node scripts/quest-scraper.js --compare
`);
    return;
  }

  if (command === '--list') {
    const quests = await getAllQuestNames();
    console.log(`\nFound ${quests.length} quests:\n`);

    // Group by category
    const byCategory = {};
    for (const quest of quests) {
      const cat = quest.category || 'unknown';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(quest);
    }

    for (const [category, catQuests] of Object.entries(byCategory)) {
      console.log(`\n=== ${QUEST_CATEGORIES[category] || category} (${catQuests.length}) ===`);
      catQuests.forEach(q => console.log(`  - ${q.name}`));
    }
  }

  else if (command === '--bulk') {
    const quests = await parseQuestsPageTables();
    console.log(`\nParsed ${quests.length} quests from tables\n`);

    // Show sample
    console.log('Sample quest data:');
    console.log(JSON.stringify(quests.slice(0, 3), null, 2));

    // Save to cache
    const cache = loadCache();
    for (const quest of quests) {
      const id = generateQuestId(quest.name);
      cache.quests[id] = {
        ...cache.quests[id],
        ...quest,
        bulkScrapedAt: new Date().toISOString(),
      };
    }
    saveCache(cache);
    console.log(`\nSaved to cache: ${SCRAPED_CACHE_PATH}`);
  }

  else if (command === '--scrape') {
    const questName = args.slice(1).join(' ');
    if (!questName) {
      console.error('Please provide a quest name');
      return;
    }

    const quest = await scrapeQuestPage(questName);
    if (quest) {
      console.log('\n=== Scraped Quest Data ===');
      console.log(JSON.stringify(quest, null, 2));

      // Save to cache
      const cache = loadCache();
      cache.quests[quest.id] = quest;
      saveCache(cache);
      console.log(`\nSaved to cache as "${quest.id}"`);
    } else {
      console.log('Failed to scrape quest');
    }
  }

  else if (command === '--scrape-all') {
    // First get all quest names
    const questNames = await getAllQuestNames();
    console.log(`\nScraping ${questNames.length} quests...\n`);

    const db = loadLocalDB();
    let scraped = 0;
    let failed = 0;
    const noRewards = [];
    const noObjectives = [];

    for (const questInfo of questNames) {
      const quest = await scrapeQuestPage(questInfo.name);

      if (quest) {
        // Add category from list
        quest.category = questInfo.category;

        db.quests[quest.id] = quest;
        scraped++;

        // Track quests missing expected data
        if (!quest.rewards || quest.rewards.length === 0) {
          noRewards.push(questInfo.name);
        }
        if (!quest.objectives || quest.objectives.length === 0) {
          noObjectives.push(questInfo.name);
        }

        console.log(`    ✓ ${questInfo.name}`);
      } else {
        failed++;
        console.log(`    ✗ ${questInfo.name}`);
      }

      await delay(DELAY_MS);
    }

    console.log(`\n=== Scrape Complete ===`);
    console.log(`Scraped: ${scraped}`);
    console.log(`Failed: ${failed}`);

    // Flag quests missing data for manual inspection
    if (noRewards.length > 0) {
      console.log(`\n⚠️  Quests WITHOUT rewards (${noRewards.length}) - may need manual inspection:`);
      noRewards.forEach(q => console.log(`    - ${q}`));
    }

    if (noObjectives.length > 0) {
      console.log(`\n⚠️  Quests WITHOUT objectives (${noObjectives.length}) - may need manual inspection:`);
      noObjectives.forEach(q => console.log(`    - ${q}`));
    }

    if (scraped > 0) {
      saveLocalDB(db);
    }
  }

  else if (command === '--compare') {
    // Get wiki quests
    const wikiQuests = await getAllQuestNames();
    const wikiNames = new Set(wikiQuests.map(q => q.name.toLowerCase()));

    // Load local quests.json
    let localQuests = {};
    try {
      const data = fs.readFileSync(QUESTS_SIMPLE_PATH, 'utf-8');
      localQuests = JSON.parse(data);
    } catch (err) {
      console.error('Failed to load quests.json:', err.message);
      return;
    }

    const localNames = new Set(Object.keys(localQuests).map(q => q.toLowerCase()));

    // Compare
    const missingFromLocal = [...wikiNames].filter(n => !localNames.has(n));
    const missingFromWiki = [...localNames].filter(n => !wikiNames.has(n));

    console.log(`\n=== Comparison Results ===`);
    console.log(`Wiki quests: ${wikiNames.size}`);
    console.log(`Local quests: ${localNames.size}`);
    console.log(`Missing from local: ${missingFromLocal.length}`);
    console.log(`Missing from wiki: ${missingFromWiki.length}`);

    if (missingFromLocal.length > 0) {
      console.log(`\nMissing from local quests.json:`);
      missingFromLocal.forEach(q => console.log(`  - ${q}`));
    }

    if (missingFromWiki.length > 0) {
      console.log(`\nIn local but not on wiki (might be OK):`);
      missingFromWiki.forEach(q => console.log(`  - ${q}`));
    }
  }

  else {
    console.error(`Unknown command: ${command}`);
    console.log('Use --help for usage information');
  }
}

main().catch(console.error);
