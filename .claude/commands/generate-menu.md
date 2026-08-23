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
- **Do NOT compute per-person nutrition by hand at any point** — not to size a portion, and not
  to work out what to change after a failure. `diagnose-plan.js` derives both. See Step 6.
- **Do NOT read `scripts/validate-plan.js`, `scripts/validate-week.js` or anything in
  `scripts/lib/`.** The inputs in Step 3 are the whole brief, and the gate's own output carries
  its severity and its percentage on every line. Reading the implementation feels like
  diligence, costs ~1,000 lines of context, and has never yet prevented a failure.
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

`portion_calibration.tagged_rows` is a **template to replicate, not background reading.** It
lists the `for:`-tagged conventions a passing week used, and they are how per-person targets are
actually met — a shared ingredient gives the child only 1.1/3.0 and the wife 0.75/3.0. Every
breakfast needs all four:

| Tag | Rows | Why it cannot be shared |
|---|---|---|
| `for: "child"` | ~250 ml milk + ~150 g Greek yogurt | 1,300 mg calcium is unreachable from shared pours |
| `for: "wife"` | 25 g walnuts + 100 ml sterol drink | 2 g of sterols and 30 g of nuts, not a third of each |
| `for: "husband"` | **~350 kcal of bread or flakes** | 2,400–2,500 kcal is unreachable at a 1.15/3.0 share |

**The husband's row is the one that gets forgotten, and it fails the widest.** Dropping it puts
him ~400 kcal short *on all seven days plus the weekly average*, and takes his breakfast protein
under the 35 g pre-training floor as well — 11 failures from one omission, which is exactly what
happened on the first W36 attempt. Vary the food across the week (whole-grain bread, rye bread,
oats, barley flakes) so it does not pin `grain_bread` to more than 3 main meals.

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
node scripts/validate-plan.js  data/weeks/{weekId}-plan.json   # the gate: what is wrong
node scripts/diagnose-plan.js  data/weeks/{weekId}-plan.json   # the fix: what to change, by how much
```

**Run both.** The gate says *"Monday husband kcal 2084 below min 2400 (-13%)"*. Every number in
that sentence is a per-person share of a recipe total, so it does not tell you what to edit.
`diagnose-plan.js` translates it:

```
[FAIL] Monday husband kcal 2084kcal vs min 2400kcal (-13%) → needs +316kcal
    lunch         red-lentil-soup              873kcal  share 0.605
    dinner        mackerel-quinoa-broccoli     734kcal  share 0.235
    breakfast     oats-blueberry-seeds         389kcal  share 0.383
    → via recipe total (moves all eaters):     breakfast +825 | lunch +522 | dinner +1345
    → via for:"husband" rows (moves only them): breakfast +316 | lunch +316 | dinner +632 (×2 days)
```

It also opens with every recipe more than 15% off its calibration median, which is the cheapest
possible signal that a plan is mis-scaled — visible before any budget is consulted.

Then patch, do not rewrite:

```bash
node scripts/patch-plan.js data/weeks/{weekId}-plan.json chicken-barley-kale "грудка куриная=700"
node scripts/patch-plan.js data/weeks/{weekId}-plan.json oats-blueberry-seeds --add "хлеб цельнозерновой=150,g,husband"
node scripts/patch-plan.js data/weeks/{weekId}-plan.json mackerel-quinoa-broccoli --kcal 3200
```

- **Never regenerate the whole plan.** A rewrite re-derives quantities that already passed, so it
  can reopen a settled constraint — and a normalised plan is one field per line, so `"quantity":
  750` is not a unique string and a text Edit cannot safely target it. That is what `patch-plan.js`
  is for. `--scale`/`--kcal` hold `for:`-tagged rows fixed on purpose.
- The `· ` lines from the gate are the derived picture of the week — weekly averages, day counts,
  distinct vegetables, formats. Read them for direction.
- Read a `[FAIL]` percentage as a magnitude and move by roughly that much. `+17%` on saturated fat
  means cut about 17%; do not recompute the day to find out.
- Expect 2 rounds. Energy and saturated fat are the usual ones; variety and cross-week rules
  normally pass first time. If you are on round 4, something structural is wrong — say so.
- `[WARN]` lines never block, and a hard budget within 10% of its bound is reported as a warning
  too. Sodium, calcium, iron, zinc, viscous fibre and sterols are warn-level on purpose — see
  `targets.json` `_severity_rule`. Do not chase them at the cost of a hard budget.
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
