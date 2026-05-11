# Weekly Menu JSON Schema

Schema version: **2.0**

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | string | ✓ | `"2.0"` |
| `week` | object | ✓ | Week metadata |
| `fixed_school_snack` | object | ✓ | Child's fixed external snack — never modify |
| `menu` | object[] | ✓ | Exactly 7 day objects (Mon–Sun) |
| `recipes` | object[] | ✓ | Non-empty; all referenced IDs must exist |
| `shopping_list` | object[] | ✓ | Grouped by category |
| `daily_nutrition` | object[] | ✓ | 7 entries, one per day |
| `weekly_validation` | object | — | LLM self-check summary (advisory, not validated by script) |

---

## `week` object

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | Must equal filename without `.json`. Format: `YYYY-Www` |
| `label` | string | ✓ | Display string. Format: `"2026 W19 · May 4–10"` |
| `start_date` | string | ✓ | ISO 8601: `"2026-05-04"` (Monday) |
| `end_date` | string | ✓ | ISO 8601: `"2026-05-10"` (Sunday) |
| `timezone` | string | — | Default `"Europe/Vilnius"` |
| `notes` | string | — | Free text, visible in manifest |

---

## `fixed_school_snack` object

Defined **once** at the top level. Never copy it into day objects.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Static label |
| `description` | string | Human-readable description |
| `kcal_estimate` | number | Approximate kcal |
| `protein_g_estimate` | number | Approximate protein in grams |

Each day object instead carries `"includes_fixed_school_snack": true` (Mon–Fri) or `false` (Sat–Sun).

---

## `menu[]` day object

| Field | Type | Required | Notes |
|---|---|---|---|
| `day_name` | string | — | E.g. `"Monday"` |
| `date` | string | — | ISO date |
| `includes_fixed_school_snack` | boolean | ✓ | `true` Mon–Fri, `false` Sat–Sun |
| `breakfast` | meal object | ✓ | |
| `lunch` | meal object | ✓ | |
| `dinner` | meal object | ✓ | |
| `shared_snack` | meal object | — | Omit if none; must appear ≥4 days/week |

### Meal object

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | ✓ | |
| `recipe_id` | string | — | Must match an `id` in `recipes[]` |
| `cook_once_eat_twice` | boolean | — | Set `true` on dinner entries only |
| `leftover_from` | string | — | Day name; set on lunch leftovers only |

---

## `recipes[]` object

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | Unique; kebab-case slug |
| `title` | string | ✓ | |
| `meal_types` | string[] | — | `["breakfast"]`, `["lunch","dinner"]`, etc. |
| `active_time_min` | number | — | Active cooking minutes |
| `total_time_min` | number | — | Total including passive time |
| `ingredients` | ingredient[] | — | |
| `instructions` | string[] | ✓ | **3–6 concise imperative steps. Placeholders forbidden.** |
| `nutrition_estimate_per_person` | object | — | See below |

### Ingredient object

| Field | Type |
|---|---|
| `name` | string |
| `quantity` | number or string |
| `unit` | string |
| `prep` | string (optional) |

### `nutrition_estimate_per_person`

Keys: `husband`, `wife`, `child`. Values:

| Field | Type | Unit | Notes |
|---|---|---|---|
| `kcal` | number | kcal | |
| `protein_g` | number | grams | |
| `carbs_g` | number | grams | |
| `fat_g` | number | grams | |
| `fiber_g` | number | grams | |
| `sat_fat_g` | number | grams | Optional for child |

---

## `shopping_list[]` object

| Field | Type | Required |
|---|---|---|
| `category` | string | ✓ |
| `items` | item[] | ✓ |

### Shopping item

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | — | Stable key for localStorage. Format: `{name-slug}\|{unit}` |
| `name` | string | ✓ | |
| `quantity` | string or number | — | Use raw weights for grains, meat, fish |
| `unit` | string | — | |
| `note` | string | — | E.g. `"Fresh or frozen"` |

---

## `daily_nutrition[]` object

Array of 7, one per day (Mon–Sun). Each entry:

| Field | Type |
|---|---|
| `date` | string (ISO) |
| `husband` | nutrition totals object |
| `wife` | nutrition totals object |
| `child` | nutrition totals object |

Child object must include `includes_fixed_school_snack: boolean`.

---

## Naming conventions

- **Week ID**: `YYYY-Www` (ISO 8601 week). Filename: `YYYY-Www.json`.
- **Recipe ID**: kebab-case slug, e.g. `salmon-tray-bake`.
- **Shopping item ID**: `{name-slug}|{unit}`, e.g. `salmon-fillet|g`.
- **Week label**: `"YYYY Www · Mon D–Mon D"`, using middle dot U+00B7 and en-dash U+2013.

---

## Validation rules enforced by scripts

1. JSON must parse.
2. Required top-level fields present (`schema_version`, `week`, `menu`, `recipes`, `shopping_list`, `daily_nutrition`).
3. `week.id`, `start_date`, `end_date` present.
4. `menu` has exactly 7 elements.
5. Each day has `breakfast`, `lunch`, `dinner` with non-empty titles.
6. `recipes` non-empty with unique IDs.
7. All `recipe_id` values in `menu` resolve to an entry in `recipes[]`.
8. `shared_snack` appears on ≥4 days.
9. `shopping_list` is an array; no duplicate item IDs.
10. `daily_nutrition` has 7 entries; child entries must have `includes_fixed_school_snack`.
11. Every recipe must have ≥2 non-empty instruction steps.
12. No banned fruit terms anywhere in the document (titles, ingredients, notes, shopping list):
    - cherry, apple, pear, apricot, peach — and their Lithuanian/Russian forms.
13. No processed-meat terms outside `fixed_school_snack`:
    - ham, bacon, sausage, salami, hot dog, deli meat — and variants.

Warnings (advisory, do not fail):
- Child `daily_nutrition` entries missing `includes_fixed_school_snack`.
