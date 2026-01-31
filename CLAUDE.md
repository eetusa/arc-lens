# ARC Lens - AI Assistant Guide

This document provides context for AI assistants (Claude, Copilot, etc.) working on this codebase.

## Project Overview

**ARC Lens** is a real-time inventory analysis tool for the game ARC Raiders. It uses computer vision and OCR to:
- Detect when the game inventory is open
- Read item names from tooltips using OCR
- Provide Keep/Sell/Recycle recommendations
- Track item priority and quest requirements
- Analyze items in real-time during gameplay
- Auto-detect active quests from the game's PLAY tab

**Live URL**: https://arclens.app
**Tech Stack**: React 19, Vite, OpenCV.js, ONNX Runtime Web, Tesseract.js
**Deployment**: Netlify (automatic deploys from `master` branch)

## Architecture

### Core Components

```
src/
├── App.jsx                      # Main app component, UI orchestration
├── main.jsx                     # React entry point
├── index.css                    # Global CSS styles
├── styles.js                    # Theme and style definitions
├── components/
│   ├── AdvisorCard.jsx          # Item analysis result card display
│   ├── InfoModal.jsx            # Help, info modal, and changelog
│   ├── ItemSearcher.jsx         # Manual item search interface
│   ├── MapTabs.jsx              # Tab navigation for multi-map quests
│   ├── MapViewer.jsx            # Interactive pan/zoom map with quest markers
│   ├── PriorityModal.jsx        # Item priority configuration modal
│   ├── PrioritySelector.jsx     # Priority selection UI component
│   ├── ProjectPanel.jsx         # Expedition project phase tracker
│   ├── QuestHelper.jsx          # Quest helper panel with objectives and maps
│   ├── QuestSelector.jsx        # Quest selection and tracking UI
│   ├── RecycleTabs.jsx          # Recycle output display tabs
│   ├── SessionConnector.jsx     # Mobile companion session connector
│   ├── SessionModal.jsx         # QR code session modal
│   ├── SessionStatus.jsx        # Session connection status display
│   └── StationPanel.jsx         # Station level configuration panel
├── hooks/
│   ├── useAppMode.js            # Game/Companion mode toggle
│   ├── useIsMobile.js           # Mobile device detection
│   ├── usePersistentState.js    # localStorage-backed state
│   ├── useQuestData.js          # Quest map data and marker coordinate loader
│   ├── useSessionSync.js        # WebSocket session synchronization
│   ├── useVersionTracking.js    # Version tracking and update detection
│   └── useVisionSystem.js       # Web Worker manager for vision processing
├── utils/
│   ├── analytics.js             # Umami analytics wrapper
│   ├── imagePreloader.js        # Preload item images
│   ├── mapCoords.js             # Map coordinate transformation utilities
│   └── sessionClient.js         # PartyKit WebSocket client
├── workers/
│   ├── vision.worker.js         # Main Web Worker orchestrating all CV/OCR
│   ├── menu-checker.js          # Inventory menu detection (template matching)
│   ├── main-menu-checker.js     # Main menu detection (rainbow stripes)
│   ├── play-tab-checker.js      # PLAY tab detection
│   ├── quest-ocr.js             # Quest name OCR from PLAY tab
│   └── tooltip-finder.js        # Tooltip region detection
└── logic/
    ├── advisor-engine.js        # Main advisor engine orchestrating analysis
    ├── advisor-analysis.js      # AdvisorAnalysis class (result structure)
    ├── item-database.js         # ItemDatabase class
    ├── quest-tracker.js         # QuestTracker class
    ├── project-tracker.js       # ProjectTracker class for expeditions
    ├── priority-tracker.js      # PriorityTracker class (dev + user)
    ├── constants.js             # Action, QuestStatus enums, station data
    └── string-utils.js          # String matching utilities (fuzzy match)
```

### Public Data Files

```
public/
├── items_db.json                # Complete item database (scraped from wiki)
├── quests.json                  # Quest dependency tree
├── quests_detailed.json         # Quest objectives, rewards, and quest chains
├── projects.json                # Expedition project phases and requirements
├── priorities.json              # Developer-managed item priorities
├── maps.json                    # Map configurations with calibrated transforms
├── metaforge_quests.json        # Quest marker coordinates from Metaforge API
├── image-manifest.json          # Generated manifest for item image preloading
├── opencv.js                    # OpenCV.js library
├── en_PP-OCRv4_rec_infer.onnx   # PaddleOCR ONNX model
├── en_dict.txt                  # OCR vocabulary dictionary
├── menu_header.png              # Template for inventory menu detection
├── *.wasm                       # ONNX Runtime WASM files
├── item-images/                 # Item images for display
└── maps/                        # Map images (AVIF format, upper/lower variants)
```

