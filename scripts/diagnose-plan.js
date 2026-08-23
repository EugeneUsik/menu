#!/usr/bin/env node
'use strict';

/**
 * Explain a plan's budget misses in terms of the edit that closes them.
 *
 * `validate-plan.js` is the gate. It reports that a budget is missed and by what percentage,
 * which is enough to know a week is wrong and not enough to know what to change — because
 * every figure it prints is a PER-PERSON share of a recipe total, and the share depends on
 * who eats that slot. Closing a 316 kcal gap in the husband's Monday is either ~316 kcal of
 * `for: "husband"` rows or ~825 kcal on the breakfast recipe total, and nothing in the gate's
 * output distinguishes those.
 *
 * Working that out by hand is the failure mode the two-stage design exists to remove. It is
 * the same portion-weight arithmetic that `prompts/weekly-menu-generation-prompt.md` forbids
 * for sizing portions, for the same reasons: slow, and wrong in a way that costs whole
 * validation rounds. The W36 plan lost a full round to it — the husband ran ~400 kcal short on
 * all seven days because his `for: "husband"` carbohydrate row had been dropped, and the gate
 * could only say "kcal below min" seven times.
 *
 * So it is derived. Read-only, and never a gate: `validate-plan.js` alone decides what passes.
 *
 * Usage
 *   node scripts/diagnose-plan.js data/weeks/2026-W36-plan.json
 *   node scripts/diagnose-plan.js data/weeks/2026-W36-plan.json --warn      # warn-level too
 *   node scripts/diagnose-plan.js data/weeks/2026-W36-plan.json --person wife
 *   node scripts/diagnose-plan.js data/weeks/2026-W36-plan.json --json
 */

const fs   = require('fs');
const path = require('path');
const { analyze, ALL_SLOTS } = require('./lib/analyze.js');
const { DAILY_KEYS, WEEKLY_AVG_KEYS, RATIO_KEYS, UNITS } = require('./lib/budgets.js');
const { recipeSlotKey } = require('./derive-history.js');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'weeks', 'recent-history.json');

