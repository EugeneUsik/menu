# Weekly Menu — Scope and Non-Goals

What this project is, what it deliberately is not, and what must not be added to it.

For anything else, read:

| For | Read |
|---|---|
| The data contract | [DATA_SCHEMA.md](DATA_SCHEMA.md) |
| How to publish a week | [OPERATIONS.md](OPERATIONS.md) |
| Architecture and conventions | [../CLAUDE.md](../CLAUDE.md) |
| The family's targets and the reasoning | [../prompts/Family-context.md](../prompts/Family-context.md) |
| The enforced numbers | [../data/targets.json](../data/targets.json) |

The original 1,400-line implementation specification is kept at
[history/SPEC-v1.md](history/SPEC-v1.md). It is a record of intent from before the project was
built and describes an app that no longer exists in several respects — a validation view, recipe
favourites, a `prompts/json-schema.md`, LLM-authored nutrition, single-pass generation with
self-review. Do not use it as a reference; this page carries forward the parts that still hold.

---

## In scope

A static, JSON-driven site on GitHub Pages that **reads** published week files.

- Week dropdown populated from `data/weeks/index.json`
- Menu view: the 7-day grid, plus per-day nutrition totals scored against `data/targets.json`
- Recipe view: ingredients, instructions, per-person nutrition, text and meal-type filters
- Shopping list view: checkbox state in `localStorage`, week-scoped
- Print-friendly output for whichever view is active
- Usable on a phone first — that is where it is actually read

Generation happens **outside the app**: the prompts are run against an LLM by a human or the
`/generate-menu` skill, and the scripts in `scripts/` then validate, compute and publish.

---

## Out of scope — do not add

**Runtime**

- LLM API calls from the app, or any backend, database, accounts or auth
- Browser-side editing of menus, recipes or shopping lists
- A service worker or offline mode
- A build step, bundler or frontend framework

The app is plain HTML, CSS and one `app.js`. It stays that way because the whole value is in the
data and the validators, and every dependency added here is a dependency that has to be
maintained for a family menu.

**Data and pipeline**

- A second copy of the schema, the thresholds, or the ingredient vocabulary. There is exactly
  one home for each: `DATA_SCHEMA.md`, `data/targets.json`, `data/foods.json`. `prompts/json-schema.md`
  existed once, drifted, and was deleted.
- Hand-authored nutrition. Every per-person and per-day figure is computed from ingredient
  quantities. See CLAUDE.md.
- LLM self-verification of any rule a script can check. If you want to add a checklist item to a
  prompt, add a check to `validate-plan.js` instead.
- A separate canonical recipe library, a substitution engine, or product-catalog normalisation
  (Barbora mapping and the like).

**Note on one reversal.** The original spec listed "automatic nutrition calculation" and a
"nutritional calculation engine" as out of scope. Both are now core, and the reason is on the
record: hand-written numbers were 15–20% off and drifting, and the child's protein ran ~75% over
target for seven published weeks without anyone noticing. Computing it was the fix. The rest of
the original non-goals list still stands.

---

## Deliberately not automated

- **`sync-weeks-index.js` and `derive-history.js` are run locally and committed.** CI regenerates
  both and fails on a diff, which catches a stale artifact without giving a workflow write access
  to the repository. Keeping the write local is why the manifest carries nothing date-derived —
  see the comment at the top of `sync-weeks-index.js`.
- **Publishing is a human `git push`.** There is no auto-deploy on generation.

---

## Open items that are not code problems

These are recorded because a reader keeps rediscovering them. None can be fixed by editing this
repository.

- **The school lunch is an estimate, not a measurement** (`targets.json` → `fixed_school_lunch`,
  `assumed: true`). It is ~45% of the child's sodium budget and the whole of his midday intake.
  Family-context.md §5.3 calls measuring it the highest-value open item; it needs the school.
- **Baseline measurements are largely missing**, so several targets in the private context are
  asserted rather than stratified against a reference. §1.1 lists what is outstanding.
- **No feedback signal exists.** Every energy target rests on a predicted requirement with
  ±10–15% error and nothing reconciles it against an outcome. §1.1 asks for the band to be driven
  by measured trend instead; that mechanism does not exist yet.