### Test Structure

```
test/
├── fixtures/
│   └── screenshots/             # Test images organized by resolution
│       ├── 1080p/
│       └── 1440p/
├── output/                      # Test output directory
├── menu-checker.test.js         # Inventory menu detection tests
├── main-menu-checker.test.js    # Main menu detection tests
├── ocr-pipeline.test.js         # OCR pipeline tests
├── quest-ocr.test.js            # Quest OCR tests
└── quest-tracker.test.js        # Quest tracker logic tests (107 tests)
```

### Configuration Files

```
├── vite.config.js               # Vite build configuration
├── vitest.config.js             # Vitest test configuration
├── eslint.config.js             # ESLint configuration
├── netlify.toml                 # Netlify deployment config and headers
├── package.json                 # Dependencies and scripts
└── index.html                   # HTML entry point with analytics
```

### Web Worker Architecture

**CRITICAL**: Vision processing runs in a Web Worker to avoid blocking the main thread.

- **Main Thread** (`App.jsx` + `useVisionSystem.js`): UI, user input, React state
- **Web Worker** (`vision.worker.js`): Orchestrates all CV/OCR processing
- **Communication**: `postMessage` API with typed message payloads

**Worker Module Structure**:
- `vision.worker.js` - Main orchestrator, imports and coordinates all modules
- `menu-checker.js` - Detects inventory menu via template matching
- `main-menu-checker.js` - Detects main menu via rainbow stripe colors (HSV)
- `play-tab-checker.js` - Detects if PLAY tab is active
- `quest-ocr.js` - Extracts quest names from the QUESTS box
- `tooltip-finder.js` - Finds tooltip regions in the frame

**Message Types**:
- `INIT` → Initialize worker with models
- `PROCESS_FRAME` → Process a video frame
- `UPDATE_USER_STATE` → Update user preferences (stations, quests, priorities)
- `RESULT` → Worker sends processed frame results
- `RESULT_TEXT_UPDATE` → Worker sends OCR results with item analysis
- `QUESTS_DETECTED` → Worker sends detected quest names
- `MAIN_MENU_STATE` → Worker sends main menu/play tab state
- `STATUS` → Worker sends status messages
- `ERROR` → Worker sends error details

### CORS/COEP Requirements

**CRITICAL**: This app uses SharedArrayBuffer (required by ONNX Runtime WASM), which requires specific headers:

```javascript
// vite.config.js
headers: {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless'  // Changed from 'require-corp'
}
```

**Why `credentialless`?**
- Allows WASM/Web Workers to use SharedArrayBuffer
- Allows external scripts (like Umami analytics) to load
- More permissive than `require-corp` but still secure

**Netlify Configuration**:
These headers are also set in `netlify.toml`.

## Key Files Explained

### `src/hooks/useVisionSystem.js`
- Manages Web Worker lifecycle
- Sends video frames to worker for processing
- Receives OCR results and updates React state
- Handles quest auto-detection results
- Tracks analytics events (session start/end, item recognition)
- **Mobile Detection**: Vision system is DISABLED on mobile (crashes the browser)

### `src/workers/vision.worker.js`
- Main orchestrator for all vision processing
- Loads OpenCV.js, ONNX Runtime for OCR
- Coordinates multiple detection modules:
  - Menu detection (inventory open/closed)
  - Main menu detection (rainbow stripes)
  - PLAY tab detection
  - Quest OCR (reads quest names)
  - Tooltip detection and item OCR
- Implements performance optimizations:
  - Adaptive frame skipping for stable tooltips
  - Menu detection skip when menu confirmed open
  - Redundant menu verification for new matches
- Maintains "stable state" to prevent UI flickering

### `src/workers/quest-ocr.js`
- Extracts quest names from the QUESTS box in PLAY tab
- Uses same ONNX OCR model as tooltip detection
- Fuzzy matches OCR results against known quest names
- Supports incremental updates (sends quests as detected)
- Has debounce/cooldown to prevent excessive OCR calls

