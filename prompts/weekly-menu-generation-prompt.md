# Weekly Family Menu — Generation Prompt

You are generating a weekly menu JSON file for a family of three. Read it fully before producing any output.

---

## TARGET WEEK

You will be told which week to generate — by ISO week ID (`2026-W22`), by a Monday start date (`2026-05-25`), or by a relative reference (`next week`, `the week after 2026-W21`). Derive the rest of the week fields yourself; the timezone is always `Europe/Vilnius`.

The JSON must contain all four of these (formats below):

- `week.id` — ISO week, `YYYY-Www` (e.g. `2026-W22`)
- `week.label` — display string in Russian, format `YYYY Ww · D–D месяц` (e.g. `2026 W22 · 25–31 мая`; if the week crosses months, use `D месяц – D месяц`, e.g. `25 мая – 31 мая` or `28 мая – 3 июня`)
- `week.start_date` — Monday, `YYYY-MM-DD`
- `week.end_date` — Sunday, `YYYY-MM-DD`

---

## TASK

Generate one complete weekly menu JSON for the family described below. The output must be valid JSON only — no markdown fences, no explanatory text before or after.

---

## ⚠️ CRITICAL SAFETY RULES — READ FIRST

These are absolute. Violating any of them makes the output unusable.

### Rule 1 — Child fruit allergy

The child must not consume **cherries, apples, pears, apricots, or peaches** in any form — fresh, cooked, baked, dried, as juice, jam, compote, puree, sauce, pastry filling, yogurt layer, smoothie ingredient, cereal filler, or any hidden ingredient.

Apply this to **every generated meal and snack**, including titles, notes, and ingredients. Do not use vague "multifruit" "forest fruit" "garden fruit" or "mixed fruit" products unless the ingredient list is explicitly free of all five excluded fruits.

All other fruits are allowed.

### Rule 2 — No processed meat in generated meals

The generated menu (breakfasts, lunches, dinners, shared snacks) must contain **no processed meat**: no ham, no bacon, no sausages, no salami, no smoked deli meats, no hot dogs, no processed meat spreads.

---

## HOUSEHOLD PROFILES

### Husband
- Activity: jogging 3×5 km/week, push-ups and pull-ups 3×/week
- Goal: muscle gain/recomposition, reduce visceral fat, overall health and longevity
- Trains in the morning after breakfast

### Wife
- Activity: functional training 3–4×/week, 15–20 min sessions
- Goal: see the private family context
- Blood results: see the private family context

### Child
- Activity: table tennis 2×/week, swimming 2×30 min/week, PE at school; sport is after school after 15:00
- Goal: support puberty growth and height potential; avoid excess fat gain
- Has a fixed school snack every school day (wrap with salad, ham, bell pepper and cream cheese) which should be considered in his daily calorie count.

### Cuisine and availability
- No fixed cuisine preference
- All ingredients must be available in Lithuanian supermarkets: Maxima, IKI, Rimi, Lidl, Barbora.

---

## CALORIE AND MACRO TARGETS

### Husband daily targets
- Calories: ~2,350–2,450 kcal/day average
- Protein: 130–145 g/day; **≥35 g per main meal**
- Carbohydrates: ~45–55% of energy, complex carbs preferred
- Fat: ~25–35% of energy; saturated fat <10% of energy
- Fiber: ≥35 g/day
- Vegetables + fruit: ≥400 g/day
- Salt: <5 g/day

Meal distribution guide:
- Breakfast: ~500–650 kcal, 35–45 g protein
- Lunch: ~650–800 kcal, 40–50 g protein
- Dinner: ~650–800 kcal, 40–50 g protein
- Snacks: ~200–400 kcal as needed

### Wife daily targets
- Calories: ~1,550–1,650 kcal/day average
- Protein: 95–105 g/day; **≥28 g per main meal**
- Fat: ~25–30% of energy; **saturated fat ≤11 g/day** preferred
- Trans fat: as close to zero as possible
- Free sugars: ideally <5% of energy
- Fiber: ≥30 g/day; include a viscous/soluble fiber source daily (oats, barley, legumes, ground flaxseed, chia, berries, citrus)
- Vegetables + fruit: ≥400 g/day
- Salt: <5 g/day

