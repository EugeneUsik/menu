# Weekly Menu App — Implementation Specification for Claude Code

## Purpose

This document defines how to implement a lightweight static Weekly Menu App using Claude Code as the development assistant.

The key goal is to support a simple weekly publishing workflow:

1. A weekly menu is generated outside the app by an LLM, using `prompts/Family-context.md` as the family-specific context.
2. The generated JSON file is added to the repository under `data/weeks/`.
3. A deterministic index-sync script scans available week files and updates `data/weeks/index.json`.
4. The GitHub Pages app loads `data/weeks/index.json` and shows every available week in a dropdown.
5. Selecting a week loads the corresponding JSON file and renders its menu, recipes, shopping list, nutrition notes, and validation checks.

The application itself must not call an LLM, store API keys, generate menus in the browser, or require a backend.

This specification replaces the heavier local generation-pipeline approach. Claude Code should implement the static site, JSON schema, validation tooling, week-index synchronization, and documentation. Menu generation remains external and manual for the MVP.

---

# 1. Product Goal

Build a static web application for weekly family meal planning.

The application is read-only for family members and hosted on GitHub Pages.

The system must optimize for:

- simple weekly publishing
- static hosting
- no backend
- no build step for the MVP
- schema-valid weekly JSON files
- deterministic week dropdown population
- clear rendering of menu, recipes, and shopping list
- mobile-first usability

The manager’s weekly workflow must be:

1. Generate next week’s menu JSON with an LLM using `prompts/Family-context.md` and `prompts/weekly-menu-generation-prompt.md`.
2. Save the generated JSON as `data/weeks/{weekId}.json`.
3. Run `node scripts/sync-weeks-index.js`.
4. Run `node scripts/validate-week.js data/weeks/{weekId}.json`.
5. Commit and push.
6. The new week appears automatically in the app’s week dropdown after GitHub Pages deploys.

---

# 2. Core Design Principle

## 2.1 Required Architecture

The system must be implemented as a static JSON-driven app.

Runtime architecture:

1. Browser loads static HTML, CSS, and JavaScript.
2. App fetches `data/weeks/index.json`.
3. App builds the week dropdown from the manifest.
4. App selects a default week.
5. App fetches the selected `data/weeks/{weekId}.json`.
6. App renders the menu, recipes, shopping list, nutrition, and validation views.

Content architecture:

- Each weekly JSON file is self-contained.
- Each weekly JSON file includes:
  - week metadata
  - menu table
  - recipes used that week
  - shopping list
  - daily nutrition estimates
  - safety checks
  - assumptions and notes
- The website does not need a separate global `recipes.json` for the MVP.
- Recipe reuse can be introduced later, but the first version should avoid cross-file dependency complexity.

Claude Code should act as:

- static-site implementer
- schema/documentation writer
- validation-script implementer
- week-index synchronization implementer

Claude Code should not be responsible for generating the family’s final weekly menu content inside the app.

---

# 3. Family and Nutrition Context

The family-specific rules are maintained outside this specification in:

```text
prompts/Family-context.md
```

This file is the binding source for family nutrition, allergy, safety, cooking, and validation rules during LLM menu generation.

The app must not duplicate the full family context in frontend code.

The app and scripts should only include deterministic safety checks that are useful as a local guardrail, especially:

- obvious forbidden fruit terms
- obvious processed-meat terms in generated meals
- existence of fixed child school snack accounting fields
- required schema fields
- recipe ID link integrity
- basic menu completeness

Important:

- The child’s fixed school snack may contain ham.
- That snack is external context.
- Processed-meat scanning must ignore content inside fields explicitly named `child_fixed_school_snack`.
- Processed meat must still be rejected in generated meals, recipes, shared snacks, and shopping-list items.

---

# 4. Application Scope

## 4.1 In Scope