### `src/logic/advisor-engine.js`
- Main orchestrator for item analysis
- Coordinates ItemDatabase, QuestTracker, ProjectTracker, and PriorityTracker
- Contains Keep/Sell/Recycle decision logic
- Considers item rarity, type, station level, quest requirements
- Returns AdvisorAnalysis objects with verdict and reasoning

### `src/logic/advisor-analysis.js`
- Data structure class for analysis results
- Contains: meta (item info), verdict (action + reason), economics (prices/ratios), demand (quests/stations), utility (crafting), prioritization

### `src/logic/priority-tracker.js`
- Manages item priorities (dev + user)
- Supports priority matching: direct, craftTo, recycleTo
- Loads from `public/priorities.json` and localStorage

### `src/logic/quest-tracker.js`
- Tracks quest completion status based on active quests
- Determines if a quest is DONE, IN_PROGRESS, TBD, or UNKNOWN
- Traverses quest dependency tree to infer completion
- Used by advisor engine to determine item demand

### `src/logic/item-database.js`
- ItemDatabase class managing game item data
- Loads from `public/items_db.json`
- Provides item lookup by ID or name
- Used by advisor engine and priority tracker

### `src/utils/analytics.js`
- Wrapper for Umami Analytics (privacy-focused, cookie-less)
- Tracks: DAU, session duration, item recognition, manual searches
- **Production only**: Domain filter prevents localhost tracking
- Graceful degradation if analytics blocked

### `src/utils/sessionClient.js`
- PartyKit WebSocket client for Mobile Companion feature
- Handles connection, reconnection, and message passing
- Syncs item analysis results to mobile devices

## Environment Variables

Currently, this project **does not require any environment variables** for deployment.

### Analytics Configuration

Umami analytics is configured via:
- **Hardcoded** in `index.html` (website ID, domains)
- **Proxied** through Netlify redirects in `netlify.toml` (`/stats/*` → Umami instance)
- No environment variables needed - works out of the box

## Build & Deployment

### Development
```bash
npm install
npm run dev         # Starts Vite dev server
```

### Production Build
```bash
npm run build       # Runs prebuild script + vite build
npm run preview     # Preview production build locally
```

### Pre-build Script
`scripts/generate-image-manifest.js` - Generates manifest of item images for preloading

### Post-install Script
Copies ONNX Runtime WASM files from `node_modules` to `public/`:
```bash
cp node_modules/onnxruntime-web/dist/*.wasm public/
```

### Data Maintenance Scripts

#### Wiki Scraper (`scripts/wiki-scraper.js`)
Scrapes item data from the ARC Raiders wiki for database maintenance:
```bash
node scripts/wiki-scraper.js --help           # Show all commands
node scripts/wiki-scraper.js --list           # List all wiki items
node scripts/wiki-scraper.js --compare        # Compare wiki vs local DB
node scripts/wiki-scraper.js --scrape <name>  # Scrape single item
node scripts/wiki-scraper.js --verify         # Verify item data against wiki
node scripts/wiki-scraper.js --add-missing    # Add missing items from wiki
```

#### Project Scraper (`scripts/project-scraper.js`)
Scrapes expedition/project data from the wiki for tracking project phases:
```bash
node scripts/project-scraper.js --help        # Show all commands
node scripts/project-scraper.js --scrape      # Scrape current project, update projects.json
node scripts/project-scraper.js --list        # Show current project phases
node scripts/project-scraper.js --verify      # Check if items exist in items_db
```

The project scraper outputs to `public/projects.json` which contains:
- Current project name and wiki URL
- Phase definitions (Foundation, Core Systems, Framework, etc.)
- Item requirements per phase
- Coin requirements for special phases (Load Stage)

#### Quest Scraper (`scripts/quest-scraper.js`)
Scrapes detailed quest data from the wiki (objectives, rewards, quest chains):
```bash
node scripts/quest-scraper.js --help           # Show all commands
node scripts/quest-scraper.js --list           # List all wiki quests
node scripts/quest-scraper.js --scrape <name>  # Scrape single quest
node scripts/quest-scraper.js --scrape-all     # Scrape all quests
node scripts/quest-scraper.js --compare        # Compare wiki vs local
```

