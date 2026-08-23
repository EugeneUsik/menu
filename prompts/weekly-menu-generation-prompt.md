# Weekly Family Menu — Generation Prompt

You generate weekly menus in **two stages**. Stage A produces a ~9 KB plan that gets validated deterministically. Stage B expands the validated plan into full recipes. Read this file fully before producing anything.

---

## WHY TWO STAGES

Every nutrition and variety rule is a property of the **whole 7-day week**, not of any single meal. The previous single-pass approach wrote all ~78 KB of recipe JSON first and checked those rules afterwards, by self-review against a 40-item checklist. That meant:

- A violation surfaced only after the expensive work was done.
- Fixing it meant editing recipes, which invalidated the shopping metadata, which forced re-running downstream steps — the loop that made generation slow.
- The checklist items were never actually verified, only asserted. Measured across seven published weeks, the child's protein ran ~75% over target every single week and nobody noticed.

Now: **all global constraints are settled on the plan, mechanically.** Once `validate-plan.js` passes, expansion cannot reopen them. Iterating on a 9 KB plan is roughly an order of magnitude cheaper than iterating on the full file.

**Do not self-verify nutrition or variety.** Do not compute per-person nutrition. Scripts do both, from the ingredient quantities, using `data/foods.json`. Your job is to choose good food and size it sensibly.

---

## TARGET WEEK

You will be told which week to generate — by ISO week ID (`2026-W27`), a Monday start date, or a relative reference (`next week`).

Write **only `week.id`** (`YYYY-Www`). `scripts/normalise-plan.js` derives `start_date`,
`end_date`, the Russian `label` and `timezone` from it — correctly across month and year
boundaries, which hand arithmetic gets wrong. Do not compute them.

---

## ⚠️ SAFETY RULES — ABSOLUTE

### Rule 1 — Child fruit allergy

No **cherries, apples, pears, apricots, or peaches** in any form — fresh, cooked, dried, juice, jam, compote, purée, sauce, filling, yogurt layer, smoothie ingredient, or hidden ingredient. This includes derived products: **apple cider vinegar is excluded** (use `уксус винный белый` or `сок лимонный`).

Applies to every field: titles, notes, ingredients. Avoid vague "multifruit" / "forest fruit" / "mixed fruit" products unless the ingredient list is verifiably clear. All other fruits are fine.

The scanner matches Russian and English stems including `яблочный`, so a term like `уксус яблочный` fails validation. Do not write "без вишни" in a note either — that embeds a banned term; write `проверить состав`.

### Rule 2 — No processed meat

No ham, bacon, sausages, salami, smoked deli meats, hot dogs, or processed meat spreads anywhere in the generated menu. The child's school lunch is external and not described, so it is out of scope.

---

## STAGE A — THE PLAN

Write `data/weeks/{weekId}-plan.json`. This is the whole creative decision: which 7 days of meals, and roughly how much of each dominant ingredient.

### Plan shape

Write only the decisions. Everything mechanical is derived in the next step.

```json
{
  "language": "ru",
  "week": { "id": "2026-W27" },
  "menu": [
    {
      "breakfast":    { "title": "Шакшука с ржаным хлебом", "recipe_id": "shakshuka-rye" },
      "lunch":        { "title": "Салат с булгуром и яйцом", "recipe_id": "egg-bulgur-salad" },
      "dinner":       { "title": "Лосось с гречкой и брокколи", "recipe_id": "salmon-buckwheat-broccoli", "cook_once_eat_twice": true },
      "shared_snack": { "title": "Кефир с ягодами", "recipe_id": "kefir-berries" }
    }
  ],
  "recipes": [
    {
      "id": "salmon-buckwheat-broccoli",
      "title": "Лосось с гречкой и брокколи",
      "meal_types": ["dinner"],
      "format": "plated",
      "active_time_min": 20,
      "total_time_min": 35,
      "ingredients": [
        { "name": "филе лосося",     "quantity": 750, "unit": "g" },
        { "name": "крупа гречневая", "quantity": 250, "unit": "g", "prep": "сухой вес" },
        { "name": "брокколи",        "quantity": 500, "unit": "g" },
        { "name": "масло оливковое", "quantity": 20,  "unit": "ml" },
        { "name": "орехи грецкие",   "quantity": 30,  "unit": "g", "for": "wife" }
      ]
    }
  ]
}
```

