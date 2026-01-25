#!/usr/bin/env node
/**
 * ARC Raiders Project Scraper
 *
 * Scrapes project/expedition data from https://arcraiders.wiki and updates
 * the local projects.json file.
 *
 * Usage:
 *   node scripts/project-scraper.js --help           # Show all commands
 *   node scripts/project-scraper.js --scrape         # Scrape current project and update projects.json
 *   node scripts/project-scraper.js --list           # Show current project phases
 *   node scripts/project-scraper.js --verify         # Check if items in requirements exist in items_db
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIKI_BASE = 'https://arcraiders.wiki/wiki';
const PROJECTS_PATH = path.join(__dirname, '../public/projects.json');
const ITEMS_DB_PATH = path.join(__dirname, '../public/items_db.json');
const REPORTS_DIR = path.join(__dirname, '../project-reports');

// Rate limiting to be nice to the wiki
const DELAY_MS = 500;

// Helper: delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Ensure directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

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

// Get current project URL from the Projects page
async function getCurrentProjectUrl() {
  console.log('Fetching Projects page...');
  const html = await fetchPage(`${WIKI_BASE}/Projects`);
  if (!html) return null;

  // Look for the current expedition link
  // Pattern: <a href="/wiki/Expedition" title="Expedition">
  // Or look for "Expedition 2" or similar
  const expeditionMatch = html.match(/href="(\/wiki\/Expedition[^"]*)"[^>]*title="([^"]+)"/i);
  if (expeditionMatch) {
    return {
      url: `https://arcraiders.wiki${expeditionMatch[1]}`,
      name: expeditionMatch[2]
    };
  }

  // Fallback: try direct Expedition page
  return {
    url: `${WIKI_BASE}/Expedition`,
    name: 'Expedition'
  };
}

// Parse a phase table row to extract item requirements
function parsePhaseRequirements(rowHtml) {
  const requirements = [];

  // Pattern: "150× <a...>Metal Parts</a>" or "150 × <a...>Metal Parts</a>"
  // Also handles: <a...>Metal Parts</a> ×150 or ×150
  const itemMatches = rowHtml.matchAll(/(\d+)\s*×?\s*<a[^>]*title="([^"]+)"/g);
  for (const match of itemMatches) {
    requirements.push({
      item: match[2],
      amount: parseInt(match[1])
    });
  }

  // Alternative pattern: <a>Item</a> (150)
  const altMatches = rowHtml.matchAll(/<a[^>]*title="([^"]+)"[^>]*>[^<]*<\/a>\s*\((\d+)\)/g);
  for (const match of altMatches) {
    // Avoid duplicates
    if (!requirements.find(r => r.item === match[1])) {
      requirements.push({
        item: match[1],
        amount: parseInt(match[2])
      });
    }
  }

  return requirements;
}

// Parse coin-based requirements (for Load Stage type phases)
function parseCoinRequirements(rowHtml) {
  const coinReqs = [];

  // Pattern: "Combat Items" with coin value
  // This is a simplified parser - actual wiki structure may vary
  const coinMatch = rowHtml.match(/(\d{1,3}(?:,\d{3})*)\s*(?:coins?)?/gi);
  if (coinMatch) {
    for (const match of coinMatch) {
      const value = parseInt(match.replace(/,/g, ''));
      if (value > 1000) { // Likely a coin value, not an item count
        coinReqs.push({ coinValue: value });
      }
    }
  }

  return coinReqs;
}

// Parse expedition page for phases
async function parseExpeditionPage(url) {
  console.log(`Fetching expedition page: ${url}`);
  const html = await fetchPage(url);
  if (!html) return null;

  const project = {
    name: '',
    wikiUrl: url,
    startDate: null,
    endDate: null,
    phases: []
  };

  // Extract project name from title
  const titleMatch = html.match(/<h1[^>]*class="[^"]*page-header__title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  if (titleMatch) {
    project.name = titleMatch[1].trim();
  } else {
    // Fallback: extract from URL
    const urlName = url.split('/').pop().replace(/_/g, ' ');
    project.name = urlName;
  }

  // Extract dates if present
  // Pattern varies, but often in format: "December 2, 2025 - February 18, 2026"
  const dateMatch = html.match(/(\w+ \d{1,2},? \d{4})\s*[-–]\s*(\w+ \d{1,2},? \d{4})/i);
  if (dateMatch) {
    try {
      project.startDate = new Date(dateMatch[1]).toISOString().split('T')[0];
      project.endDate = new Date(dateMatch[2]).toISOString().split('T')[0];
    } catch (e) {
      console.warn('Could not parse dates:', dateMatch[0]);
    }
  }

  // Find phase tables
  // Look for section headers like "Phase 1", "Foundation", etc.
  const phaseNames = [
    'Foundation',
    'Core Systems',
    'Framework',
    'Outfitting',
    'Load Stage',
    'Departure'
  ];

  // Method 1: Look for wikitables with phase data
  const tableMatches = html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi);

  for (const tableMatch of tableMatches) {
    const tableHtml = tableMatch[1];
    const rows = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

    for (const row of rows) {
      const rowHtml = row[1];

      // Skip header rows
      if (rowHtml.includes('<th')) continue;

      // Check if this row contains a phase name
      let foundPhase = null;
      let phaseId = 0;

      for (let i = 0; i < phaseNames.length; i++) {
        if (rowHtml.toLowerCase().includes(phaseNames[i].toLowerCase())) {
          foundPhase = phaseNames[i];
          phaseId = i + 1;
          break;
        }
      }

      if (foundPhase) {
        const requirements = parsePhaseRequirements(rowHtml);
        const coinRequirements = parseCoinRequirements(rowHtml);

        // Only add if we found some requirements
        if (requirements.length > 0 || coinRequirements.length > 0) {
          const phase = {
            id: phaseId,
            name: foundPhase
          };

          if (requirements.length > 0) {
            phase.requirements = requirements;
          }

          if (coinRequirements.length > 0) {
            phase.coinRequirements = coinRequirements;
          }

          // Don't add duplicates
          if (!project.phases.find(p => p.id === phaseId)) {
            project.phases.push(phase);
          }
        }
      }
    }
  }

  // Method 2: Look for phase sections with headers
  if (project.phases.length === 0) {
    console.log('  Trying alternative parsing method...');

    for (let i = 0; i < phaseNames.length; i++) {
      const phaseName = phaseNames[i];
      // Look for section with this phase name
      const sectionPattern = new RegExp(
        `id="${phaseName.replace(/ /g, '_')}"[\\s\\S]*?<table[^>]*>([\\s\\S]*?)<\\/table>`,
        'i'
      );
      const sectionMatch = html.match(sectionPattern);

      if (sectionMatch) {
        const requirements = parsePhaseRequirements(sectionMatch[1]);
        if (requirements.length > 0) {
          project.phases.push({
            id: i + 1,
            name: phaseName,
            requirements: requirements
          });
        }
      }
    }
  }

  // Sort phases by ID
  project.phases.sort((a, b) => a.id - b.id);

  return project;
}

// Verify items exist in the database
function verifyItemsExist(project, itemsDB) {
  const issues = [];
  const itemNames = new Set(Object.values(itemsDB).map(i => i.name.toLowerCase()));

  for (const phase of project.phases) {
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
ARC Raiders Project Scraper

Usage:
  node scripts/project-scraper.js --scrape         Scrape current project and update projects.json
  node scripts/project-scraper.js --list           Show current project phases
  node scripts/project-scraper.js --verify         Check if items in requirements exist in items_db

Examples:
  node scripts/project-scraper.js --scrape
  node scripts/project-scraper.js --list
  node scripts/project-scraper.js --verify
`);
    return;
  }

  if (command === '--scrape') {
    console.log('=== Scraping Current Project ===\n');

    // Get current project URL
    const projectInfo = await getCurrentProjectUrl();
    if (!projectInfo) {
      console.error('Could not find current project URL');
      return;
    }

    console.log(`Found project: ${projectInfo.name}`);
    await delay(DELAY_MS);

    // Parse the project page
    const project = await parseExpeditionPage(projectInfo.url);
    if (!project) {
      console.error('Could not parse project page');
      return;
    }

    console.log(`\nProject: ${project.name}`);
    console.log(`Phases found: ${project.phases.length}`);

    if (project.phases.length > 0) {
      console.log('\nPhase Summary:');
      for (const phase of project.phases) {
        const reqCount = phase.requirements?.length || 0;
        const coinCount = phase.coinRequirements?.length || 0;
        console.log(`  ${phase.id}. ${phase.name}: ${reqCount} items, ${coinCount} coin requirements`);
      }
    }

    // Verify items
    const itemsDB = loadItemsDB();
    const issues = verifyItemsExist(project, itemsDB);

    if (issues.length > 0) {
      console.log(`\n⚠️  Found ${issues.length} item(s) not in database:`);
      for (const issue of issues) {
        console.log(`    - ${issue.item} (${issue.phase})`);
      }
    }

    // Save
    const data = {
      currentProject: project,
      lastUpdated: new Date().toISOString()
    };
    saveProjects(data);

    console.log('\n✓ Done!');
  }

  else if (command === '--list') {
    const data = loadProjects();

    if (!data.currentProject) {
      console.log('No project data found. Run --scrape first.');
      return;
    }

    const project = data.currentProject;
    console.log(`\n=== ${project.name} ===`);
    console.log(`URL: ${project.wikiUrl}`);
    if (project.startDate && project.endDate) {
      console.log(`Period: ${project.startDate} to ${project.endDate}`);
    }
    console.log(`Last Updated: ${data.lastUpdated}`);

    console.log('\nPhases:');
    for (const phase of project.phases) {
      console.log(`\n  ${phase.id}. ${phase.name}`);

      if (phase.requirements && phase.requirements.length > 0) {
        console.log('     Item Requirements:');
        for (const req of phase.requirements) {
          console.log(`       - ${req.amount}× ${req.item}`);
        }
      }

      if (phase.coinRequirements && phase.coinRequirements.length > 0) {
        console.log('     Coin Requirements:');
        for (const req of phase.coinRequirements) {
          console.log(`       - ${req.coinValue.toLocaleString()} coins`);
        }
      }
    }
  }

  else if (command === '--verify') {
    const data = loadProjects();

    if (!data.currentProject) {
      console.log('No project data found. Run --scrape first.');
      return;
    }

    const itemsDB = loadItemsDB();
    const issues = verifyItemsExist(data.currentProject, itemsDB);

    if (issues.length === 0) {
      console.log('✓ All items in project requirements exist in items_db.json');
    } else {
      console.log(`\n⚠️  Found ${issues.length} issue(s):\n`);
      for (const issue of issues) {
        console.log(`  Phase "${issue.phase}": "${issue.item}" - ${issue.issue}`);
      }

      // Save report
      ensureDir(REPORTS_DIR);
      const reportPath = path.join(REPORTS_DIR, 'verification-report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        project: data.currentProject.name,
        issues: issues
      }, null, 2));
      console.log(`\nReport saved to: ${reportPath}`);
    }
  }

  else {
    console.error(`Unknown command: ${command}`);
    console.log('Use --help for usage information');
  }
}

main().catch(console.error);
