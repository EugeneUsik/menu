'use strict';

/**
 * The two gates that stop a bad artifact reaching publication.
 *
 * 1. promote-plan.js must refuse a plan that validate-plan.js rejects. Every global
 *    constraint -- budgets, variety, cross-week history -- is checked only at the plan
 *    stage, so promoting a failing plan launders those failures into a week file where
 *    validate-week.js will never look for them again.
 *
 * 2. sync-weeks-index.js must produce byte-identical output regardless of when it runs,
 *    because CI regenerates it and diff-checks the result.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { promotePlan, buildWeek } = require('../scripts/promote-plan.js');
const { buildIndex } = require('../scripts/sync-weeks-index.js');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ── Fixtures ── */

/** A structurally valid plan. It will not satisfy the nutrition budgets, and need not. */
function plan(overrides = {}) {
  const recipes = [];
  const menu = DAYS.map((day_name, i) => {
    const slots = {};
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      const id = `${slot}-${i}`;
      const serves = (slot === 'lunch' && i < 5) ? 2 : 3;
      recipes.push({
        id, title: `${slot} ${i}`, meal_types: [slot], serves,
        active_time_min: 20, total_time_min: 25,
        ingredients: [
          { name: 'грудка куриная', quantity: 300, unit: 'g' },
          { name: 'брокколи', quantity: 200, unit: 'g' }
        ],
        ...(slot === 'breakfast' ? { base: 'eggs' } : {}),
        ...(slot === 'dinner' ? { format: 'plated' } : {})
      });
      slots[slot] = { title: `${slot} ${i}`, recipe_id: id };
    }
    return { day_name, date: `2026-08-${String(24 + i).padStart(2, '0')}`, includes_fixed_school_lunch: i < 5, ...slots };
  });
  return {
    stage: 'plan', language: 'ru',
    week: { id: '2026-W35', start_date: '2026-08-24', end_date: '2026-08-30' },
    menu, recipes, ...overrides
  };
}

