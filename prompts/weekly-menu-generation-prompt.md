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

You will be told which week to generate — by ISO week ID (`2026-W27`), a Monday start date, or a relative reference (`next week`). Derive the rest yourself; the timezone is always `Europe/Vilnius`.

- `week.id` — ISO week, `YYYY-Www`
- `week.label` — Russian display string, `YYYY Ww · D–D месяц` (e.g. `2026 W27 · 29 июня – 5 июля`)
- `week.start_date` — Monday, `YYYY-MM-DD`
- `week.end_date` — Sunday, `YYYY-MM-DD`

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

```json
{
  "schema_version": "1.0",
  "language": "ru",
  "week": { "id": "2026-W27", "label": "...", "start_date": "...", "end_date": "...", "timezone": "Europe/Vilnius" },
  "menu": [
    {
      "day_name": "Monday",
      "date": "2026-06-29",
      "includes_fixed_school_lunch": true,
      "breakfast":    { "title": "Шакшука с ржаным хлебом", "recipe_id": "shakshuka-rye" },
      "lunch":        { "title": "Салат с тунцом и булгуром", "recipe_id": "tuna-bulgur-salad" },
      "dinner":       { "title": "Лосось с гречкой и брокколи", "recipe_id": "salmon-buckwheat-broccoli", "cook_once_eat_twice": true },
      "shared_snack": { "title": "Кефир с ягодами", "recipe_id": "kefir-berries" }
    }
  ],
  "recipes": [
    {
      "id": "salmon-buckwheat-broccoli",
      "title": "Лосось с гречкой и брокколи",
      "meal_types": ["dinner"],
      "serves": 5,
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

### What goes in `ingredients` at this stage

Only the **nutritionally dominant** items — the protein, the starch, the main vegetables, the added fat, and any `for`-tagged extras. Typically 4–7 rows. Garlic, herbs, spices, and lemon get added in Stage B; they barely move the numbers.

Quantities are **totals for all `serves` portions**, not per person.

### `serves` — get this right

`serves` is the total number of person-portions the quantities produce. It is checked against who actually eats the recipe, and a mismatch is a hard failure because shopping quantities are summed once per recipe.

| Recipe used for | `serves` |
|---|---|
| One breakfast, dinner, or shared snack (3 eaters) | **3** |
| One Mon–Fri lunch (adults only — child is at school) | **2** |
| One Sat/Sun lunch (3 eaters) | **3** |
| Mon–Thu dinner + next-day school lunch | **5** (3 + 2) |
| Fri/Sat dinner + next-day weekend lunch | **6** (3 + 3) |

A recipe may appear in **at most two** menu slots, and only as a dinner → next-day-lunch pair. Anything else (the same snack on two separate days) is rejected: it would be bought only once.

### Per-recipe declared fields

The catalog derives protein category, fish species, grain base, vegetables, legume species and soy form from the ingredient names. You only declare what it cannot know:

- **Every breakfast recipe** needs `base`: `oats` · `barley` · `eggs` · `yogurt_bowl` · `cottage_cheese` · `toast` · `savory_pan` · `buckwheat` · `millet` · `smoothie_bowl`
- **Every dinner recipe** needs `format`: `plated` · `tray_bake` · `soup_plus_side` · `grain_bowl` · `stir_fry` · `pasta_plus_side` · `egg_dish` · `one_pot`
- **Every shared-snack recipe** needs `snack_format`: `yogurt_based` · `savory_spread` · `nut_and_fruit` · `soy_yogurt` · `cottage_cheese` · `fish_topping` · `legume_based`

### Ingredient names must come from the catalog

Use the exact `name_ru` from [`data/foods.json`](../data/foods.json). That file is the ingredient vocabulary: 170+ foods with per-100 g nutrition, shopping category, and unit conversions. An unrecognised name is a **hard failure** — nutrition cannot be computed for it.

If you genuinely need a food that is not in the catalog, add an entry to `data/foods.json` (key, `name_ru` noun-first, `cat`, `tags`, `per100g`, `aliases`) and then use it. The catalog is meant to grow; it is not meant to be bypassed.

This replaces the old noun-first naming convention — canonical spelling now comes from one place instead of being re-derived every week.

### Then validate

```bash
node scripts/validate-plan.js data/weeks/{weekId}-plan.json
```

It reports daily and weekly nutrition against every budget, all variety counts, cooking-time caps, `serves` consistency, safety terms, and repetition against the last 3 weeks. **Fix and re-run until it passes.** Edit the plan surgically — do not regenerate it wholesale.

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
- Each person: ≥2 main meals reaching their protein anchor (husband 30 g, wife 20 g, child 15 g). The child's school lunch counts as one.
- No single main meal above 45% of a person's daily protein maximum.

**Use that freedom.** A light vegetable soup lunch, a pasta-and-vegetable dinner, a fruit-forward yogurt breakfast are all now available and were not before. Previous menus forced a protein anchor into all 28 slots, which is exactly why they felt repetitive.

### Don't over-deliver protein

The daily protein *maximums* are real constraints, not aspirations. Historic menus ran the child at ~1.7× target and the adults 20–30% over. Extra protein displaces the carbohydrate the child's growth and the husband's running need, and it crowds out variety by forcing animal or legume protein into every slot.

### Breakfast

No grain-only breakfasts. Include a protein element, a fibre-rich carbohydrate or fruit/vegetable, and a calcium source for the child. Avoid plain porridge without protein, cereal with milk only, toast with jam, pastries, sweetened yogurt bowls.

### Lunch

Mon–Fri lunch is a **two-person adult meal**. This is the freest slot in the week — use it for the formats that don't fit dinner: soups, salads, grain bowls, egg dishes, leftovers.

### Dinner

Family-shared, three eaters. Usually one clear protein, one whole-grain or starchy carbohydrate, at least two vegetables or one large vegetable component, and a healthy fat.

### Shared snack

On ≥4 days, with a calcium source for the child. Rotate the format across the week: yogurt-based, savoury spread with vegetables, nut-and-fruit, soy yogurt, cottage cheese, fish topping on rye, legume-based.

### Variety — the numbers that are enforced

Across the week: ≥4 distinct dinner protein categories; no protein item headlining more than 2 dinners; different fish species each time; no legume species more than twice; ≥3 grain/starch bases with none in more than 3 main meals; ≥8 distinct vegetables in main meals; ≤2 oat breakfasts and ≥3 breakfast base types; ≥4 dinner formats with ≤2 one-pot; no snack on more than 2 days; ≥2 soy delivery forms.

Also enforced **across weeks**: a dinner protein+starch pairing used in the last 3 weeks is rejected, and at most 1 dinner title may repeat last week. `data/weeks/recent-history.json` lists what was recently used — consult it. Salmon-with-buckwheat appeared three times in five weeks under the old flow.

### LDL priorities for the wife

Viscous fibre ≥10 g/day (oats, barley, legumes, flaxseed, chia, berries, citrus, aubergine); soy ~25 g protein on most days, varied across tofu / soy milk / soy yogurt / edamame; nuts ~30 g/day with walnuts featured; legumes ≥5 servings/week as structure not garnish; fatty fish ≥2×/week; no saturated-fat stacking (cheese + fatty meat + cream in one meal or one day). Prefer olive oil, avocado, nuts, seeds and fatty fish over butter, cream and fatty cheese.

Use `for: "wife"` on ingredients meant only for her — that is how her walnuts, sterol spread, or smaller oil share get accounted correctly.

### Sodium

Adults <5 g salt/day, child lower. High-sodium items here: herring, sardines, canned fish, canned legumes, cheese, rye and whole-grain bread, crispbread, tortillas, soy sauce, broth, mustard, capers. Do not stack salty fish + cheese + bread + canned foods on one day. The child's school lunch is already salt-heavy (~900 mg estimated), so keep their home meals on school days lower. Rinse canned legumes.

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
2. `menu` has exactly 7 objects, Monday through Sunday, `day_name` matching position.
3. `recipe_id` values in `menu` exactly match an `id` in `recipes[]`.
4. `includes_fixed_school_lunch`: `true` Mon–Fri, `false` Sat–Sun.
5. `shopping_list` and `daily_nutrition` stay `[]` — scripts fill them.
6. Never write `nutrition_estimate_per_person` by hand. `compute-nutrition.js` derives it.
7. `cook_once_eat_twice: true` only on dinners that actually produce next-day leftovers; `leftover_from` only on lunches that actually are leftovers.
8. All dates `YYYY-MM-DD`.
9. Ingredient names must resolve against `data/foods.json`.
