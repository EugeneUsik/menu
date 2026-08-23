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

Use `--brief` when the output is going to an LLM: it prints the ~36 lines generation needs — the
energy and protein medians to seed from, the `for:`-tagged conventions, the blocked dinner pairings
already deduped over the lookback window, and last week's titles, bases and snack formats —
instead of the 465-line JSON. Same trick `catalog-digest.js` plays on `data/foods.json`.

### Step 2 — Write a spec, scaffold the plan

Feed the LLM `prompts/weekly-menu-generation-prompt.md`, `data/targets.json`, the output of
`catalog-digest.js` and the output of `derive-history.js --brief`. It writes a spec of decisions
only — which dish, which slot, which foods, **no quantities**:

```jsonc
{ "week": "2026-W37",
  "days": [
    { "breakfast": { "title": "Овсянка с черникой", "id": "oats-blueberry", "base": "oats",
                     "foods": ["хлопья овсяные", "скир 0–2%", "черника", "семена тыквы"] },
      "dinner":    { "title": "Форель с булгуром", "id": "trout-bulgur", "format": "plated",
                     "carry": true,                    // wires the next day's lunch
                     "foods": ["филе форели", "булгур", "брокколи", "масло оливковое=25"] } }
    // ... 7 days, Monday first
  ] }
```

```bash
node scripts/scaffold-plan.js data/weeks/2026-W37-spec.json
```

This writes a **normalised** plan — so there is no separate `normalise-plan.js` step — with
quantities solved to hit both the energy and protein medians for each recipe's slot-and-serves
bucket, the `for:`-tagged conventions on every breakfast, cook-once dinners wired to next-day
lunches, and `serves` derived from who actually eats. A `!` line means a recipe's protein target
was unreachable from the foods chosen, which is information about the spec rather than an error.

Why two constraints and not just energy: 40% of a lunch's kcal is a reasonable share for red
lentils (24% protein, 60% carbohydrate) and absurd for chicken breast, where it is ~107 g of
protein and puts the husband 26% over his ceiling. The first scaffolded week did exactly that.

The allocator's role energy shares are measured, not chosen. Regenerate them from the newest
passing week when the pattern shifts materially, and paste the result into `ROLE_SHARE`:

```bash
node -e '
const F=require("./scripts/lib/foods.js"),{analyze}=require("./scripts/lib/analyze.js");
const {roleOf}=require("./scripts/scaffold-plan.js"),w=require("./data/weeks/2026-W36.json");
const by={};for(const f of analyze(w).recipeFacts.values()){if(!f.occasions.length)continue;
const s=[...new Set(f.occasions.map(o=>o.slot))].sort().join("+");by[s]=by[s]||{};
for(const r of f.rows)by[s][roleOf(r.food)]=(by[s][roleOf(r.food)]||0)+r.nut.kcal;}
for(const[s,r]of Object.entries(by)){const t=Object.values(r).reduce((a,b)=>a+b,0);
console.log(s.padEnd(15),Object.entries(r).sort((a,b)=>b[1]-a[1])
  .map(([k,v])=>k+" "+(v/t).toFixed(2)).join("  "));}'
```

### Step 3 — Solve the quantities, then validate

```bash
node scripts/solve-plan.js    data/weeks/2026-W27-plan.json
node scripts/validate-plan.js data/weeks/2026-W27-plan.json
```

**Do not adjust quantities by hand.** Every budget is linear in ingredient grams, each person's
share of a recipe is a fixed coefficient, and the energy-share budgets are linear once written as
`9*fat - max*kcal <= 0` rather than as a ratio — so satisfying all of them at once is arithmetic.
`solve-plan.js` does it by cyclic projection in about 0.15 s, starting from the scaffolded
quantities so the recipe still looks like food. Measured on a fresh week: 6 gate failures to 0.

Warn-level budgets are pursued as *soft* constraints, only after the hard ones hold. That is what
keeps sodium honest — it went from 2018/1361/2174 mg/day to 1073/748/1598 on the week this was
built against, all three inside their caps.

Read the solver's report; it ends with what it could not satisfy:

- `Could not satisfy (hard)` — no quantity vector works. **The menu needs a different food.** Change
  the spec and re-scaffold rather than fighting it with patches.
- `Still outside a warn-level budget` — expected for the wife's calcium, iron and viscous fibre,
  which are structural in this pattern.

Anything the solver leaves broken appears in that report, so a plan is never presented as solved
when it is not. If the gate fails on something the solver did not mention, that is a bug.

Two things the solver deliberately will not move: the sterol drink (one 100 ml bottle, a discrete
product) and seasonings. And `for:`-tagged rows are bounded by `portion_calibration.tagged_rows`
rather than by the generic bands — otherwise nothing defends the wife's 30 g of walnuts or the
husband's tagged carbohydrate, because neither is a checked budget.

Only if the gate still fails:

```bash
node scripts/validate-plan.js data/weeks/2026-W27-plan.json
```

**This is where iteration belongs.** The `· ` lines are the derived picture of the week —
weekly averages, day counts, distinct vegetables, formats used. Read them to see which
direction to move.

When something fails, the gate tells you *what* is wrong but not *what to change*, because every
number it prints is a per-person share of a recipe total. Two scripts close that gap:

```bash
node scripts/diagnose-plan.js data/weeks/2026-W27-plan.json          # which slot, which share, what delta
node scripts/patch-plan.js    data/weeks/2026-W27-plan.json chicken-barley-kale "грудка куриная=700"
```

`diagnose-plan.js` opens with any recipe more than 15% off its `portion_calibration` median — the
earliest sign of a mis-scaled plan — then for each blocking breach prints each slot's
contribution, the share that person receives, and both routes out: change the recipe total (moves
every eater) or change a `for:`-tagged row (moves only them, multiplied by the days the recipe
spans). Add `--warn` for the warn-level diagnostics, `--person wife` to narrow it. It is read-only
and never a gate.

`patch-plan.js` addresses a quantity by recipe id and ingredient name, resolving names through the
catalog. Use it rather than a text edit: a normalised plan is pretty-printed one field per line,
so `"quantity": 750` is not a unique string anywhere in the file. `--scale` and `--kcal` hold
`for:`-tagged rows fixed, because those are the conventions a passing week established — the
wife's sterol drink is one 100 ml bottle delivering 2 g, not a number to multiply.

**Do not regenerate the plan wholesale.** A rewrite re-derives quantities that already passed and
can reopen a settled constraint.

Common failures and what they mean:

| Failure | Meaning |
|---|---|
| `serves=6 but the menu needs 5` | A Mon–Thu dinner carrying into next-day lunch feeds 3 + 2 adults, not 3 + 3 |
| `husband kcal below min` on most or all days | His `for: "husband"` breakfast carbohydrate row is missing. At a 1.15/3.0 share he cannot reach 2,400 kcal from shared food; ~350 kcal of tagged bread or flakes per breakfast is what `portion_calibration.tagged_rows` carries. Usually arrives with `husband breakfast protein below 35 g` |
| `husband/wife protein_g above max` | Too much protein — a real constraint, not an aspiration. The **child has no gram ceiling**; only `protein is N% of energy, above max 30%` applies to him |
| `child: only 1 of 2 home main meals reach the 15 g protein anchor` | Both his anchors must be home food — breakfast *and* dinner each need 15 g. The school lunch does not count |
| `child calcium_mg below min` (warn) | Almost always missing `for: "child"` dairy. A shared pour gives him 1.1/3.0 of it — tag ~400 ml milk + ~200 g yogurt to him |
| `wife fat is 28% of energy, below min 30%` | Her floor went **up** in v6.0 — don't ration olive oil or nuts. Saturated fat at ≤11 g is the real cap |
| `veg_fruit_g below min` | Potato and sweet potato don't count toward it; add actual vegetables or fruit |
| `red_meat_days = 0, need at least 1` | Lean red meat is the wife's heme-iron source; the rule is a floor as well as a ceiling |
| `Only 1 distinct dinner formats` | Vary `format`; ≥4 needed, ≤2 `one_pot` |
| `Dinner pairing "salmon+grain_buckwheat" was already used` | Cross-week repeat within 3 weeks |
| `used in 2 slots but only a dinner → next-day-lunch pair is supported` | The same snack on two days would be bought once |
| `unknown ingredient` | Not in `data/foods.json` — add it there, don't rename around it |

Warn-level budgets (sodium, calcium, iron, zinc, viscous fibre, sterols) never block the gate —
see `Family-context.md` §8.1 for why each sits where it does. Read them anyway; the child's
calcium in particular will flag every week until his dairy is `for:`-tagged.

### Step 4 — Expand into the week file

```bash
node scripts/promote-plan.js data/weeks/2026-W27-plan.json
```

Writes `data/weeks/2026-W27.json` with everything the plan settled, `instructions: []`, and
the `fixed_school_lunch` block copied from `targets.json`.

Then, per recipe:

- Remaining minor ingredients — aromatics, herbs, spices, lemon. State `соль` and
  `перец чёрный молотый` in grams; the legacy `соль, перец` catch-all makes sodium untrackable.
- `instructions`: 3–6 short Russian imperative steps.

Nothing else changes — `serves`, dominant quantities, titles and the menu all passed validation.

This is the slowest part of a run and every recipe is independent of every other, so it
parallelises. Several workers cannot write one JSON file, so each writes its own fragment and
`apply-expansion.js` merges them:

```jsonc
// data/weeks/2026-W27-exp-1.json
{ "cod-potato": {
    "add": [ { "name": "чеснок", "quantity": 12, "unit": "g" },
             { "name": "соль",   "quantity": 2,  "unit": "g" } ],
    "instructions": [ "Разогреть духовку до 200 °C…", "…", "…" ] } }
```

