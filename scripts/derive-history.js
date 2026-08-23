#!/usr/bin/env node
'use strict';

/**
 * Build data/weeks/recent-history.json — a small summary of what the last few weeks used.
 *
 * Cross-week variety previously had no mechanism at all: the generation skill forbids
 * reading existing week files (to keep input cheap), so nothing stopped a dinner from
 * repeating week after week. W25 and W26 shared 4 of 26 slots including the same salmon
 * dinner. This file is small enough to feed into generation, and validate-plan.js reads
 * it to reject protein/starch pairings reused too recently.
 *
 * ── Why it reads the archive too ───────────────────────────────────────────────────────
 *
 * Published weeks are retired into data/weeks/archive/ to keep the live manifest to what is
 * actually current. History is the one thing a retired week is still good for, so both
 * directories are scanned. Scanning only the live one would silently empty this file and
 * quietly disable the cross-week check — the failure mode it was built to fix.
 *
 * Archived weeks are schema 2.0 and some use ingredient names that predate the catalog.
 * That is fine here: nothing in this summary depends on the eater model or on nutrition.
 * It reads titles, the headline protein and grain, and the declared base/snack_format.
 *
 * Usage
 *   node scripts/derive-history.js              # newest 6 weeks
 *   node scripts/derive-history.js --weeks 10
 */

const fs   = require('fs');
const path = require('path');
const { analyze, loadTargets } = require('./lib/analyze.js');

const WEEKS_DIR   = path.join(__dirname, '..', 'data', 'weeks');
const ARCHIVE_DIR = path.join(WEEKS_DIR, 'archive');
const OUT_PATH    = path.join(WEEKS_DIR, 'recent-history.json');

const WEEK_FILE_RE = /^\d{4}-W\d{2}\.json$/;

/** Calibration is only meaningful from a week whose `serves` is trustworthy, i.e. 2.1+. */
const MIN_SCHEMA_FOR_CALIBRATION = 2.1;

/**
 * Six by default, not the three that validate-plan.js enforces: the extra weeks are context
 * for whoever is writing the next plan, while the check itself slices to
 * targets.history.lookback_weeks. The docstring, the default and CLAUDE.md previously
 * disagreed with each other (6 / 4 / 8).
 */
const DEFAULT_WEEKS = 6;

/** Every week file across the live and archive directories, newest first. */
function weekFiles() {
  const out = [];
  for (const dir of [WEEKS_DIR, ARCHIVE_DIR]) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;                                  // the archive need not exist
    }
    for (const name of names) {
      if (WEEK_FILE_RE.test(name)) out.push({ id: name.replace(/\.json$/, ''), file: path.join(dir, name) });
    }
  }
  // Descending by week id, which sorts chronologically because the format is YYYY-Www.
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

function summarise(data) {
  const A = analyze(data);
  return { partial: A.problems.length, summary: buildSummary(data, A), analysis: A };
}

function buildSummary(data, A) {
  const dinnerIds = [...new Set(data.menu.map(d => d.dinner?.recipe_id).filter(Boolean))];
  const pairings  = [];
  const proteins  = new Set();
  const grains    = new Set();

  for (const id of dinnerIds) {
    const f = A.recipeFacts.get(id);
    if (!f) continue;
    if (f.proteinItem) proteins.add(f.proteinItem);
    if (f.grainBase)   grains.add(f.grainBase);
    if (f.proteinItem && f.grainBase) pairings.push(`${f.proteinItem}+${f.grainBase}`);
  }

  const bases = new Set();
  const snackFormats = new Set();
  for (const day of data.menu) {
    const b = A.recipeFacts.get(day.breakfast?.recipe_id)?.recipe.base;
    if (b) bases.add(b);
    const s = A.recipeFacts.get(day.shared_snack?.recipe_id)?.recipe.snack_format;
    if (s) snackFormats.add(s);
  }

  return {
    id: data.week.id,
    start_date: data.week.start_date,
    dinner_titles:    data.menu.map(d => d.dinner?.title).filter(Boolean),
    dinner_pairings:  [...new Set(pairings)],
    dinner_proteins:  [...proteins],
    grain_bases:      [...grains],
    breakfast_bases:  [...bases],
    snack_formats:    [...snackFormats]
  };
}