const r0 = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
const signed = n => `${n > 0 ? '+' : ''}${r0(n)}`;
const pctOf = n => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`;

/**
 * The share of a recipe's UNTAGGED rows that one person receives per occasion.
 *
 * This is the number that makes the gate's output hard to act on. It is not 1/serves: a
 * dinner carrying into next-day school lunch has a weight demand of 4.9, so the husband gets
 * 1.15/4.9 = 23% of it on the dinner day and another 23% on the lunch day.
 */
function sharedShare(facts, person, weights) {
  const demand = facts.occasions.reduce(
    (sum, o) => sum + o.eaters.reduce((a, e) => a + (weights[e] || 0), 0), 0);
  return demand > 0 ? (weights[person] || 0) / demand : 0;
}

/** Occasions of this recipe the person is actually present for — the tagged-row divisor. */
function occasionsAttended(facts, person) {
  return facts.occasions.filter(o => o.eaters.includes(person)).length;
}

function sumRows(rows, key) {
  return rows.reduce((sum, r) => sum + (r.nut[key] || 0), 0);
}

function loadCalibration() {
  if (!fs.existsSync(HISTORY_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')).portion_calibration || null;
  } catch {
    return null;
  }
}

/**
 * Where each recipe sits against the last passing week's totals for the same slot and serves.
 *
 * Seeding from these medians is Step 4 of the generation flow, so a recipe well outside its
 * band is the earliest and cheapest signal that a plan is mis-scaled — visible before any
 * per-day budget is consulted.
 */
function calibrationReport(recipeFacts, cal) {
  const out = [];
  for (const [id, facts] of recipeFacts) {
    if (!facts.occasions.length) continue;
    const key    = recipeSlotKey(facts);
    const total  = r0(sumRows(facts.rows, 'kcal'));
    const band   = cal?.recipe_total_kcal?.[key] || null;
    const median = band?.median ?? null;
    out.push({
      id, key, total, median,
      offPct: median ? (total - median) / median : null
    });
  }
  return out.sort((a, b) => Math.abs(b.offPct ?? 0) - Math.abs(a.offPct ?? 0));
}

/**
 * For one breached absolute budget, what each slot contributes and what would close the gap.
 *
 * `delta` is signed: positive means the person needs more of the nutrient, negative less.
 * Two routes out, per slot:
 *   sharedDelta  — change the recipe total; everyone eating it moves.
 *   taggedDelta  — change a `for: "<person>"` row; only they move. Multiplied by the occasions
 *                  they attend, because a tagged row is divided across them.
 */
function slotBreakdown(day, person, key, delta, recipeFacts, targets) {
  const weights = targets.portion_weights;
  const rows = [];

  for (const slot of ALL_SLOTS) {
    const id = day.day[slot]?.recipe_id;
    if (!id) continue;
    const facts  = recipeFacts.get(id);
    const eaters = day.bySlot[slot]?._eaters || [];
    if (!facts || !eaters.includes(person)) continue;

    const share     = sharedShare(facts, person, weights);
    const attended  = occasionsAttended(facts, person);
    const untagged  = facts.rows.filter(r => !r.for);
    const mine      = facts.rows.filter(r => r.for === person);

    rows.push({
      slot,
      recipeId:     id,
      contribution: facts.perPerson[person][key] || 0,
      share,
      occasions:    facts.occasions.length,
      attended,
      recipeShared: sumRows(untagged, key),
      recipeTagged: sumRows(mine, key),
      sharedDelta:  share > 0 ? delta / share : null,
      taggedDelta:  attended > 0 ? delta * attended : null
    });
  }

  // The external school meal is not editable, but hiding it makes the child's day look
  // 620 kcal lighter than it is and invites over-correcting at home.
  if (day.bySlot.school_lunch && person === 'child') {
    rows.push({
      slot: 'school_lunch', recipeId: '(external estimate)',
      contribution: day.bySlot.school_lunch.child[key] || 0,
      share: null, occasions: 1, attended: 1,
      recipeShared: null, recipeTagged: null, sharedDelta: null, taggedDelta: null
    });
  }

  return rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

function diagnose(plan) {
  const A = analyze(plan);
  if (A.problems.length) {
    return { problems: A.problems, calibration: [], daily: [], ratios: [], weekly: [] };
  }

  const { targets, people, recipeFacts, daily } = A;
  const tol = targets.tolerance;
  const cal = loadCalibration();

  const out = {
    problems:    [],
    calibration: calibrationReport(recipeFacts, cal),
    calibrationSource: cal?.source_week || null,
    daily:       [],
    ratios:      [],
    weekly:      []
  };

  for (const d of daily) {
    for (const person of people) {
      const t = targets.daily[person];
      const v = d.totals[person];
      if (!t) continue;

      for (const key of DAILY_KEYS) {
        const spec = t[key];
        if (!spec) continue;
        const actual = v[key];
        if (actual == null) continue;

        let delta = null, bound = null, off = null;
        if (spec.min != null && actual < spec.min) {
          delta = spec.min - actual; bound = 'min'; off = (actual - spec.min) / spec.min;
        } else if (spec.max != null && actual > spec.max) {
          delta = spec.max - actual; bound = 'max'; off = (actual - spec.max) / spec.max;
        }
        if (delta == null) continue;

        // Same routing as lib/budgets.js: warn-level specs and near-misses do not block.
        const severity = (spec.severity === 'warn' || Math.abs(off) <= tol.day_pct)
          ? 'warn' : 'fail';

        out.daily.push({
          day: d.day_name, person, key, unit: UNITS[key] || '',
          actual, target: { min: spec.min ?? null, max: spec.max ?? null },
          bound, delta, off, severity,
          slots: slotBreakdown(d, person, key, delta, recipeFacts, targets)
        });
      }

      // Ratio budgets have two exits — move the nutrient, or move total energy — and which
      // one is right is a judgement the gate cannot make for you. Report both magnitudes.
      for (const [key, cfg] of Object.entries(RATIO_KEYS)) {
        const spec = t[key];
        if (!spec || !(v.kcal > 0)) continue;
        const share = (v[cfg.field] * cfg.kcalPerG) / v.kcal;

        let bound = null, off = null, limit = null;
        if (spec.min != null && share < spec.min) { bound = 'min'; limit = spec.min; off = (share - spec.min) / spec.min; }
        else if (spec.max != null && share > spec.max) { bound = 'max'; limit = spec.max; off = (share - spec.max) / spec.max; }
        if (bound == null) continue;

        out.ratios.push({
          day: d.day_name, person, key, label: cfg.label,
          share, limit, off,
          severity: (spec.severity === 'warn' || Math.abs(off) <= tol.day_pct) ? 'warn' : 'fail',
          gramDelta: (limit * v.kcal / cfg.kcalPerG) - v[cfg.field],
          kcalDelta: (v[cfg.field] * cfg.kcalPerG / limit) - v.kcal,
          field: cfg.field, kcal: v.kcal, grams: v[cfg.field]
        });
      }
    }
  }

  // Weekly averages bind tighter than any single day, so a week can pass every day and still
  // fail here. Listing the per-day values says whether to fix one day or all seven.
  for (const person of people) {
    const t = targets.daily[person];
    if (!t) continue;
    for (const key of WEEKLY_AVG_KEYS) {
      const spec = t[key];
      if (!spec) continue;
      const values = daily.map(d => ({ day: d.day_name, value: d.totals[person][key] || 0 }));
      const avg = values.reduce((s, x) => s + x.value, 0) / values.length;

      let delta = null, bound = null;
      if (spec.min != null && avg < spec.min * (1 - tol.avg_pct)) { delta = spec.min - avg; bound = 'min'; }
      else if (spec.max != null && avg > spec.max * (1 + tol.avg_pct)) { delta = spec.max - avg; bound = 'max'; }
      if (delta == null) continue;

      out.weekly.push({
        person, key, unit: UNITS[key] || '', avg, bound, delta,
        target: { min: spec.min ?? null, max: spec.max ?? null },
        severity: spec.severity === 'warn' ? 'warn' : 'fail',
        perDay: values.sort((a, b) => (bound === 'min' ? a.value - b.value : b.value - a.value))
      });
    }
  }

  return out;
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────── */

function report(res, opts) {
  const keep = e => opts.warn || e.severity === 'fail';
  const person = e => !opts.person || e.person === opts.person;
  const show = e => keep(e) && person(e);

  if (res.problems.length) {
    res.problems.forEach(p => console.error(`[ERROR] ${p}`));
    return;
  }

  const off = res.calibration.filter(c => c.offPct != null && Math.abs(c.offPct) > 0.15);
  console.log(`Recipe totals vs calibration${res.calibrationSource ? ` (${res.calibrationSource})` : ''}:`);
  if (!res.calibration.some(c => c.median != null)) {
    console.log('  · no calibration available — run scripts/derive-history.js');
  } else if (!off.length) {
    console.log('  · every recipe within 15% of its slot median');
  } else {
    for (const c of off) {
      console.log(`  · ${c.id.padEnd(34)} ${c.key.padEnd(24)} ${String(c.total).padStart(5)} kcal ` +
                  `vs median ${c.median} (${pctOf(c.offPct)})`);
    }
  }

  const days = res.daily.filter(show);
  if (days.length) {
    console.log('\nPer-day budgets:');
    for (const e of days) {
      const tgt = e.bound === 'min' ? `min ${e.target.min}` : `max ${e.target.max}`;
      console.log(`\n[${e.severity.toUpperCase()}] ${e.day} ${e.person} ${e.key} ` +
                  `${r1(e.actual)}${e.unit} vs ${tgt}${e.unit} (${pctOf(e.off)}) → needs ${signed(e.delta)}${e.unit}`);
      for (const s of e.slots) {
        const shareTxt = s.share == null ? '   —  ' : s.share.toFixed(3);
        console.log(`    ${s.slot.padEnd(13)} ${s.recipeId.padEnd(32)} ` +
                    `${String(r1(s.contribution)).padStart(7)}${e.unit}  share ${shareTxt}`);
      }
      const viaShared = e.slots.filter(s => s.sharedDelta != null)
        .map(s => `${s.slot} ${signed(s.sharedDelta)}`).join(' | ');
      const viaTagged = e.slots.filter(s => s.taggedDelta != null)
        .map(s => `${s.slot} ${signed(s.taggedDelta)}${s.attended > 1 ? ` (×${s.attended} days)` : ''}`).join(' | ');
      if (viaShared) console.log(`    → via recipe total (moves all eaters): ${viaShared}`);
      if (viaTagged) console.log(`    → via for:"${e.person}" rows (moves only them): ${viaTagged}`);
    }
  }

  const ratios = res.ratios.filter(show);
  if (ratios.length) {
    console.log('\nEnergy-share budgets:');
    for (const e of ratios) {
      console.log(`\n[${e.severity.toUpperCase()}] ${e.day} ${e.person} ${e.label} is ` +
                  `${Math.round(e.share * 100)}% of energy vs ${e.bound} ${Math.round(e.limit * 100)}% (${pctOf(e.off)})`);
      console.log(`    → ${signed(e.gramDelta)} g ${e.label} at ${r0(e.kcal)} kcal, ` +
                  `or ${signed(e.kcalDelta)} kcal from other macros at ${r1(e.grams)} g ${e.label}`);
    }
  }

  const weekly = res.weekly.filter(show);
  if (weekly.length) {
    console.log('\nWeekly averages:');
    for (const e of weekly) {
      const tgt = e.bound === 'min' ? `min ${e.target.min}` : `max ${e.target.max}`;
      console.log(`\n[${e.severity.toUpperCase()}] ${e.person} ${e.key} avg ${r1(e.avg)}${e.unit} ` +
                  `vs ${tgt}${e.unit} → needs ${signed(e.delta)}${e.unit}/day`);
      console.log(`    worst days: ${e.perDay.slice(0, 3).map(x => `${x.day} ${r1(x.value)}`).join(', ')}`);
    }
  }

  if (!days.length && !ratios.length && !weekly.length) {
    console.log(`\nNo ${opts.warn ? '' : 'blocking '}budget breaches.` +
                (opts.warn ? '' : ' Add --warn to see warn-level diagnostics.'));
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const opts = {
    warn:   args.includes('--warn'),
    person: (() => {
      const i = args.indexOf('--person');
      return i >= 0 ? args[i + 1] : null;
    })()
  };

  if (!file) {
    console.error('Usage: node diagnose-plan.js <plan-or-week.json> [--warn] [--person NAME] [--json]');
    process.exit(1);
  }
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    console.error(`JSON parse error: ${err.message}`);
    process.exit(1);
  }

  const res = diagnose(data);
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else report(res, opts);

  // Always exits 0 on a readable file: this is a diagnostic, and a non-zero exit here would
  // make it look like a second gate that CI or a caller should be honouring.
  process.exit(res.problems.length ? 1 : 0);
}

module.exports = { diagnose, sharedShare, occasionsAttended };
