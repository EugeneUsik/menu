'use strict';

/**
 * Budget scoring: which breaches fail, which only warn, and how ratio budgets behave.
 *
 * Severity comes from the threshold itself (`"severity": "warn"`), not from this code, and a
 * near-miss inside `tolerance.day_pct` never fails. Both rules matter: the warn tier is what
 * keeps uncertain measures (sodium as an ingredient-only lower bound, minerals as total
 * rather than bioavailable intake) from gating a week, and the tolerance band is what keeps
 * an estimate 2% off target from reading as an error.
 *
 * These use a synthetic analysis object rather than a week file, because the unit under test
 * is the routing, not the derivation.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { checkBudgets, DAILY_KEYS, WEEKLY_AVG_KEYS, RATIO_KEYS } = require('../scripts/lib/budgets.js');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** One-person analysis stub. `totals` may be a single object (repeated 7x) or a list. */
function stub(spec, totals, tolerance = { day_pct: 0.1, avg_pct: 0.04 }) {
  const list = Array.isArray(totals) ? totals : Array.from({ length: 7 }, () => totals);
  return {
    targets: { tolerance, daily: { husband: spec } },
    people: ['husband'],
    daily: list.map((t, i) => ({ day_name: DAYS[i], totals: { husband: t } }))
  };
}

/** Daily and weekly messages are two separate gates, so keep them apart when counting. */
const daily  = list => list.filter(m => !m.startsWith('Weekly average'));
const weekly = list => list.filter(m =>  m.startsWith('Weekly average'));

/* ── Severity ── */

test('a warn-level budget never produces an error, however large the breach', () => {
  const r = checkBudgets(stub(
    { sodium_mg: { max: 1400, severity: 'warn' } },
    { kcal: 2400, sodium_mg: 3000 }                        // +114%
  ));
  assert.equal(r.errors.length, 0);
  assert.equal(daily(r.warnings).length, 7);
  assert.equal(weekly(r.warnings).length, 1);
  assert.match(r.warnings[0], /sodium_mg/);
});

test('a hard budget breached beyond the tolerance band is an error', () => {
  const r = checkBudgets(stub({ protein_g: { max: 150 } }, { kcal: 2400, protein_g: 180 }));
  assert.equal(daily(r.errors).length, 7);                 // +20%
  assert.match(r.errors[0], /above max 150/);
});

test('a hard budget breached inside the tolerance band only warns that day', () => {
  const r = checkBudgets(stub({ protein_g: { max: 150 } }, { kcal: 2400, protein_g: 160 }));
  assert.equal(daily(r.errors).length, 0, '+6.7% is inside day_pct 0.1');
  assert.equal(daily(r.warnings).length, 7);
});

test('the tolerance band applies to minimums too', () => {
  const inBand  = checkBudgets(stub({ fiber_g: { min: 35 } }, { kcal: 2400, fiber_g: 33 }));
  const outBand = checkBudgets(stub({ fiber_g: { min: 35 } }, { kcal: 2400, fiber_g: 25 }));
  assert.equal(daily(inBand.errors).length, 0, '-5.7% is inside the band');
  assert.equal(daily(outBand.errors).length, 7, '-28.6% is not');
});

test('a day can pass on tolerance while the week still fails', () => {
  // This is the point of having two bands: day_pct 0.1 forgives a single estimate being a
  // little off, avg_pct 0.04 does not forgive being consistently off in the same direction.
  const r = checkBudgets(stub({ protein_g: { max: 150 } }, { kcal: 2400, protein_g: 160 }));
  assert.equal(daily(r.errors).length, 0);
  assert.equal(weekly(r.errors).length, 1, '160 exceeds 150 * 1.04 = 156');
  assert.match(weekly(r.errors)[0], /Weekly average husband protein_g/);
});

test('a value inside its band produces neither an error nor a warning', () => {
  const r = checkBudgets(stub(
    { kcal: { min: 2400, max: 2500 }, protein_g: { min: 130, max: 150 } },
    { kcal: 2450, protein_g: 140 }
  ));
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 0);
});

/* ── Ratio budgets ── */

test('a ratio budget measures a share of that day\'s energy', () => {
  // 100 g fat at 9 kcal/g is 900 kcal of a 2000 kcal day = 45%, well over a 30% ceiling.
  const r = checkBudgets(stub({ fat_pct_energy: { max: 0.30 } }, { kcal: 2000, fat_g: 100 }));
  assert.equal(r.errors.length, 7);
  assert.match(r.errors[0], /fat is 45% of energy, above max 30%/);
});

