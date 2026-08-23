# Weekly Menu JSON Schema

Schema version: **2.1**

Two file shapes matter:

- **Plan** — `data/weeks/{weekId}-plan.json`, a gitignored working artifact. What generation writes first and iterates on.
- **Week** — `data/weeks/{weekId}.json`, the published file the site fetches.

Plus three data files the tooling reads:

| File | Role |
|---|---|
| [`data/foods.json`](../data/foods.json) | Canonical food catalog: per-100 g nutrition, shopping category, unit conversions, aliases. The ingredient vocabulary. |
| [`data/targets.json`](../data/targets.json) | Nutrition budgets, portion weights, eater sets, variety thresholds. Every enforced number. |
| `data/weeks/recent-history.json` | Auto-generated summary of the last 4 weeks, for cross-week variety. |

---

## What changed in 2.1

| | 2.0 | 2.1 |
|---|---|---|
| Child's midday meal | `fixed_school_snack` (packed, ham tortilla) | `fixed_school_lunch` (school canteen, external) |
| Day flag | `includes_fixed_school_snack` | `includes_fixed_school_lunch` |
| Lunch eaters | 3 every day | **2 on Mon–Fri**, 3 on Sat–Sun |
| Portion count | implicit | `recipes[].serves` — required, cross-checked against who eats |
| Nutrition | hand-authored per recipe | **computed** by `compute-nutrition.js` from ingredients |
| Shopping metadata | per-week `-shopping-meta.json` pass | derived from `data/foods.json` |
| Protein rules | per-meal floors | per-day budgets (see `targets.json`) |

2.0 files are retired to `data/weeks/archive/` and are no longer validated or served — see the note at the end of this document. The table above is kept because the archived files still have that shape.

---

## Top-level fields (week file)

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | string | ✓ | `"2.1"` |
| `language` | string | — | BCP-47 tag for user-visible content, e.g. `"ru"` |
| `week` | object | ✓ | Week metadata |
| `fixed_school_lunch` | object | ✓ | External school lunch — never modify. Injected by `promote-plan.js` from `targets.json`. |
| `menu` | object[] | ✓ | Exactly 7 day objects (Mon–Sun), `day_name` matching position |
| `recipes` | object[] | ✓ | Non-empty; all referenced IDs must exist |
| `shopping_list` | object[] | ✓ | Written by `generate-shopping-list.js`; `[]` until then |
| `daily_nutrition` | object[] | ✓ | 7 day totals, written by `compute-nutrition.js`; `[]` until then |
| `nutrition_source` | string | — | `"computed"`, set by `compute-nutrition.js` |

---

## `week` object

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | Must equal filename without `.json`. Format `YYYY-Www` |
| `label` | string | ✓ | Russian display string, e.g. `"2026 W27 · 29 июня – 5 июля"` |
| `start_date` | string | ✓ | ISO date, Monday |
| `end_date` | string | ✓ | ISO date, Sunday |
| `timezone` | string | — | Default `"Europe/Vilnius"` |
| `notes` | string | — | Free text, surfaced in the manifest |

---

## `fixed_school_lunch` object

Defined **once** at the top level. Never copy it into day objects, never modify it.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Static label |
| `description` | string | Human-readable |
| `kcal_estimate` | number | |
| `protein_g_estimate` | number | |
| `carbs_g_estimate` | number | |
| `fat_g_estimate` | number | |
| `sat_fat_g_estimate` | number | |
| `fiber_g_estimate` | number | |
| `sodium_mg_estimate` | number | |
| `assumed` | boolean | `true` while the values are estimates rather than measurements |

> These values are **estimates** for a standard Lithuanian school-canteen lunch. The child's whole daily budget rests on them, so an error here propagates to all five school days. Canonical source: `targets.json` → `fixed_school_lunch`.

---

## `menu[]` day object

| Field | Type | Required | Notes |
|---|---|---|---|
| `day_name` | string | ✓ | `"Monday"`…`"Sunday"`, must match array position |
| `date` | string | ✓ | ISO date |
| `includes_fixed_school_lunch` | boolean | ✓ | `true` Mon–Fri, `false` Sat–Sun. **Determines who eats lunch.** |
| `breakfast` | meal object | ✓ | 3 eaters |
| `lunch` | meal object | ✓ | 2 eaters on school days, 3 otherwise |
| `dinner` | meal object | ✓ | 3 eaters |
| `shared_snack` | meal object | — | Omit if none; must appear on ≥4 days |

