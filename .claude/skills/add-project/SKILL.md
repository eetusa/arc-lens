# Skill: /add-project

Use this skill when the user says `/add-project` or asks to add a new concurrent project.

## Purpose

Adds a new concurrent project (e.g. Weather Monitor System, Trophy Display) to `public/projects.json` and ensures all required items exist in the item database.

## Instructions

### Step 1: Get the wiki URL

Ask the user for the wiki URL of the new project. Wait for their response before proceeding.

Example: `https://arcraiders.wiki/wiki/Weather_Monitor_System`

### Step 2: Auto-scrape the project

Run the project scraper with the provided URL:

```bash
node scripts/project-scraper.js --scrape-url <url> 2>&1
```

Replace `<url>` with the URL the user provided.

### Step 3: Review parsed phases

Show the user the parsed project phases from the scraper output. Ask them to confirm:
- Is the project name correct?
- Are all phases present?
- Do the item requirements look right?

If the parser failed or the output looks wrong, ask the user to manually provide the project data and update `public/projects.json` accordingly.

### Step 4: Verify items exist in the database

```bash
node scripts/project-scraper.js --verify 2>&1
```

Report any items that are missing from `items_db.json`.

### Step 5: Add missing items (if any)

If Step 4 found missing items, scrape them from the wiki:

```bash
node scripts/wiki-scraper.js --add-missing 2>&1
```

### Step 6: Regenerate image manifest

After adding any new items:

```bash
npm run generate-manifest 2>&1
```

### Step 7: Show project summary

```bash
node scripts/project-scraper.js --list 2>&1
```

Show the full project listing so the user can verify everything looks correct.

### Step 8: Commit the changes

Stage the relevant files and ask the user for confirmation before committing:

```bash
git add public/projects.json public/items_db.json public/image-manifest.json
git status
```

Commit with a message like: `Add <project name> project data`

## Notes

- If the wiki scraper cannot parse the project page (tables vary in structure), offer to help the user manually create the project entry in `public/projects.json`.
- Always run `--verify` before finishing — missing items will cause the advisor engine to silently fail to show project demand.
