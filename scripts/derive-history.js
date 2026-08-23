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
  if (A.problems.length) {
    return { partial: A.problems.length, summary: buildSummary(data, A) };
  }
  return { partial: 0, summary: buildSummary(data, A) };
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

  for (const { id, file } of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(`[WARN] skipping ${id}: ${err.message}`);
      continue;
    }
    const { partial, summary } = summarise(data);
    if (partial) console.warn(`[WARN] ${id}: ${partial} ingredient(s) unresolved — summary may be partial`);
    weeks.push(summary);
  }

  const out = {
    schema_version: '1.0',
    _comment: 'Auto-generated by scripts/derive-history.js — do not hand-edit. Newest week first. Covers data/weeks/ and data/weeks/archive/.',
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

module.exports = { weekFiles, buildSummary, DEFAULT_WEEKS };