- static GitHub Pages app
- week dropdown populated from `data/weeks/index.json`
- menu view
- recipe view
- shopping list view
- nutrition/validation view
- JSON-driven runtime data loading
- shopping checkbox state in `localStorage`
- recipe favorites in `localStorage`
- print-friendly menu and shopping list
- local validation script
- week manifest synchronization script
- documentation for weekly publishing workflow

## 4.2 Out of Scope for MVP

- LLM API integration
- Claude Code generating weekly content automatically
- direct Barbora ordering/cart integration
- backend
- database
- accounts/auth
- browser-side editing
- service worker/offline mode
- automatic nutrition calculation
- separate canonical recipe library
- product catalog normalization
- complex substitution engine
- notifications

---

# 5. Technical Architecture

## 5.1 Hosting

- GitHub Pages
- no backend
- no database
- no API keys
- no server-side runtime

## 5.2 Frontend Stack

Use:

- `index.html`
- `styles.css`
- `app.js`
- vanilla JavaScript

No React, no Vite, no framework, and no build step for the MVP.

## 5.3 Runtime Data Loading

The frontend loads JSON using `fetch()`.

On app load:

1. fetch `data/weeks/index.json`
2. populate week dropdown
3. determine selected week
4. fetch selected `data/weeks/{weekId}.json`
5. render active route/view

The app must not rely on directory listing. Static hosting does not provide a reliable way for browser JavaScript to discover arbitrary files in a folder. Therefore, `data/weeks/index.json` is required.

## 5.4 Week Selection Rules

The app should determine the selected week in this priority order:

1. `?week={weekId}` query parameter, if present and valid
2. value saved in `localStorage`, if still valid
3. `defaultWeekId` from `data/weeks/index.json`, if present
4. first week marked `isCurrent: true`
5. nearest upcoming week based on `start_date`
6. most recent week based on `start_date`
7. first manifest entry as fallback

When the user changes the dropdown:

- update the visible page
- save selected week ID to `localStorage`
- update the URL query parameter without a full reload, if practical

---

# 6. Repository Structure

Required structure:

```text
/
  index.html
  styles.css
  app.js
  /data/
    /weeks/
      index.json
      2026-W19.json
      sample-week.json
  /prompts/
    Family-context.md
    weekly-menu-generation-prompt.md
    json-schema.md
  /scripts/
    sync-weeks-index.js
    validate-week.js
    validate-all-weeks.js
  /docs/
    SPEC.md
    DATA_SCHEMA.md
    OPERATIONS.md
  README.md
```

Optional future structure:

```text
/data/archive/
/data/assets/
/scripts/repair-json.js
/scripts/format-json.js
```

Do not introduce these unless needed for the MVP.

---

# 7. Data Files

## 7.1 `/data/weeks/index.json`

This is the manifest used by the frontend to populate the week dropdown.

The file is generated by `scripts/sync-weeks-index.js`.

