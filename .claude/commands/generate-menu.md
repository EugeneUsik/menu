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

## Step 5 — Validate, diagnose, patch

```bash
node scripts/validate-plan.js  data/weeks/{weekId}-plan.json   # the gate: what is wrong
node scripts/diagnose-plan.js  data/weeks/{weekId}-plan.json   # the fix: what to change, how much
```

Run `diagnose-plan.js` whenever the gate fails. Every number the gate prints is a per-person
*share* of a recipe total, so it cannot say what to edit; the diagnostic prints each slot's
contribution, the share that person receives, and both routes out — change the recipe total,
which moves every eater, or change a `for:`-tagged row, which moves only them.

Then patch. **Never regenerate the plan**, and never hand-edit it — a normalised plan is one
field per line, so `"quantity": 750` is not a unique string:

```bash
node scripts/patch-plan.js data/weeks/{weekId}-plan.json cod-potato "картофель=1150" --add "авокадо=220,g"
node scripts/patch-plan.js data/weeks/{weekId}-plan.json yogurt-bowl "йогурт греческий 2%#shared=200"
```

Qualify a name with `#shared` or `#husband` when the same food appears twice in one recipe.

- Expect **1 patch round** from a scaffolded plan. Saturated fat and the husband's fat share are
  the usual survivors. If you are on round 3, something structural is wrong — say so.
- Read a `[FAIL]` percentage as a magnitude and move by roughly that much.
- `[WARN]` never blocks, and a hard budget within 10% of its bound reports as a warning too. Do
  not chase warn-level items at the cost of a hard budget.
- If a failure looks like a bad rule rather than a bad menu, stop and say so.

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

```bash
node scripts/apply-expansion.js data/weeks/{weekId}.json data/weeks/{weekId}-exp-*.json
```

It refuses partial work and checks every added ingredient against the catalog, so a bad name is
named with its fragment rather than surfacing two steps later.

## Step 7 — Compute, shop, validate

```bash
node scripts/compute-nutrition.js       data/weeks/{weekId}.json
node scripts/generate-shopping-list.js  data/weeks/{weekId}.json
node scripts/validate-week.js           data/weeks/{weekId}.json
```

Failures here should be small — a minor ingredient nudged a day out of band. Fix with targeted
edits, then re-run all three (nutrition must be recomputed, or `validate-week.js` will report
`daily_nutrition` as stale).

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