test('a ratio budget is scale-free', () => {
  // The point of expressing the child's protein guard as a share: it does not move when the
  // energy band moves. Doubling the day must not change the verdict.
  const small = checkBudgets(stub({ fat_pct_energy: { max: 0.30 } }, { kcal: 2000, fat_g: 100 }));
  const large = checkBudgets(stub({ fat_pct_energy: { max: 0.30 } }, { kcal: 4000, fat_g: 200 }));
  assert.equal(small.errors.length, large.errors.length);
  assert.match(large.errors[0], /45% of energy/);
});

test('a ratio budget with a minimum catches too low a share', () => {
  const r = checkBudgets(stub({ fat_pct_energy: { min: 0.30 } }, { kcal: 2000, fat_g: 40 }));
  assert.equal(r.errors.length, 7);                        // 18% against a 30% floor
  assert.match(r.errors[0], /below min 30%/);
});

test('a ratio budget is skipped when the day has no energy', () => {
  // Guards against a divide-by-zero turning into NaN comparisons that quietly never fire.
  const r = checkBudgets(stub({ fat_pct_energy: { max: 0.30 } }, { kcal: 0, fat_g: 10 }));
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 0);
});

/* ── Weekly averages ── */

test('the weekly average uses the tighter avg_pct band', () => {
  // Every day 2% under the floor: inside day_pct 0.1, outside avg_pct 0.04.
  const r = checkBudgets(stub({ fiber_g: { min: 35 } }, { kcal: 2400, fiber_g: 33 }));
  const weekly = r.errors.filter(e => e.startsWith('Weekly average'));
  assert.equal(weekly.length, 1);
  assert.match(weekly[0], /Weekly average husband fiber_g/);
});

test('a warn-level budget does not error at the weekly level either', () => {
  const r = checkBudgets(stub({ calcium_mg: { min: 1000, severity: 'warn' } }, { kcal: 2400, calcium_mg: 500 }));
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.some(w => w.startsWith('Weekly average')));
});

test('weekly notes record the average and flag the warn tier', () => {
  const r = checkBudgets(stub(
    { kcal: { min: 2400, max: 2500 }, iron_mg: { min: 18, severity: 'warn' } },
    { kcal: 2450, iron_mg: 20 }
  ));
  assert.ok(r.notes.some(n => n.includes('avg husband kcal: 2450')));
  assert.ok(r.notes.some(n => n.includes('iron_mg') && n.includes('[warn-level]')));
});

test('the weekly average is a mean, not a per-day check', () => {
  // Six compliant days and one very high day must average out, not fail seven times.
  const days = [{ kcal: 2450 }, { kcal: 2450 }, { kcal: 2450 }, { kcal: 2450 },
                { kcal: 2450 }, { kcal: 2450 }, { kcal: 2450 }];
  const r = checkBudgets(stub({ kcal: { min: 2400, max: 2500 } }, days));
  assert.equal(r.errors.length, 0);
});

/* ── Robustness ── */

test('budgets with no threshold defined are skipped', () => {
  const r = checkBudgets(stub({}, { kcal: 2450 }));
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.notes.length, 0);
});

test('a nutrient absent from the totals is skipped rather than read as zero', () => {
  // Treating "not computed" as 0 would fail every minimum for a nutrient the catalog
  // does not yet carry.
  const r = checkBudgets(stub({ sterol_g: { min: 2 } }, { kcal: 2400 }));
  assert.equal(r.errors.filter(e => !e.startsWith('Weekly average')).length, 0);
});

test('the key lists stay in step with the units table', () => {
  // A DAILY_KEYS entry with no unit renders as a bare "1234" in the message.
  const { UNITS } = require('../scripts/lib/budgets.js');
  for (const k of DAILY_KEYS) assert.ok(UNITS[k], `no unit defined for ${k}`);
  for (const k of WEEKLY_AVG_KEYS) assert.ok(DAILY_KEYS.includes(k), `${k} is weekly-only`);
  for (const k of Object.keys(RATIO_KEYS)) assert.ok(!DAILY_KEYS.includes(k), `${k} is in both lists`);
});

test('every budget key in targets.json is actually scored', () => {
  // The failure this guards: targets.json 1.1 added eight budgets, and a hardcoded key list
  // in the validators would have ignored every one of them in silence.
  const targets = require('../scripts/lib/analyze.js').loadTargets();
  const scored  = new Set([...DAILY_KEYS, ...Object.keys(RATIO_KEYS)]);
  for (const person of targets.people) {
    for (const key of Object.keys(targets.daily[person])) {
      if (key.startsWith('_')) continue;
      assert.ok(scored.has(key),
        `targets.daily.${person}.${key} is defined but no budget check reads it`);
    }
  }
});
