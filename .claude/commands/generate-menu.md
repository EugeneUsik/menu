# Generate Weekly Menu

Generate one or more weekly menus and publish them.

The flow is **spec → scaffold → validate → expand → compute → publish**. All nutrition and
variety constraints are settled on the plan, so iteration is cheap. Once `validate-plan.js`
passes, expansion cannot reopen a global constraint.

**Target: a published week in about 3 minutes.** Everything below is shaped by that. The scripts
take 0.3 s in total, so the entire budget is reading and authoring — which is why the read set is
short, the plan is scaffolded rather than typed, and expansion runs in parallel. Do not add
reading or authoring to this flow without taking some out.

## STRICT CONSTRAINTS

- Do NOT read existing week JSON files. The history brief in Step 2 exists for this purpose.
- Do NOT read `prompts/Family-context.md`. Every *enforced* number is in `data/targets.json` and
  the design intent is in `prompts/weekly-menu-generation-prompt.md`. It is 690 lines of
  rationale, lab history and monitoring gaps, none of which changes a menu decision — and it
  holds a minor's health data that does not need to be in context to cook dinner. Read it only if
  the user asks a question about *why* a target is what it is.
- Do NOT read `scripts/validate-plan.js`, `scripts/validate-week.js` or anything in
  `scripts/lib/`. The gate's own output carries its severity and its percentage on every line.
  Reading the implementation feels like diligence, costs ~1,000 lines of context, and has never
  yet prevented a failure.
- Do NOT output JSON to the chat. Write to files.
- Do NOT narrate reasoning or print intermediate plans to the chat.
- Do NOT hand-write `nutrition_estimate_per_person` or `daily_nutrition`. Scripts derive both.
- Do NOT write `serves`, week dates, `label`, `timezone`, `day_name`, `date` or
  `includes_fixed_school_lunch`. `scaffold-plan.js` derives all of them.
- **Do NOT compute per-person nutrition by hand at any point** — not to size a portion, and not
  to work out what to change after a failure. `scaffold-plan.js` and `diagnose-plan.js` derive
  both.
- Do NOT self-verify nutrition or variety. `validate-plan.js` does that mechanically.
- Read each prompt file exactly once per run.

## Step 1 — Resolve target week(s)

Today's date is in the `currentDate` system context. ISO 8601 weeks, Monday start.

- "this week" → current ISO week; "next week" → +1; "next two weeks" → +1 and +2
- "2026-W37" → that week; "weeks 37 and 38" → both

You only need the week **ID**. Do not compute Monday/Sunday — Step 4 does it, correctly,
including across year boundaries. If `data/weeks/{weekId}.json` exists, ask before overwriting.

## Step 2 — Refresh history and read the brief

```bash
node scripts/derive-history.js --brief
```

Refreshes `recent-history.json` and prints the ~36 lines generation actually needs: the kcal and
protein medians to seed from, the `for:`-tagged conventions, the blocked dinner pairings already
deduped across the lookback window, and last week's titles, bases and snack formats. Do not then
open the 465-line JSON.

## Step 3 — Read the remaining inputs (once, in parallel)

One parallel batch, no repeats:

- `prompts/weekly-menu-generation-prompt.md` — the design brief and the safety rules
- `node scripts/catalog-digest.js --no-seasonings` — the ingredient vocabulary

Two things deliberately absent. **`data/targets.json` is not read at spec time**: you no longer
choose quantities — `solve-plan.js` does, straight from that file — and the variety thresholds you
actually design against are already spelled out in the generation prompt. Read it only to answer a
question about a specific number. And `--no-seasonings` drops the ~40 lines of spices and salt,
which are chosen during expansion from the list in `prompts/expansion-brief.md`, never here.

`--tag fatty_fish` narrows the digest further if you want one category.

## Step 4 — Write a spec, scaffold the plan

Write `data/weeks/{weekId}-spec.json` — the decisions only, no quantities:

```json
{
  "week": "2026-W37",
  "days": [
    { "breakfast": { "title": "Овсянка с черникой", "id": "oats-blueberry", "base": "oats",
                     "foods": ["хлопья овсяные", "скир 0–2%", "черника", "семена тыквы"] },
      "lunch":     { "title": "Курица с бататом", "id": "chicken-sweet-potato",
                     "foods": ["грудка куриная", "батат", "шпинат свежий", "масло оливковое"] },
      "dinner":    { "title": "Форель с булгуром", "id": "trout-bulgur", "format": "plated",
                     "carry": true,
                     "foods": ["филе форели", "булгур", "брокколи", "масло оливковое"] },
      "snack":     { "title": "Соевый йогурт", "id": "soy-yogurt", "snack_format": "soy_yogurt",
                     "foods": ["йогурт соевый натуральный", "черника", "хлопья овсяные"] } }
  ]
}
```

Seven days, Monday first. `carry: true` on a dinner wires the next day's lunch to the same
recipe, so omit that lunch. A food can pin its own quantity — `"филе лосося=520"` — when the
split needs a hand. Then:

```bash
node scripts/scaffold-plan.js data/weeks/{weekId}-spec.json \
  && node scripts/solve-plan.js   data/weeks/{weekId}-plan.json \
  && node scripts/validate-plan.js data/weeks/{weekId}-plan.json
```

Run the three as one command. They total well under a second, so every separate round-trip costs
more than the work does — and the loop you iterate on is spec → all three → read the failures.