Example:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-05-03T12:00:00.000Z",
  "defaultWeekId": "2026-W19",
  "weeks": [
    {
      "id": "2026-W19",
      "label": "2026 W19 · May 4–10",
      "start_date": "2026-05-04",
      "end_date": "2026-05-10",
      "file": "2026-W19.json",
      "isCurrent": true,
      "status": "ready"
    }
  ]
}
```

Required behavior:

- The frontend must only use weeks listed in this manifest.
- The sync script must sort weeks by `start_date`, newest first by default.
- The sync script must extract week metadata from each weekly JSON file.
- The sync script must ignore `index.json`.
- The sync script may ignore files starting with `_`.
- The sync script should include `sample-week.json` only if configured to do so.

## 7.2 `/data/weeks/{weekId}.json`

Each weekly menu file is complete and self-contained.

Required naming convention:

```text
YYYY-Www.json
```

Examples:

```text
2026-W19.json
2026-W20.json
2026-W21.json
```

The `week.id` inside the JSON must match the filename without `.json`.

The file must include:

- `week`
- `menu`
- `recipes`
- `shopping_list`
- `daily_nutrition`
- `weekly_validation`
- `safety`
- `assumptions`

---

# 8. Weekly JSON Contract

Create detailed schema documentation in:

```text
docs/DATA_SCHEMA.md
prompts/json-schema.md
```

`docs/DATA_SCHEMA.md` is for developers.

`prompts/json-schema.md` is for the LLM prompt that generates weekly JSON.

Both should describe the same contract, but `prompts/json-schema.md` should be shorter and optimized for copying into an LLM prompt.

## 8.1 Top-Level Shape

```json
{
  "schema_version": "1.0",
  "week": {
    "id": "2026-W19",
    "label": "2026 W19 · May 4–10",
    "start_date": "2026-05-04",
    "end_date": "2026-05-10",
    "timezone": "Europe/Vilnius",
    "notes": []
  },
  "household_context_version": "3.0",
  "language": "en",
  "assumptions": [],
  "menu": [],
  "recipes": [],
  "shopping_list": [],
  "daily_nutrition": [],
  "weekly_validation": {
    "pass": false,
    "checks": []
  },
  "safety": {
    "allergy_check": {
      "pass": false,
      "notes": []
    },
    "processed_meat_check": {
      "pass": false,
      "notes": []
    },
    "fixed_child_snack_accounted_for": false,
    "fixed_child_snack_not_modified": false
  }
}
```

## 8.2 Menu Day Shape

```json
{
  "day": "Monday",
  "date": "2026-05-04",
  "breakfast": {
    "title": "",
    "recipe_id": "",
    "portion_notes": {
      "husband": "",
      "wife": "",
      "child": ""
    }
  },
  "lunch": {
    "title": "",
    "recipe_id": "",
    "leftover_from": null,
    "portion_notes": {
      "husband": "",
      "wife": "",
      "child": ""
    }
  },
  "dinner": {
    "title": "",
    "recipe_id": "",
    "cook_once_eat_twice": false,
    "portion_notes": {
      "husband": "",
      "wife": "",
      "child": ""
    }
  },
  "shared_snack": {
    "title": "",
    "recipe_id": "",
    "optional": true
  },
  "child_fixed_school_snack": {
    "included_in_nutrition": true,
    "description": "Fixed external school snack accounted for but not modified."
  },
  "daily_notes": []
}
```

Rules:

- `menu` must contain exactly 7 day objects.
- Each day must have breakfast, lunch, and dinner.
- At least 4 days must have a non-empty `shared_snack.title`.
- Recipe IDs referenced by meals must exist in the same weekly file’s `recipes` array.
- Empty snack values are allowed, but must render as an em dash.

## 8.3 Recipe Shape

```json
{
  "id": "salmon-potato-broccoli-traybake",
  "title": "Salmon, potato and broccoli tray bake",
  "meal_type": ["dinner", "lunch-leftover"],
  "servings": 6,
  "active_time_minutes": 25,
  "total_time_minutes": 45,
  "equipment": ["oven", "stovetop"],
  "ingredients": [
    {
      "name": "salmon fillet",
      "quantity": 900,
      "unit": "g",
      "category": "Fish and seafood",
      "notes": "Fresh or frozen; thaw before cooking."
    }
  ],
  "instructions": [
    "Step text."
  ],
  "portioning": {
    "husband": "",
    "wife": "",
    "child": ""
  },
  "nutrition_estimate_per_person": {
    "husband": {
      "kcal": 0,
      "protein_g": 0,
      "fiber_g": 0,
      "sat_fat_g": 0
    },
    "wife": {
      "kcal": 0,
      "protein_g": 0,
      "fiber_g": 0,
      "sat_fat_g": 0
    },
    "child": {
      "kcal": 0,
      "protein_g": 0,
      "fiber_g": 0,
      "calcium_mg": 0
    }
  },
  "tags": ["fatty-fish", "high-protein", "batch-friendly"]
}
```

Rules:

- `id` must be stable and URL-safe.
- `ingredients` may use approximate quantities.
- Nutrition estimates are approximate and must not be presented as exact.
- Recipes are scoped to the week file for MVP.

## 8.4 Shopping List Shape

```json
{
  "category": "Fish and seafood",
  "items": [
    {
      "id": "2026-W19|fish-and-seafood|salmon-fillet|g",
      "name": "salmon fillet",
      "quantity": 900,
      "unit": "g",
      "notes": "Fresh or frozen.",
      "used_in": ["salmon-potato-broccoli-traybake"]
    }
  ]
}
```

Rules:

- Shopping list must be grouped by category.
- Each item should have a stable `id`.
- If `id` is missing, the app should derive a localStorage key from week ID, category, item name, and unit.
- `used_in` should reference recipe IDs when possible.

## 8.5 Daily Nutrition Shape

```json
{
  "date": "2026-05-04",
  "husband": {
    "kcal": 0,
    "protein_g": 0,
    "fiber_g": 0,
    "notes": []
  },
  "wife": {
    "kcal": 0,
    "protein_g": 0,
    "fiber_g": 0,
    "sat_fat_g": 0,
    "ldl_support_notes": []
  },
  "child": {
    "kcal": 0,
    "protein_g": 0,
    "fiber_g": 0,
    "calcium_mg": 0,
    "includes_fixed_school_snack": true,
    "notes": []
  },
  "day_notes": []
}
```

Rules:

- Daily nutrition must include all three family members.
- Child nutrition must explicitly show whether the fixed school snack was included.
- The UI should show these values as estimates.

---

# 9. Frontend UX Requirements

## 9.1 Devices

Primary target: iPhone 13/15/16 width class.

No horizontal scrolling should be required on mobile.

## 9.2 Navigation

Use a sticky top bar with:

- app title
- week selector dropdown
- Menu tab
- Recipes tab
- Shopping List tab
- Validation tab

The app may be implemented as a single `index.html` with hash routes:

```text
#menu
#recipes
#shopping
#validation
```

This is preferred for simplicity.

Alternative multi-page implementation is acceptable only if shared state and week selection still work reliably.

## 9.3 Week Dropdown

Requirements:

- Built from `data/weeks/index.json`.
- Each option label should show the week label, for example `2026 W19 · May 4–10`.
- Selecting a week loads that week’s JSON.
- The dropdown must work without rebuilding the site when a new JSON file and updated index are committed.
- If the selected week file fails to load, show a clear error and keep the previous week visible if possible.

## 9.4 Menu View

Render:

- week label and date range
- seven day cards or table rows
- breakfast, lunch, dinner, shared snack
- child fixed school snack accounting status
- portion notes for husband, wife, and child
- cook-once-eat-twice notes
- leftover references

Meal titles should link to recipe cards using recipe IDs.

Mobile requirement:

- On narrow screens, render each day as a card.
- Avoid wide tables on mobile.

## 9.5 Recipes View

Render recipe cards from the selected week JSON.

Each card should show:

- title
- meal type
- servings
- active time
- total time
- equipment
- ingredients
- instructions
- portioning notes
- nutrition estimate per person
- tags
- favorite toggle

Filters:

- text search by title or ingredient
- meal type filter
- tag filter, if tags exist
- favorites filter

Favorites must be stored in `localStorage` by recipe ID.

## 9.6 Shopping List View

Render shopping list grouped by category.

Each item should show:

- checkbox
- name
- quantity
- unit
- notes
- used-in recipe references

Behavior:

- Checkbox state stored in `localStorage`.
- Storage key must include week ID to avoid mixing weeks.
- Buttons:
  - Reset all
  - Check all
  - Clear checked visually, if implemented safely
  - Print

Recommended checkbox key:

```text
shopping:{weekId}:{itemId}
```

Fallback checkbox key:

```text
shopping:{weekId}:{category}|{name}|{unit}
```

## 9.7 Validation View

Render:

1. LLM-provided validation from the weekly JSON.
2. Deterministic client-side validation computed in the browser.

LLM-provided section:

- weekly validation pass/fail
- checklist entries
- safety checks
- assumptions
- sodium-risk notes, if present

Deterministic section:

- JSON loaded successfully
- required top-level fields exist
- menu has exactly 7 days
- recipes array exists
- shopping list array exists
- recipe references exist
- at least 4 shared snacks are present
- child fixed school snack accounting field exists
- obvious banned fruit terms are absent outside explicitly ignored fields
- obvious processed-meat terms are absent outside `child_fixed_school_snack`

Statuses:

- `pass`
- `fail`
- `needs_review`

The UI must clearly distinguish deterministic validation from the LLM’s own self-check.

---

# 10. Scripts

All scripts should use Node.js and no external dependencies for the MVP.

## 10.1 `scripts/sync-weeks-index.js`

Purpose:

Scan `data/weeks/*.json`, extract metadata, and write `data/weeks/index.json`.

Usage:

```bash
node scripts/sync-weeks-index.js
```

Optional flags:

```bash
node scripts/sync-weeks-index.js --include-sample
node scripts/sync-weeks-index.js --default 2026-W19
```

Requirements:

- Ignore `index.json`.
- Ignore files beginning with `_`.
- By default, ignore `sample-week.json` unless `--include-sample` is passed.
- Parse each weekly file.
- Require `week.id`, `week.start_date`, and `week.end_date`.
- Require filename to match `week.id` for normal week files.
- Build `weeks[]` entries with:
  - `id`
  - `label`
  - `start_date`
  - `end_date`
  - `file`
  - `isCurrent`
  - `status`
- Determine `isCurrent` based on current date falling between start and end date.
- Determine `defaultWeekId` using:
  - explicit `--default`
  - current week if available
  - nearest upcoming week
  - most recent week
- Sort weeks by `start_date` descending.
- Write stable, pretty-printed JSON.
- Print a concise summary.
- Exit with code 1 if any included weekly file is invalid.

## 10.2 `scripts/validate-week.js`

Purpose:

Validate one weekly JSON file.

Usage:

```bash
node scripts/validate-week.js data/weeks/2026-W19.json
```

Checks:

- file exists
- JSON parses
- required top-level fields exist
- `week.id` exists
- `week.start_date` exists
- `week.end_date` exists
- `menu` has exactly 7 days
- every day has breakfast, lunch, dinner
- at least 4 shared snacks exist
- `recipes` is an array
- `shopping_list` is an array
- recipe IDs referenced by menu exist in recipes
- `daily_nutrition` exists
- child daily nutrition has `includes_fixed_school_snack: true` where applicable
- `safety` exists
- obvious banned fruit terms do not appear outside ignored fields
- obvious processed-meat terms do not appear outside `child_fixed_school_snack`
- no duplicate recipe IDs
- no duplicate shopping item IDs within a week file, if IDs are present

The script must print:

- PASS/FAIL summary
- errors
- warnings
- file path checked

Exit codes:

- `0` if hard validation passes
- `1` if hard validation fails

## 10.3 `scripts/validate-all-weeks.js`

Purpose:

Validate all weekly files listed in `data/weeks/index.json`.

Usage:

```bash
node scripts/validate-all-weeks.js
```

Behavior:

- Load `data/weeks/index.json`.
- Validate every listed week file with the same checks as `validate-week.js`.
- Print summary by week.
- Exit with code 1 if any week fails.

---

# 11. Deterministic Safety Terms

The validator and client-side validation should use term scanning only as a safety net.

## 11.1 Banned Fruit Terms

English:

- cherry
- cherries
- apple
- apples
- pear
- pears
- apricot
- apricots
- peach
- peaches

Lithuanian/basic variants:

- obuolys
- obuoliai
- obuolių
- kriaušė
- kriaušės
- kriaušių
- vyšnia
- vyšnios
- vyšnių
- abrikosas
- abrikosai
- abrikosų
- persikas
- persikai
- persikų

Russian/basic variants, if Russian recipe text may be used:

- яблоко
- яблоки
- яблочный
- груша
- груши
- вишня
- вишни
- абрикос
- абрикосы
- персик
- персики

## 11.2 Processed-Meat Terms

English:

- ham
- bacon
- sausage
- sausages
- salami
- hot dog
- hotdog
- deli meat
- processed meat
- smoked sausage
- smoked ham

Lithuanian/basic variants:

- kumpis
- dešra
- dešros
- dešrelė
- dešrelės
- šoninė
- saliamis

Russian/basic variants:

- ветчина
- бекон
- колбаса
- колбаски
- сосиска
- сосиски
- салями

Important:

- The processed-meat scan must ignore the object path `*.child_fixed_school_snack.*`.
- It must not ignore processed-meat terms elsewhere.

---

# 12. Prompt Files

## 12.1 `prompts/weekly-menu-generation-prompt.md`

Create a prompt file for the manager to use with ChatGPT or another LLM.

The prompt must instruct the LLM to:

- use `prompts/Family-context.md` as the binding family context
- generate one complete weekly JSON file
- output strict valid JSON only
- follow `prompts/json-schema.md`
- include week metadata
- include 7 breakfasts, 7 lunches, 7 dinners
- include shared family snacks on at least 4 days
- include recipes used that week
- include shopping list grouped by category
- include daily nutrition estimates per person
- include weekly validation checklist
- include safety checks
- include assumptions
- include sodium-risk notes
- include child fixed school snack accounting without modifying the snack

The prompt must not include the full family context. It should only reference `prompts/Family-context.md`.

## 12.2 `prompts/json-schema.md`

Create an LLM-friendly schema guide.

It should include:

- top-level JSON skeleton
- menu day object skeleton
- recipe object skeleton
- shopping-list object skeleton
- daily nutrition object skeleton
- validation object skeleton
- strict output rules
- filename convention

It should not include a full real week menu.

---

# 13. Documentation

## 13.1 `README.md`

Explain:

- what the app does
- how data loading works
- how to add a new week
- how the week dropdown is populated
- how to run validation
- how to publish via GitHub Pages
- how shopping checkbox state works
- how recipe favorites work
- that weekly JSON is generated externally by an LLM
- that `prompts/Family-context.md` is the family-specific source of truth
- that nutrition estimates are approximate and should be reviewed

## 13.2 `docs/OPERATIONS.md`

Include the exact weekly operating flow:

```bash
# 1. Save generated JSON
cp ~/Downloads/2026-W19.json data/weeks/2026-W19.json

# 2. Validate the new week
node scripts/validate-week.js data/weeks/2026-W19.json

# 3. Sync dropdown manifest
node scripts/sync-weeks-index.js

# 4. Validate all listed weeks
node scripts/validate-all-weeks.js

# 5. Commit and push
git add data/weeks/2026-W19.json data/weeks/index.json
git commit -m "Add weekly menu for 2026-W19"
git push
```

Also include troubleshooting:

- new week does not appear in dropdown
- JSON fails to parse
- recipe link is broken
- shopping checkboxes seem stale
- GitHub Pages cache delay
- wrong default week selected

## 13.3 `docs/DATA_SCHEMA.md`

Developer-facing data schema.

Should be more detailed than `prompts/json-schema.md`.

---

# 14. Frontend Implementation Rules

Claude Code must implement the frontend with maintainability in mind.

Requirements:

- centralize JSON loading in `app.js`
- centralize state management for selected week
- centralize rendering helpers
- escape generated content before injecting into HTML
- avoid unsafe `innerHTML` unless content is escaped
- show clear loading and error states
- preserve selected week across page refreshes
- make print styles usable
- support empty/missing optional fields gracefully
- never crash the whole app due to one missing optional field

Recommended state object:

```js
const state = {
  manifest: null,
  selectedWeekId: null,
  weekData: null,
  activeView: 'menu'
};
```

Required helper functions:

- `loadManifest()`
- `loadWeek(weekId)`
- `selectDefaultWeek(manifest)`
- `renderWeekSelector()`
- `renderActiveView()`
- `renderMenuView()`
- `renderRecipesView()`
- `renderShoppingView()`
- `renderValidationView()`
- `runClientValidation(weekData)`
- `escapeHtml(value)`

---

# 15. LocalStorage Requirements

## 15.1 Selected Week

Key:

```text
weekly-menu:selectedWeekId
```

## 15.2 Shopping Checkbox State

Key format:

```text
weekly-menu:shopping:{weekId}:{itemId}
```

If item ID is unavailable:

```text
weekly-menu:shopping:{weekId}:{category}|{name}|{unit}
```

## 15.3 Recipe Favorites

Key format:

```text
weekly-menu:favorites
```

Value:

```json
["recipe-id-1", "recipe-id-2"]
```

Favorites may persist across weeks if recipe IDs are reused.

---

# 16. Sample Data

Create:

```text
data/weeks/sample-week.json
```

Requirements:

- structurally valid
- small but representative
- contains 7 menu days
- contains recipes referenced by menu
- contains shopping list
- contains validation block
- contains safety block
- contains daily nutrition placeholders or approximate examples
- contains no banned fruits
- contains no processed meat in generated meals
- mentions the fixed child school snack only inside `child_fixed_school_snack`

For development convenience, also create one normal week file such as:

```text
data/weeks/2026-W19.json
```

It may duplicate sample content but must use a normal week ID and filename.

Run:

```bash
node scripts/sync-weeks-index.js --include-sample
```

for local demo data if needed.

For production, run without `--include-sample`.

---

# 17. Claude Code Operating Model

Claude Code should focus on implementation, not weekly content generation.

Dedicated agents, commands, and skills are optional for the MVP.

Do not create a complex Claude Code agent system unless the user explicitly asks for it later.

For this simplified approach, use plain scripts and docs first.

## 17.1 Optional Claude Commands

If Claude Code command files are created, keep them thin.

### `/bootstrap-app`

Create the initial static app, docs, schemas, scripts, and sample data.

### `/validate-data`

Run:

```bash
node scripts/sync-weeks-index.js
node scripts/validate-all-weeks.js
```

### `/prepare-commit`

Show changed files and suggest a commit message.

No `/generate-menu` command is required for the MVP.

---

# 18. Build Phases

## Phase 1 — Repository Bootstrap

- create repository structure
- create `index.html`
- create `styles.css`
- create `app.js`
- create `data/weeks/`
- create `prompts/`
- create `scripts/`
- create `docs/`

## Phase 2 — Data Contract and Sample Data

- create `docs/DATA_SCHEMA.md`
- create `prompts/json-schema.md`
- create `prompts/weekly-menu-generation-prompt.md`
- create `data/weeks/sample-week.json`
- create one normal example week file

## Phase 3 — Week Manifest Tooling

- implement `scripts/sync-weeks-index.js`
- generate `data/weeks/index.json`
- ensure new week files appear in the manifest
- test default week selection metadata

## Phase 4 — Validation Tooling

- implement `scripts/validate-week.js`
- implement `scripts/validate-all-weeks.js`
- include deterministic term-scan safety checks
- include recipe reference checks
- include menu completeness checks

## Phase 5 — Runtime UI

- implement manifest loading
- implement week selector
- implement selected week loading
- implement menu view
- implement recipes view
- implement shopping list view
- implement validation view

## Phase 6 — UX Hardening

- mobile layout
- print styles
- error states
- loading states
- localStorage persistence
- accessibility pass

## Phase 7 — Operations Documentation

- write `README.md`
- write `docs/OPERATIONS.md`
- document weekly JSON publishing flow
- document troubleshooting

---

# 19. Acceptance Criteria

Implementation is complete when all of the following are true.

## 19.1 App

- app loads statically from GitHub Pages
- no backend required
- no build step required
- app fetches `data/weeks/index.json`
- week dropdown is populated from the manifest
- selecting a week loads `data/weeks/{weekId}.json`
- selected week persists after refresh
- URL can represent the selected week using `?week={weekId}`
- menu view works
- recipes view works
- shopping list view works
- validation view works
- no horizontal scroll on target phones
- print styles exist for menu and shopping list

## 19.2 Weekly JSON Workflow

- manager can add `data/weeks/2026-W19.json`
- running `node scripts/sync-weeks-index.js` adds it to `data/weeks/index.json`
- after commit and push, the new week appears in the dropdown
- no app code change is required to add a new week

## 19.3 Data

- weekly JSON schema is documented
- sample data validates
- weekly JSON files validate
- broken recipe references are reported
- duplicate recipe IDs are reported
- duplicate shopping item IDs are reported when present

## 19.4 Validation

- allergy term violations are reported
- generated-menu processed meat term violations are reported
- processed meat inside `child_fixed_school_snack` is ignored by the processed-meat validator
- fixed school snack accounting is checked
- at least 4 shared snacks are checked
- validation can run for one week
- validation can run for all manifest weeks

## 19.5 UX

- shopping checkboxes persist per week
- shopping checkbox state does not leak between weeks
- recipe favorites persist
- missing optional fields render gracefully
- invalid week data shows a readable error

---

# 20. Weekly Operating Flow

The intended weekly flow is:

1. Generate next week’s JSON in ChatGPT or another LLM using:
   - `prompts/Family-context.md`
   - `prompts/weekly-menu-generation-prompt.md`
   - `prompts/json-schema.md`
2. Save the result as:

```text
data/weeks/{weekId}.json
```

Example:

```text
data/weeks/2026-W19.json
```

3. Validate the week:

```bash
node scripts/validate-week.js data/weeks/2026-W19.json
```

4. Sync the week dropdown manifest:

```bash
node scripts/sync-weeks-index.js
```

5. Validate all manifest weeks:

```bash
node scripts/validate-all-weeks.js
```

6. Commit and push:

```bash
git add data/weeks/2026-W19.json data/weeks/index.json
git commit -m "Add weekly menu for 2026-W19"
git push
```

7. Open the GitHub Pages site and select the new week from the dropdown.

---

# 21. Future Enhancements

Do not implement these in the MVP unless explicitly requested:

- GitHub Action that automatically runs `sync-weeks-index.js` on push
- GitHub Action that validates all weeks before publishing
- separate reusable recipe library
- recipe deduplication across weeks
- automatic shopping-list aggregation from recipe ingredients
- Barbora product mapping
- Lithuanian/Russian bilingual shopping names
- import/export UI
- calendar integration
- nutritional calculation engine
- LLM API integration

If GitHub Actions are added later, the preferred flow is:

- user commits only `data/weeks/{weekId}.json`
- GitHub Action runs validation
- GitHub Action regenerates `data/weeks/index.json`
- GitHub Pages publishes only if validation passes

For the MVP, keep index sync local and explicit.

---

# 22. Final Instruction to Claude Code

Implement the simplified weekly JSON publishing architecture.

Do not implement the previous deterministic generation pipeline, recipe-selection engine, Barbora catalog resolver, or Claude Code agent system unless explicitly requested later.

Prioritize:

1. static app
2. week dropdown from manifest
3. self-contained weekly JSON files
4. index sync script
5. validation scripts
6. clear documentation
7. mobile usability

The most important user story is:

> I add a new LLM-generated JSON file for next week into `data/weeks/`, run the sync script, commit and push, and the new week appears in the dropdown on the GitHub Pages app.
