# Prompts

Two files drive menu generation. One of them is deliberately **not** in this repository.

| File | Tracked | Role |
|---|---|---|
| `weekly-menu-generation-prompt.md` | yes | How to generate: the two-stage flow, safety rules, output contract, meal-design guidance |
| `Family-context.md` | **no — untracked** | Why the numbers are what they are: the household's targets and the measurements behind them |

## Why `Family-context.md` is untracked

This repository is **public** and publishes to GitHub Pages. `Family-context.md` contains
biomarkers, anthropometrics and a minor's growth data. None of that belongs in a public repo, and
none of it is needed to run the site — the app only ever fetches `data/weeks/index.json`, the week
files, and the min/max numbers in `data/targets.json`.

So it lives on disk at `prompts/Family-context.md`, listed in `.gitignore`. The path is unchanged
from when it was tracked, which is why every reference to it across
[CLAUDE.md](../CLAUDE.md), [docs/OPERATIONS.md](../docs/OPERATIONS.md),
[docs/SPEC.md](../docs/SPEC.md), `data/targets.json` and the `/generate-menu` skill still resolves.

`tests/privacy.test.js` fails the build if biomarker or anthropometric patterns reappear in any
**tracked** file. That is the mechanism; this note is only the explanation.

## What this means in practice

**Generation needs the file.** Without it, `/generate-menu` has no household context and must not
proceed — the enforced numbers in `data/targets.json` are the *what*, and they were derived from
reasoning that lives only in this document. A plan built without it would be guessing at why any
threshold is what it is.

**Everything else works without it.** Cloning this repo and running the full check suite,
validating a week, computing nutrition, rebuilding the manifest, or serving the site all work with
the file absent. It is a generation input, not a code dependency — `tests/privacy.test.js` and the
CI run prove that on every push.

**Keep a backup.** It is six versions of accumulated reasoning and it is not in git, so nothing is
protecting it but you. A private repo, or any versioned store outside this one, is the right home.

## The pairing rule still holds

[CLAUDE.md](../CLAUDE.md) requires that a threshold changed in `data/targets.json` is changed in
`Family-context.md` too — one holds the checkable number, the other the reason. Untracking one side
means that pairing is no longer visible in a single diff, so it now depends on discipline rather
than on review. When you change a number, change both in the same sitting.
