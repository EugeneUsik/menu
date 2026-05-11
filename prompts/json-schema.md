# Weekly Menu JSON Schema — LLM Output Reference

## STRICT OUTPUT RULES

1. Output **only valid JSON**. No markdown code fences. No commentary. No trailing text.
2. `recipe_id` values in `menu` must **exactly match** `id` values in `recipes[]`.
3. `menu` must contain **exactly 7 objects** (Monday–Sunday).
4. Shopping item `id` format: `{name-slug}|{unit}` — e.g. `"salmon-fillet|g"`.
5. `fixed_school_snack` is defined **once** at the top level. Never copy or repeat it inside day objects. Each day object instead uses `"includes_fixed_school_snack": true` (Mon–Fri) or `false` (Sat–Sun).
6. **No banned fruits** anywhere in the document (not in titles, notes, ingredients, or any other field):
   - cherry, apple, pear, apricot, peach (and their plural/Lithuanian/Russian forms)
7. **No processed meat** outside `fixed_school_snack`:
   - ham, bacon, sausage, salami, hot dog, deli meat (and variants)
8. Every recipe **must** include real cooking instructions: 3–6 concise steps, each a single short imperative sentence with concrete actions (and times/temperatures where relevant). Do not output placeholders, empty arrays, or generic filler.
9. All dates in `YYYY-MM-DD` format.
10. `week.id` must match the requested week (e.g. `"2026-W19"`).
11. In the shopping list indicate raw weights for grains, potatoes, pasta, meat, and fish.
12. All nutrition estimates must be per-person, not per-serving of the shared recipe.
13. Only include `cook_once_eat_twice: true` on dinner entries where it applies; omit otherwise. Only include `leftover_from` on lunch entries that are leftovers; omit otherwise.

## Fixed child school snack (never modify)

```json
"fixed_school_snack": {
  "title": "Fixed school snack (external)",
  "description": "Tortilla wrap with cream cheese and vegetables — external, not generated",
  "kcal_estimate": 400,
  "protein_g_estimate": 24
}
```

---

## JSON skeleton

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
