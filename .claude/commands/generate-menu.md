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
- `data/targets.json` — the enforced numbers
- `node scripts/catalog-digest.js` — the ingredient vocabulary

`--tag fatty_fish` narrows the digest if you want one category.

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
node scripts/scaffold-plan.js data/weeks/{weekId}-spec.json
```

It writes a **normalised** plan: quantities scaled to hit both the energy and protein medians for
each recipe's slot-and-serves bucket, the `for:`-tagged conventions on every breakfast, cook-once
dinners wired to next-day lunches, `serves` derived from who actually eats, dates and label. Read
its output — any `!` line is a recipe whose protein target was unreachable from the foods you
chose, which is information about the spec, not an error.

**Your job is choosing good food and getting the variety right.** The scale is derived. Spend the
thinking on: 4+ dinner protein categories, a different fish species each time, ≥8 distinct
vegetables, ≥3 breakfast bases, ≥4 dinner formats, 7 distinct snacks, red meat on 1–2 days, and
no dinner pairing from the blocked list in Step 2.

## Step 5 — Solve the quantities, then validate

```bash
node scripts/solve-plan.js    data/weeks/{weekId}-plan.json
node scripts/validate-plan.js data/weeks/{weekId}-plan.json
```

**Do not adjust quantities by hand.** Every budget is linear in ingredient grams — energy,
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
recipe is independent, so **fan it out**: split the recipe ids into 4 roughly equal groups and
give each group to one subagent. Each writes its own fragment to
`data/weeks/{weekId}-exp-{n}.json`:

```json
{ "cod-potato": {
    "add": [ { "name": "чеснок", "quantity": 12, "unit": "g" },
             { "name": "соль",   "quantity": 2,  "unit": "g" } ],
    "instructions": [ "Разогреть духовку до 200 °C…", "…", "…" ] } }
```

Brief each subagent with: its recipe ids and their ingredients and `serves`, the requirement for
3–6 short Russian imperative steps with real actions, times and temperatures, and both safety
rules (no cherries/apples/pears/apricots/peaches in any form including `уксус яблочный`; no
processed meat). Tell them to state `соль` and `перец чёрный молотый` in grams and to be sparing:
ingredient sodium is already near the ceiling from bread, crispbread and canned goods, and the
child has ~0.75 g of added-salt headroom across three home meals. Tell them not to touch
`serves`, existing quantities, titles or the menu — those passed validation.

**Tell them NOT to write the serving boilerplate.** Two things used to be restated in every one of
the 24 recipes, and the app now renders both from the data: which portions are `for:`-tagged to
whom, and that a cook-once dinner owes the next day a lunch. So no
*"порцию ребёнка залить молоком, жене подать орехи и напиток с фитостеролами"*, and no
*"отложить 2 порции на обед следующего дня"* — those are derived in `renderServingNotes()`. Steps
should cover **cooking only**. This is the least informative fifth of the prose and the slowest
phase of the run.

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
