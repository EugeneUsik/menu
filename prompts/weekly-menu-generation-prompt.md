# Weekly Family Menu — Generation Prompt

You are generating a weekly menu JSON file for a family of three. Read it fully before producing any output.

---

| Field | Value |
|---|---|
| **Week ID** | `YYYY-Www` (e.g. `2026-W20`) |
| **Week label** | `YYYY Www · Mon D–Mon D` (e.g. `2026 W20 · May 11–17`) |
| **Start date** | `YYYY-MM-DD` — Monday |
| **End date** | `YYYY-MM-DD` — Sunday |

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

### Husband — 40M, 70 kg, 180 cm
- Activity: jogging 3×5 km/week, push-ups and pull-ups 3×/week
- Goal: muscle gain/recomposition, reduce visceral fat, overall health and longevity
- Trains in the morning after breakfast

### Wife — 40F, 62 kg, 164 cm
- Activity: functional training 3–4×/week, 15–20 min sessions
- Goal: lose 3–4 kg to ~58–59 kg, lower LDL cholesterol, improve energy, overall health and longevity
- Blood results (February 2026): total cholesterol 6.43 mmol/L, LDL 4.22 mmol/L (elevated), HDL 1.82 (good), triglycerides 0.86 (good)

### Child — 12M, 49 kg, 151 cm
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
Good options: Greek yogurt/Greek yogurt + berries + seeds; kefir + rye crispbread + cottage cheese; hummus + vegetables + boiled egg; fortified soy yogurt + walnuts.

### Portioning
- Husband: largest protein portion; moderate-large complex carbs around training
- Wife: high protein and fiber; controlled calories and saturated fat; smaller oil and cheese portions; walnuts intentionally included
- Child: adequate energy; high calcium; sport-day carbohydrate top-up if needed; never underfeed because of the fixed snack

---

## COOKING CONSTRAINTS

**Available equipment:** oven, microwave, stovetop, dishwasher, immersion blender.
**Not available:** food processor, mincer, air fryer, multicooker/Instant Pot, grill.

**Weekday active cooking: ≤30 minutes.** Passive time (oven, simmering) does not count.
Weekend meals may have longer prep if they produce useful weekday leftovers.

Prefer simple weekday methods: oven tray bake, stovetop one-pot, soup + protein side, grain bowl, omelet/egg-white scramble, yogurt/cottage cheese bowl, fish + potatoes + vegetables, tofu/legume stir-fry.

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

**Preferred staples:** oats, buckwheat, barley, brown rice, whole-grain bread, rye bread, whole-grain pasta, potatoes, lentils, chickpeas, kidney beans, tofu, Greek yogurt, Greek yogurt, kefir, cottage cheese, low-fat milk, fortified soy milk, salmon, mackerel, herring, sardines, cod/white fish, chicken breast, turkey, lean beef, eggs, egg whites, olive oil, walnuts, almonds, pumpkin seeds, sunflower seeds, ground flaxseed, chia seeds, leafy greens, carrots, bell peppers, tomatoes, cucumbers, broccoli, cabbage, beetroot, mushrooms, berries, banana, citrus, kiwi, grapes, melon.

**Avoid in generated meals:** butter-heavy dishes, cream sauces, fatty-cheese-heavy meals, coconut milk/fat as regular ingredient, fried foods, all processed meats, sugary breakfast cereals, pastries as breakfast, juice as routine, sweetened yogurts, high-sugar snacks.

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
- [ ] No banned fruit terms anywhere (cherries, apples, pears, apricots, peaches — titles, notes, ingredients, shopping)
- [ ] No processed-meat terms anywhere in the document

**Nutrition**
- [ ] Shared snack on ≥4 days
- [ ] Fatty fish on ≥2 days
- [ ] Legumes on ≥3 days
- [ ] Soy foods 4–7 inclusions
- [ ] Oats or barley on >2 days
- [ ] Wife has walnuts on most days
- [ ] Husband protein ≥35 g at each main meal
- [ ] Wife protein ≥28 g at each main meal
- [ ] Child protein ≥20 g at each main meal
- [ ] Child calcium sources present at every meal where feasible
- [ ] Leftovers assigned as lunches are checked per-person for protein adequacy
- [ ] Breakfast variety: ≤2 oat-based breakfasts, ≥3 distinct base types across the week
- [ ] Sodium not stacked on high-risk days
