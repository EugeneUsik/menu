# Generate Weekly Menu

Generate one or more weekly menus and publish them (validate → sync manifest → commit → push).

## STRICT CONSTRAINTS — follow exactly, no exceptions

- Do NOT read any existing week JSON files for reference or style calibration.
- Do NOT output the JSON to the chat. Write it directly to the file using the Write tool.
- Do NOT explain your reasoning, narrate steps, or print intermediate plans to the chat.
- Do NOT re-read prompt files more than once per generation run.
- Read each prompt file exactly once, in one tool call each, then generate immediately.

## Step 1 — Resolve target week(s)

Today's date is in the `currentDate` system context. Use ISO 8601 week numbering (weeks start Monday, Europe/Vilnius timezone).

Resolve plain-English input to one or more week IDs:
- "this week" → current ISO week
- "next week" → current + 1
- "next two weeks" → current + 1 and current + 2
- "2026-W25" → that exact week
- "weeks 24 and 25" → both

For each resolved week ID:
1. Check if `data/weeks/{weekId}.json` already exists. If it does, ask the user before overwriting.
2. Derive `start_date` (Monday) and `end_date` (Sunday) from the week ID.

## Step 2 — Read prompt files (once, in parallel)

Read these three files in a single parallel batch — do not read them separately or repeatedly:
- `prompts/weekly-menu-generation-prompt.md`
- `prompts/Family-context.md`
- `prompts/json-schema.md`

## Step 3 — Generate and write (two-pass)

The output JSON is large (~75–80KB). Write it in two passes to stay within output limits:

**Pass 1** — Write the file with everything except `shopping_list` and `daily_nutrition`:

```json
{
  "schema_version": "2.0",
  "language": "ru",
  "week": { ... },
  "fixed_school_snack": { ... },
  "menu": [ ...7 days... ],
  "recipes": [ ...all recipes... ],
  "shopping_list": [],
  "daily_nutrition": []
}
```

Use the Write tool. This creates the file on disk.

**Pass 2** — Fill in `shopping_list` and `daily_nutrition` using the Edit tool (replace `[]` with the real arrays).

Do both passes before running validation.

## Step 4 — Validate and fix

```bash
node scripts/validate-week.js data/weeks/{weekId}.json
```

If validation fails:
- Show `[FAIL]` lines to the user
- Fix with targeted Edit calls only — do not regenerate the whole file
- Re-run until it passes or you cannot fix without user input

## Step 5 — Publish

Once validation passes:

```bash
node scripts/sync-weeks-index.js
git add data/weeks/{weekId}.json data/weeks/index.json
git commit -m "W{nn}: generate menu for {weekId}"
git push
```

## Multiple weeks

Process sequentially — finish validate + commit for week N before starting week N+1.

## Done

One-line summary per week: week ID, validation result, push status.
