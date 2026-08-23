# Operations Guide

## Weekly publishing workflow

Generation is **two-stage**: a small plan is validated first, then expanded. All nutrition
and variety constraints are properties of the whole week, so they are settled on the ~9 KB
plan rather than on the ~78 KB finished file. Once the plan passes, expansion cannot reopen
them — which is what removes the old menu → recipes → shopping → nutrition rework loop.

The `/generate-menu` skill drives all of this. The steps below are the manual equivalent.

### Step 1 — Refresh cross-week history

```bash
node scripts/derive-history.js
```

Writes `data/weeks/recent-history.json` — a ~5 KB summary of the last 4 weeks' dinner
protein/starch pairings, breakfast bases and snack formats. This is the only thing generation
should read about previous weeks, and `validate-plan.js` uses it to reject recent repeats.

### Step 2 — Write the plan

Feed the LLM `prompts/weekly-menu-generation-prompt.md`, `prompts/Family-context.md`,
`data/foods.json`, `data/targets.json` and `data/weeks/recent-history.json`. It writes:

```
data/weeks/YYYY-Www-plan.json
```

The plan holds the week metadata, the 7-day menu, and each recipe's `serves`, declared
`base`/`format`/`snack_format`, and 4–7 nutritionally dominant ingredients with total
quantities. No instructions, no minor ingredients, no nutrition figures.

### Step 3 — Validate the plan and iterate

```bash
node scripts/validate-plan.js data/weeks/2026-W27-plan.json
```

**This is where iteration belongs.** The `· ` lines are the derived picture of the week —
weekly averages, day counts, distinct vegetables, formats used. Read them to see which
direction to move, then fix `[FAIL]` lines with targeted edits and re-run.

Common failures and what they mean:

| Failure | Meaning |
|---|---|
| `serves=6 but the menu needs 5` | A Mon–Thu dinner carrying into next-day lunch feeds 3 + 2 adults, not 3 + 3 |
| `child protein_g above max` | Too much protein — a real constraint, not an aspiration |
| `Only 1 distinct dinner formats` | Vary `format`; ≥4 needed, ≤2 `one_pot` |
| `Dinner pairing "salmon+grain_buckwheat" was already used` | Cross-week repeat within 3 weeks |
| `used in 2 slots but only a dinner → next-day-lunch pair is supported` | The same snack on two days would be bought once |
| `unknown ingredient` | Not in `data/foods.json` — add it there, don't rename around it |

### Step 4 — Expand into the week file

```bash
node scripts/promote-plan.js data/weeks/2026-W27-plan.json
```

Writes `data/weeks/2026-W27.json` with everything the plan settled, `instructions: []`, and
the `fixed_school_lunch` block copied from `targets.json`.

Then the LLM adds, per recipe:

- Remaining minor ingredients — aromatics, herbs, spices, lemon. State `соль` and
  `перец чёрный молотый` in grams; the legacy `соль, перец` catch-all makes sodium untrackable.
- `instructions`: 3–6 short Russian imperative steps.

Nothing else changes — `serves`, dominant quantities, titles and the menu all passed validation.

### Step 5 — Compute nutrition

```bash
node scripts/compute-nutrition.js data/weeks/2026-W27.json
```

Derives every per-person figure from ingredient quantities via `data/foods.json`. Exits
non-zero on an unknown ingredient or a `serves` mismatch. Also reports which values moved
>15% from the previous estimate.

Useful variants:

```bash
node scripts/compute-nutrition.js data/weeks/2026-W27.json --check          # report, don't write
node scripts/compute-nutrition.js data/weeks/2026-W25.json --check --infer-serves   # audit a legacy file
```

### Step 6 — Assemble the shopping list

```bash
node scripts/generate-shopping-list.js data/weeks/2026-W27.json
node scripts/generate-shopping-list.js data/weeks/2026-W27.json --dry-run    # preview
```

Display names, categories and purchase units come from `data/foods.json`. There is no
metadata pass. If a genuine purchase note is needed:

```bash
echo '{"berries-mixed": "проверить состав"}' > data/weeks/2026-W27-notes.json
node scripts/generate-shopping-list.js data/weeks/2026-W27.json --notes data/weeks/2026-W27-notes.json
```

Notes must not contain banned fruit terms — write `проверить состав`, never `без вишни`.

### Step 7 — Validate the week

```bash
node scripts/validate-week.js data/weeks/2026-W27.json
```

Re-checks structure, safety, `serves`, and the budgets against the final ingredient lists.
Failures here should be small — a minor ingredient nudged a day out of band. Fix with
targeted edits and re-run Steps 5–7.

### Step 8 — Publish

```bash
node scripts/sync-weeks-index.js
node scripts/derive-history.js
git add data/weeks/2026-W27.json data/weeks/index.json data/weeks/recent-history.json
git commit -m "W27: generate menu for 2026-W27"
git push
```

Commit `data/foods.json` too if you added foods. GitHub Pages rebuilds within ~1 minute;
hard-refresh if you see stale content.

`-plan.json` and `-notes.json` are gitignored working artifacts — leave them uncommitted.

---

## Changing the family's targets

`data/targets.json` is the single source of truth for every enforced number: daily budgets,
portion weights, who eats which slot, variety thresholds, cooking-time caps, and the school
lunch estimate. `prompts/Family-context.md` explains the reasoning behind them.

