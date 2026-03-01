#!/usr/bin/env node
/**
 * ARC Raiders Project Scraper
 *
 * Scrapes project/expedition data from https://arcraiders.wiki and updates
 * the local projects.json file.
 *
 * Usage:
 *   node scripts/project-scraper.js --help                    # Show all commands
 *   node scripts/project-scraper.js --scrape                  # Scrape current project (auto-discover URL)
 *   node scripts/project-scraper.js --scrape-url <url>        # Scrape a specific project URL
 *   node scripts/project-scraper.js --list                    # Show all projects and their phases
 *   node scripts/project-scraper.js --verify                  # Check if items in requirements exist in items_db
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

// Load existing projects.json — always returns { projects: [], lastUpdated: null }
function loadProjects() {
  try {
    if (fs.existsSync(PROJECTS_PATH)) {
      const data = JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf-8'));
      // Normalise legacy single-project format
      if (data.currentProject && !data.projects) {
        return { projects: [data.currentProject], lastUpdated: data.lastUpdated };
      }
      return data;
    }
  } catch (err) {
    console.error('Failed to load projects.json:', err.message);
  }
  return { projects: [], lastUpdated: null };
}

// Save projects.json (always uses the projects[] array format)
function saveProjects(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(data, null, 2));
  console.log(`\nSaved to: ${PROJECTS_PATH}`);
}

// Derive a stable ID from a wiki URL or project name
function deriveProjectId(url) {
  return url.split('/').pop().replace(/_/g, '-').toLowerCase();
}

// Get current project URL from the Projects page (auto-discovery)
async function getCurrentProjectUrl() {
  console.log('Fetching Projects page...');
  const html = await fetchPage(`${WIKI_BASE}/Projects`);
  if (!html) return null;

  // Look for any /wiki/ link whose title looks like a project page
  // Expedition pages: /wiki/Expedition, /wiki/Expedition_2
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

// Parse a block of HTML to extract item requirements (quantity × item)
function parsePhaseRequirements(html) {
  const requirements = [];

  // Pattern: "150× <a...>Metal Parts</a>" or "150 × <a...>Metal Parts</a>"
  const itemMatches = html.matchAll(/(\d+)\s*×\s*<a[^>]*title="([^"]+)"/g);
  for (const match of itemMatches) {
    requirements.push({ item: match[2], amount: parseInt(match[1]) });
  }

  // Pattern: quantity before link without × e.g. "150 <a title="Metal Parts">"
  if (requirements.length === 0) {
    const altMatches = html.matchAll(/(\d+)\s*<a[^>]*title="([^"]+)"/g);
    for (const match of altMatches) {
      if (!requirements.find(r => r.item === match[2])) {
        requirements.push({ item: match[2], amount: parseInt(match[1]) });
      }
    }
  }

  // Pattern: <a>Item</a> (150)
  const parenMatches = html.matchAll(/<a[^>]*title="([^"]+)"[^>]*>[^<]*<\/a>\s*\((\d+)\)/g);
  for (const match of parenMatches) {
    if (!requirements.find(r => r.item === match[1])) {
      requirements.push({ item: match[1], amount: parseInt(match[2]) });
    }
  }

  return requirements;
}

// Parse coin-based requirements (for Load Stage type phases)
function parseCoinRequirements(rowHtml) {
  const coinReqs = [];
  const coinMatch = rowHtml.match(/(\d{1,3}(?:,\d{3})*)\s*(?:coins?)?/gi);
  if (coinMatch) {
    for (const match of coinMatch) {
      const value = parseInt(match.replace(/,/g, ''));
      if (value > 1000) {
        coinReqs.push({ coinValue: value });
      }
    }
  }
  return coinReqs;
}

// Split HTML into sections by h2/h3 headings
// Returns [{ title, content }]
function splitByHeadings(html) {
  const sections = [];
  // Match h2 or h3 with mw-headline span (standard MediaWiki structure)
  const headingPattern = /<h[23][^>]*>[\s\S]*?<span[^>]*class="[^"]*mw-headline[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<\/h[23]>/gi;

  let lastIndex = 0;
  let lastTitle = null;
  let match;

  while ((match = headingPattern.exec(html)) !== null) {
    if (lastTitle !== null) {
      sections.push({ title: lastTitle.trim(), content: html.slice(lastIndex, match.index) });
    }
    lastTitle = match[1].trim();
    lastIndex = match.index + match[0].length;
  }

  if (lastTitle !== null) {
    sections.push({ title: lastTitle.trim(), content: html.slice(lastIndex) });
  }

  return sections;
}

// Parse a project/expedition page for phases — supports both Expedition style and generic wikis
async function parseProjectPage(url) {
  console.log(`Fetching project page: ${url}`);
  const html = await fetchPage(url);
  if (!html) return null;

  const project = {
    id: deriveProjectId(url),
    name: '',
    wikiUrl: url,
    startDate: null,
    phases: []
  };

  // Extract project name from page title
  const titleMatch = html.match(/<h1[^>]*class="[^"]*page-header__title[^"]*"[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<title>([^<|]+)/i);
  if (titleMatch) {
    project.name = titleMatch[1].trim().replace(/\s*[-|].*$/, '').trim();
  } else {
    project.name = url.split('/').pop().replace(/_/g, ' ');
  }

  // Extract dates — pattern: "December 2, 2025 – February 18, 2026"
  const dateMatch = html.match(/(\w+ \d{1,2},? \d{4})\s*[-–]\s*(\w+ \d{1,2},? \d{4})/i);
  if (dateMatch) {
    try {
      project.startDate = new Date(dateMatch[1]).toISOString().split('T')[0];
      project.endDate = new Date(dateMatch[2]).toISOString().split('T')[0];
    } catch (e) {
      console.warn('Could not parse dates:', dateMatch[0]);
    }
  }

  // -------------------------------------------------------------------
  // Strategy 1: Hardcoded phase names (Expedition-style pages)
  // -------------------------------------------------------------------
  const hardcodedPhaseNames = [
    'Foundation', 'Core Systems', 'Framework', 'Outfitting', 'Load Stage', 'Departure'
  ];

  const tableMatches = html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi);

  for (const tableMatch of tableMatches) {
    const tableHtml = tableMatch[1];
    const rows = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

    for (const row of rows) {
      const rowHtml = row[1];
      if (rowHtml.includes('<th')) continue;

      let foundPhase = null;
      let phaseId = 0;

      for (let i = 0; i < hardcodedPhaseNames.length; i++) {
        if (rowHtml.toLowerCase().includes(hardcodedPhaseNames[i].toLowerCase())) {
          foundPhase = hardcodedPhaseNames[i];
          phaseId = i + 1;
          break;
        }
      }

      if (foundPhase) {
        const requirements = parsePhaseRequirements(rowHtml);
        const coinRequirements = parseCoinRequirements(rowHtml);

        if (requirements.length > 0 || coinRequirements.length > 0) {
          const phase = { id: phaseId, name: foundPhase };
          if (requirements.length > 0) phase.requirements = requirements;
          if (coinRequirements.length > 0) phase.coinRequirements = coinRequirements;
          if (!project.phases.find(p => p.id === phaseId)) {
            project.phases.push(phase);
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Strategy 2: Section-based (generic — works for any project page)
  // Splits the page by h2/h3 headings and extracts items per section.
  // -------------------------------------------------------------------
  if (project.phases.length === 0) {
    console.log('  Hardcoded phase names not found. Trying generic section-based parser...');
    const sections = splitByHeadings(html);
    let phaseId = 1;

    // Skip common non-phase headings
    const skipSections = new Set([
      'contents', 'references', 'navigation', 'see also',
      'external links', 'notes', 'gallery'
    ]);

    for (const section of sections) {
      if (skipSections.has(section.title.toLowerCase())) continue;

      // Check section content for item links
      const requirements = parsePhaseRequirements(section.content);

      if (requirements.length > 0) {
        project.phases.push({ id: phaseId++, name: section.title, requirements });
        console.log(`  Found phase "${section.title}" with ${requirements.length} items`);
      } else {
        // Also scan any wikitables in this section
        const tables = section.content.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi);
        let tableReqs = [];
        for (const table of tables) {
          tableReqs = tableReqs.concat(parsePhaseRequirements(table[1]));
        }
        if (tableReqs.length > 0) {
          project.phases.push({ id: phaseId++, name: section.title, requirements: tableReqs });
          console.log(`  Found phase "${section.title}" (from table) with ${tableReqs.length} items`);
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Strategy 3: Single-table with section header rows
  // Some pages use one big wikitable where rows alternate between
  // section headers and item requirement rows.
  // -------------------------------------------------------------------
  if (project.phases.length === 0) {
    console.log('  Trying single-table with header-row parser...');
    const allTableMatches = html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi);
    let phaseId = 1;

    for (const tableMatch of allTableMatches) {
      const tableHtml = tableMatch[1];
      let currentPhaseName = null;
      let currentRequirements = [];

      const rows = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      for (const row of rows) {
        const rowHtml = row[1];

        // Detect header rows: contains th, or a bold-only td with no item links
        const isHeader = rowHtml.includes('<th');
        const hasItemLinks = /<a[^>]*title="[^"]+"/.test(rowHtml);
        const hasBoldText = /<(?:th|b|strong)[^>]*>([^<]{2,50})<\/(?:th|b|strong)>/i.test(rowHtml);

        if (isHeader || (hasBoldText && !hasItemLinks)) {
          // Save previous phase
          if (currentPhaseName && currentRequirements.length > 0) {
            project.phases.push({ id: phaseId++, name: currentPhaseName, requirements: currentRequirements });
          }
          // Extract phase name from this header row
          const nameMatch = rowHtml.match(/<(?:th|td|b|strong)[^>]*>([^<]{2,50})<\/(?:th|td|b|strong)>/i);
          currentPhaseName = nameMatch ? nameMatch[1].trim() : null;
          currentRequirements = [];
        } else if (hasItemLinks) {
          const reqs = parsePhaseRequirements(rowHtml);
          currentRequirements = currentRequirements.concat(reqs);
        }
      }

      // Save last phase
      if (currentPhaseName && currentRequirements.length > 0) {
        project.phases.push({ id: phaseId++, name: currentPhaseName, requirements: currentRequirements });
      }

      if (project.phases.length > 0) break; // Found phases in this table
    }
  }

  // Sort phases by ID
  project.phases.sort((a, b) => a.id - b.id);

  return project;
}

// Verify items exist in the database (for one project)
function verifyProjectItems(project, itemsDB) {
  const issues = [];
  const itemNames = new Set(Object.values(itemsDB).map(i => i.name.toLowerCase()));

  for (const phase of project.phases) {
    if (!phase.requirements) continue;
    for (const req of phase.requirements) {
      if (!itemNames.has(req.item.toLowerCase())) {
        issues.push({ project: project.name, phase: phase.name, item: req.item, issue: 'Item not found in items_db.json' });
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
  node scripts/project-scraper.js --scrape                  Scrape current project (auto-discover URL)
  node scripts/project-scraper.js --scrape-url <url>        Scrape a specific project wiki URL
  node scripts/project-scraper.js --list                    Show all projects and their phases
  node scripts/project-scraper.js --verify                  Check if items in requirements exist in items_db

Examples:
  node scripts/project-scraper.js --scrape
  node scripts/project-scraper.js --scrape-url https://arcraiders.wiki/wiki/Weather_Monitor_System
  node scripts/project-scraper.js --list
  node scripts/project-scraper.js --verify
`);
    return;
  }

  // ------------------------------------------------------------------
  // --scrape  (auto-discover URL)
  // ------------------------------------------------------------------
  if (command === '--scrape') {
    console.log('=== Scraping Current Project (auto-discover) ===\n');

    const projectInfo = await getCurrentProjectUrl();
    if (!projectInfo) {
      console.error('Could not find current project URL');
      return;
    }

    console.log(`Found project: ${projectInfo.name} → ${projectInfo.url}`);
    await delay(DELAY_MS);

    await scrapeAndSave(projectInfo.url);
  }

  // ------------------------------------------------------------------
  // --scrape-url <url>
  // ------------------------------------------------------------------
  else if (command === '--scrape-url') {
    const url = args[1];
    if (!url) {
      console.error('Error: --scrape-url requires a URL argument');
      console.log('Example: node scripts/project-scraper.js --scrape-url https://arcraiders.wiki/wiki/Weather_Monitor_System');
      process.exit(1);
    }

    console.log(`=== Scraping Project from URL ===\n  ${url}\n`);
    await scrapeAndSave(url);
  }

  // ------------------------------------------------------------------
  // --list
  // ------------------------------------------------------------------
  else if (command === '--list') {
    const data = loadProjects();

    if (!data.projects || data.projects.length === 0) {
      console.log('No project data found. Run --scrape first.');
      return;
    }

    console.log(`\nLast Updated: ${data.lastUpdated}`);
    console.log(`\n${data.projects.length} project(s) in projects.json:\n`);

    for (const project of data.projects) {
      const activeLabel = project.active === false ? ' [INACTIVE]' : ' [ACTIVE]';
      console.log(`=== ${project.name}${activeLabel} ===`);
      console.log(`  ID: ${project.id}`);
      console.log(`  URL: ${project.wikiUrl}`);
      if (project.startDate) console.log(`  Start: ${project.startDate}`);
      if (project.endDate) console.log(`  End: ${project.endDate}`);

      console.log(`  Phases (${project.phases.length}):`);
      for (const phase of project.phases) {
        const reqCount = phase.requirements?.length || 0;
        const coinCount = phase.coinRequirements?.length || 0;
        console.log(`    ${phase.id}. ${phase.name}: ${reqCount} items${coinCount ? `, ${coinCount} coin reqs` : ''}`);

        if (phase.requirements && phase.requirements.length > 0) {
          for (const req of phase.requirements) {
            console.log(`       - ${req.amount}× ${req.item}`);
          }
        }

        if (phase.coinRequirements && phase.coinRequirements.length > 0) {
          for (const req of phase.coinRequirements) {
            console.log(`       - ${req.coinValue?.toLocaleString()} coins`);
          }
        }
      }
      console.log('');
    }
  }

  // ------------------------------------------------------------------
  // --verify
  // ------------------------------------------------------------------
  else if (command === '--verify') {
    const data = loadProjects();

    if (!data.projects || data.projects.length === 0) {
      console.log('No project data found. Run --scrape first.');
      return;
    }

    const itemsDB = loadItemsDB();
    let allIssues = [];

    for (const project of data.projects) {
      const issues = verifyProjectItems(project, itemsDB);
      allIssues = allIssues.concat(issues);
    }

    if (allIssues.length === 0) {
      console.log('✓ All items in project requirements exist in items_db.json');
    } else {
      console.log(`\n⚠️  Found ${allIssues.length} issue(s):\n`);
      for (const issue of allIssues) {
        console.log(`  [${issue.project}] Phase "${issue.phase}": "${issue.item}" - ${issue.issue}`);
      }

      ensureDir(REPORTS_DIR);
      const reportPath = path.join(REPORTS_DIR, 'verification-report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        issues: allIssues
      }, null, 2));
      console.log(`\nReport saved to: ${reportPath}`);
    }
  }

  else {
    console.error(`Unknown command: ${command}`);
    console.log('Use --help for usage information');
  }
}

// Shared scrape + save logic used by --scrape and --scrape-url
async function scrapeAndSave(url) {
  const project = await parseProjectPage(url);
  if (!project) {
    console.error('Could not parse project page');
    return;
  }

  console.log(`\nProject: ${project.name}`);
  console.log(`ID: ${project.id}`);
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
  const issues = verifyProjectItems(project, itemsDB);

  if (issues.length > 0) {
    console.log(`\n⚠️  Found ${issues.length} item(s) not in database:`);
    for (const issue of issues) {
      console.log(`    - ${issue.item} (${issue.phase})`);
    }
  }

  // Load existing data, upsert the project
  const data = loadProjects();
  const idx = data.projects.findIndex(p => p.id === project.id || p.wikiUrl === project.wikiUrl);
  if (idx >= 0) {
    // Preserve the active flag if already set
    const existing = data.projects[idx];
    if (existing.active !== undefined && project.active === undefined) {
      project.active = existing.active;
    }
    data.projects[idx] = project;
    console.log(`\nUpdated existing project: ${project.name}`);
  } else {
    data.projects.push(project);
    console.log(`\nAdded new project: ${project.name}`);
  }

  saveProjects(data);
  console.log('\n✓ Done!');
}

main().catch(console.error);