### Meal object

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | ✓ | Russian, ≤4 words / ≤30 chars where possible |
| `recipe_id` | string | ✓ | Must match an `id` in `recipes[]` |
| `cook_once_eat_twice` | boolean | — | Dinner entries only; requires the next day's lunch to use the same recipe |
| `leftover_from` | string | — | Day name; lunch entries only |

---

## `recipes[]` object

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | Unique kebab-case slug |
| `title` | string | ✓ | Russian |
| `meal_types` | string[] | — | `["breakfast"]`, `["lunch","dinner"]`, … |
| `serves` | number | ✓ | **Total person-portions the ingredient quantities produce.** See below. |
| `base` | string | breakfast only | `oats` · `barley` · `eggs` · `yogurt_bowl` · `cottage_cheese` · `toast` · `savory_pan` · `buckwheat` · `millet` · `smoothie_bowl` |
| `format` | string | dinner only | `plated` · `tray_bake` · `soup_plus_side` · `grain_bowl` · `stir_fry` · `pasta_plus_side` · `egg_dish` · `one_pot` |
| `snack_format` | string | snack only | `yogurt_based` · `savory_spread` · `nut_and_fruit` · `soy_yogurt` · `cottage_cheese` · `fish_topping` · `legume_based` |
| `active_time_min` | number | ✓ | Hands-on minutes. Capped at 30 on weekdays, 60 at weekends. |
| `total_time_min` | number | — | Including passive time |
| `ingredients` | ingredient[] | ✓ | Quantities are totals for all `serves` portions |
| `instructions` | string[] | ✓ | 3–6 concise Russian imperative steps. Placeholders rejected. |
| `nutrition_estimate_per_person` | object | ✓ | **Generated — never hand-write it** |

### `serves`

The total number of person-portions the ingredient quantities cover. Validated against who
actually eats the recipe, and a mismatch is a hard failure: `generate-shopping-list.js` sums
each recipe's quantities exactly once, so a wrong `serves` silently over- or under-buys.

| Recipe used for | `serves` |
|---|---|
| One breakfast, dinner, or shared snack | 3 |
| One Mon–Fri lunch (adults only) | 2 |
| One Sat/Sun lunch | 3 |
| Mon–Thu dinner + next-day school lunch | **5** |
| Fri/Sat dinner + next-day weekend lunch | 6 |

A recipe may occupy at most **two** menu slots, and only as a dinner → next-day-lunch pair.
Anything else — the same snack on two separate days — is rejected, because it would be
bought only once. This was a live defect in W20 and W21.

### Ingredient object

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✓ | Must resolve against `data/foods.json`; prefer the canonical `name_ru` |
| `quantity` | number | ✓ | Total for all `serves` portions |
| `unit` | string | ✓ | `g` · `ml` · `pcs` · `slice` · `cloves` · `stalks` · `tsp` · `tbsp` |
| `prep` | string | — | E.g. `"сухой вес"`, `"крупно порубить"` |
| `for` | string | — | `"husband"` · `"wife"` · `"child"` — this quantity goes entirely to that person |

`for` is how a per-person difference gets accounted rather than merely described: the wife's
walnuts, her sterol spread, her smaller oil share.

### `nutrition_estimate_per_person`

Keys `husband`, `wife`, `child`. Each carries `kcal`, `protein_g`, `carbs_g`, `fat_g`,
`fiber_g`, `sat_fat_g`, `sodium_mg`, `calcium_mg`, `iron_mg`, `zinc_mg`.

Minerals are **total** intake from composition tables, not bioavailable intake — see the
`_micronutrient_caveat` in `data/foods.json` before reading much into them. Their budgets in
`targets.json` are `severity: "warn"` for that reason.

**Computed by `scripts/compute-nutrition.js`**, never authored. Each person's share of an
untagged ingredient is its total weighted by their portion weight, divided by the sum of
weights over every eater of every occasion the recipe covers. `sodium_mg` counts only
sodium present in ingredients — it is a lower bound, since added salt is often unstated.

---

## `shopping_list[]` object

Written by `generate-shopping-list.js` from `data/foods.json`. Categories come from the
catalog in a fixed shop-walk order, so headings are stable across weeks.

| Field | Type | Required |
|---|---|---|
| `category` | string | ✓ |
| `items` | item[] | ✓ |

### Shopping item

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | `{food-key}\|{unit}` — stable across weeks, used for localStorage |
| `name` | string | ✓ | Capitalised catalog `name_ru` |
| `quantity` | string | ✓ | Aggregated; unit chosen per food (countable → `pcs`, liquid → `ml`, else `g`) |
| `unit` | string | ✓ | |
| `note` | string | — | From the catalog, or a per-week `--notes` override |

