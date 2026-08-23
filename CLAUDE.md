# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Local dev — fetch() needs HTTP, do not open index.html from the filesystem
python3 -m http.server 8080

# ── Generation pipeline (in order) ──────────────────────────────────────────
node scripts/derive-history.js --brief                            # FIRST: history + calibration, 36 lines
node scripts/catalog-digest.js                                    # ingredient vocabulary, compact
node scripts/scaffold-plan.js   data/weeks/2026-W36-spec.json     # spec → scaled, normalised plan
node scripts/solve-plan.js      data/weeks/2026-W36-plan.json     # satisfy every budget at once
node scripts/validate-plan.js   data/weeks/2026-W36-plan.json     # the gate
node scripts/diagnose-plan.js   data/weeks/2026-W36-plan.json     # only if the gate still fails
node scripts/patch-plan.js      data/weeks/2026-W36-plan.json <recipe-id> "ингредиент=700"
node scripts/promote-plan.js    data/weeks/2026-W36-plan.json     # plan → week skeleton
node scripts/expansion-groups.js data/weeks/2026-W36.json         # per-worker group files
node scripts/apply-expansion.js data/weeks/2026-W36.json <fragments...>   # merge parallel expansion
node scripts/finalise-week.js   data/weeks/2026-W36.json --solve  # solve + nutrition + shopping + gate
node scripts/sync-weeks-index.js                                  # rebuild manifest