/**
 * Observed recipe scale from the newest 2.1 week, so the next plan starts at roughly the right
 * size instead of being derived from first principles.
 *
 * This exists because deriving portions from the portion-weight arithmetic by hand landed the
 * first attempt at W35 about 20% under target on energy — breakfasts were estimated at 1240 kcal
 * against an actual 2018 — and cost two extra validation rounds to walk back. The figures below
 * are TOTAL recipe kcal across every ingredient row, `for:`-tagged rows included, because that
 * is the number a plan actually writes. Forgetting that the tagged rows count is precisely how
 * the first estimate went wrong.
 *
 * Grouped by slot AND serves: a breakfast, a dinner and a snack all have serves 3 and differ
 * by a factor of two, so serves alone is not a scale.
 */
function calibration(data, A) {
  const groups = new Map();
  for (const facts of A.recipeFacts.values()) {
    if (!facts.occasions.length) continue;
    const slots = [...new Set(facts.occasions.map(o => o.slot))].sort().join('+');
    const key   = `${slots} (serves ${facts.expectedServes})`;
    const kcal  = facts.rows.reduce((sum, r) => sum + r.nut.kcal, 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(Math.round(kcal));
  }

  const recipe_total_kcal = {};
  for (const [key, list] of [...groups].sort()) {
    list.sort((a, b) => a - b);
    recipe_total_kcal[key] = {
      median: list[Math.floor(list.length / 2)],
      min: list[0],
      max: list[list.length - 1],
      n: list.length
    };
  }

  // The `for:`-tagged rows are load-bearing and easy to omit: a shared ingredient gives the
  // child 1.1/3.0 and the wife 0.75/3.0, so anything with a per-person target has to be tagged.
  // Recording what a passing week actually used saves rediscovering the quantities.
  const seen = new Map();
  for (const r of (data.recipes || [])) {
    for (const ing of (r.ingredients || [])) {
      if (!ing.for) continue;
      const key = `${ing.for}|${ing.name}|${ing.quantity}|${ing.unit}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  const tagged_rows = [...seen.entries()]
    .map(([key, recipes]) => {
      const [forWhom, name, quantity, unit] = key.split('|');
      return { for: forWhom, name, quantity: Number(quantity), unit, recipes };
    })
    .sort((a, b) => b.recipes - a.recipes || a.for.localeCompare(b.for));

  return { source_week: data.week.id, recipe_total_kcal, tagged_rows };
}

function main(argv) {
  const args  = argv.slice(2);
  const nIdx  = args.indexOf('--weeks');
  let limit   = DEFAULT_WEEKS;
  if (nIdx !== -1) {
    const raw = Number(args[nIdx + 1]);
    if (!Number.isInteger(raw) || raw < 1) {
      // Silently falling back turned a typo into a quietly shorter history.
      console.error(`--weeks needs a positive integer, got "${args[nIdx + 1]}"`);
      return 1;
    }
    limit = raw;
  }

  const files = weekFiles().slice(0, limit);
  const weeks = [];
  let portion_calibration = null;

  for (const { id, file } of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(`[WARN] skipping ${id}: ${err.message}`);
      continue;
    }
    const { partial, summary, analysis } = summarise(data);
    if (partial) console.warn(`[WARN] ${id}: ${partial} ingredient(s) unresolved — summary may be partial`);
    weeks.push(summary);

    // Newest 2.1 week wins: files are walked newest-first, so the first match is the freshest.
    if (!portion_calibration && parseFloat(data.schema_version) >= MIN_SCHEMA_FOR_CALIBRATION) {
      portion_calibration = calibration(data, analysis);
    }
  }

  const out = {
    schema_version: '1.1',
    _comment: 'Auto-generated by scripts/derive-history.js — do not hand-edit. Newest week first. Covers data/weeks/ and data/weeks/archive/.',
    portion_calibration,
    weeks
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');

  const lookback = loadTargets().history?.lookback_weeks;
  console.log(`Wrote ${weeks.length} week summary/ies to ${path.relative(process.cwd(), OUT_PATH)} ` +
              `(${fs.statSync(OUT_PATH).size} bytes; validate-plan.js enforces against the newest ${lookback})`);
  weeks.forEach(w => console.log(`  ${w.id}: ${w.dinner_pairings.length} dinner pairing(s), bases [${w.breakfast_bases.join(', ') || '—'}]`));
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { weekFiles, buildSummary, calibration, DEFAULT_WEEKS };
