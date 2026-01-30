#!/usr/bin/env node
/**
 * ARC Raiders Trophy Display Scraper
 *
 * Scrapes Trophy Display stage data from https://arcraiders.wiki/wiki/Trophy_Display
 * and updates the trophyDisplay section in projects.json.
 *
 * Usage:
 *   node scripts/trophy-display-scraper.js --help      # Show all commands
 *   node scripts/trophy-display-scraper.js --scrape    # Scrape and update projects.json
 *   node scripts/trophy-display-scraper.js --list      # Show current trophy display data
 *   node scripts/trophy-display-scraper.js --verify    # Check if items exist in items_db
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIKI_URL = 'https://arcraiders.wiki/wiki/Trophy_Display';
const PROJECTS_PATH = path.join(__dirname, '../public/projects.json');
const ITEMS_DB_PATH = path.join(__dirname, '../public/items_db.json');

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
function loadItemsDB() {
  try {
    const data = fs.readFileSync(ITEMS_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load items_db.json:', err.message);
    return {};
  }
}

// Load existing projects.json
function loadProjects() {
  try {
    if (fs.existsSync(PROJECTS_PATH)) {
      return JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load projects.json:', err.message);
  }
  return { currentProject: null, lastUpdated: null };
}

// Save projects.json
function saveProjects(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(data, null, 2));
  console.log(`\nSaved to: ${PROJECTS_PATH}`);
}

// Find or create a project in the projects array
function upsertProject(data, project) {
  if (!data.projects) {
    data.projects = [];
  }

  const existingIndex = data.projects.findIndex(p => p.id === project.id);
  if (existingIndex >= 0) {
    data.projects[existingIndex] = project;
  } else {
    data.projects.push(project);
  }
}

// Parse a single TD to extract item name and amount
// Format: "10x <span...><a href="..." title="Item Name">..."
function parseRequirementTd(tdHtml) {
  // Extract amount: look for "Nx" or "N×" pattern at the start
  const amountMatch = tdHtml.match(/(\d+)\s*[x×]/i);
  if (!amountMatch) return null;

  const amount = parseInt(amountMatch[1]);

  // Extract item name from the title attribute of the first link
  const titleMatch = tdHtml.match(/<a[^>]*title="([^"]+)"/);
  if (!titleMatch) return null;

  const itemName = titleMatch[1];

  return { item: itemName, amount };
}

// Parse the Trophy Display page
async function parseTrophyDisplayPage() {
  console.log(`Fetching: ${WIKI_URL}`);
  const html = await fetchPage(WIKI_URL);
  if (!html) return null;

  const trophyDisplay = {
    id: 'trophy-display',
    name: 'Trophy Display',
    wikiUrl: WIKI_URL,
    startDate: '2026-01-27',
    phases: []
  };

  // Stage names and their tabber panel IDs (need to escape parentheses for regex)
  const stages = [
    { id: 1, name: 'Roaming Threats', tabId: 'tabber-Roaming_Threats_\\(1\\)' },
    { id: 2, name: 'Soaring Menaces', tabId: 'tabber-Soaring_Menaces_\\(2\\)' },
    { id: 3, name: 'Ferocious Foes', tabId: 'tabber-Ferocious_Foes_\\(3\\)' },
    { id: 4, name: 'Dominant Dangers', tabId: 'tabber-Dominant_Dangers_\\(4\\)' },
    { id: 5, name: 'Imposing Behemoths', tabId: 'tabber-Imposing_Behemoths_\\(5\\)' }
  ];

  // Find each stage's tabber panel and extract the table
  for (const stage of stages) {
    // Pattern: find the article with the tabber panel id, then extract the table inside
    const panelPattern = new RegExp(
      `id="${stage.tabId}"[^>]*>[\\s\\S]*?<table[^>]*class="wikitable"[^>]*>([\\s\\S]*?)<\\/table>`,
      'i'
    );

    const panelMatch = html.match(panelPattern);
    if (!panelMatch) {
      console.log(`  Warning: Could not find table for stage "${stage.name}"`);
      continue;
    }

    const tableHtml = panelMatch[1];
    const requirements = [];

    // Find all TR elements
    const trMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

    for (const trMatch of trMatches) {
      const trHtml = trMatch[1];

      // Skip header rows (contain <th>)
      if (trHtml.includes('<th')) continue;

      // Find all TD elements in this row
      const tdMatches = [...trHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];

      if (tdMatches.length >= 1) {
        // FIRST TD is the requirement, second TD is the reward (ignored)
        const firstTdHtml = tdMatches[0][1];
        const req = parseRequirementTd(firstTdHtml);

        if (req) {
          requirements.push(req);
        }
      }
    }

    if (requirements.length > 0) {
      trophyDisplay.phases.push({
        id: stage.id,
        name: stage.name,
        requirements
      });
      console.log(`  Stage ${stage.id} (${stage.name}): ${requirements.length} requirements`);
      for (const req of requirements) {
        console.log(`    - ${req.amount}x ${req.item}`);
      }
    } else {
      console.log(`  Warning: No requirements found for stage "${stage.name}"`);
    }
  }

  return trophyDisplay;
}

// Verify items exist in the database
function verifyItemsExist(trophyDisplay, itemsDB) {
  const issues = [];
  const itemNames = new Set(Object.values(itemsDB).map(i => i.name.toLowerCase()));

  for (const phase of trophyDisplay.phases) {
    if (!phase.requirements) continue;

    for (const req of phase.requirements) {
      if (!itemNames.has(req.item.toLowerCase())) {
        issues.push({
          phase: phase.name,
          item: req.item,
          issue: 'Item not found in items_db.json'
        });
      }
    }
  }

  return issues;
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
ARC Raiders Trophy Display Scraper

Usage:
  node scripts/trophy-display-scraper.js --scrape    Scrape Trophy Display and update projects.json
  node scripts/trophy-display-scraper.js --list      Show current trophy display data
  node scripts/trophy-display-scraper.js --verify    Check if items in requirements exist in items_db

Examples:
  node scripts/trophy-display-scraper.js --scrape
  node scripts/trophy-display-scraper.js --list
  node scripts/trophy-display-scraper.js --verify
`);
    return;
  }

  if (command === '--scrape') {
    console.log('=== Scraping Trophy Display ===\n');

    const trophyDisplay = await parseTrophyDisplayPage();
    if (!trophyDisplay) {
      console.error('Could not parse Trophy Display page');
      return;
    }

    console.log(`\nStages found: ${trophyDisplay.phases.length}`);

    // Verify items
    const itemsDB = loadItemsDB();
    const issues = verifyItemsExist(trophyDisplay, itemsDB);

    if (issues.length > 0) {
      console.log(`\n⚠️  Found ${issues.length} item(s) not in database:`);
      for (const issue of issues) {
        console.log(`    - ${issue.item} (${issue.phase})`);
      }
    }

    // Load existing projects and upsert trophy display
    const data = loadProjects();
    upsertProject(data, trophyDisplay);
    saveProjects(data);

    console.log('\n✓ Done!');
  }

  else if (command === '--list') {
    const data = loadProjects();
    const td = data.projects?.find(p => p.id === 'trophy-display');

    if (!td) {
      console.log('No trophy display data found. Run --scrape first.');
      return;
    }

    console.log(`\n=== ${td.name} ===`);
    console.log(`URL: ${td.wikiUrl}`);
    console.log(`Start Date: ${td.startDate}`);
    console.log(`Last Updated: ${data.lastUpdated}`);

    console.log('\nStages:');
    for (const phase of td.phases) {
      console.log(`\n  ${phase.id}. ${phase.name}`);
      if (phase.requirements && phase.requirements.length > 0) {
        for (const req of phase.requirements) {
          console.log(`       - ${req.amount}x ${req.item}`);
        }
      }
    }
  }

  else if (command === '--verify') {
    const data = loadProjects();
    const td = data.projects?.find(p => p.id === 'trophy-display');

    if (!td) {
      console.log('No trophy display data found. Run --scrape first.');
      return;
    }

    const itemsDB = loadItemsDB();
    const issues = verifyItemsExist(td, itemsDB);

    if (issues.length === 0) {
      console.log('✓ All items in trophy display requirements exist in items_db.json');
    } else {
      console.log(`\n⚠️  Found ${issues.length} issue(s):\n`);
      for (const issue of issues) {
        console.log(`  Stage "${issue.phase}": "${issue.item}" - ${issue.issue}`);
      }
    }
  }

  else {
    console.error(`Unknown command: ${command}`);
    console.log('Use --help for usage information');
  }
}

main().catch(console.error);