# ── Checks ──────────────────────────────────────────────────────────────────
node --test tests/*.test.js                                       # unit tests
node scripts/validate-foods.js                                    # food catalog self-test
node scripts/validate-all-weeks.js                                # every week in the manifest

# ── Useful flags ────────────────────────────────────────────────────────────
node scripts/compute-nutrition.js <week> --check                  # report, don't write
node scripts/generate-shopping-list.js <week> --dry-run           # preview the list
node scripts/derive-history.js --weeks 10                         # default 6
node scripts/promote-plan.js <plan> --force                       # promote despite failures
```

Vanilla Node, no dependencies, no build step. Tests use the built-in `node:test` runner, so
there is still nothing to install. Pass the glob (`tests/*.test.js`) rather than the directory —
`node --test tests/` resolves the path as a module and fails.

CI runs Node 24, matching the development machine, so "works locally" and "passes CI" mean the
same thing. Nothing in the tree needs anything past Node 18, but only 24 is actually exercised —
if you care about a lower floor, add it to the workflow as a matrix rather than asserting it here.

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
[docs/SPEC.md](docs/SPEC.md) is the scope and non-goals page and lists these explicitly, with
the reasons. The original 1,400-line implementation spec is archived at
[docs/history/SPEC-v1.md](docs/history/SPEC-v1.md) and describes an app that no longer exists in
several respects — don't reference it.

### Two-stage generation — the load-bearing design decision

```
spec  →  scaffold-plan.js  →  validate-plan.js  →  promote-plan.js  →  expand  →  compute  →  publish
                                   ↑ iterate here          (parallel, apply-expansion.js merges)
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

`validate-plan.js` is the gate and answers "what is wrong". [scripts/diagnose-plan.js](scripts/diagnose-plan.js)
answers "what do I change, and by how much" — every figure the gate prints is a per-person
*share* of a recipe total, so closing a 316 kcal gap is either ~316 kcal of `for: "husband"`
rows or ~825 kcal on the breakfast recipe, and only the eater set of the slot decides which.
Deriving that is not optional politeness: hand-computing it is the same portion-weight
arithmetic the prompt forbids for sizing, and it cost W36 a full round.
[scripts/patch-plan.js](scripts/patch-plan.js) then edits quantities by recipe id and ingredient
name, because a normalised plan is one field per line and `"quantity": 750` is not a unique
string anywhere in it. Neither script is a gate; `validate-plan.js` alone decides what passes.

### Derive, don't assert — and don't reason about it either

The same principle extends past nutrition. `normalise-plan.js` fills in the week dates, the
Russian label, the day scaffolding and every recipe's `serves`, all from `week.id` and where the
recipe_ids sit in the menu. A plan carries only decisions: which dishes, in which slot, at what
quantity. `serves` matters most — three scripts hard-fail on a mismatch — and deriving it makes
the error class impossible rather than merely detected.

There is a third failure mode beyond asserting and mis-deriving: **reasoning your way to a number
the tooling would hand you.** `recent-history.json` carries `portion_calibration` — observed total
recipe kcal *and protein* by slot from the last passing week. Working portions out from the
portion-weight split instead is slow *and* error-prone: the first W35 attempt reached 1240 kcal
for a breakfast against an actual 2018, because it treated the `for:`-tagged rows as outside the
recipe total when they are inside it, and that cost two extra validation rounds.

So quantities are no longer authored at all. [scripts/scaffold-plan.js](scripts/scaffold-plan.js)
takes a spec of decisions — which dish, which slot, which foods, no numbers — and solves for both
medians at once. Two constraints, not one: energy alone does not pin a recipe's shape, because 40%
of a lunch's kcal is reasonable as red lentils (24% protein, 60% carbohydrate) and absurd as
chicken breast, where it works out to ~107 g of protein and puts the husband 26% over his ceiling.
The first scaffolded week did exactly that, which is why `calibration()` now records protein too
and the allocator solves a 2×2 system over protein-dense and everything-else rows. Measured
effect on a fresh week: 30 → 10 → 3 failures on the first gate run, then one patch round to green.

Role energy shares in that allocator are **measured from the last passing week**, not chosen. The
one-liner that regenerates them is in [docs/OPERATIONS.md](docs/OPERATIONS.md); a guess there is
what put the husband over his protein ceiling and under his fat floor simultaneously.

### Quantities are solved, not negotiated

[scripts/solve-plan.js](scripts/solve-plan.js) finishes what the scaffold starts. **Every budget is
linear in ingredient grams** — energy, protein, fat, saturated fat, fibre, sodium, calcium and
vegetable weight are all `(per-100 g value) × grams`, each person's share of a recipe is a fixed
coefficient, and even the energy-share budgets are linear once written as `9·fat − max·kcal ≤ 0`
instead of as a ratio. So satisfying 3 people × 7 days × 12 budgets at once is a linear feasibility
problem, solved by cyclic projection in ~0.15 s.

This exists because doing it by hand does not work. W37 took four patch rounds of whack-a-mole:
cutting the husband's protein broke the wife's, adding skyr to fix that broke his energy, trimming
that broke a fat share. Each round fixed one budget and broke another, because `diagnose-plan.js`
reports a delta for one nutrient and nothing about what else that delta moves. Measured on the same
week: 6 gate failures → 0, in one command.

Warn-level budgets are **soft** constraints here, pursued only once the hard ones hold and never at
their expense. That is what finally put sodium under control — it is warn-level because the
measurement is an ingredient-only lower bound, not because a child at 113% over is acceptable. Same
week: 2018/1361/2174 mg/day → 1073/748/1598.

Two things the solver must not treat as free variables, both learned by watching it get them wrong:

- **`for:`-tagged rows are banded per person, not per portion.** A tagged row feeds one person once
  per occasion they attend, so scaling its band by `serves` made it three times too wide and drifted
  the wife's 25 g of walnuts to 55 g.
- **Recorded conventions bound tagged rows.** Banding correctly then pulled those walnuts down to
  15 g and the husband's carbohydrate row to its 35 g floor — both fully legal, because neither
  "30 g of nuts a day" nor "the husband's energy comes from a tagged carbohydrate" is a checked
  budget. So the bounds come from `portion_calibration.tagged_rows`, ±25%/+50% around what a passing
  week used.

Corollary: if you add a budget to `targets.json`, the solver picks it up with no code change — it
reads the same `DAILY_KEYS`/`RATIO_KEYS`/`WEEKLY_AVG_KEYS` as `lib/budgets.js`. If you add something
that is *not* a budget but still matters (a gram target for nuts, say), the solver will happily
trade it away. Put it in `targets.json` or accept that nothing defends it.

`scripts/catalog-digest.js` prints the same 174 foods as `data/foods.json` at ~40% of the size,
with the per-100 g figures in columns. Generation reads the digest; nothing reads a stale copy,
because it is generated on demand and never written to disk.

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

- `week.id` **must equal the filename without `.json`** (`buildIndex` in [sync-weeks-index.js](scripts/sync-weeks-index.js)).
- Filename format `YYYY-Www.json` (ISO 8601 week).
- `menu` has exactly 7 days; `day_name` matches array position; each day has
  breakfast/lunch/dinner with non-empty titles; `shared_snack` on ≥4 days.
- Every recipe needs ≥2 non-empty instruction steps.
- A recipe may occupy at most **two** menu slots, and only as a dinner → next-day-lunch pair.
  Anything else (the same snack on two days) would be bought once — a live defect in W20/W21.
- `daily_nutrition` has 7 entries, written by `compute-nutrition.js` from the same
  `analyze()` pass the budgets use. `validate-week.js` cross-checks it against the current
  ingredients, so a stale copy is an error rather than a wrong number in the UI. Archived
  2.0 weeks carry `[]`.
- Catalog keys must not contain a banned term as a word. `cherry-tomato` leaked "cherry" into
  shopping IDs and failed the allergy scan; it is `tomato-cocktail` now, and
  `validate-foods.js` guards against a recurrence.

### One live schema, and an archive

Every live week is **2.1**. The seven schema-2.0 weeks (W20–W26) live in
`data/weeks/archive/`, which `sync-weeks-index.js` cannot see because it reads the weeks
directory non-recursively — that is the whole retirement mechanism, and nothing is deleted.

`validate-week.js` therefore applies one rule set instead of branching per version. Pointed at
a 2.0 file it reports the version once and stops, rather than emitting dozens of failures
about fields that schema never had.

**`derive-history.js` reads the archive as well as the live directory.** It has to: history is
the one thing a retired week is still good for, and scanning only the live directory would
empty `recent-history.json` and silently disable the cross-week variety check. That is safe
because the summary reads titles, headline protein/grain and the declared `base`/`snack_format`
— never the eater model — so the archived files summarise correctly even though
`isSchoolLunchDay()` now reads their day flag as false.

Do not add a compatibility branch back for archived files. If you need to interpret one as
2.1, migrate a copy; do not teach the live code two schemas again.

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

Week selection priority (`selectDefaultWeek`): `?week=` param → `localStorage` → the week
covering today → nearest upcoming → manifest `defaultWeekId` → newest entry.

The date-based rules outrank `defaultWeekId`, which is the reverse of the original order.
They have to: `defaultWeekId` used to be computed today-first by `sync-weeks-index.js`, so
trusting it first happened to give the current week. It is now just "newest, or whatever
`--default` named" — and newest is often a future week — so keeping it first would mean never
landing on the week the reader is living in. `isCurrent` is gone from the manifest entirely;
`isCurrentWeek()` in app.js derives it from `start_date`/`end_date`.

The app does **not** compute nutrition. `daily_nutrition` is written into the week file by
`compute-nutrition.js`; `renderTotalsStrip` renders it and scores each day against
`data/targets.json`, which is fetched alongside the manifest.

It used to compute those totals on load, which meant a second nutrition engine in the browser
— already drifting from `lib/analyze.js` (its key list predated the micronutrient expansion)
and, as it turned out, feeding nothing: no view read the result. If you find yourself adding
nutrition arithmetic here, add it to `lib/analyze.js` and write it into the file instead.
A week with `daily_nutrition: []` renders no strip rather than erroring, which is what
archived 2.0 weeks rely on.

LocalStorage keys:
- Selected week: `weekly-menu:selectedWeekId`
- Shopping checkbox: `weekly-menu:shopping:{weekId}:{itemId}` — week-scoped, so state never
  leaks between weeks. `{itemId}` is now `{food-key}|{unit}`, stable across weeks.

`renderServingNotes()` derives the "Serving" block from the data rather than reading it out of
prose: which portions are `for:`-tagged to whom, and that a recipe filling both a dinner and a lunch
slot owes the next day a lunch. Both facts were previously restated in Russian in all 24 recipes of
every week, because `ingredients[].for` — the tag that drives the whole per-person nutrition split —
was not rendered anywhere at all. Generation is now told not to write either one.

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
- `data/weeks/archive/` — historical record of what was actually cooked. Read only by
  `derive-history.js`. Never rewrite these to satisfy a current threshold; generate a new week
  instead.