Meal distribution guide:
- Breakfast: ~350–450 kcal, 28–35 g protein
- Lunch: ~450–550 kcal, 30–35 g protein
- Dinner: ~500–600 kcal, 30–40 g protein
- Snack: ~100–200 kcal if needed

### Child daily targets
- Calories: ~2,100–2,550 kcal/day **including** the fixed school snack
- Protein: 70–85 g/day; **≥20 g per main meal**
- Fiber: ≥25 g/day
- Calcium: structurally support ~1,300 mg/day (dairy, fortified soy milk, kefir, etc.)
- Vegetables + fruit: ≥350 g/day
- Salt: below adult ceiling; extra caution on school days because the fixed snack is moderately salty
- No exposure to excluded fruits
- No processed meat in generated meals

Meal distribution guide (school days include fixed snack):
- Breakfast: ~450–650 kcal, 20–30 g protein
- Fixed school snack: ~400 kcal, ~24 g protein (fixed, external)
- Lunch: ~550–700 kcal, ≥20 g protein
- Dinner: ~600–800 kcal, ≥20 g protein

---

## LDL-LOWERING PRIORITIES FOR WIFE

Apply these every week, not occasionally:

1. **Oats or barley** — approach ~3 g/day beta-glucan for cholesterol-lowering support
2. **Fatty fish ≥2×/week**
3. **Walnuts most days** — ideally 15–30 g/day depending on calorie room
4. **Soy foods regularly** — tofu, edamame, soy milk, soy yogurt, etc
5. **Legumes ≥3×/week** — lentils, chickpeas, kidney beans, peas
6. **Limit saturated fat stacking** — do not combine fatty meat + cheese + cream/butter sauce in the same meal
7. **Whole eggs ≤1/day for wife** — use egg whites for extra volume
8. **Prefer low-fat dairy** over high-fat dairy
9. **Prefer olive oil, avocado, nuts, seeds, fatty fish** over butter, cream, coconut fat, fatty cheese

---

## MEAL CONSTRUCTION RULES

### Breakfast rule
Every breakfast must include:
- A **protein anchor** (Greek yogurt, eggs, cottage cheese, tofu, fish etc)
- A **fiber-rich carbohydrate** (oats, rye bread, whole-grain toast, buckwheat etc)
- A **healthy fat or seeds** (walnuts, flaxseed, chia, avocado etc)
- A **calcium source for child** (dairy, fortified soy milk, kefir etc)

### Lunch rule
Every lunch must meet protein floors: husband ≥35 g, wife ≥28 g, child ≥20 g.
If lunch is leftovers, check protein by person — do not assume.

### Dinner rule
Family-shared where possible with portion adjustments. Include:
- One clear protein source
- One whole-grain or starchy carbohydrate
- At least 2 vegetables or one large vegetable component
- Healthy fat source

### Cook-once-eat-twice
Use this structure for weekday lunches where practical. Cook double dinner portions; next-day lunch uses the leftovers. 

### Shared family snack
Present on ≥4 days. Should provide ~10 g protein per adult serving and a calcium source for the child.

Example formats (illustrative, not a closed list): Greek yogurt + berries + seeds; skyr + nuts + fruit; kefir + rye crispbread + cottage cheese; hummus + raw vegetables + boiled egg; fortified soy yogurt + walnuts; cottage cheese with herbs on rye + cucumber; banana + nut butter + milk; tuna or mackerel pâté on rye + tomato; edamame + clementines + a handful of almonds. Vary the format across the week — see Variety rules.

### Portioning
- Husband: largest protein portion; moderate-large complex carbs around training
- Wife: high protein and fiber; controlled calories and saturated fat; smaller oil and cheese portions; walnuts intentionally included
- Child: adequate energy; high calcium; sport-day carbohydrate top-up if needed; never underfeed because of the fixed snack

---

## VARIETY ACROSS THE WEEK