```bash
node scripts/apply-expansion.js data/weeks/2026-W27.json data/weeks/2026-W27-exp-*.json
```

It refuses partial work and resolves every added name against the catalog, so a bad ingredient is
reported against its fragment rather than surfacing in `compute-nutrition.js` two steps later.

### Step 5 — Finalise

```bash
node scripts/finalise-week.js data/weeks/2026-W27.json --solve
```

Chains the quantity solve, `compute-nutrition.js`, `generate-shopping-list.js` and
`validate-week.js`, stopping at the first failure. Nutrition must be recomputed before it is
validated or the gate reports `daily_nutrition` as stale, so these always run together — and any
fix means all three again, which is why they are one command.

`--solve` re-runs the solver first. The minor ingredients added during expansion — a clove of
garlic, two grams of salt — shift a day by a few percent, and that is the one class of failure that
legitimately appears after the plan has passed. Repairing it with the solver rather than by hand is
the same reasoning as Step 3.

The individual steps, when you want them separately:

```bash
node scripts/compute-nutrition.js      data/weeks/2026-W27.json   # --check to report, not write
node scripts/generate-shopping-list.js data/weeks/2026-W27.json   # --dry-run to preview
node scripts/validate-week.js          data/weeks/2026-W27.json
```

Display names, categories and purchase units for the shopping list come from `data/foods.json`.
There is no metadata pass. If a genuine purchase note is needed:

```bash
echo '{"berries-mixed": "проверить состав"}' > data/weeks/2026-W27-notes.json
node scripts/generate-shopping-list.js data/weeks/2026-W27.json --notes data/weeks/2026-W27-notes.json
```

Notes must not contain banned fruit terms — write `проверить состав`, never `без вишни`.

### Step 6 — Publish

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

## Retired weeks

`data/weeks/archive/` holds the seven schema-2.0 weeks (W20–W26) and the old schema-1.0 sample
fixture. They are the record of what was actually cooked.

Retirement works by location, not by a flag: `sync-weeks-index.js` reads the weeks directory
non-recursively, so anything under `archive/` drops out of the manifest and off the site
without being deleted. Moving a file back would put it back on the site — which must not be
done to a 2.0 file, since `validate-week.js` now applies one rule set and will reject it.

`derive-history.js` **does** read the archive, and must keep doing so. History is the one thing
a retired week is still useful for, and scanning only the live directory would empty
`recent-history.json` and silently switch off the cross-week variety check. That is safe
because the summary reads titles, headline protein/grain and the declared `base` /
`snack_format` — never the eater model or nutrition.

Do not rewrite an archived week to satisfy a current threshold. If a published week no longer
meets a budget, that is either information about the budget or a reason to generate a new week.
W20–W26 predate eight of the twelve budgets now in `targets.json`, so their failures say
nothing about their quality.

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
| `derive-history.js` | Build `recent-history.json` from the last N weeks (`--weeks N`, `--brief`) |
| `scaffold-plan.js` | Turn a spec of decisions into a scaled, normalised plan (`--dry-run`) |
| `solve-plan.js` | Adjust quantities until every hard budget holds at once (`--dry-run`, `--no-soft`) |
| `validate-plan.js` | Validate a plan: structure, safety, budgets, variety, cross-week repeats |
| `diagnose-plan.js` | Explain a budget miss as an edit: per-slot shares and the deltas that close it (`--warn`, `--person`, `--json`) |
| `patch-plan.js` | Change ingredient quantities by recipe id and name (`--add`, `--remove`, `--scale`, `--kcal`, `--dry-run`) |
| `apply-expansion.js` | Merge parallel expansion fragments into a promoted week (`--dry-run`) |
| `finalise-week.js` | Chain nutrition, shopping list and the final gate (`--solve`) |
| `promote-plan.js` | Expand a validated plan into the week skeleton (`--force` to overwrite) |
| `normalise-plan.js` | Derive week dates, label, day scaffolding and every `serves` (`--check`) |
| `catalog-digest.js` | Print the ingredient vocabulary compactly for generation (`--tag X`) |
| `compute-nutrition.js` | Derive per-person nutrition and day totals from ingredients (`--check`) |
| `generate-shopping-list.js` | Assemble `shopping_list[]` from the catalog (`--dry-run`, `--notes`) |
| `validate-week.js` | Validate a published week file |
| `validate-all-weeks.js` | Validate every week in the manifest (CI) |
| `validate-foods.js` | Self-test `data/foods.json` (CI) |
| `sync-weeks-index.js` | Rebuild `index.json` (`--default WEEK-ID`) |

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
    archive/            Retired weeks — read only by derive-history.js
    2026-W27.json       Published week files
    2026-W27-plan.json  Working artifact — gitignored
```
