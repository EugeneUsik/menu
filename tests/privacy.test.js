'use strict';

/**
 * This repository is public and publishes to GitHub Pages. The household's biomarkers,
 * anthropometrics and a minor's growth data live in `prompts/Family-context.md`, which is
 * deliberately untracked (see prompts/README.md).
 *
 * "Don't commit health data" as a note in a README is a convention, and conventions drift. This
 * makes it a red build instead. It is also the check that would have caught a real mistake: the
 * daily-totals strip was added by making app.js fetch `data/targets.json`, whose per-person
 * `_comment` fields opened with the household's weight, height, age and sex — turning
 * repo-readable data into data served over HTTP by the site.
 *
 * Scope is `git ls-files`, so an untracked local file is invisible here by construction. That is
 * the point: the boundary being tested is "what git would publish", not "what is on disk".
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');

/**
 * Patterns are deliberately specific rather than broad. `\d+ cm` on its own would match the
 * cooking instructions ("нарезать кубиками 2 см") that legitimately fill the week files, and a
 * check that cries wolf gets deleted. Each entry below targets a shape that only occurs when a
 * person is being described.
 */
const FORBIDDEN = [
  { label: 'weight + height together', re: /\b\d{2,3}\s?kg,\s?\d{2,3}\s?cm/i },
  { label: 'age/sex + weight',         re: /\b\d{2}[MF],\s?\d{2,3}\s?kg/i },
  { label: 'blood concentration',      re: /\b\d+([.,]\d+)?\s?(mmol|nmol|pmol)\s?\/\s?L/i },
  { label: 'HbA1c',                    re: /\bHbA1c\b/i },
  { label: 'Tanner stage',             re: /\bTanner\b/i },
  { label: 'BMI-for-age percentile',   re: /\b(BMI[- ]for[- ]age|\d{1,3}(st|nd|rd|th) percentile)\b/i },
  { label: 'ferritin',                 re: /\bferritin\b/i },
  // Requires a decimal, so a lipid *reading* trips it while the food category does not: the
  // catalog legitimately talks about "LDL nuts ≥5 days", and a check that flags that gets deleted.
  { label: 'named lipid value',        re: /\b(LDL|HDL|total cholesterol|triglycerides)\b[^.\n]{0,12}\d+[.,]\d/i }
];

/**
 * This file is the one exemption, because a pattern list necessarily contains its own patterns:
 * `HbA1c`, `Tanner` and `ferritin` appear above as detection terms. Kept as narrow as possible —
 * one path, not a directory — and the docstring deliberately describes the values it once caught
 * rather than quoting them.
 *
 * Worth recording how this was found: the check passed while its own file was still untracked, so
 * `git ls-files` did not return it and the self-match was invisible. It failed the moment it was
 * committed. A git-aware check has to be tested from a committed state.
 */
const SELF = 'tests/privacy.test.js';

/** Text files git would publish. Binary and generated week data are included on purpose. */
function trackedTextFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter(f => f !== SELF)
    .filter(f => /\.(md|json|js|yml|yaml|html|css|txt)$/i.test(f));
}

test('no tracked file carries biomarkers or anthropometrics', () => {
  const findings = [];
  for (const file of trackedTextFiles()) {
    let text;
    try {
      text = fs.readFileSync(path.join(REPO, file), 'utf8');
    } catch {
      continue;                                   // deleted-but-staged, or unreadable
    }
    for (const { label, re } of FORBIDDEN) {
      const m = text.match(re);
      if (m) findings.push(`${file}: ${label} — ${JSON.stringify(m[0])}`);
    }
  }
  assert.deepEqual(findings, [],
    'health data must not be committed; keep it in the untracked prompts/Family-context.md ' +
    '(see prompts/README.md)\n  ' + findings.join('\n  '));
});

test('Family-context.md is untracked and gitignored', () => {
  // Both halves matter: absent from the index, and actively ignored so `git add -A` cannot
  // silently put it back.
  const tracked = execFileSync('git', ['ls-files', 'prompts/Family-context.md'],
    { cwd: REPO, encoding: 'utf8' }).trim();
  assert.equal(tracked, '', 'prompts/Family-context.md must not be tracked');

  let ignored = '';
  try {
    ignored = execFileSync('git', ['check-ignore', 'prompts/Family-context.md'],
      { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    // check-ignore exits 1 when the path is not ignored
  }
  assert.equal(ignored, 'prompts/Family-context.md',
    'prompts/Family-context.md must be listed in .gitignore');
});

test('the pipeline does not depend on the untracked context', () => {
  // A clone without Family-context.md must still validate, compute and publish — only generation
  // needs it. CI proves this on every push by running the whole suite on a fresh clone; this
  // localises the failure so it names the offending file instead of erroring somewhere downstream.
  //
  // `git grep` exits 1 when nothing matches, which is the passing case, so the throw is expected.
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-lE', 'Family-context[^ ]*\\.md', '--', 'scripts/', 'app.js'],
      { cwd: REPO, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    if (err.status !== 1) throw err;              // 1 = no matches; anything else is a real error
  }
  assert.equal(hits, '',
    `no script or the app may reference the untracked context by filename; found: ${hits}`);
});

test('the app fetches only files that are safe to publish', () => {
  // app.js runs on a public site, so everything it fetches is world-readable by design.
  const app = fs.readFileSync(path.join(REPO, 'app.js'), 'utf8');
  const fetched = [...app.matchAll(/fetch\(['`]([^'`$]*)/g)].map(m => m[1]);
  const allowed = ['data/weeks/index.json', 'data/targets.json', 'data/weeks/'];
  for (const url of fetched) {
    assert.ok(allowed.some(a => url.startsWith(a)),
      `app.js fetches ${url}, which is not on the reviewed-as-public list`);
  }
});
