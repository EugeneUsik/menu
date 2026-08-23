# Generate Weekly Menu

Generate one or more weekly menus and publish them.

The flow is **plan → normalise → validate → expand → compute → publish**. All nutrition and
variety constraints are settled on the plan, so iteration is cheap. Once `validate-plan.js`
passes, expansion cannot reopen a global constraint.

## STRICT CONSTRAINTS

- Do NOT read existing week JSON files. `data/weeks/recent-history.json` is the summary that
  exists for this purpose, and it now carries portion calibration too.
- Do NOT output JSON to the chat. Write to files.
- Do NOT narrate reasoning or print intermediate plans to the chat.
- Do NOT hand-write `nutrition_estimate_per_person` or `daily_nutrition`. Scripts derive both.
- Do NOT write `serves`, `week.start_date`, `week.end_date`, `week.label`, `week.timezone`,
  `menu[].day_name`, `menu[].date` or `menu[].includes_fixed_school_lunch`.
  `normalise-plan.js` derives all of them in Step 5.
- Do NOT self-verify nutrition or variety. `validate-plan.js` does that mechanically.
- **Do NOT derive portion sizes from the portion-weight arithmetic.** See Step 4.
- Read each prompt file exactly once per run.

## Step 1 — Resolve target week(s)

Today's date is in the `currentDate` system context. ISO 8601 weeks, Monday start.

- "this week" → current ISO week; "next week" → +1; "next two weeks" → +1 and +2
- "2026-W36" → that week; "weeks 36 and 37" → both

You only need the week **ID**. Do not compute Monday/Sunday — Step 5 does it, correctly,
including across year boundaries.

If `data/weeks/{weekId}.json` exists, ask before overwriting.

## Step 2 — Refresh history first

```bash
node scripts/derive-history.js
```

Before reading it, not after: it carries the portion calibration Step 4 depends on, and a stale
copy would seed the plan from the wrong week.

## Step 3 — Read inputs (once, in parallel)

One parallel batch, no repeats:

- `prompts/weekly-menu-generation-prompt.md`
- `prompts/Family-context.md`
- `data/targets.json` — the enforced numbers
- `data/weeks/recent-history.json` — recent weeks, and `portion_calibration`
- `node scripts/catalog-digest.js` — the ingredient vocabulary

Use the digest, **not** `data/foods.json`. Same 174 foods and the same names, ~40 KB less, with
the per-100 g numbers in columns so sizing is a reading exercise. `--tag fatty_fish` narrows it
if you want one category.

## Step 4 — Write the plan

Write `data/weeks/{weekId}-plan.json` in **one** Write call: `week.id`, the 7-day menu, and each
recipe with its declared `base`/`format`/`snack_format` and its 4–7 nutritionally dominant
ingredients with total quantities.

**Size portions from `portion_calibration`, not from first principles.** It gives the observed
total recipe kcal by slot and serves from the last passing week — e.g. a breakfast at ~2000 kcal,
a school-day lunch at ~1280, a dinner at ~1900, a snack at ~850. Pick dishes, then scale their
quantities so each recipe lands near the matching median.

> Why this is a rule and not a hint: deriving portions from the portion-weight split by hand is
> slow and it was wrong. The first attempt at W35 estimated breakfasts at 1240 kcal against an
> actual 2018 — a 60% miss, because the derivation treated the `for:`-tagged rows as sitting
> outside the recipe total when they are inside it. That cost two extra validation rounds. The
> validator computes the real numbers in a second; your job is choosing good food and getting
> the scale roughly right.

`portion_calibration.tagged_rows` lists the `for:`-tagged conventions a passing week used — the
child's milk and yogurt, the wife's walnuts and sterol drink. Carry them forward; they are how
per-person targets are actually met (a shared ingredient gives the child only 1.1/3.0).

**Get the first plan written and validated quickly.** Treat iteration 1 as the measurement, not
the answer.

## Step 5 — Derive the mechanical fields

```bash
node scripts/normalise-plan.js data/weeks/{weekId}-plan.json
```

Fills the week dates and Russian label, the day scaffolding, and every recipe's `serves` from
who actually eats each slot. Read its output — it prints what it set.

## Step 6 — Validate the plan, iterate here

```bash
node scripts/validate-plan.js data/weeks/{weekId}-plan.json
```

- The `· ` lines are the derived picture of the week. Read them first; they say which way to move.
- Fix `[FAIL]` lines with **targeted Edit calls**. Never regenerate the whole plan.
- Expect 2–3 rounds. Energy and saturated fat are the usual ones; variety and cross-week rules
  normally pass first time.
- `[WARN]` lines never block. Sodium, calcium, iron, zinc, viscous fibre and sterols are
  warn-level on purpose — see `targets.json` `_severity_rule`. Do not chase them at the cost of
  a hard budget.
- If a failure looks like a bad rule rather than a bad menu, stop and say so instead of
  contorting the menu around it.

## Step 7 — Expand into the week file

```bash
node scripts/promote-plan.js data/weeks/{weekId}-plan.json
```

This refuses a plan that does not pass Step 6, so there is no way to launder a failure
downstream. Then for each recipe add:

- Remaining minor ingredients — aromatics, herbs, spices, lemon. State `соль` and
  `перец чёрный молотый` in grams. Be sparing with salt: ingredient sodium is already near the
  ceiling from bread, crispbread and canned goods, and the child has ~0.75 g of added-salt
  headroom across three home meals.
- `instructions`: 3–6 short Russian imperative steps with real actions, times, temperatures.

Do not touch `serves`, dominant quantities, titles, or the menu — those passed validation.

## Step 8 — Compute, shop, validate

```bash
node scripts/compute-nutrition.js       data/weeks/{weekId}.json
node scripts/generate-shopping-list.js  data/weeks/{weekId}.json
node scripts/validate-week.js           data/weeks/{weekId}.json
```

Failures here should be small — a minor ingredient nudged a day out of band. Fix with targeted
Edits, then re-run all three (nutrition must be recomputed, or `validate-week.js` will report
`daily_nutrition` as stale).

## Step 9 — Publish

```bash
node scripts/sync-weeks-index.js
node scripts/derive-history.js
git add data/weeks/{weekId}.json data/weeks/index.json data/weeks/recent-history.json
git commit -m "W{nn}: generate menu for {weekId}"
git push
```

Commit `data/foods.json` too if you added foods to it. The `-plan.json` and `-notes.json` files
are gitignored working artifacts — leave them uncommitted.

## Multiple weeks

Sequential: finish Step 9 for week N before starting week N+1, so N+1's cross-week variety check
and portion calibration both see N.

## Done

One line per week: week ID, plan iterations needed, validation result, push status. Report any
warn-level budget that was missed by a wide margin — that is calibration feedback, and
`targets.json` §8.1 asks for it before any warn is promoted to hard.