**Change both, together.** The scripts read only `targets.json`; the LLM reads mainly the
prompt. Divergence means the menu is designed against one set of numbers and judged against
another.

The school lunch values in `targets.json` → `fixed_school_lunch` are currently **estimates**
(`assumed: true`). Replace them when the school publishes real figures — the child's whole
daily budget is built on them.

---

## Adding a food

`data/foods.json` is the ingredient vocabulary. An unknown ingredient name is a hard failure
in `compute-nutrition.js`, by design: it forces the catalog to grow rather than letting
unpriceable names in.

```jsonc
{ "key": "sardines-canned",              // lowercase ASCII slug, never changed once published
  "name_ru": "сардины консервированные", // canonical spelling, noun-first
  "cat": "Рыба и морепродукты",           // shopping category, from the fixed list
  "tags": ["fatty_fish", "canned"],       // drives variety and weekly-count rules
  "species": "sardine",                   // fish only — for the different-species rule
  "basis": "dry",                          // only for grains/legumes weighed uncooked
  "per100g": { "kcal": 208, "p": 25, "c": 0, "f": 11, "sf": 1.5, "fib": 0, "na": 400 },
  "g_per": { "pcs": 30 },                 // needed if the ingredient is ever counted, not weighed
  "density": 0.92,                         // needed if ever measured in ml and not water-like
  "aliases": ["сардины", "sardines"] }     // every spelling that should resolve here
```

Then:

```bash
node scripts/validate-foods.js
```

Watch out: **a key must not contain a banned term as a word.** Keys end up inside shopping
item IDs, so `cherry-tomato` put "cherry" into every week that used it and failed the allergy
scan at the very last step. It is `tomato-cocktail` now.

---

## Auditing legacy weeks

Weeks up to 2026-W26 are schema 2.0: hand-authored nutrition, no `serves`, and the child's
midday meal modelled as a packed snack. Their nutrition figures cannot be recomputed reliably
because portion intent is unrecorded. `validate-week.js` therefore skips budget checks on them
and says so.

To see roughly how far off one is:

```bash
node scripts/compute-nutrition.js data/weeks/2026-W25.json --check --infer-serves
```

Treat the output as indicative. Several 2.0 recipes were written with 6-portion quantities
but used in a single slot, so inference over-reads them.

---

## Sample data

`data/weeks/sample-week.json` is a test fixture, excluded from the production manifest.

```bash
node scripts/sync-weeks-index.js --include-sample
```

Do not commit an `index.json` generated with `--include-sample`.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Week not in dropdown | `index.json` stale | `node scripts/sync-weeks-index.js` |
| `unknown ingredient "X"` | Not in the catalog | Add it to `data/foods.json`, run `validate-foods.js` |
| `serves=N but the menu needs M` | Weekday lunch feeds 2, not 3 | Set `serves` to M and rescale quantities |
| `Banned fruit term "яблочный"` | Apple cider vinegar or similar | Use `уксус винный белый` or `сок лимонный` |
| `Banned fruit term` in a shopping item `id` | A catalog key contains the term | Rename the key; `validate-foods.js` catches this |
| Nutrition looks doubled or halved | `serves` wrong, or a recipe reused outside a dinner→lunch pair | `validate-plan.js` reports both |
| `week.id does not match filename` | Mismatch | Rename the file or fix `week.id` |
| Cross-week check passes but repeats appear | `recent-history.json` stale | `node scripts/derive-history.js` |
| Shopping checkboxes wrong week | `week.id` format differs across weeks | Ensure `week.id` matches the filename |
| GitHub Pages not updating | CDN cache | Wait 2–5 min, hard-refresh |
| `fetch()` fails locally | Opened the HTML from the filesystem | `python3 -m http.server 8080` |

---

## Script reference

| Script | Purpose |
|---|---|
| `derive-history.js` | Build `recent-history.json` from the last N weeks (`--weeks N`) |
| `validate-plan.js` | Validate a plan: structure, safety, budgets, variety, cross-week repeats |
| `promote-plan.js` | Expand a validated plan into the week skeleton (`--force` to overwrite) |
| `compute-nutrition.js` | Derive per-person nutrition from ingredients (`--check`, `--infer-serves`) |
| `generate-shopping-list.js` | Assemble `shopping_list[]` from the catalog (`--dry-run`, `--notes`) |
| `validate-week.js` | Validate a published week file |
| `validate-all-weeks.js` | Validate every week in the manifest (CI) |
| `validate-foods.js` | Self-test `data/foods.json` (CI) |
| `sync-weeks-index.js` | Rebuild `index.json` (`--include-sample`, `--default WEEK-ID`) |

Shared libraries in `scripts/lib/`: `foods.js` (catalog and name resolution),
`analyze.js` (eater sets, portion maths, derived variety facts), `scan.js` (banned-term scanner).

Node ≥16, no dependencies, no build step, no test runner.

---

## Data directory layout

```
data/
  foods.json            Food catalog — nutrition, categories, aliases
  targets.json          Budgets, portion weights, eater sets, variety thresholds
  weeks/
    index.json          Auto-generated manifest — do not hand-edit
    recent-history.json Auto-generated cross-week summary
    sample-week.json    Test fixture — not in the production manifest
    2026-W27.json       Published week files
    2026-W27-plan.json  Working artifact — gitignored
```
