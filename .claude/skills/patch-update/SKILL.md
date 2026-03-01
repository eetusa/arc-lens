# Skill: /patch-update

Use this skill when the user says `/patch-update` or asks to run the patch update pipeline.

## Purpose

Runs the full data-update pipeline after a new ARC Raiders game patch drops. Updates item values, adds new items, refreshes quest data and map markers, and regenerates the image manifest.

## Instructions

Follow these steps **in exact order**. Do NOT parallelize steps — race conditions in the scrapers will corrupt output files.

### Step 1: Create a feature branch

Ask the user for the patch name/version (e.g. "shrouded-sky", "1.3.0"). Then:

```bash
git checkout master
git pull origin master
git checkout -b feature/patch-<name>
```

Confirm the branch was created successfully before proceeding.

### Step 2: Update existing item values

Run the wiki scraper to update values on ALL existing items. This takes ~5 minutes — inform the user it will take a while.

```bash
node scripts/wiki-scraper.js --update-all --all 2>&1
```

Wait for this to complete fully before moving to Step 3.

### Step 3: Add missing items

After Step 2 is complete, add any brand-new items that are not yet in the database:

```bash
node scripts/wiki-scraper.js --add-missing 2>&1
```

### Step 4: Compare quest data

Show the user what quests are new or missing:

```bash
node scripts/quest-scraper.js --compare 2>&1
```

Report the diff to the user. Ask if they want to proceed with a full quest refresh.

### Step 5: Scrape all quest data

If the user confirms (or if there are new quests), run the full quest scrape:

```bash
node scripts/quest-scraper.js --scrape-all 2>&1
```

### Step 6: Refresh map markers

Update quest marker coordinates for all maps:

```bash
node scripts/metaforge-scraper.js --scrape 2>&1
```

### Step 7: Verify project items

Confirm all project phase items exist in the item database:

```bash
node scripts/project-scraper.js --verify 2>&1
```

If any items are missing from the DB, note them for the summary.

### Step 8: Regenerate image manifest

```bash
npm run generate-manifest 2>&1
```

### Step 9: Summary report

Report to the user:
- How many items were updated (from Step 2 output)
- How many items were added (from Step 3 output)
- How many quests were added/updated (from Steps 4–5 output)
- How many map markers were updated (from Step 6 output)
- Any missing project items that need manual attention (from Step 7)

### Step 10: Commit, push, and open PR

Ask the user to review the changes, then:

```bash
git add public/items_db.json public/quests.json public/quests_detailed.json public/metaforge_quests.json public/image-manifest.json
git status
```

Show the staged files and ask for confirmation before committing. Then commit with a descriptive message and open a PR targeting `master`.

## Critical Rules

- **Steps 2 and 3 must run sequentially** — never in parallel. Running them concurrently causes race conditions in `items_db.json`.
- **Always create the branch first** (Step 1) before touching any data files.
- **Always regenerate the manifest** (Step 8) after any item changes.
- If any step fails with an error, stop and report the error to the user before continuing.