It writes a **normalised** plan: quantities scaled to hit both the energy and protein medians for
each recipe's slot-and-serves bucket, the `for:`-tagged conventions on every breakfast, cook-once
dinners wired to next-day lunches, `serves` derived from who actually eats, dates and label. Read
its output — any `!` line is a recipe whose protein target was unreachable from the foods you
chose, which is information about the spec, not an error.

**Your job is choosing good food. The scale is derived and the variety is checked.** Aim for 4+
dinner protein categories, a different fish species each time, ≥8 distinct vegetables, ≥3 breakfast
bases, ≥4 dinner formats, 7 distinct snacks, red meat on 1–2 days, and nothing from the blocked
pairing list in Step 2.

**Do not verify any of that while writing the spec.** Do not count grain bases across the 21 main
meals, do not tally legume species, do not check the pairing list item by item. Steps 4 and 5
together run in **under one second**, and the gate checks every one of those rules exactly. Write
the spec at speed, run it, and fix what the gate names. Hand-counting is slow, it is the part most
likely to be wrong, and it buys nothing that a sub-second command does not already give you.

## Step 5 — Read the reports

The command in Step 4 already solved and validated. **Do not adjust quantities by hand.** Every budget is linear in ingredient grams — energy,
protein, fat, saturated fat, fibre, sodium, calcium and vegetable weight are all
`(per-100 g value) × grams`, and each person's share of a recipe is a fixed coefficient — so
satisfying all of them at once is arithmetic, not search. `solve-plan.js` does it in about 0.15 s
by cyclic projection, starting from the scaffolded quantities so the recipe still looks like food.

It also treats warn-level budgets as *soft* constraints, pursued only after the hard ones hold and
never at their expense. That is what keeps sodium honest: on the week this was built against it
moved husband/wife/child from 2018/1361/2174 mg/day to 1073/748/1598, all inside their caps.

Read its report. It ends with what it could **not** satisfy:

- `Could not satisfy (hard)` — no quantity vector works. **The menu needs a different food**, not a
  different number. Change the spec and re-scaffold; do not fight it with patches.
- `Still outside a warn-level budget` — expected for the wife's calcium, iron and viscous fibre,
  which are structural in this pattern. Report them at the end; do not distort the week for them.

If the gate still fails after solving, that is a genuine surprise. Then, and only then:

```bash
node scripts/diagnose-plan.js data/weeks/{weekId}-plan.json      # which slot, which share, what delta
node scripts/patch-plan.js    data/weeks/{weekId}-plan.json cod-potato "картофель=1150"
```

`diagnose-plan.js` translates a per-person share back into a recipe-level edit. `patch-plan.js`
edits by recipe id and ingredient name — never hand-edit a normalised plan, where `"quantity": 750`
is not a unique string. Qualify a name with `#shared` or `#husband` when a food appears twice.

**Never regenerate the plan.** A rewrite re-derives quantities that already passed.

## Step 6 — Promote, then expand in parallel

```bash
node scripts/promote-plan.js data/weeks/{weekId}-plan.json
```

This refuses a plan that does not pass Step 5. Expansion is the slowest part of the run and every
recipe is independent, so **fan it out**:

```bash
node scripts/expansion-groups.js data/weeks/{weekId}.json
```

That writes one group file per worker, each naming its recipes, their solved quantities and its
output path. The shared half of the brief — output format, the 36 allowed ingredient names, the salt
limits, both safety rules, the equipment list — lives once in `prompts/expansion-brief.md`.

**So each worker prompt is two lines**, not six hundred words:

> Read `prompts/expansion-brief.md`, then do `data/weeks/{weekId}-group-3.md`. Write only the output
> file it names. Do not read any other file and do not run verification — speed matters.

Authoring four near-identical briefs by hand was most of the 85 seconds that separated the expansion
phase's 2m35s from its slowest worker's 70s. Groups are round-robin, so no worker gets all seven
breakfasts — wall clock is bound by the slowest one.

```bash
node scripts/apply-expansion.js data/weeks/{weekId}.json data/weeks/{weekId}-exp-*.json
```

It refuses partial work and checks every added ingredient against the catalog, so a bad name is
named with its fragment rather than surfacing two steps later.

## Step 7 — Finalise

```bash
node scripts/finalise-week.js data/weeks/{weekId}.json --solve
```

Chains the quantity solve, `compute-nutrition.js`, `generate-shopping-list.js` and
`validate-week.js`, stopping at the first failure. Nutrition must be recomputed before it is
validated or the gate reports `daily_nutrition` as stale, so these always run together.

`--solve` re-runs the solver first, because the minor ingredients added during expansion — a clove
of garlic, two grams of salt — shift a day by a few percent. That is the one class of failure that
legitimately appears after the plan has passed, and repairing it by hand is the same mistake as
sizing portions by hand. Drop `--solve` only if you want to see what expansion did on its own.

## Step 8 — Publish

```bash
node scripts/sync-weeks-index.js
node scripts/derive-history.js
git add data/weeks/{weekId}.json data/weeks/index.json data/weeks/recent-history.json
git commit -m "W{nn}: generate menu for {weekId}"
git push
```

Commit `data/foods.json` too if you added foods to it. The `-plan.json`, `-spec.json`,
`-notes.json` and `-exp-*.json` files are gitignored working artifacts — leave them uncommitted.

## Multiple weeks

Sequential: finish Step 8 for week N before starting week N+1, so N+1's cross-week variety check
and portion calibration both see N.

## Done

One line per week: week ID, patch rounds needed, validation result, push status. Report any
warn-level budget missed by a wide margin — that is calibration feedback, and `targets.json`
§8.1 asks for it before any warn is promoted to hard.
