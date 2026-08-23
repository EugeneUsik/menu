# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Local dev — fetch() needs HTTP, do not open index.html from the filesystem
python3 -m http.server 8080

# ── Generation pipeline (in order) ──────────────────────────────────────────
node scripts/derive-history.js                                    # refresh cross-week summary
node scripts/validate-plan.js  data/weeks/2026-W27-plan.json      # iterate HERE
node scripts/promote-plan.js   data/weeks/2026-W27-plan.json      # plan → week skeleton
node scripts/compute-nutrition.js data/weeks/2026-W27.json        # derive nutrition
node scripts/generate-shopping-list.js data/weeks/2026-W27.json   # assemble shopping list
node scripts/validate-week.js  data/weeks/2026-W27.json           # final gate
node scripts/sync-weeks-index.js                                  # rebuild manifest

# ── Checks ──────────────────────────────────────────────────────────────────
node --test tests/*.test.js                                       # unit tests
node scripts/validate-foods.js                                    # food catalog self-test
node scripts/validate-all-weeks.js                                # every week in the manifest

# ── Useful flags ────────────────────────────────────────────────────────────
node scripts/compute-nutrition.js <week> --check                  # report, don't write
node scripts/compute-nutrition.js <week> --check --infer-serves   # audit a legacy 2.0 file
node scripts/generate-shopping-list.js <week> --dry-run           # preview the list
node scripts/derive-history.js --weeks 8
node scripts/sync-weeks-index.js --include-sample                 # dev only
```

Vanilla Node ≥18, no dependencies, no build step. Tests use the built-in `node:test` runner,
so there is still nothing to install. Pass the glob (`tests/*.test.js`) rather than the
directory — `node --test tests/` resolves the path as a module and fails.

Tests cover the arithmetic that cannot be eyeballed: unit conversion, the eater model and
per-person split, budget severity routing, and the banned-term scanner. Anything that reads
a threshold from `data/targets.json` belongs here rather than in a comment.

## Architecture

### Publishing model

Static, JSON-driven site on GitHub Pages. The app is read-only — no LLM calls, no backend,
no build step. Menu generation happens **externally**: a human (or the `/generate-menu` skill)
runs the prompts against an LLM, then the scripts validate, compute, and publish.
See [docs/OPERATIONS.md](docs/OPERATIONS.md).

Do not add: LLM API calls, a backend, build tooling, frameworks, or browser-side editing.
[docs/SPEC.md](docs/SPEC.md) §4.2 and §21 list these as out of scope.

### Two-stage generation — the load-bearing design decision

```
plan (~9 KB)  →  validate-plan.js  →  promote-plan.js  →  expand  →  compute  →  publish
                       ↑ iterate here
```

Every nutrition and variety rule is a property of the **whole 7-day week**, not of a single
meal. The old single-pass flow wrote ~78 KB of recipes first and checked those rules
afterwards by LLM self-review. That meant failures surfaced only after the expensive work,
and fixing one invalidated the downstream artifacts — the rework loop that made generation
slow. It also meant the rules were asserted rather than verified: across seven published
weeks the child's protein ran ~75% over target every week, undetected.

So: **settle all global constraints on the plan, mechanically.** Iterating on 9 KB is far
cheaper, and after `validate-plan.js` passes, expansion cannot reopen a global constraint.

Corollary for anyone editing the prompts: **never ask the model to self-verify nutrition or
variety, and never ask it to write nutrition numbers.** Both are computed. If you find
yourself adding a checklist item, add a check to `validate-plan.js` instead.

### Data flow

```
data/foods.json    ─┐
data/targets.json  ─┼─→ scripts/lib/{foods,analyze,budgets,scan}.js ─→ validate-plan / compute-nutrition / validate-week
{weekId}-plan.json ─┘                                                      │
                                                                           ↓
data/weeks/{weekId}.json → sync-weeks-index.js → index.json → app.js fetches both
data/weeks/{weekId}.json → derive-history.js   → recent-history.json → next week's variety check
```

`lib/budgets.js` holds the daily/weekly budget loop and the surviving per-meal rules. Both
validators call it. They used to carry near-identical copies, which is the drift this repo
keeps paying for — add a budget there, not in either validator.

### Three data files, one source of truth each

| File | Owns | Never |
|---|---|---|
| [data/foods.json](data/foods.json) | Per-100 g nutrition, shopping category, unit conversions, canonical ingredient names, food tags | Hand-edit a `key` after it ships — it appears in shopping item IDs |
| [data/targets.json](data/targets.json) | Every enforced number: budgets, portion weights, eater sets, variety thresholds, cooking caps, school-lunch estimate | Duplicate a threshold into a script |
| [prompts/Family-context.md](prompts/Family-context.md) | The *reasoning* behind those numbers | Let it diverge from `targets.json` |

Change a threshold in `targets.json` and in `Family-context.md` together. Scripts read only
the former; the LLM reads mainly the latter. Divergence means designing against one set of
numbers and judging against another.

`Family-context.md` §8.2 must stay **exhaustive**: any number in that document not present in
`targets.json` belongs on that list. A number that is neither enforced nor listed as
unenforced reads as though it were being checked. That was how the wife's sterol target, the
vegetable-weight targets and every salt figure went years without a mechanism.

A budget entry is hard-fail unless it carries `"severity": "warn"`. Hard where the data is
complete and the lever direct (energy, macros, fibre, gram weights); warn where the
measurement itself is uncertain (sodium is an ingredient-only lower bound; ca/fe/zn are total
rather than bioavailable and exclude the school lunch). Don't promote a warn to hard without
first generating a real week against it.

### Nutrition is computed, never authored

`compute-nutrition.js` derives every per-person figure from ingredient quantities via the
catalog. Each person's share of an untagged ingredient is its total weighted by their portion
weight, divided by the sum of weights over every eater of every occasion the recipe covers.
An ingredient tagged `for: "wife"` goes entirely to her.

This replaced hand-written numbers that were 15–20% off, with internal macro/kcal consistency
degrading week over week (0% mismatch in W20 → 20% in W26).

`sodium_mg` counts only sodium present in ingredients — a lower bound, since added salt is
often unstated. Do not present it as total salt intake.

`veg_fruit_g` is a pseudo-nutrient carried through the same split: a food's own gram weight
when it counts toward the fruit-and-vegetable target, 0 otherwise. Potato and sweet potato
carry `vegetable_starchy` *without* `vegetable` and so don't count; parsnip carries both and
does. Adding a per-day metric this way costs nothing — no separate accumulation path.

`calcium_mg`/`iron_mg`/`zinc_mg` are **total** intake from composition tables, not
bioavailable intake, and the school lunch contributes zero by design. They detect a floor;
they do not measure adequacy. `for:` tagging matters most here: a shared ingredient gives the
child 1.1/3.0 of its total, so 500 ml of shared milk delivers him ~220 mg of calcium against a
1300 mg target. His dairy has to be `for: "child"`.

### The eater model — easy to get wrong

The child eats **lunch at school Monday–Friday**. So:

- `menu[].lunch` on a school day feeds **two** people, not three.
- A Mon–Thu dinner carrying into next-day lunch is **5** portions (3 + 2), not 6.
- `recipes[].serves` must equal the derived eater count; a mismatch is a hard failure because
  `generate-shopping-list.js` sums each recipe's quantities exactly once.

All of this is derived from `includes_fixed_school_lunch` via `eatersFor()` in
[scripts/lib/analyze.js](scripts/lib/analyze.js) — never declared by the model.

### Invariants enforced by tooling

- `week.id` **must equal the filename without `.json`** ([sync-weeks-index.js:67](scripts/sync-weeks-index.js#L67)).
- Filename format `YYYY-Www.json` (ISO 8601 week).
- `menu` has exactly 7 days; `day_name` matches array position; each day has
  breakfast/lunch/dinner with non-empty titles; `shared_snack` on ≥4 days.
- Every recipe needs ≥2 non-empty instruction steps.
- A recipe may occupy at most **two** menu slots, and only as a dinner → next-day-lunch pair.
  Anything else (the same snack on two days) would be bought once — a live defect in W20/W21.
- `daily_nutrition` is `[]`; `app.js` computes it at load time.
- Catalog keys must not contain a banned term as a word. `cherry-tomato` leaked "cherry" into
  shopping IDs and failed the allergy scan; it is `tomato-cocktail` now, and
  `validate-foods.js` guards against a recurrence.

### Schema 2.1 vs 2.0

2.1 renamed `fixed_school_snack` → `fixed_school_lunch` (and the per-day flag likewise), added
required `serves`, and moved to computed nutrition. Weeks up to 2026-W26 are 2.0.

`app.js` reads both. `validate-week.js` applies nutrition budgets **only from 2.1**, because a
2.0 file declares no `serves`, so portion size is unknowable and scoring it would emit dozens
of meaningless warnings. Do not "fix" that by inferring `serves` in the validator — several
2.0 recipes were written with 6-portion quantities but used in a single slot.

### Deterministic safety scanner

[scripts/lib/scan.js](scripts/lib/scan.js) recursively scans all string values for banned fruit
terms and processed-meat terms (EN/LT/RU). Two exclusion rules:

- `META_SKIP` keys are skipped so admin fields don't trip the scan.
- The processed-meat scan **additionally** skips `fixed_school_lunch` — its contents are
  external and undescribed. Processed meat is rejected everywhere else.

`containsTerm()` uses manual Unicode-aware word boundaries, not `\b`, which does not work for
Cyrillic or Lithuanian diacritics. **Preserve this when adding terms.**

The fruit list includes stems like `яблочный`, so apple cider vinegar (`уксус яблочный`) fails.
That is intended — use `уксус винный белый` or `сок лимонный`.

### Frontend ([app.js](app.js))

Single global `state`: `{ manifest, selectedWeekId, weekData, activeView, recipeFilters }`.
Three hash-routed views: `#menu`, `#recipes`, `#shopping`.

Week selection priority (`selectDefaultWeek`): `?week=` param → `localStorage` → manifest
`defaultWeekId` → `isCurrent` week → nearest upcoming → first entry.

`computeDailyNutrition` respects the eater model — it will not credit the child for a weekday
lunch — and reads both `fixed_school_lunch` and the legacy `fixed_school_snack`.

LocalStorage keys:
- Selected week: `weekly-menu:selectedWeekId`
- Shopping checkbox: `weekly-menu:shopping:{weekId}:{itemId}` — week-scoped, so state never
  leaks between weeks. `{itemId}` is now `{food-key}|{unit}`, stable across weeks.

All user-facing strings go through `escapeHtml()` before `innerHTML` injection. **Maintain
this** — recipe and menu content comes from external LLM output.

## CI

[.github/workflows/validate.yml](.github/workflows/validate.yml) runs `validate-foods.js`,
then syncs and diff-checks the manifest, then `validate-all-weeks.js`, then diff-checks
`recent-history.json`. Triggers on any change under `data/**.json` or `scripts/**.js`.

## Don't touch without intent

- `prompts/Family-context.md` — binding family-specific source of truth. Not for app code to duplicate.
- `data/targets.json` `fixed_school_lunch` — currently **estimates** (`assumed: true`). The
  child's whole daily budget rests on them; replace with measured figures when available.
- `data/foods.json` keys — they appear in published shopping item IDs.
- `data/weeks/sample-week.json` — test fixture, excluded from the production manifest by
  default. Never commit an `index.json` generated with `--include-sample`.
