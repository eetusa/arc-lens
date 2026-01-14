# ARC Lens - AI Assistant Guide

This document provides context for AI assistants (Claude, Copilot, etc.) working on this codebase.

## Project Overview

**ARC Lens** is a real-time inventory analysis tool for the game ARC Raiders. It uses computer vision and OCR to:
- Detect when the game inventory is open
- Read item names from tooltips using OCR
- Provide Keep/Sell/Recycle recommendations
- Track item priority and quest requirements
- Analyze items in real-time during gameplay

**Live URL**: https://arclens.app
**Tech Stack**: React 19, Vite, OpenCV.js, ONNX Runtime Web, Tesseract.js
**Deployment**: Netlify (automatic deploys from `master` branch)

## Architecture

### Core Components

```
src/
├── App.jsx                      # Main app component, UI orchestration
├── hooks/
│   ├── useVisionSystem.js       # Web Worker manager for vision processing
│   ├── useIsMobile.js           # Mobile detection hook
│   └── useTooltipAnalysis.js    # Tooltip data processing
├── components/
│   ├── InfoModal.jsx            # Help and info modal
│   ├── PriorityModal.jsx        # Item priority configuration
│   └── StationModal.jsx         # Station level configuration
├── utils/
│   ├── analytics.js             # Umami analytics wrapper
│   └── imagePreloader.js        # Preload item images
├── workers/
│   └── visionWorker.js          # Web Worker for CV/OCR processing
├── logic/
│   ├── advisor-engine.js        # Main advisor engine orchestrating analysis
│   ├── advisor-analysis.js      # AdvisorAnalysis class (result structure)
│   ├── item-database.js         # ItemDatabase class
│   ├── quest-tracker.js         # QuestTracker class
│   ├── priority-tracker.js      # PriorityTracker class (dev + user)
│   ├── constants.js             # Action, QuestStatus enums
│   └── string-utils.js          # String utility functions
└── public/
    ├── *.wasm                   # ONNX Runtime WASM files
    ├── priorities.json          # Developer-managed item priorities
    └── item-images/             # Preloaded item images
```

### Web Worker Architecture

**CRITICAL**: Vision processing runs in a Web Worker to avoid blocking the main thread.

- **Main Thread** (`App.jsx` + `useVisionSystem.js`): UI, user input, React state
- **Web Worker** (`visionWorker.js`): OpenCV.js, ONNX Runtime, Tesseract.js OCR
- **Communication**: `postMessage` API with typed message payloads

**Message Types**:
- `INIT` → Initialize worker with models
- `START_CAPTURE` → Begin processing video frames
- `STOP_CAPTURE` → Stop processing
- `RESULT_TEXT_UPDATE` → Worker sends OCR results to main thread
- `ITEM_DETECTED` → Worker sends detected item data
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
These headers are also set in `netlify.toml` (if it exists) or via Netlify dashboard.

## Key Files Explained

### `src/hooks/useVisionSystem.js`
- Manages Web Worker lifecycle
- Sends video frames to worker for processing
- Receives OCR results and updates React state
- Tracks analytics events (session start/end, item recognition)
- **Mobile Detection**: Vision system is DISABLED on mobile (too resource-intensive)

### `src/workers/visionWorker.js`
- Loads OpenCV.js, ONNX Runtime, Tesseract.js
- Processes video frames for menu detection
- Performs OCR on detected tooltips
- Matches OCR text against item database
- Sends results back to main thread

### `src/logic/advisor-engine.js`
- Main orchestrator for item analysis
- Coordinates ItemDatabase, QuestTracker, and PriorityTracker
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

### `src/logic/item-database.js`
- ItemDatabase class managing game item data
- Provides item lookup by ID or name
- Used by advisor engine and priority tracker

### `src/utils/analytics.js`
- Wrapper for Umami Analytics (privacy-focused, cookie-less)
- Tracks: DAU, session duration, item recognition, manual searches
- **Production only**: Domain filter prevents localhost tracking
- Graceful degradation if analytics blocked

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

## Testing

```bash
npm test            # Vitest watch mode
npm run test:run    # Single run
```

Tests cover:
- Item database validation
- Advisor logic rules
- Utility functions
- Component behavior

## Mobile Considerations

**Vision System**: DISABLED on mobile devices
- Check: `src/hooks/useIsMobile.js`
- Reason: Mobile devices lack processing power for real-time CV/OCR
- Mobile users see message: "Vision system not available on mobile"

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
- No Redux/Zustand (project is simple enough)
- User preferences stored in localStorage

### Styling
- CSS Modules or inline styles (check existing patterns)
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

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
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
Don't try to enable it - mobile devices can't handle the processing load.

### 5. Line Endings (Windows)
Git may warn about CRLF/LF conversion. This is normal for Windows development.

### 6. Item Database Updates
When adding new items to `src/logic/item-database.js`, update images in `public/item-images/` and run:
```bash
npm run generate-manifest
```

### 7. Branch Workflow
ALWAYS start from master and create a new branch. Don't work on existing feature branches unless continuing previous work.

## File Locations Reference

- **Item database**: `src/logic/item-database.js`
- **Advisor engine**: `src/logic/advisor-engine.js`
- **Advisor analysis**: `src/logic/advisor-analysis.js`
- **Priority tracker**: `src/logic/priority-tracker.js`
- **Quest tracker**: `src/logic/quest-tracker.js`
- **Vision worker**: `src/workers/visionWorker.js`
- **Analytics**: `src/utils/analytics.js`
- **Build config**: `vite.config.js`
- **Package config**: `package.json`

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
- `tesseract.js` - OCR engine
- React 19 is latest - watch for breaking changes

### Performance Considerations
- Vision processing is CPU-intensive
- Keep Web Worker isolated
- Avoid blocking main thread
- Monitor bundle size (currently ~2MB)

---

**Last Updated**: 2026-01-14
**Maintained By**: eetusa + Claude Sonnet 4.5