`menu` still needs exactly 7 objects in Monday-to-Sunday order — position is what determines the
day. `day_name`, `date`, `includes_fixed_school_lunch` and every `serves` are filled in by
`normalise-plan.js`.

### What goes in `ingredients` at this stage

Only the **nutritionally dominant** items — the protein, the starch, the main vegetables, the added fat, and any `for`-tagged extras. Typically 4–7 rows. Garlic, herbs, spices, and lemon get added in Stage B; they barely move the numbers.

Quantities are **totals for all `serves` portions**, not per person.

### `serves` — do not write it, but know what it will be

`serves` is the total number of person-portions the quantities produce. **`normalise-plan.js`
derives it** from who actually eats the slots the recipe fills, so you never write it — but your
quantities have to match what it will compute:

| Recipe used for | derived `serves` |
|---|---|
| One breakfast, dinner, or shared snack (3 eaters) | **3** |
| One Mon–Fri lunch (adults only — child is at school) | **2** |
| One Sat/Sun lunch (3 eaters) | **3** |
| Mon–Thu dinner + next-day school lunch | **5** (3 + 2) |
| Fri/Sat dinner + next-day weekend lunch | **6** (3 + 3) |

Getting the quantities wrong for the derived count is still a hard failure downstream, because
`generate-shopping-list.js` sums each recipe's quantities exactly once — a 5-portion pot written
with 3 portions of food under-buys silently.

A recipe may appear in **at most two** menu slots, and only as a dinner → next-day-lunch pair. Anything else (the same snack on two separate days) is rejected: it would be bought only once.

### Per-recipe declared fields

The catalog derives protein category, fish species, grain base, vegetables, legume species and soy form from the ingredient names. You only declare what it cannot know:

- **Every breakfast recipe** needs `base`: `oats` · `barley` · `eggs` · `yogurt_bowl` · `cottage_cheese` · `toast` · `savory_pan` · `buckwheat` · `millet` · `smoothie_bowl`
- **Every dinner recipe** needs `format`: `plated` · `tray_bake` · `soup_plus_side` · `grain_bowl` · `stir_fry` · `pasta_plus_side` · `egg_dish` · `one_pot`
- **Every shared-snack recipe** needs `snack_format`: `yogurt_based` · `savory_spread` · `nut_and_fruit` · `soy_yogurt` · `cottage_cheese` · `fish_topping` · `legume_based`

### Ingredient names must come from the catalog

Use the exact `name_ru` from the catalog. Read it via `node scripts/catalog-digest.js` rather
than opening `data/foods.json`: same 174 foods and the same names, about 40 KB less, with the
per-100 g figures in columns so portion sizing is reading rather than arithmetic. An
unrecognised name is a **hard failure** — nutrition cannot be computed for it.

If you genuinely need a food that is not in the catalog, add an entry to `data/foods.json` (key, `name_ru` noun-first, `cat`, `tags`, `per100g`, `aliases`) and then use it. The catalog is meant to grow; it is not meant to be bypassed.

This replaces the old noun-first naming convention — canonical spelling now comes from one place instead of being re-derived every week.

### Sizing portions — start from the calibration, not from the arithmetic

`data/weeks/recent-history.json` carries `portion_calibration`: the observed **total recipe kcal**
by slot and serves from the last passing week, plus the `for:`-tagged conventions it used. Scale
your dishes so each recipe lands near the matching median.

Do **not** try to derive portions from the portion-weight split (husband 1.15, wife 0.75, child
1.10 over a demand sum). It is slow and it misleads: the first attempt at W35 reasoned its way to
1240 kcal for a breakfast when the right answer was 2018, because the derivation treated the
`for:`-tagged rows as sitting outside the recipe total when they are inside it. Two extra
validation rounds went into walking that back.

