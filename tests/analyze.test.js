'use strict';

/**
 * The eater model and the per-person split.
 *
 * This is the arithmetic that failed silently for seven published weeks: the child's protein
 * ran ~75% over target because nothing derived who actually eats which slot. The child has
 * lunch at school Monday–Friday, so a weekday lunch feeds TWO people, and a Mon–Thu dinner
 * carrying into next-day lunch is FIVE portions, not six.
 *
 * Expectations are computed from the real data/targets.json portion weights (1.15 / 0.75 /
 * 1.1, summing to 3.0) rather than hardcoded, except where an exact figure is the point.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../scripts/lib/analyze.js');
const F = require('../scripts/lib/foods.js');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const targets = A.loadTargets();
const W = targets.portion_weights;

/** A 7-day week: Mon–Fri are school days. `place(dayIndex, slot, recipeId)` fills slots. */
function week(recipes, placements) {
  const menu = DAYS.map((day_name, i) => ({
    day_name,
    date: `2026-08-${String(24 + i).padStart(2, '0')}`,
    includes_fixed_school_lunch: i < 5
  }));
  for (const [dayIndex, slot, recipe_id] of placements) {
    menu[dayIndex][slot] = { title: `${slot} ${dayIndex}`, recipe_id };
  }
  return { schema_version: '2.1', week: { id: '2026-W35' }, menu, recipes };
}

const recipe = (id, ingredients, serves) => ({ id, title: id, serves, ingredients });
const ing = (name, quantity, extra = {}) => ({ name, quantity, unit: 'g', ...extra });

/* ── Who eats what ── */

test('a weekday lunch feeds two people; a weekend lunch feeds three', () => {
  const w = week([], []);
  assert.deepEqual(A.eatersFor('lunch', w.menu[0], targets), ['husband', 'wife']);   // Monday
  assert.deepEqual(A.eatersFor('lunch', w.menu[5], targets), targets.people);        // Saturday
});

test('breakfast, dinner and the shared snack always feed all three', () => {
  const w = week([], []);
  for (const slot of ['breakfast', 'dinner', 'shared_snack']) {
    for (const day of [w.menu[0], w.menu[5]]) {
      assert.deepEqual(A.eatersFor(slot, day, targets), targets.people, `${slot}`);
    }
  }
});

/* ── Portion counts ── */

test('a Mon-Thu dinner carrying into next-day lunch is 5 portions, not 6', () => {
  const w = week([recipe('r', [ing('грудка куриная', 490)], 5)],
                 [[2, 'dinner', 'r'], [3, 'lunch', 'r']]);       // Wed dinner -> Thu lunch
  const facts = A.analyze(w).recipeFacts.get('r');
  assert.equal(facts.expectedServes, 5);
  assert.deepEqual(facts.occasions.map(o => o.eaters.length), [3, 2]);
});

test('a Fri dinner carrying into Sat lunch is 6 portions', () => {
  const w = week([recipe('r', [ing('грудка куриная', 490)], 6)],
                 [[4, 'dinner', 'r'], [5, 'lunch', 'r']]);       // Fri dinner -> Sat lunch
  assert.equal(A.analyze(w).recipeFacts.get('r').expectedServes, 6);
});

test('a weekday lunch on its own is 2 portions', () => {
  const w = week([recipe('r', [ing('грудка куриная', 200)], 2)], [[1, 'lunch', 'r']]);
  assert.equal(A.analyze(w).recipeFacts.get('r').expectedServes, 2);
});

/* ── The per-person split ── */

