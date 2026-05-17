# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Local dev — fetch() needs HTTP, do not open index.html from filesystem
python3 -m http.server 8080

# Rebuild data/weeks/index.json from the week files on disk
node scripts/sync-weeks-index.js
node scripts/sync-weeks-index.js --include-sample      # include sample-week.json (dev only)
node scripts/sync-weeks-index.js --default 2026-W20    # force default week

# Validate one week file (exit 1 on failure)
node scripts/validate-week.js data/weeks/2026-W20.json

# Validate every week listed in the manifest (CI runs this)
node scripts/validate-all-weeks.js
```

Scripts are vanilla Node ≥16, no dependencies, no build step. There is no test runner.

## Architecture

### Publishing model

This is a **static, JSON-driven** site on GitHub Pages. The app is read-only — it never calls an LLM, has no backend, and has no build step. Menu generation happens **externally**: a human runs the prompts in `prompts/` against an LLM, saves the JSON into `data/weeks/{weekId}.json`, syncs the manifest, validates, commits, pushes. See [docs/OPERATIONS.md](docs/OPERATIONS.md) for the exact flow.

Do not add: LLM API calls, backend, build tooling, frameworks, browser-side editing, or cross-file recipe libraries. The spec ([docs/SPEC.md](docs/SPEC.md) §4.2, §21) lists these as explicitly out of scope for the MVP.

### Data flow

```
data/weeks/{id}.json  →  sync-weeks-index.js  →  data/weeks/index.json  →  app.js fetches both
```

- Each `data/weeks/{weekId}.json` is **self-contained** (week metadata, menu, recipes, shopping list, daily nutrition). No cross-file recipe reuse in MVP.
- `data/weeks/index.json` is **auto-generated** — never hand-edit it. CI also regenerates it on push.
- The frontend cannot list directories (static hosting), so the manifest is the only way it discovers weeks.

### Invariants enforced by tooling

- `week.id` inside the JSON **must equal the filename without `.json`** ([scripts/sync-weeks-index.js:67](scripts/sync-weeks-index.js#L67)). Renaming a file requires updating `week.id` and vice versa.
- Filename format: `YYYY-Www.json` (ISO 8601 week).
- `menu` has exactly 7 days; each day has breakfast/lunch/dinner with non-empty titles; `shared_snack` appears on ≥4 days.
- Every recipe needs **≥2 non-empty instruction steps** — placeholders fail validation ([scripts/validate-week.js:179](scripts/validate-week.js#L179)).
- `daily_nutrition` has 7 entries; child entries should have `includes_fixed_school_snack` (warning, not failure, if missing).

### Schema 2.0 (current)

`fixed_school_snack` is defined **once at the top level** of the week JSON, not per day. Each `menu[]` day instead carries `includes_fixed_school_snack: boolean` (true Mon–Fri, false Sat–Sun). See [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) for the full contract. Older files may still contain legacy `weekly_validation`/`safety`/`assumptions` blocks — these are tolerated but no longer required.

### Deterministic safety scanner

[scripts/validate-week.js](scripts/validate-week.js) recursively scans all string values for banned fruit terms and processed-meat terms (EN/LT/RU variants). Two important exclusion rules:

- `META_SKIP` keys (`schema_version`, `weekly_validation`, `safety`, `assumptions`, `household_context_version`, `language`) are skipped entirely so admin/summary fields don't trip the scan.
- The processed-meat scan **additionally** skips `fixed_school_snack` — the child's external school snack legitimately contains ham, but processed meat is rejected everywhere else.

`containsTerm()` uses manual Unicode-aware word boundaries (not `\b`) because `\b` does not work for Cyrillic or Lithuanian diacritics. Preserve this when adding new terms.

### Frontend ([app.js](app.js))

Single global `state` object: `{ manifest, selectedWeekId, weekData, activeView, recipeFilters }`. Three hash-routed views: `#menu`, `#recipes`, `#shopping`.

Week selection priority (`selectDefaultWeek` in [app.js:76](app.js#L76)): `?week=` URL param → `localStorage` → manifest `defaultWeekId` → `isCurrent` week → nearest upcoming → first entry.

LocalStorage key conventions:
- Selected week: `weekly-menu:selectedWeekId`
- Shopping checkbox: `weekly-menu:shopping:{weekId}:{itemId}` — week-scoped so state never leaks between weeks. The `{itemId}` falls back to `{name-slug}|{unit}` when the JSON omits an `id`.

All user-facing strings go through `escapeHtml()` before `innerHTML` injection. Maintain this — recipe/menu content comes from external LLM output.

## CI

[.github/workflows/validate.yml](.github/workflows/validate.yml) runs `sync-weeks-index.js` then `validate-all-weeks.js` on every push/PR that touches `data/weeks/**.json` or the validate scripts. A failing week blocks the merge.

## Don't touch without intent

- `prompts/Family-context.md` — binding family-specific source of truth for LLM generation. Not for app code to duplicate.
- `data/weeks/sample-week.json` — test fixture. Excluded from production manifest by default. Never commit an `index.json` that was generated with `--include-sample`.