The totals in the calibration **include** every ingredient row, tagged rows included. That is the
number you are writing.

`portion_calibration.tagged_rows` is a template to replicate, not background reading. Three people
need `for:`-tagged rows and all three fail if you drop them:

| Tag | Rows a passing week used | What it is for |
|---|---|---|
| `for: "child"` | ~250 ml milk + ~150 g Greek yogurt, every breakfast | 1,300 mg calcium — a shared pour gives him 1.1/3.0 |
| `for: "wife"` | 25 g walnuts + 100 ml sterol drink, every breakfast | 30 g of nuts and 2 g of sterols, not a third of each |
| `for: "husband"` | **~350 kcal of bread, oats or barley flakes, every breakfast** | 2,400–2,500 kcal — a 1.15/3.0 share cannot reach it |

**The husband's row is the one that gets forgotten and it fails the widest.** Without it he lands
~400 kcal short on all seven days *and* the weekly average, and his breakfast protein drops under
the 35 g pre-training floor — eleven failures from one omission. Vary the food across the week so
`grain_bread` does not end up in more than three main meals.

### Do not compute per-person nutrition to decide what to change

After a failure, `node scripts/diagnose-plan.js <plan>` prints each slot's contribution, the
share the person receives, and the two deltas that close the gap — one via the recipe total, one
via a `for:`-tagged row. Reaching for the portion-weight arithmetic instead is the same mistake as
using it to size a portion, and it costs the same thing: rounds.

### Then normalise and validate

```bash
node scripts/normalise-plan.js data/weeks/{weekId}-plan.json
node scripts/validate-plan.js  data/weeks/{weekId}-plan.json
node scripts/diagnose-plan.js  data/weeks/{weekId}-plan.json   # only when something failed
```

It reports daily and weekly nutrition against every budget, all variety counts, cooking-time caps, `serves` consistency, safety terms, and repetition against the last 3 weeks. **Fix and re-run until it passes.** Edit the plan surgically with `scripts/patch-plan.js` — do not regenerate it wholesale, and do not hand-edit a normalised plan, where `"quantity": 750` is not a unique string.

The `· ` lines it prints before any failures are the derived picture of the week (weekly averages, day counts, distinct vegetables, formats). Read them: they tell you which direction to move.

---

## STAGE B — EXPANSION

```bash
node scripts/promote-plan.js data/weeks/{weekId}-plan.json
```

This writes `data/weeks/{weekId}.json` with everything the plan settled, `instructions: []` on each recipe, and empty `shopping_list` / `daily_nutrition`.

Then, for each recipe, add:

1. **Remaining minor ingredients** — aromatics, herbs, spices, lemon, salt and pepper. State salt explicitly in grams (`соль`, `перец чёрный молотый`); do not use the legacy `соль, перец` catch-all, which makes sodium untrackable.
2. **`instructions`** — 3–6 short imperative steps in Russian, with concrete actions and times or temperatures where they matter. No placeholders, no "cook as usual".

Do not change quantities of the dominant ingredients, `serves`, titles, or the menu. Those passed validation.

---

## MEAL DESIGN GUIDANCE

The rules below shape good menus. They are **not** a checklist to verify — the scripts do that. Read them as design intent.

### The day is the unit

Daily totals are what bind. A single meal does not need to be balanced on its own; it needs to make the day work. The only hard per-meal rules are:

- Husband's breakfast: ≥35 g protein, ≥60 g complex carbohydrate (he trains straight after).
- Each person: ≥2 main meals reaching their protein anchor (husband 30 g, wife 20 g, child 15 g). **For the child, both must be home meals** — the school lunch does not count, because its protein figure is an estimate. In practice: breakfast and dinner each need ≥15 g for him.
- No single main meal above 45% of a person's daily protein maximum.

**Use that freedom.** A light vegetable soup lunch, a pasta-and-vegetable dinner, a fruit-forward yogurt breakfast are all now available and were not before. Previous menus forced a protein anchor into all 28 slots, which is exactly why they felt repetitive.

### Don't over-deliver protein — but the child has no gram ceiling