test('an untagged ingredient is split by portion weight over every occasion', () => {
  // 490 g chicken breast at 120 kcal/100 g = 588 kcal. Demand over a dinner (3 eaters) plus
  // a school-day lunch (2) is 3.0 + 1.9 = 4.9 weight, so one weight unit is 120 kcal.
  const w = week([recipe('r', [ing('грудка куриная', 490)], 5)],
                 [[2, 'dinner', 'r'], [3, 'lunch', 'r']]);
  const pp = A.analyze(w).recipeFacts.get('r').perPerson;

  const demand = (W.husband + W.wife + W.child) + (W.husband + W.wife);
  assert.equal(demand, 4.9);
  assert.equal(Math.round(pp.husband.kcal * 10) / 10, 138);   // 120 * 1.15
  assert.equal(Math.round(pp.wife.kcal    * 10) / 10, 90);    // 120 * 0.75
  assert.equal(Math.round(pp.child.kcal   * 10) / 10, 132);   // 120 * 1.10
});

test('an ingredient tagged for one person goes entirely to them', () => {
  // 30 g walnuts at 654 kcal/100 g = 196.2 kcal, all the wife's, spread over the two
  // occasions she attends -> 98.1 kcal per serving. The others get none of it.
  const w = week([recipe('r', [ing('грудка куриная', 490), ing('орехи грецкие', 30, { for: 'wife' })], 5)],
                 [[2, 'dinner', 'r'], [3, 'lunch', 'r']]);
  const pp = A.analyze(w).recipeFacts.get('r').perPerson;

  assert.equal(Math.round(pp.wife.kcal * 10) / 10, Math.round((90 + 196.2 / 2) * 10) / 10);
  assert.equal(Math.round(pp.husband.kcal * 10) / 10, 138, 'husband must not get the wife\'s walnuts');
  assert.equal(Math.round(pp.child.kcal   * 10) / 10, 132, 'child must not get the wife\'s walnuts');
});

test('a recipe absent from the menu falls back to serves/3 occasions', () => {
  const w = week([recipe('orphan', [ing('грудка куриная', 300)], 3)], []);
  const facts = A.analyze(w).recipeFacts.get('orphan');
  assert.equal(facts.occasions.length, 0);
  assert.ok(facts.perPerson.husband.kcal > 0, 'an unreferenced recipe still gets numbers');
});

/* ── Daily totals ── */

test('a school-day lunch adds nothing to the child\'s day', () => {
  const w = week([recipe('lunch-only', [ing('грудка куриная', 200)], 2)], [[1, 'lunch', 'lunch-only']]);
  const day = A.analyze(w).daily[1];
  const lunchKcal = A.analyze(w).recipeFacts.get('lunch-only').perPerson.child.kcal;

  assert.ok(lunchKcal > 0, 'the recipe does have a child-share figure...');
  // ...but the child is at school, so the day must not include it. Only the external
  // school-lunch estimate should appear.
  const external = targets.fixed_school_lunch.kcal_estimate;
  assert.equal(Math.round(day.totals.child.kcal), external);
});

test('a weekend lunch does count for the child', () => {
  const w = week([recipe('sat-lunch', [ing('грудка куриная', 300)], 3)], [[5, 'lunch', 'sat-lunch']]);
  const day = A.analyze(w).daily[5];
  assert.ok(day.totals.child.kcal > 0);
  assert.equal(day.schoolLunch, false);
});

test('the external school lunch is added on school days only', () => {
  const w = week([], []);
  const daily = A.analyze(w).daily;
  const external = targets.fixed_school_lunch.kcal_estimate;
  for (let i = 0; i < 5; i++) {
    assert.equal(Math.round(daily[i].totals.child.kcal), external, `${DAYS[i]}`);
  }
  for (const i of [5, 6]) {
    assert.equal(daily[i].totals.child.kcal, 0, `${DAYS[i]} must have no school lunch`);
  }
});

/* ── Problem reporting ── */

test('an unresolvable ingredient is reported, not silently skipped', () => {
  const w = week([recipe('r', [ing('драконий фрукт', 100)], 3)], [[0, 'dinner', 'r']]);
  const problems = A.analyze(w).problems;
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unknown ingredient/);
});

test('a menu slot pointing at a missing recipe is reported', () => {
  const w = week([], [[0, 'dinner', 'nope']]);
  assert.match(A.analyze(w).problems.join('\n'), /not found in recipes/);
});