function withTempPlan(planObj, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-gate-'));
  const p = path.join(dir, '2026-W35-plan.json');
  fs.writeFileSync(p, JSON.stringify(planObj, null, 2));
  try { return fn(p, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ── promote-plan gates on validate-plan ── */

test('a plan that fails validation is not promoted', () => {
  // A recipe with one ingredient is a hard failure: the plan must carry the nutritionally
  // dominant ingredients or its numbers are not real.
  const broken = plan();
  broken.recipes[0].ingredients = [{ name: 'брокколи', quantity: 200, unit: 'g' }];

  withTempPlan(broken, (p, dir) => {
    const out = promotePlan(p);
    assert.equal(out.ok, false);
    assert.match(out.reason, /does not pass validate-plan/);
    assert.ok(out.errors.length > 0);
    assert.ok(!fs.existsSync(path.join(dir, '2026-W35.json')), 'no week file may be written');
  });
});

test('--force promotes anyway and reports what it overrode', () => {
  const broken = plan();
  broken.recipes[0].ingredients = [{ name: 'брокколи', quantity: 200, unit: 'g' }];

  withTempPlan(broken, (p, dir) => {
    const out = promotePlan(p, { force: true });
    assert.equal(out.ok, true);
    assert.equal(out.overridden, true);
    assert.ok(out.errors.length > 0, 'the failures are still reported');
    assert.ok(fs.existsSync(path.join(dir, '2026-W35.json')));
  });
});

test('an existing week file is not overwritten without --force', () => {
  withTempPlan(plan(), (p, dir) => {
    fs.writeFileSync(path.join(dir, '2026-W35.json'), '{"sentinel":true}');
    const out = promotePlan(p);
    assert.equal(out.ok, false);
    assert.match(out.reason, /already exists/);
    assert.match(fs.readFileSync(path.join(dir, '2026-W35.json'), 'utf8'), /sentinel/);
  });
});

test('a missing or unparseable plan is reported, not thrown', () => {
  assert.equal(promotePlan('/nonexistent/plan.json').ok, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-gate-'));
  const p = path.join(dir, 'bad-plan.json');
  fs.writeFileSync(p, '{ not json');
  try {
    const out = promotePlan(p);
    assert.equal(out.ok, false);
    assert.match(out.reason, /parse error/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ── the promoted shape ── */

test('the skeleton carries every school-lunch estimate, not a hardcoded seven', () => {
  // The hand-written key list is how the school-lunch block came to ignore half the
  // nutrition model. Any *_estimate in the source must survive promotion.
  const week = buildWeek(plan({
    fixed_school_lunch: {
      title: 't', description: 'd', assumed: true,
      kcal_estimate: 100, protein_g_estimate: 5, unobtainium_mg_estimate: 42
    }
  }));
  assert.equal(week.fixed_school_lunch.kcal_estimate, 100);
  assert.equal(week.fixed_school_lunch.unobtainium_mg_estimate, 42,
    'an estimate the code has never heard of must still be copied through');
});

test('the skeleton leaves instructions empty and nutrition uncomputed', () => {
  const week = buildWeek(plan());
  assert.equal(week.schema_version, '2.1');
  assert.deepEqual(week.shopping_list, []);
  assert.deepEqual(week.daily_nutrition, []);
  for (const r of week.recipes) assert.deepEqual(r.instructions, []);
});

test('the skeleton does not re-decide anything the plan settled', () => {
  const p = plan();
  const week = buildWeek(p);
  assert.deepEqual(week.menu, p.menu);
  assert.deepEqual(week.recipes.map(r => r.serves), p.recipes.map(r => r.serves));
  assert.deepEqual(week.recipes.map(r => r.id), p.recipes.map(r => r.id));
});

/* ── sync-weeks-index determinism ── */

const WEEK_FILES = {
  '2026-W34.json': { week: { id: '2026-W34', start_date: '2026-08-17', end_date: '2026-08-23', label: 'W34' } },
  '2026-W35.json': { week: { id: '2026-W35', start_date: '2026-08-24', end_date: '2026-08-30', label: 'W35' } },
  '2026-W36.json': { week: { id: '2026-W36', start_date: '2026-08-31', end_date: '2026-09-06', label: 'W36' } }
};
const read = f => JSON.parse(JSON.stringify(WEEK_FILES[f]));
const files = Object.keys(WEEK_FILES);

test('the manifest contains no date-derived field', () => {
  const { index } = buildIndex(files, read);
  for (const entry of index.weeks) {
    assert.ok(!('isCurrent' in entry),
      'isCurrent made the manifest a function of the clock, so CI failed on time passing');
    assert.ok(!('generated_at' in entry));
  }
});

test('the manifest is identical however many times it is built', () => {
  const a = JSON.stringify(buildIndex(files, read).index);
  const b = JSON.stringify(buildIndex(files, read).index);
  assert.equal(a, b);
});

test('weeks are sorted newest first and defaultWeekId is the newest', () => {
  const { index } = buildIndex(files, read);
  assert.deepEqual(index.weeks.map(w => w.id), ['2026-W36', '2026-W35', '2026-W34']);
  assert.equal(index.defaultWeekId, '2026-W36');
});

test('--default pins defaultWeekId when it names a real week', () => {
  assert.equal(buildIndex(files, read, '2026-W34').index.defaultWeekId, '2026-W34');
  assert.equal(buildIndex(files, read, 'nope').index.defaultWeekId, '2026-W36',
    'an unknown --default falls back rather than pinning a missing week');
});

test('week.id must match the filename', () => {
  // The id ends up in shopping item ids and in the ?week= parameter, so a mismatch would
  // make a week unreachable from its own manifest entry.
  const bad = { '2026-W35.json': { week: { id: '2026-W99', start_date: '2026-08-24', end_date: '2026-08-30' } } };
  const { errors } = buildIndex(['2026-W35.json'], f => bad[f]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not match filename/);
});

test('a week missing required dates is an error, not a silent skip', () => {
  const bad = { '2026-W35.json': { week: { id: '2026-W35' } } };
  const { errors, index } = buildIndex(['2026-W35.json'], f => bad[f]);
  assert.equal(errors.length, 1);
  assert.equal(index.weeks.length, 0);
});

test('an empty week directory yields a null default rather than throwing', () => {
  const { index, errors } = buildIndex([], read);
  assert.equal(index.defaultWeekId, null);
  assert.deepEqual(index.weeks, []);
  assert.deepEqual(errors, []);
});