The adults' daily protein *maximums* are real constraints, not aspirations. Extra protein displaces the carbohydrate the child's growth and the husband's running need, and it crowds out variety by forcing animal or legume protein into every slot.

The child is different: he has a ≥70 g floor and **no gram ceiling**, only a ≤30% of energy guard. Because he eats the adults' dishes scaled by portion size, he lands around 110–145 g whatever you do, and that is fine. Do not engineer his meals to suppress protein. What actually binds for him is energy adequacy, calcium, fibre and saturated fat.

### Breakfast

No grain-only breakfasts. Include a protein element, a fibre-rich carbohydrate or fruit/vegetable, and a `for: "child"` calcium source. Avoid plain porridge without protein, cereal with milk only, toast with jam, pastries, sweetened yogurt bowls. The child needs ≥15 g protein here (one of his two required home anchors).

### Lunch

Mon–Fri lunch is a **two-person adult meal**. This is the freest slot in the week — use it for the formats that don't fit dinner: soups, salads, grain bowls, egg dishes, leftovers.

### Dinner

Family-shared, three eaters. Usually one clear protein, one whole-grain or starchy carbohydrate, at least two vegetables or one large vegetable component, and a healthy fat. This is the child's second required protein anchor, so it needs ≥15 g for him even when it is a lighter vegetable-forward dish.

### Shared snack

On ≥4 days, with a calcium source for the child. Rotate the format across the week: yogurt-based, savoury spread with vegetables, nut-and-fruit, soy yogurt, cottage cheese, fish topping on rye, legume-based.

### Variety — the numbers that are enforced

Across the week: ≥4 distinct dinner protein categories; no protein item headlining more than 2 dinners; different fish species each time; no legume species more than twice; ≥3 grain/starch bases with none in more than 3 main meals; ≥8 distinct vegetables in main meals; ≤2 oat breakfasts and ≥3 breakfast base types; ≥4 dinner formats with ≤2 one-pot; no snack on more than 2 days; ≥2 soy delivery forms.

Also enforced **across weeks**: a dinner protein+starch pairing used in the last 3 weeks is rejected, and at most 1 dinner title may repeat last week. `data/weeks/recent-history.json` lists what was recently used — consult it. Salmon-with-buckwheat appeared three times in five weeks under the old flow.

### Weekly frequency floors and ceilings

Fatty fish ≥2 days; white fish or seafood ≥1 day; legumes ≥3 days (and ≥5 servings for the wife); soy ≥4 days in ≥2 forms; oats or barley ≥2 days; walnuts or other LDL nuts ≥5 days; shared snack ≥4 days.

**Red meat is 1–2 days — a floor as well as a ceiling.** Lean red meat is the wife's most bioavailable iron source, her iron status is unmeasured, and the rest of this pattern is legume-dominant where non-heme iron absorbs poorly.

**Canned tuna: at most 1 day per week**, methylmercury, with the child as the constraining eater. Prefer skipjack/light. Salmon, trout, herring, sardines and mackerel are unaffected.

### Vegetables, fruit and free sugars

Enforced per person per day, computed from ingredient weights: vegetables + fruit ≥400 g husband, ≥500 g wife, ≥350 g child. Potato and sweet potato do **not** count toward this — they are starchy staples. Parsnip does.

Free sugars ≤30 g husband, ≤20 g wife, ≤29 g child (<5% of energy each). Only added sugars count — honey, sugar, dark chocolate, balsamic — not the sugar in intact fruit or milk. Note that a single tablespoon of honey is 17 g of free sugars.

### LDL priorities for the wife

Viscous fibre ≥10 g/day (oats, barley, legumes, flaxseed, chia, berries, citrus, aubergine); soy ~25 g protein on most days, varied across tofu / soy milk / soy yogurt / edamame; nuts ~30 g/day with walnuts featured; **one `sterol-drink` daily** (≥2 g plant sterols, taken with a meal); legumes ≥5 servings/week as structure not garnish; fatty fish ≥2×/week; no saturated-fat stacking (cheese + fatty meat + cream in one meal or one day). Prefer olive oil, avocado, nuts, seeds and fatty fish over butter, cream and fatty cheese.

