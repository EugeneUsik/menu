# Operations Guide

## Weekly publishing workflow

### Step 1 — Generate the week JSON

Open `prompts/weekly-menu-generation-prompt.md`. Fill in the week ID, dates, and label. Attach or paste the contents of `prompts/Family-context.md` and `prompts/json-schema.md` into your LLM session.

Copy the JSON output and save it as:

```
data/weeks/YYYY-Www.json
```

Example: `data/weeks/2026-W20.json`

### Step 2 — Validate

```bash
node scripts/validate-week.js data/weeks/2026-W20.json
```

Fix any `[FAIL]` errors before proceeding. `[WARN]` items are advisory.

### Step 3 — Update the manifest

```bash
node scripts/sync-weeks-index.js
```

This scans `data/weeks/`, rebuilds `data/weeks/index.json`, and prints the resolved default week.

To force a specific default week:

```bash
node scripts/sync-weeks-index.js --default 2026-W20
```

### Step 4 — Validate all weeks (optional sanity check)

```bash
node scripts/validate-all-weeks.js
```

Exits with code 1 if any week fails. Useful before pushing.

### Step 5 — Commit and push

```bash
git add data/weeks/2026-W20.json data/weeks/index.json
git commit -m "Add week 2026-W20"
git push
```

GitHub Pages rebuilds within ~1 minute. Hard-refresh if you see stale content.

---

## Sample data

`data/weeks/sample-week.json` is a complete test fixture. It is excluded from the production manifest by default.

To include it (for testing the UI):

```bash
node scripts/sync-weeks-index.js --include-sample
```

Do not commit `index.json` generated with `--include-sample` to the main branch.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Week not in dropdown | `index.json` not updated | `node scripts/sync-weeks-index.js` |
| JSON parse error on validate | Invalid JSON from LLM | Fix JSON, re-run validate |
| `week.id does not match filename` | Mismatch between `week.id` in JSON and filename | Rename file or fix the id field |
| Broken recipe_id reference | recipe_id in menu not matching any recipe | validate-week.js lists the broken IDs |
| Wrong default week | `isCurrent` check uses local system date | Verify system date; re-run sync |
| Shopping checkboxes wrong week | Different `week.id` format across weeks | Ensure `week.id` matches filename exactly |
| GitHub Pages not updating | CDN cache | Wait 2–5 min, hard-refresh (Cmd+Shift+R) |
| `fetch()` fails locally | Opened HTML directly via filesystem | Use `python3 -m http.server 8080` |

---

## Script reference

| Script | Purpose | Usage |
|---|---|---|
| `sync-weeks-index.js` | Rebuild `index.json` from week files | `node scripts/sync-weeks-index.js [--include-sample] [--default WEEK-ID]` |
| `validate-week.js` | Validate one week file | `node scripts/validate-week.js data/weeks/YYYY-Www.json` |
| `validate-all-weeks.js` | Validate all weeks in manifest | `node scripts/validate-all-weeks.js` |

All scripts require Node.js ≥16. No external dependencies.

---

## Data directory layout

```
data/weeks/
  index.json          Auto-generated manifest — do not edit by hand
  sample-week.json    Test fixture — not in production manifest
  2026-W19.json       Real week files (one per week)
  2026-W20.json
  ...
```

---

## Validation checks

The validate script enforces 16 checks. Failures exit with code 1:

1. File exists and JSON parses
2. Required top-level fields present
3. `week.id` / `start_date` / `end_date` present
4. `menu` has exactly 7 days
5. Each day has breakfast / lunch / dinner with non-empty titles
6. `recipes` non-empty, no duplicate IDs
7. All `recipe_id` values in menu resolve to a recipe
8. `shared_snack` on ≥4 days
9. `shopping_list` is an array, no duplicate item IDs
10. `daily_nutrition` has 7 entries
11. Child nutrition entries have `includes_fixed_school_snack`
12. `safety.fixed_child_snack_accounted_for` present
13. No banned fruit terms in menu / recipes / shopping content
14. No processed-meat terms outside `child_fixed_school_snack`

Warnings (advisory, do not fail):

- Child daily nutrition entries missing `includes_fixed_school_snack` field (note: check 11 is a warning, not error, to accommodate partial data)