Repetition within a single week reduces nutrient diversity and makes the menu boring to cook and eat. Apply these rules across the 7-day plan:

- **Main protein source:** no single specific main-protein item (a given fish species, a given legume, chicken breast, etc.) should headline more than **two dinners**. Across all dinners, hit at least **four distinct main-protein categories** — e.g. fish/seafood, poultry, red meat, legumes/soy, eggs.
- **Fish & seafood:** when fish appears multiple times in the week, use **different species** each time (don't repeat the same fish twice). Include at least one **non-fatty seafood or white-fish** meal per week (e.g. shrimp, prawns, mussels, squid, cod, hake, pollock, plaice, perch) when feasible.
- **Legumes:** rotate species across the week — don't use the same legume more than twice.
- **Grains & starches:** use at least **three distinct grain/starch bases** across the week (e.g. oats, buckwheat, potatoes, rice, pasta, bulgur, quinoa, barley). No single base should appear in more than three meals.
- **Vegetables:** at least **eight distinct vegetables** across the week's main meals; avoid using the same vegetable as the headliner more than twice.
- **Breakfast variety:** no more than **two oat-based breakfasts**; include at least **three distinct breakfast base types** (oats, eggs, cottage-cheese/yogurt bowl, whole-grain toast with topping, savory variant such as shakshuka, etc.).
- **Dinner format variety:** at least **four distinct cooking formats** per week; no more than two one-pot/mixed-bowl dinners (see Cooking Constraints).
- **Shared snack variety:** don't repeat the exact same snack on more than two days. Rotate among yogurt-based, savory (hummus + veg / egg / fish topping), nut-and-fruit, soy-yogurt, or cottage-cheese options.
- **Soy and walnut variety:** soy intake should be varied across delivery forms (e.g. soy milk in breakfast, tofu in a stir-fry, soy yogurt as snack) rather than the same form daily. On a few days, other LDL-friendly nuts (almonds, hazelnuts) may stand in for walnuts to break monotony.

These variety rules sit **on top of** the LDL priorities and nutrition floors — meet both. If two rules collide, satisfy the LDL/nutrition floors first and then maximize variety within them.

---

## COOKING CONSTRAINTS

**Available equipment:** oven, microwave, stovetop, dishwasher, immersion blender.
**Not available:** food processor, mincer, air fryer, multicooker/Instant Pot, grill.

**Weekday active cooking: ≤30 minutes.** Passive time (oven, simmering) does not count.
Weekend meals may have longer prep if they produce useful weekday leftovers.

Use a **mix of weekday-friendly formats** — do not lean on a single style. Suitable formats include:

- **Plated meals** where the protein, vegetables, and starch are cooked and served as separate components (e.g. pan-seared cod with boiled potatoes and a side salad; oven-baked chicken thigh with roasted broccoli and a buckwheat side; grilled-pan shrimp with quinoa and steamed green beans)
- **Tray bakes** with protein and vegetables roasted on one sheet
- **Soups served with a protein-rich side** (e.g. lentil soup + boiled egg + rye toast) rather than all-in-one stews every time
- **Grain or salad bowls** with composed toppings
- **Stir-fries**
- **Pasta or grain dishes** with a separate vegetable or salad side
- **Egg-based dishes** (omelet, frittata, shakshuka, scramble)
- **Yogurt or cottage-cheese bowls** (breakfast)

Across the week, dinners should use **at least four distinct formats**, and **no more than two dinners may be "everything mixed in one pot/bowl"** (stews, casseroles, mixed-bowl dishes, mixed tray bakes where ingredients lose individual identity). Plated meals with separated components are preferred for visual and textural variety.

---

## SODIUM MANAGEMENT

Adults: <5 g salt/day (<2 g sodium). Child: below adult ceiling.

High-sodium foods in this household: herring, sardines, canned fish, canned legumes, cottage cheese, cheese, rye bread, whole-grain bread, tortillas, cream cheese, ham in fixed school snack.

Rules:
- Do not stack salty fish + cheese + bread/wrap + canned foods on the same day.
- On school days the child's fixed snack may already be high-sodium — reduce other salt sources that day.
- Rinse canned legumes when possible.

---

## INGREDIENT PREFERENCES

The lists below are **non-exhaustive examples**, not a closed allow-list. Any ingredient routinely stocked in Lithuanian supermarkets (Maxima, IKI, Rimi, Lidl, Barbora) that fits the safety rules and nutrition targets is fair game — use the examples as inspiration, not as the only permitted ingredients.

**Preferred staples — examples:**

- Grains & starches: oats, buckwheat, barley, brown rice, bulgur, quinoa, couscous, whole-grain bread, rye bread, whole-grain pasta, potatoes, sweet potatoes
- Legumes & soy: lentils (red, brown, green), chickpeas, kidney beans, white beans, black beans, butter beans, green peas, edamame, tofu, soy milk, soy yogurt
- Fish & seafood: salmon, trout, mackerel, herring, sardines, tuna (canned in water), cod, hake, pollock, plaice, perch, shrimp/prawns, mussels, squid
- Poultry & meat: chicken breast and thighs, turkey breast and mince, lean beef, lean pork tenderloin, eggs, egg whites
- Dairy: Greek yogurt, skyr, kefir, cottage cheese, low-fat milk, ricotta (occasional), feta (small amounts)
- Fats, nuts & seeds: olive oil, avocado, walnuts, almonds, hazelnuts, peanuts (unsalted), pumpkin seeds, sunflower seeds, ground flaxseed, chia seeds, sesame seeds, tahini
- Vegetables: leafy greens (spinach, arugula, lettuce), kale, carrots, bell peppers, tomatoes, cucumbers, broccoli, cauliflower, cabbage, beetroot, zucchini, eggplant, mushrooms, onions, garlic, leeks, fennel, radishes, asparagus (seasonal), green beans, peas
- Fruit: berries (strawberries, blueberries, raspberries, blackberries), banana, citrus, kiwi, grapes, melon, pineapple, plums, mango (occasional)

**Avoid in generated meals:** butter-heavy dishes, cream sauces, fatty-cheese-heavy meals, coconut milk/fat as regular ingredient, deep-fried foods, all processed meats, sugary breakfast cereals, pastries as breakfast, juice as routine, sweetened yogurts, high-sugar snacks.

---

## OUTPUT LANGUAGE

All user-visible content in the JSON must be written in **Russian**:

- `week.label` (display string shown in the week picker — Russian month name, see Target Week section)
- Meal titles (`title` in menu entries and in `fixed_school_snack`)
- Recipe titles (`title` in `recipes[]`)
- Ingredient names (`name`) and prep notes (`prep`)
- Recipe `instructions` steps
- Shopping list item `name` and `note`
- Shopping list `category` headings
- `fixed_school_snack.description`

Keep the following in English / ASCII so tooling, IDs, validation, and the frontend filters keep working:

- All JSON keys (e.g. `breakfast`, `lunch`, `recipes`, `nutrition_estimate_per_person`)
- Enum / structural values: `schema_version`, `week.id`, `day_name` (`Monday`…`Sunday`), `leftover_from` (`Monday`…`Sunday`), `meal_types` (`breakfast` / `lunch` / `dinner` / `snack`), `timezone`
- All `id` and slug fields: `recipes[].id`, `menu[].*.recipe_id`, shopping item `id` (`name-slug|unit`, ASCII slug only)
- `unit` values (`g`, `ml`, `pcs`, etc.) and all numeric values

Optionally set `"language": "ru"` at the JSON root — the validator already tolerates this field.

**Title length.** Keep all `title` fields in `menu[]` entries and `shared_snack` concise — aim for ≤4 words and ≤30 characters where possible. These titles render in narrow phone grid cells with a 3-line clamp; long titles will be truncated.

**Reasoning vs output.** You may (and should) reason internally in English for better accuracy on nutrition math, allergy/ingredient checks, and constraint verification. Only the final JSON output must contain Russian in the user-visible fields listed above. Do not include English translations or parallel/bilingual text — only Russian in those fields.

---

## OUTPUT FORMAT — STRICT JSON

Output **only** valid JSON. No text before it, no text after it, no markdown code fences.

### Strict output rules

1. Output only valid JSON. No markdown fences, no commentary, no trailing text.
2. `recipe_id` values in `menu` must **exactly match** `id` values in `recipes[]`.
3. `menu` must contain **exactly 7 objects** (Monday through Sunday).
4. Shopping item `id` format: `{name-slug}|{unit}` — e.g. `"salmon-fillet|g"`.
5. `fixed_school_snack` is defined once at top level. Never copy or repeat it inside day objects.
6. No banned fruit terms anywhere in the document — not in titles, notes, ingredients, or any other field.
7. No processed-meat terms anywhere outside `fixed_school_snack`.
8. Every recipe **must** include real cooking instructions: 3–6 concise steps that a cook can follow. Each step is one short imperative sentence with concrete actions, times or temperatures where relevant. Do not output placeholders, "see notes", empty arrays, or generic filler like "cook as usual".
9. All dates in `YYYY-MM-DD` format.
10. `week.id` must match the requested week exactly (e.g. `"2026-W19"`).
11. In the shopping list indicate raw weights for grains, potatoes, pasta, meat, and fish.
12. All nutrition estimates must be per-person, not per-serving of the shared recipe.
13. Only include `cook_once_eat_twice: true` on dinner entries where it applies; omit the field otherwise. Only include `leftover_from` on lunch entries that are leftovers; omit otherwise.

### JSON structure

```json
{
  "schema_version": "2.0",
  "week": {
    "id": "YYYY-Www",
    "label": "YYYY Www · Mon D–Mon D",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "timezone": "Europe/Vilnius"
  },
  "fixed_school_snack": {
    "title": "Fixed school snack (external)",
    "description": "Tortilla wrap with cream cheese and vegetables — external, not generated",
    "kcal_estimate": 400,
    "protein_g_estimate": 24
  },
  "menu": [
    {
      "day_name": "Monday",
      "date": "YYYY-MM-DD",
      "includes_fixed_school_snack": true,
      "breakfast": {
        "title": "Meal title",
        "recipe_id": "recipe-slug"
      },
      "lunch": {
        "title": "Meal title",
        "recipe_id": "recipe-slug",
        "leftover_from": "Sunday"
      },
      "dinner": {
        "title": "Meal title",
        "recipe_id": "recipe-slug",
        "cook_once_eat_twice": true
      },
      "shared_snack": {
        "title": "Snack title",
        "recipe_id": "recipe-slug"
      }
    }
  ],
  "recipes": [
    {
      "id": "recipe-slug",
      "title": "Full recipe title",
      "meal_types": ["breakfast"],
      "active_time_min": 10,
      "total_time_min": 10,
      "ingredients": [
        { "name": "rolled oats", "quantity": 90, "unit": "g" },
        { "name": "fortified soy milk", "quantity": 300, "unit": "ml" },
        { "name": "Greek yogurt", "quantity": 150, "unit": "g" },
        { "name": "walnuts", "quantity": 25, "unit": "g", "prep": "roughly chopped" },
        { "name": "berries", "quantity": 120, "unit": "g" }
      ],
      "instructions": [
        "Simmer oats with soy milk for 4–5 minutes, stirring, until creamy.",
        "Divide into bowls and let cool for a minute.",
        "Top with Greek yogurt, berries, and chopped walnuts."
      ],
      "nutrition_estimate_per_person": {
        "husband": { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sat_fat_g": 0 },
        "wife":    { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sat_fat_g": 0 },
        "child":   { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 }
      }
    }
  ],
  "shopping_list": [
    {
      "category": "Fish & Seafood",
      "items": [
        {
          "id": "salmon-fillet|g",
          "name": "Salmon fillet",
          "quantity": "600",
          "unit": "g",
          "note": "Fresh or frozen"
        }
      ]
    },
    { "category": "Vegetables & Fruit", "items": [] },
    { "category": "Dairy, Eggs & Soy", "items": [] },
    { "category": "Meat & Poultry", "items": [] },
    { "category": "Pantry, Grains & Legumes", "items": [] }
  ],
  "daily_nutrition": [
    {
      "date": "YYYY-MM-DD",
      "husband": { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sat_fat_g": 0 },
      "wife":    { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sat_fat_g": 0 },
      "child":   { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "includes_fixed_school_snack": true }
    }
  ]
}
```

The nutrition/safety rules in this prompt (LDL priorities, protein floors, banned fruits, processed meat, sodium, cooking time, breakfast variety) must be satisfied by the menu itself. They are no longer echoed back as a `weekly_validation` block — verify them mentally against the checklist below before producing the JSON.

---

## PRE-SUBMIT CHECKLIST

Before producing the final JSON, verify every item:

**Structure**
- [ ] `menu` has exactly 7 day objects (Monday–Sunday)
- [ ] All `recipe_id` values in `menu` exactly match an `id` in `recipes[]`
- [ ] Every recipe has 3–6 real, concise `instructions` steps — no placeholders or empty arrays
- [ ] `daily_nutrition` has exactly 7 entries
- [ ] Each `daily_nutrition` child entry has `includes_fixed_school_snack: true` (Mon–Fri) or `false` (Sat–Sun)
- [ ] Each menu day has `includes_fixed_school_snack: true` (Mon–Fri) or `false` (Sat–Sun)
- [ ] `fixed_school_snack` appears once at top level only — not inside any day object
- [ ] Shopping list covers every ingredient, grouped by category, with stable `id` fields
- [ ] `cook_once_eat_twice: true` only on dinner entries that actually produce next-day leftovers
- [ ] `leftover_from` only on lunch entries that are actually leftovers

**Safety**
- [ ] No banned fruit terms anywhere (cherries, apples, pears, apricots, peaches — titles, notes, ingredients, shopping) — checked in both English and Russian
- [ ] No processed-meat terms anywhere in the document — checked in both English and Russian

**Language**
- [ ] All user-visible text fields are in Russian (meal titles, recipe titles, ingredient names, prep notes, instructions, shopping names/notes/categories, `fixed_school_snack.description`)
- [ ] All enum/structural values and IDs remain English/ASCII (`day_name`, `leftover_from`, `meal_types`, recipe `id`, shopping item `id`, `unit`)

**Nutrition**
- [ ] Shared snack on ≥4 days
- [ ] Fatty fish on ≥2 days
- [ ] Legumes on ≥3 days (rotated across different species)
- [ ] Soy foods on 2–4 days, varied across delivery forms (tofu, soy milk, soy yogurt, edamame)
- [ ] Oats or barley on ≥2 days
- [ ] Wife has walnuts on most days (other LDL-friendly nuts may stand in occasionally)
- [ ] Husband protein ≥35 g at each main meal
- [ ] Wife protein ≥28 g at each main meal
- [ ] Child protein ≥20 g at each main meal
- [ ] Child calcium sources present at every meal where feasible
- [ ] Leftovers assigned as lunches are checked per-person for protein adequacy
- [ ] Sodium not stacked on high-risk days

**Variety**
- [ ] No single specific main-protein item headlines more than two dinners
- [ ] ≥4 distinct main-protein categories across dinners (fish/seafood, poultry, red meat, legumes/soy, eggs)
- [ ] When fish appears multiple times, species differ each time
- [ ] ≥1 non-fatty seafood or white-fish meal in the week when feasible (shrimp/prawns, mussels, squid, cod, hake, pollock, plaice, perch, etc.)
- [ ] Legume species rotated — none used more than twice
- [ ] ≥3 distinct grain/starch bases across the week; no base used in >3 meals
- [ ] ≥8 distinct vegetables across main meals; no vegetable headlines more than twice
- [ ] Breakfast variety: ≤2 oat-based breakfasts, ≥3 distinct base types across the week
- [ ] ≥4 distinct dinner cooking formats; ≤2 one-pot/mixed-bowl dinners
- [ ] Shared snack not repeated on more than two days
