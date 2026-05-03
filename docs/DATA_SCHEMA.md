# Weekly Menu JSON Schema

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | string | ✓ | Must be `"1.0"` |
| `week` | object | ✓ | Week metadata |
| `household_context_version` | string | — | E.g. `"3.0"` |
| `language` | string | — | `"en"` or `"lt"` |
| `assumptions` | string[] | — | List of generation assumptions |
| `menu` | object[] | ✓ | Exactly 7 day objects |
| `recipes` | object[] | ✓ | Non-empty; all referenced IDs must exist |
| `shopping_list` | object[] | ✓ | Grouped by category |
| `daily_nutrition` | object[] | ✓ | 7 entries, one per day |
| `weekly_validation` | object | ✓ | LLM self-check result |
| `safety` | object | ✓ | Allergy and processed-meat checks |

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

## `menu[]` day object

| Field | Type | Required |
|---|---|---|
| `day_name` | string | — | E.g. `"Monday"` |
| `date` | string | — | ISO date |
| `breakfast` | meal object | ✓ |
| `lunch` | meal object | ✓ |
| `dinner` | meal object | ✓ |
| `shared_snack` | meal object | — | Omit or null if none |
| `child_fixed_school_snack` | string or object | — | External fixed snack; never modify |
| `day_notes` | string | — | Cook-once notes, etc. |

### Meal object

| Field | Type | Required |
|---|---|---|
| `title` | string | ✓ |
| `recipe_id` | string | — | Must match an `id` in `recipes[]` |
| `portions` | object | — | `{ "husband": "...", "wife": "...", "child": "..." }` |
| `notes` | string | — | Prep notes, leftover info |
| `cook_once_eat_twice` | boolean | — | |
| `leftover_from` | string | — | Day name this is a leftover from |

---

## `recipes[]` object

| Field | Type | Required |
|---|---|---|
| `id` | string | ✓ | Unique; slug format |
| `title` | string | ✓ | |
| `meal_types` | string[] | — | `["breakfast"]`, `["lunch","dinner"]`, etc. |
| `tags` | string[] | — | E.g. `["fish","high-protein"]` |
| `active_time_min` | number | — | Active cooking minutes |
| `total_time_min` | number | — | Total including passive time |
| `equipment` | string[] | — | E.g. `["oven","stovetop"]` |
| `ingredients` | ingredient[] | — | |
| `instructions` | string[] | — | Ordered steps |
| `nutrition_estimate_per_person` | object | — | See below |

### Ingredient object

| Field | Type |
|---|---|
| `name` | string |
| `quantity` | number or string |
| `unit` | string |
| `prep` | string (optional) |

### `nutrition_estimate_per_person`

Keys are person identifiers (`husband`, `wife`, `child`). Values:

| Field | Type | Unit |
|---|---|---|
| `kcal` | number | kcal |
| `protein_g` | number | grams |
| `carbs_g` | number | grams |
| `fat_g` | number | grams |
| `fiber_g` | number | grams |
| `sat_fat_g` | number (optional) | grams |

---

## `shopping_list[]` object

| Field | Type | Required |
|---|---|---|
| `category` | string | ✓ | E.g. `"Fish & Seafood"` |
| `items` | item[] | ✓ | |

### Shopping item

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | — | Stable key for localStorage. If absent, derived as `{name}|{unit}` |
| `name` | string | ✓ | |
| `quantity` | string or number | — | |
| `unit` | string | — | |
| `note` | string | — | E.g. `"Fresh or frozen"` |
| `used_in` | string[] | — | Recipe titles or IDs |

---

## `daily_nutrition[]` object

Array of 7, one per day. Each:

| Field | Type |
|---|---|
| `date` | string (ISO) |
| `husband` | nutrition totals object |
| `wife` | nutrition totals object |
| `child` | nutrition totals object |

Child object must include `includes_fixed_school_snack: boolean`.

---

## `weekly_validation` object

| Field | Type |
|---|---|
| `pass` | boolean |
| `checks` | check[] |

### Check object

| Field | Type |
|---|---|
| `label` | string |
| `pass` | boolean |
| `detail` | string (optional) |

---

## `safety` object

| Field | Type | Required |
|---|---|---|
| `allergy_check` | object | ✓ |
| `processed_meat_check` | object | ✓ |
| `fixed_child_snack_accounted_for` | boolean | ✓ |
| `fixed_child_snack_not_modified` | boolean | ✓ |

`allergy_check` and `processed_meat_check` shape:

```json
{ "pass": true, "notes": [] }
```

---

## Naming conventions

- **Week ID**: `YYYY-Www` (ISO 8601 week). Filename: `YYYY-Www.json`.
- **Recipe ID**: kebab-case slug, e.g. `salmon-tray-bake`.
- **Shopping item ID**: `{name-slug}|{unit}`, e.g. `salmon-fillet|g`.
- **Week label**: `"YYYY Www · Mon D–Mon D"`, using middle dot U+00B7 and en-dash U+2013.

---

## Validation rules enforced by scripts

1. JSON must parse.
2. All required top-level fields must be present.
3. `menu` must have exactly 7 elements.
4. Each day must have `breakfast`, `lunch`, `dinner` with non-empty titles.
5. `recipes` must be non-empty with unique IDs.
6. All `recipe_id` values in menu must exist in `recipes[].id`.
7. `shared_snack` count across the week must be ≥ 4.
8. No duplicate shopping item IDs.
9. `daily_nutrition` must have 7 entries; child entries must have `includes_fixed_school_snack`.
10. `safety.fixed_child_snack_accounted_for` must exist.
11. No banned fruit terms anywhere in the document.
12. No processed-meat terms outside `child_fixed_school_snack` fields.