Her **total** fat budget is 30–38% of energy — deliberately generous, so do not ration olive oil or nuts to save fat. The binding constraint is **saturated** fat at ≤11 g/day. A previous version capped total fat at 30%, which made her walnuts, tofu, sterol source and oil jointly impossible and quietly squeezed out the LDL-lowering items.

### The `for:` tag is load-bearing

A shared ingredient gives the wife 0.75/3.0 of its total and the child 1.1/3.0. Anything that has to reach a **per-person** number must be tagged, or it arrives at roughly a third of the intended amount:

- `for: "wife"` — her walnuts, her sterol drink, her smaller oil share.
- `for: "child"` — his dairy. His 1,300 mg calcium target cannot be met from shared pours: 500 ml milk plus 300 g Greek yogurt in a family dish gives him only ~341 mg. Tag ~400 ml milk + ~200 g yogurt to him at home meals.

### Sodium

Adults and child alike: <5 g salt/day total. The enforced figure is ingredient sodium — ≤1,400 mg for each adult, ≤1,700 mg for the child *including* the school lunch's 900 mg, which leaves him only ~800 mg from home food. High-sodium items here: herring, lightly salted salmon, sardines, canned fish, canned legumes, cheese (hard cheese is 819 mg/100 g), rye and whole-grain bread, crispbread, tortillas, soy sauce, broth, mustard, capers. Do not stack salty fish + cheese + bread + canned foods on one day, and keep the child's school-day home meals at the low end. Rinse canned legumes. Use iodized salt.

### Cooking constraints

Available: oven, microwave, stovetop, immersion blender. **Not** available: food processor, mincer, air fryer, multicooker, grill, deep fryer.

Weekday `active_time_min` ≤30 (enforced); weekend ≤60. Passive oven or simmer time does not count. Avoid long weekday prep, rare ingredients, multiple separate sauces, deep frying, complex pastry.

---

## OUTPUT LANGUAGE

All user-visible content in Russian:

- `week.label`, meal titles, recipe titles, ingredient names, `prep` notes, `instructions`

Keep in English/ASCII so tooling keeps working:

- All JSON keys
- `day_name` (`Monday`…`Sunday`), `leftover_from`, `meal_types`, `base`, `format`, `snack_format`, `for`, `timezone`
- All `id` and slug fields; `unit` values (`g`, `ml`, `pcs`, `slice`, `cloves`, `tsp`); all numbers

**Title length:** meal titles in `menu[]` render in narrow phone grid cells with a 3-line clamp. Aim for ≤4 words and ≤30 characters.

**Reasoning vs output:** reason internally in English for accuracy on portion sizing and allergy checks. Only the final JSON's user-visible fields are Russian. No bilingual or parallel text.

---

## STRICT OUTPUT RULES

1. Valid JSON only — no markdown fences, no commentary before or after.
2. `menu` has exactly 7 objects in Monday-to-Sunday order. Position is the day; you do not
   write `day_name`.
3. `recipe_id` values in `menu` exactly match an `id` in `recipes[]`.
4. `cook_once_eat_twice: true` only on dinners that actually produce next-day leftovers;
   `leftover_from` only on lunches that actually are leftovers.
5. Ingredient names must resolve against the catalog — read it with
   `node scripts/catalog-digest.js`.
6. Ingredient `quantity` is a number and a total for all portions. Never `null`, never a phrase
   like `"по вкусу"`; state salt and spices in grams.

**Never write these — they are derived, and writing them means asserting something a script
verifies:**

| Field | Derived by |
|---|---|
| `week.start_date`, `week.end_date`, `week.label`, `week.timezone` | `normalise-plan.js` |
| `menu[].day_name`, `menu[].date`, `menu[].includes_fixed_school_lunch` | `normalise-plan.js` |
| `recipes[].serves` | `normalise-plan.js`, from who eats each slot |
| `recipes[].nutrition_estimate_per_person` | `compute-nutrition.js` |
| `shopping_list`, `daily_nutrition` | `generate-shopping-list.js`, `compute-nutrition.js` |