#### Metaforge Scraper (`scripts/metaforge-scraper.js`)
Fetches quest marker coordinates from the Metaforge API:
```bash
node scripts/metaforge-scraper.js --help       # Show all commands
node scripts/metaforge-scraper.js --scrape     # Scrape all maps
node scripts/metaforge-scraper.js --map <id>   # Scrape specific map
```

#### Map Calibrator (`scripts/map-calibrator.js`)
Calibrates map coordinate transforms using reference points:
```bash
node scripts/map-calibrator.js --help          # Show all commands
node scripts/map-calibrator.js --all           # Calibrate all maps
node scripts/map-calibrator.js <mapId>         # Calibrate specific map
```

#### Lower Map Calibrator (`scripts/calibrate-lower-maps.js`)
Calibrates coordinate transforms for underground/lower level map variants:
```bash
node scripts/calibrate-lower-maps.js --help    # Show all commands
node scripts/calibrate-lower-maps.js --all     # Calibrate all lower maps
node scripts/calibrate-lower-maps.js <mapId>   # Calibrate specific map
```

## Testing

```bash
npm test            # Vitest watch mode
npm run test:run    # Single run
```

Tests cover:
- Menu detection (inventory and main menu)
- OCR pipeline accuracy
- Quest OCR extraction
- Quest tracker logic (107 comprehensive tests)
- Component behavior

Test fixtures (screenshots) are organized by resolution in `test/fixtures/screenshots/`.

## Mobile Considerations

**Vision System**: DISABLED on mobile devices
- Check: `src/hooks/useIsMobile.js`
- Reason: Loading the vision system on mobile browsers causes the site to crash
- Mobile users can use "Companion Mode" to receive results from a PC

**Mobile Companion Feature**:
- Uses PartyKit WebSocket for real-time sync
- PC runs vision system, mobile displays results
- QR code or session ID for easy connection

**UI**: Responsive design with mobile-specific layouts
- Breakpoint: 768px
- Touch-friendly buttons and spacing
- Scrollable modals

## Analytics

**Provider**: Umami Analytics (self-hosted on Vercel + Supabase)
**Dashboard**: https://umami-chi-eight-52.vercel.app/

### Tracked Events
- `session_start` - User starts capture
- `session_end` - User stops capture (includes duration)
- `item_recognized` - Item detected via vision system (includes item name, verdict, rarity)
- `manual_search` - User manually searches for item

### Privacy Features
- Cookie-less tracking
- GDPR compliant
- Respects Do Not Track header
- Domain filtering (production only)
- Anonymous IP hashing
- **Proxied** through `/stats/*` to bypass ad blockers (appears as first-party request)

## Common Patterns

### Error Handling
- Vision system errors: Show user-friendly message, log to console
- Analytics errors: Silent fail, never break app
- OCR failures: Retry logic in worker

### State Management
- React hooks for local state
- `usePersistentState` for localStorage-backed state
- No Redux/Zustand (project is simple enough)
- User preferences stored in localStorage

### Styling
- Centralized theme in `src/styles.js`
- Inline styles using theme constants
- Responsive design with media queries
- Dark theme optimized for gaming

## Git Workflow

### **CRITICAL: Branch Creation Guidelines**

**When starting ANY new feature or task:**

1. **Always start from master** (unless explicitly told otherwise)
2. **Pull latest changes** to ensure you're up-to-date
3. **Create a new feature branch** with descriptive name

```bash
# Standard workflow for new features:
git checkout master
git pull origin master
git checkout -b feature/descriptive-name
```

**Branch Naming Convention:**
- `feature/` - New features (e.g., `feature/umami-analytics`)
- `fix/` - Bug fixes (e.g., `fix/mobile-crash`)
- `refactor/` - Code refactoring (e.g., `refactor/worker-messages`)
- `docs/` - Documentation updates (e.g., `docs/update-readme`)

**Never commit directly to `master`** - Always use feature branches and PRs.

### Branches
- `master` - Production (auto-deploys to Netlify)
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- Create PR for all changes

### Commit Message Style
```
Add feature description

More detailed explanation of changes.

Key changes:
- Bullet point 1
- Bullet point 2

Co-Authored-By: Claude <model>-<version> <noreply@anthropic.com>
```

### Creating Pull Requests