---

## `daily_nutrition[]`

Seven entries, one per menu day, written by `compute-nutrition.js` from the same `analyze()`
pass the budget checks use. `[]` in a skeleton that has not been computed yet, and in archived
archived schema 2.0 weeks.

| Field | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD`, matching `menu[i].date` |
| `day_name` | string | `Monday`…`Sunday` |
| `husband` · `wife` · `child` | object | Day totals for that person |

Each person object carries everything in `nutrition_estimate_per_person` plus `veg_fruit_g`,
`free_sugar_g`, `viscous_fiber_g` and `sterol_g` — the app scores a day against
`data/targets.json`, which budgets all four. `child` additionally carries
`includes_fixed_school_lunch`.

Totals respect who actually eats each slot, so a weekday lunch contributes nothing to the
child, and the external school-lunch estimate is added on school days only.

**Do not author or hand-edit these.** `validate-week.js` recomputes them from the current
ingredients and fails on a mismatch: the app renders the stored copy, so a stale array would
show the reader numbers no validator ever scored.

---

## Plan file shape

Same as the week file, minus `instructions` (empty) and with `ingredients` holding only the
4–7 nutritionally dominant rows. `promote-plan.js` converts a plan into a week skeleton.

---

## Naming conventions

- **Week ID**: `YYYY-Www` (ISO 8601). Filename `YYYY-Www.json`; `week.id` must match.
- **Recipe ID**: kebab-case slug, e.g. `salmon-buckwheat-broccoli`.
- **Shopping item ID**: `{food-key}|{unit}`, e.g. `salmon|g`.
- **Food key**: lowercase ASCII slug. Must not contain a banned term as a word — a key like
  `cherry-tomato` leaks "cherry" into shopping IDs and fails the allergy scan.
- **Week label**: `"YYYY Www · D–D месяц"`, middle dot U+00B7, en-dash U+2013.

---

## Validation

| Script | Target | Enforces |
|---|---|---|
| `validate-foods.js` | `data/foods.json` | Key format, no banned terms in keys/names, per-100 g plausibility, sat-fat ≤ fat, alias round-trip, no alias conflicts |
| `validate-plan.js` | plan file | Everything below, plus all nutrition budgets, all variety rules, cooking-time caps, cross-week repetition |
| `validate-week.js` | week file | Structure, safety, `serves`, references, budgets recomputed from final ingredients |
| `validate-all-weeks.js` | every published week | Runs `validate-week.js` across the manifest |

### Structure and safety (all versions)

1. JSON parses; required top-level fields present.
2. `week.id` / `start_date` / `end_date` present.
3. `menu` has exactly 7 entries; `day_name` matches position (2.1).
4. Each day has `breakfast`, `lunch`, `dinner` with non-empty titles.
5. `includes_fixed_school_lunch` present on every day (2.1).
6. `recipes` non-empty, unique IDs; every `recipe_id` resolves.
7. `shared_snack` on ≥4 days.
8. Every recipe has ≥2 non-empty instruction steps.
9. `shopping_list` is an array with no duplicate item IDs, and is non-empty (2.1).
10. `daily_nutrition` is `[]` or a 7-entry array; each entry carries totals for all three
    people, and they agree with the current ingredients (2.1).
11. `cook_once_eat_twice` dinners are followed by a matching next-day lunch.
12. A recipe in >1 slot must be a dinner → next-day-lunch pair.
13. `serves` matches the derived eater count (2.1).
14. No banned fruit terms anywhere — cherry, apple, pear, apricot, peach, plus Lithuanian
    and Russian forms including `яблочный`, so `уксус яблочный` fails.
15. No processed-meat terms outside `fixed_school_lunch`.

### Nutrition (2.1 only)

16. Per-day and weekly-average `kcal`, `protein_g`, `fiber_g`, `sat_fat_g` against
    `targets.json`. Outside target but within ±10% is a warning; beyond is a failure.
    Weekly averages are held to ±4%.

### Variety (plan only)

17. Dinner protein items, protein categories, fish species, legume species, grain bases,
    distinct vegetables, breakfast bases, dinner formats, snack repeats, soy forms — all
    derived from `data/foods.json`, never self-reported.
18. Cross-week: no dinner protein+starch pairing reused within 3 weeks; ≤1 dinner title
    repeated from last week.
