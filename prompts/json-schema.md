# Weekly Menu JSON Schema — LLM Output Reference

## STRICT OUTPUT RULES

1. Output **only valid JSON**. No markdown code fences. No commentary. No trailing text.
2. `recipe_id` values in `menu` must **exactly match** `id` values in `recipes[]`.
3. `menu` must contain **exactly 7 objects** (Monday–Sunday).
4. Shopping item `id` format: `{name-slug}|{unit}` — e.g. `"salmon-fillet|g"`.
5. `child_fixed_school_snack` must **not be modified or replaced**. Always use the fixed value below.
6. **No banned fruits** anywhere in the document (not even in notes or tags):
   - cherry, apple, pear, apricot, peach (and their plural/Lithuanian/Russian forms)
7. **No processed meat** outside `child_fixed_school_snack`:
   - ham, bacon, sausage, salami, hot dog, deli meat (and variants)
8. `weekly_validation.pass` must **accurately reflect** whether the week meets all nutritional rules.
9. All dates in `YYYY-MM-DD` format.
10. Week ID must match the requested week (e.g. `"2026-W19"`).

## Fixed child school snack (never modify)

```json
"child_fixed_school_snack": {
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
  "schema_version": "1.0",
  "week": {
    "id": "YYYY-Www",
    "label": "YYYY Www · Mon D–Mon D",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "timezone": "Europe/Vilnius",
    "notes": ""
  },
  "household_context_version": "3.0",
  "language": "en",
  "assumptions": [],
  "menu": [
    {
      "day_name": "Monday",
      "date": "YYYY-MM-DD",
      "breakfast": {
        "title": "",
        "recipe_id": "",
        "portions": { "husband": "", "wife": "", "child": "" },
        "notes": "",
        "cook_once_eat_twice": false
      },
      "lunch": {
        "title": "",
        "recipe_id": "",
        "portions": { "husband": "", "wife": "", "child": "" },
        "notes": ""
      },
      "dinner": {
        "title": "",
        "recipe_id": "",
        "portions": { "husband": "", "wife": "", "child": "" },
        "notes": "",
        "cook_once_eat_twice": false
      },
      "shared_snack": {
        "title": "",
        "recipe_id": ""
      },
      "child_fixed_school_snack": {
        "title": "Fixed school snack (external)",
        "description": "Tortilla wrap with cream cheese and vegetables — external, not generated",
        "kcal_estimate": 400,
        "protein_g_estimate": 24
      },
      "day_notes": ""
    }
  ],
  "recipes": [
    {
      "id": "recipe-slug",
      "title": "",
      "meal_types": ["breakfast"],
      "tags": [],
      "active_time_min": 0,
      "total_time_min": 0,
      "equipment": [],
      "ingredients": [
        { "name": "", "quantity": 0, "unit": "", "prep": "" }
      ],
      "instructions": [],
      "nutrition_estimate_per_person": {
        "husband": { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 },
        "wife":    { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 },
        "child":   { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 }
      }
    }
  ],
  "shopping_list": [
    {
      "category": "Fish & Seafood",
      "items": [
        {
          "id": "item-slug|unit",
          "name": "",
          "quantity": "",
          "unit": "",
          "note": "",
          "used_in": []
        }
      ]
    }
  ],
  "daily_nutrition": [
    {
      "date": "YYYY-MM-DD",
      "husband": { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sat_fat_g": 0 },
      "wife":    { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sat_fat_g": 0 },
      "child":   { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "includes_fixed_school_snack": true }
    }
  ],
  "weekly_validation": {
    "pass": true,
    "checks": [
      { "label": "Fatty fish ≥2x this week", "pass": true, "detail": "" },
      { "label": "Legumes ≥3x this week", "pass": true, "detail": "" },
      { "label": "Soy foods 4–7 inclusions", "pass": true, "detail": "" },
      { "label": "Red meat ≤2x (adults)", "pass": true, "detail": "" },
      { "label": "Wife sat fat ≤11g/day average", "pass": true, "detail": "" },
      { "label": "Wife beta-glucan ≥3g/day (oats/barley daily)", "pass": true, "detail": "" },
      { "label": "Husband protein ≥130g/day average", "pass": true, "detail": "" },
      { "label": "Child calcium ~1300mg/day structurally supported", "pass": true, "detail": "" },
      { "label": "Shared snack ≥4 days", "pass": true, "detail": "" },
      { "label": "No banned fruits", "pass": true, "detail": "" },
      { "label": "No generated processed meat", "pass": true, "detail": "" }
    ]
  },
  "safety": {
    "allergy_check": { "pass": true, "notes": [] },
    "processed_meat_check": { "pass": true, "notes": [] },
    "fixed_child_snack_accounted_for": true,
    "fixed_child_snack_not_modified": true
  }
}
```