**Always use `gh pr create`** with:
- Clear title describing the change
- Detailed summary of what was done
- List of key changes
- Test plan (local + production testing)
- Any required configuration (env vars, etc.)

```bash
# After committing your changes:
git push -u origin feature/your-branch-name
gh pr create --title "Feature: Description" --body "..." --base master
```

## Important Gotchas

### 1. WASM Files Must Be in `public/`
The postinstall script copies WASM files. If missing, OCR won't work.

### 2. COEP Header Changed
We use `credentialless` instead of `require-corp` to allow external scripts.

### 3. Analytics Won't Track Locally
Domain filter (`data-domains="arclens.app"`) prevents localhost tracking. This is intentional.

### 4. Mobile Vision System is Disabled
Don't try to enable it - it crashes mobile browsers.

### 5. Line Endings (Windows)
Git may warn about CRLF/LF conversion. This is normal for Windows development.

### 6. Item Database Updates
When adding new items to `public/items_db.json`, update images in `public/item-images/` and run:
```bash
npm run generate-manifest
```

### 7. Branch Workflow
ALWAYS start from master and create a new branch. Don't work on existing feature branches unless continuing previous work.

### 8. Worker Module Dependencies
The vision worker imports multiple modules. When modifying worker code, ensure imports are correct and modules don't have circular dependencies.

## File Locations Reference

### Data Files
- **Item database**: `public/items_db.json`
- **Quest tree**: `public/quests.json`
- **Quest details**: `public/quests_detailed.json`
- **Project data**: `public/projects.json`
- **Priorities**: `public/priorities.json`
- **Map configs**: `public/maps.json`
- **Quest markers**: `public/metaforge_quests.json`
- **Image manifest**: `public/image-manifest.json`

### Logic Files
- **Advisor engine**: `src/logic/advisor-engine.js`
- **Advisor analysis**: `src/logic/advisor-analysis.js`
- **Priority tracker**: `src/logic/priority-tracker.js`
- **Quest tracker**: `src/logic/quest-tracker.js`
- **Project tracker**: `src/logic/project-tracker.js`
- **Item database class**: `src/logic/item-database.js`
- **Constants**: `src/logic/constants.js`
- **String utilities**: `src/logic/string-utils.js`

### Worker Files
- **Main worker**: `src/workers/vision.worker.js`
- **Menu checker**: `src/workers/menu-checker.js`
- **Main menu checker**: `src/workers/main-menu-checker.js`
- **Play tab checker**: `src/workers/play-tab-checker.js`
- **Quest OCR**: `src/workers/quest-ocr.js`
- **Tooltip finder**: `src/workers/tooltip-finder.js`

### Config Files
- **Build config**: `vite.config.js`
- **Test config**: `vitest.config.js`
- **Lint config**: `eslint.config.js`
- **Package config**: `package.json`
- **Netlify config**: `netlify.toml`

## External Services

### Umami Analytics
- **Instance**: https://umami-chi-eight-52.vercel.app/
- **Database**: Supabase (PostgreSQL)
- **Free tier**: 500MB DB, 2GB bandwidth/month

### Netlify
- **Hosting**: Static site hosting
- **Builds**: Automatic on push to master
- **Proxy**: Rewrites `/stats/*` to Umami instance (bypasses ad blockers)
- **Free tier**: 100GB bandwidth/month

### PartyKit
- **Purpose**: WebSocket server for Mobile Companion feature
- **Usage**: Real-time sync between PC and mobile devices

## Need Help?

- Check existing patterns in similar files
- Look for TODO comments in code
- Review recent PRs for context
- Ask clarifying questions before making assumptions
- **When in doubt about branching**: Start from master, pull, create new branch

## Maintenance Notes

### Dependencies to Watch
- `onnxruntime-web` - WASM runtime for OCR
- `@techstark/opencv-js` - Computer vision
- `tesseract.js` - OCR engine (currently unused, kept for fallback)
- `partykit` / `partysocket` - WebSocket for mobile companion
- React 19 is latest - watch for breaking changes

### Performance Considerations
- Vision processing is CPU-intensive
- Keep Web Worker isolated
- Avoid blocking main thread
- Monitor bundle size (currently ~2MB)
- Adaptive frame skipping reduces CPU when tooltip is stable

---

**Last Updated**: 2026-01-28
**Maintained By**: eetusa + Claude
