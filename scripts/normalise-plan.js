#!/usr/bin/env node
'use strict';

/**
 * Fill in everything about a plan that is mechanically derivable, so generation does not have
 * to assert it.
 *
 * ── What this removes from the model's job ────────────────────────────────────────────
 *
 * Given only `week.id` and the menu's recipe_id placement, all of the following are pure
 * arithmetic and were previously written by hand and then checked afterwards:
 *
 *   week.start_date / end_date   ISO-8601 week → Monday and Sunday
 *   week.label                   the Russian display string, incl. cross-month spans
 *   week.timezone                always Europe/Vilnius
 *   menu[].day_name              Monday…Sunday by position
 *   menu[].date                  start_date + index
 *   menu[].includes_fixed_school_lunch   true Mon–Fri, false Sat–Sun
 *   recipes[].serves             the derived eater count for the slots it fills
 *
 * `serves` is the one that matters most. It is checked by validate-plan.js,
 * compute-nutrition.js and validate-week.js, and a mismatch is a hard failure in all three,
 * because generate-shopping-list.js sums each recipe's quantities exactly once — so a wrong
 * `serves` silently over- or under-buys. Deriving it from the menu makes the whole class of
 * error impossible rather than merely detected. It is the same reasoning as computing
 * nutrition instead of authoring it.
 *
 * Idempotent: running it twice changes nothing the second time.
 *
 * Usage
 *   node scripts/normalise-plan.js data/weeks/2026-W36-plan.json
 *   node scripts/normalise-plan.js data/weeks/2026-W36-plan.json --check   # report, don't write
 */

const fs   = require('fs');
const path = require('path');
const { analyze, loadTargets, eatersFor, ALL_SLOTS } = require('./lib/analyze.js');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Genitive, because the label reads "24–30 августа". */
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                   'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const DAY_MS = 86400000;

/**
 * Monday of an ISO-8601 week. January 4th is always in week 1, which is the definition that
 * makes this work across year boundaries — counting from January 1st does not.
 */
function isoWeekMonday(year, week) {
  const jan4    = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;                    // Mon=1 … Sun=7
  const week1   = Date.UTC(year, 0, 4 - (jan4Dow - 1));
  return new Date(week1 + (week - 1) * 7 * DAY_MS);
}

const iso = d => d.toISOString().slice(0, 10);

/** "2026 W35 · 24–30 августа", or "2026 W27 · 29 июня – 5 июля" across a month boundary. */
function weekLabel(id, monday, sunday) {
  const [year, wk] = id.split('-');
  const d1 = monday.getUTCDate(), m1 = monday.getUTCMonth();
  const d2 = sunday.getUTCDate(), m2 = sunday.getUTCMonth();
  const span = m1 === m2
    ? `${d1}–${d2} ${MONTHS_RU[m1]}`
    : `${d1} ${MONTHS_RU[m1]} – ${d2} ${MONTHS_RU[m2]}`;
  return `${year} ${wk} · ${span}`;
}

/**
 * @returns {{plan: object, changes: string[], errors: string[]}}
 */
function normalisePlan(plan) {
  const changes = [], errors = [];

  const id = plan.week?.id;
  if (!id || !/^\d{4}-W\d{2}$/.test(id)) {
    errors.push(`week.id must be present and formatted YYYY-Www, found ${JSON.stringify(id)}`);
    return { plan, changes, errors };
  }
  if (!Array.isArray(plan.menu) || plan.menu.length !== 7) {
    errors.push(`menu must be an array of exactly 7 days, found ${Array.isArray(plan.menu) ? plan.menu.length : typeof plan.menu}`);
    return { plan, changes, errors };
  }

  const [yearStr, wkStr] = id.split('-W');
  const monday = isoWeekMonday(Number(yearStr), Number(wkStr));
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);

  const set = (obj, key, value, where) => {
    if (obj[key] === value) return;
    changes.push(`${where}.${key}: ${JSON.stringify(obj[key])} → ${JSON.stringify(value)}`);
    obj[key] = value;
  };

  // ── week metadata ───────────────────────────────────────────────────────────
  set(plan.week, 'start_date', iso(monday), 'week');
  set(plan.week, 'end_date',   iso(sunday), 'week');
  set(plan.week, 'label',      weekLabel(id, monday, sunday), 'week');
  set(plan.week, 'timezone',   'Europe/Vilnius', 'week');
  if (!plan.language) set(plan, 'language', 'ru', '');
  if (!plan.schema_version) set(plan, 'schema_version', '1.0', '');

  // ── day scaffolding ─────────────────────────────────────────────────────────
  plan.menu.forEach((day, i) => {
    set(day, 'day_name', DAY_NAMES[i], `menu[${i}]`);
    set(day, 'date', iso(new Date(monday.getTime() + i * DAY_MS)), `menu[${i}]`);
    // Mon–Fri are school days; the child is out for lunch, which is what makes a weekday
    // lunch a two-person meal.
    set(day, 'includes_fixed_school_lunch', i < 5, `menu[${i}]`);
  });

  // ── serves, from who actually eats each slot ─────────────────────────────────
  const targets = loadTargets();
  const uses = new Map();
  plan.menu.forEach((day, i) => {
    for (const slot of ALL_SLOTS) {
      const rid = day[slot]?.recipe_id;
      if (!rid) continue;
      if (!uses.has(rid)) uses.set(rid, 0);
      uses.set(rid, uses.get(rid) + eatersFor(slot, day, targets).length);
    }
  });

  for (const recipe of (plan.recipes || [])) {
    const derived = uses.get(recipe.id);
    if (derived == null) continue;                 // unreferenced; validate-plan warns about it
    set(recipe, 'serves', derived, `recipes[${recipe.id}]`);
  }

  return { plan, changes, errors };
}

function main(argv) {
  const args     = argv.slice(2);
  const planPath = args.find(a => !a.startsWith('--'));
  const check    = args.includes('--check');

  if (!planPath) {
    console.error('Usage: node normalise-plan.js <plan.json> [--check]');
    return 1;
  }
  const resolved = path.resolve(planPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    return 1;
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    console.error(`[FAIL] JSON parse error: ${err.message}`);
    return 1;
  }

  const { changes, errors } = normalisePlan(plan);

  if (errors.length) {
    errors.forEach(e => console.error(`[FAIL] ${e}`));
    return 1;
  }

  if (!changes.length) {
    console.log(`${path.basename(resolved)} already normalised — nothing to derive.`);
    return 0;
  }

  changes.forEach(c => console.log(`  ${c}`));
  if (check) {
    console.log(`\n[CHECK] ${changes.length} field(s) would be set. Nothing written.`);
    return 0;
  }

  fs.writeFileSync(resolved, JSON.stringify(plan, null, 2) + '\n', 'utf8');
  console.log(`\nDerived ${changes.length} field(s) in ${path.basename(resolved)}.`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { normalisePlan, isoWeekMonday, weekLabel };
