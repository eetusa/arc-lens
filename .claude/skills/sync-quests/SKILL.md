# Skill: /sync-quests

Use this skill when the user says `/sync-quests` or asks to refresh quest data without a full patch update.

## Purpose

Refreshes quest data and map markers when new quests have been added or quest details have changed, without running the full patch update pipeline.

## Instructions

### Step 1: Show the quest diff

Compare current quest data against the wiki to find new or changed quests:

```bash
node scripts/quest-scraper.js --compare 2>&1
```

Report the diff to the user:
- How many quests are in the wiki vs local
- Which quests are new (in wiki but not local)
- Which quests may be missing locally

### Step 2: Scrape quest data

If new quests were found (or if the user wants a full refresh), scrape all quest data:

```bash
node scripts/quest-scraper.js --scrape-all 2>&1
```

If the user only wants specific quests updated, use:

```bash
node scripts/quest-scraper.js --scrape "<quest name>" 2>&1
```

### Step 3: Refresh map markers

Map markers should always be updated alongside quest data — new quests may have new marker locations:

```bash
node scripts/metaforge-scraper.js --scrape 2>&1
```

### Step 4: Check for missing prerequisite entries

After scraping, check if any new quests in `quests_detailed.json` are missing prerequisite (dependency) entries in `quests.json`. New quests without proper prereqs won't be tracked correctly.

Read `public/quests.json` and cross-reference with the newly added quests from Step 2. Report any quests that:
- Appear in `quests_detailed.json` but not in `quests.json`
- Have `prereqs: []` when they should have prerequisites based on the quest chain

For any quests needing manual prereq entries, show the user what to add to `quests.json`.

### Step 5: Commit the changes

Stage and show the user what will be committed:

```bash
git add public/quests.json public/quests_detailed.json public/metaforge_quests.json
git status
```

Ask for confirmation, then commit with a message like: `Sync quest data and map markers`

## Notes

- Always run Step 3 (metaforge) after updating quests — map markers depend on quest names matching exactly.
- If `quests.json` needs manual edits for prerequisites, do them before committing so the quest tracker works correctly.
- This skill does NOT update item data or the image manifest — use `/patch-update` for that.
