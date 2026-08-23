# Generate Weekly Menu

Generate one or more weekly menus and publish them.

The flow is **plan → validate → expand → compute → publish**. All nutrition and variety
constraints are settled on the plan, which is ~9 KB, so iteration is cheap. Once
`validate-plan.js` passes, expansion cannot reopen a global constraint.

## STRICT CONSTRAINTS

- Do NOT read existing week JSON files for reference or style. Read `data/weeks/recent-history.json` instead — it is the ~5 KB summary that exists for this purpose.
- Do NOT output JSON to the chat. Write to files.
- Do NOT narrate reasoning or print intermediate plans to the chat.
- Do NOT hand-write `nutrition_estimate_per_person`. `compute-nutrition.js` derives it.
- Do NOT self-verify nutrition or variety rules. `validate-plan.js` does that mechanically.
- Read each prompt file exactly once per run.

## Step 1 — Resolve target week(s)

Today's date is in the `currentDate` system context. ISO 8601 weeks, Monday start, Europe/Vilnius.

- "this week" → current ISO week; "next week" → +1; "next two weeks" → +1 and +2
- "2026-W27" → that week; "weeks 27 and 28" → both

For each week: if `data/weeks/{weekId}.json` exists, ask before overwriting. Derive Monday and Sunday from the week ID.

## Step 2 — Read inputs (once, in parallel)

One parallel batch, no repeats:

- `prompts/weekly-menu-generation-prompt.md`
- `prompts/Family-context.md`
- `data/foods.json` — the ingredient vocabulary; names must come from here
- `data/targets.json` — the enforced numbers
- `data/weeks/recent-history.json` — what the last weeks used, for cross-week variety

## Step 3 — Refresh history

```bash
node scripts/derive-history.js
```

Cheap, and keeps the cross-week check honest if weeks were added since the file was built.

## Step 4 — Write the plan

Write `data/weeks/{weekId}-plan.json` in **one** Write call (~9 KB): week metadata, 7-day
menu, and each recipe with `serves`, the declared `base`/`format`/`snack_format`, and its
4–7 nutritionally dominant ingredients with total quantities.

Watch `serves`: a Mon–Thu dinner carrying into next-day school lunch is **5** portions
(3 + 2 adults), a Mon–Fri lunch alone is **2**, a weekend carry-over is **6**.

## Step 5 — Validate the plan, iterate here

```bash
node scripts/validate-plan.js data/weeks/{weekId}-plan.json
```

- The `· ` lines are the derived picture of the week — read them to see which way to move.
- Fix `[FAIL]` lines with **targeted Edit calls**. Never regenerate the whole plan.
- Re-run until it passes. This is the loop that matters; keep it here rather than downstream.
- If a failure looks like a bad rule rather than a bad menu, stop and say so instead of contorting the menu around it.

## Step 6 — Expand into the week file

```bash
node scripts/promote-plan.js data/weeks/{weekId}-plan.json
```

Then for each recipe add:

- Remaining minor ingredients — aromatics, herbs, spices, lemon. State `соль` and
  `перец чёрный молотый` in grams; do not use the legacy `соль, перец` catch-all.
- `instructions`: 3–6 short Russian imperative steps with real actions, times, temperatures.

Do not touch `serves`, dominant quantities, titles, or the menu — those passed validation.

Two Edit batches over the recipe array is usually enough. Adding minor ingredients shifts
the numbers only slightly, and Step 7 recomputes exactly.

## Step 7 — Compute nutrition

```bash
node scripts/compute-nutrition.js data/weeks/{weekId}.json
```

Derives every per-person figure from ingredient quantities via `data/foods.json`. Fails on
any unknown ingredient — add it to the catalog and re-run. It also reports which values
moved >15% from the plan's implied numbers.

## Step 8 — Shopping list

```bash
node scripts/generate-shopping-list.js data/weeks/{weekId}.json
```

Display names and categories come from the catalog; no metadata pass. Add a
`--notes {weekId}-notes.json` file only if a purchase note is genuinely needed
(`{"food-key": "проверить состав"}`). Notes must not contain banned fruit terms.

## Step 9 — Validate the week

```bash
node scripts/validate-week.js data/weeks/{weekId}.json
```

Re-checks structure, safety, and the budgets against the final ingredient lists. Failures
here should be small (a minor ingredient pushed a day out of band) — fix with targeted
Edits, then re-run Steps 7–9.

## Step 10 — Publish

```bash
node scripts/sync-weeks-index.js
node scripts/derive-history.js
git add data/weeks/{weekId}.json data/weeks/index.json data/weeks/recent-history.json
git commit -m "W{nn}: generate menu for {weekId}"
git push
```

Commit `data/foods.json` too if you added foods to it.

The `-plan.json` and `-notes.json` files are gitignored working artifacts — leave them uncommitted.

## Multiple weeks

Sequential: finish Step 10 for week N before starting week N+1, so week N+1's cross-week
variety check sees week N.

## Done

One line per week: week ID, plan iterations needed, validation result, push status.
