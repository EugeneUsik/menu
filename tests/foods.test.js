'use strict';

/**
 * Unit conversion and name resolution.
 *
 * These run against the real data/foods.json rather than a fixture: the catalog IS the
 * contract, and a test that mocks it would not have caught the failures this file guards.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const F = require('../scripts/lib/foods.js');

const food = key => {
  const f = F.loadCatalog().byKey.get(key);
  assert.ok(f, `catalog is missing "${key}" — update this test if the key was renamed`);
  return f;
};

/* ── Mass and volume ── */

test('grams pass through, in either alphabet', () => {
  const oats = food('oats');
  assert.equal(F.toGrams(oats, 60, 'g').grams, 60);
  assert.equal(F.toGrams(oats, 60, 'г').grams, 60);
  assert.equal(F.toGrams(oats, 1, 'kg').grams, 1000);
});

test('millilitres use the food density, defaulting to 1.0', () => {
  // Olive oil is 0.92, so 100 ml is 92 g. Getting this wrong overstates oil energy by ~9%.
  assert.equal(F.toGrams(food('olive-oil'), 100, 'ml').grams, 92);
  assert.equal(F.toGrams(food('olive-oil'), 1, 'l').grams, 920);
  // milk-2 declares no density, so the 1.0 fallback applies.
  assert.equal(F.toGrams(food('milk-2'), 250, 'ml').grams, 250);
  assert.equal(F.toGrams(food('milk-2'), 250, 'мл').grams, 250);
});

/* ── Countables ── */

test('pieces use the g_per table', () => {
  assert.equal(F.toGrams(food('egg'), 3, 'pcs').grams, 150);   // 50 g each
});

test('singular and plural unit spellings both resolve', () => {
  const garlic = food('garlic');
  for (const unit of ['clove', 'cloves', 'pcs']) {
    assert.equal(F.toGrams(garlic, 2, unit).grams, 6, `unit "${unit}"`);
  }
});

test('size words scale a piece rather than failing', () => {
  // Legacy files say "2 medium onions". small/medium/large are 0.7/1.0/1.35 of a piece.
  const egg = food('egg');
  assert.equal(F.toGrams(egg, 2, 'medium').grams, 100);
  assert.equal(F.toGrams(egg, 2, 'large').grams, 135);
  assert.equal(F.toGrams(egg, 2, 'small').grams, 70);
});

test('an unconvertible unit reports an error instead of guessing', () => {
  // Silently assuming a number would put a wrong figure into published nutrition.
  const out = F.toGrams(food('oats'), 2, 'cups');
  assert.ok(out.error, 'expected an error for an unknown unit');
  assert.equal(out.grams, undefined);
  assert.match(out.error, /cups/);
});

test('a non-numeric quantity reports an error', () => {
  assert.ok(F.toGrams(food('oats'), 'по вкусу', 'g').error);
});

test('a missing quantity errors rather than converting to 0 g', () => {
  // Number(null) and Number('') are both 0, and 0 is finite, so these used to pass the
  // isFinite guard and drop the ingredient from nutrition and the shopping list in silence.
  for (const q of [null, undefined, '', '   ']) {
    const out = F.toGrams(food('oats'), q, 'g');
    assert.ok(out.error, `expected an error for quantity ${JSON.stringify(q)}, got ${JSON.stringify(out)}`);
  }
});

test('a negative quantity errors', () => {
  assert.ok(F.toGrams(food('oats'), -50, 'g').error);
});

/* ── Nutrition scaling ── */

test('nutritionFor scales per-100 g figures linearly', () => {
  const chicken = food('chicken-breast');            // 120 kcal, 23 g protein per 100 g
  const n = F.nutritionFor(chicken, 250);
  assert.equal(Math.round(n.kcal), 300);
  assert.equal(Math.round(n.protein_g * 10) / 10, 57.5);
});

test('veg_fruit_g counts a vegetable\'s own weight and excludes starchy staples', () => {
  // Potato carries vegetable_starchy WITHOUT vegetable, because no 5-a-day scheme counts it.
  assert.equal(F.nutritionFor(food('broccoli'), 200).veg_fruit_g, 200);
  assert.equal(F.nutritionFor(food('potato'), 200).veg_fruit_g, 0);
});

test('EMPTY covers every key nutritionFor produces', () => {
  // A key present in one and missing from the other silently drops that nutrient from
  // every total, which is exactly how the school-lunch block lost seven of them.
  const produced = Object.keys(F.nutritionFor(food('broccoli'), 100)).sort();
  const empty    = Object.keys(F.EMPTY()).sort();
  assert.deepEqual(produced, empty);
});

test('addInto accumulates and scales', () => {
  const acc = F.EMPTY();
  F.addInto(acc, { kcal: 100, protein_g: 10 });
  F.addInto(acc, { kcal: 100, protein_g: 10 }, 0.5);
  assert.equal(acc.kcal, 150);
  assert.equal(acc.protein_g, 15);
});

/* ── Name resolution ── */

test('word order does not matter', () => {
  // LLM output drifts between "оливковое масло" and "масло оливковое". Both are explicit
  // aliases here, so this is the cheap path; the wordset fallback is covered below.
  assert.equal(F.resolve('масло оливковое').food.key, 'olive-oil');
  assert.equal(F.resolve('оливковое масло').food.key, 'olive-oil');
});

test('wordSetKey is order-insensitive', () => {
  assert.equal(F.wordSetKey('филе лосося'), F.wordSetKey('лосося филе'));
  assert.notEqual(F.wordSetKey('филе лосося'), F.wordSetKey('филе форели'));
});

test('resolution reports how it matched, so canonical spellings can win over time', () => {
  // compute-nutrition.js warns on a wordset match to nudge the catalog spelling into use,
  // so the distinction has to survive.
  assert.equal(F.resolve('филе лосося').match, 'exact');
  assert.equal(F.resolve('лосося филе').match, 'wordset');
  assert.equal(F.resolve('лосося филе').food.key, 'salmon');
});

test('ё and е are interchangeable', () => {
  assert.ok(F.resolve(F.loadCatalog().byKey.get('walnuts').name_ru));
  assert.equal(F.normalise('грецкие орёхи'), F.normalise('грецкие орехи'));
});

test('an unknown ingredient resolves to null rather than a wrong food', () => {
  assert.equal(F.resolve('драконий фрукт'), null);
});

test('every catalog name and alias round-trips to its own food', () => {
  // Guards the alias table against a name being claimed by two foods.
  for (const f of F.loadCatalog().foods) {
    for (const name of [f.name_ru, ...(f.aliases || [])]) {
      const r = F.resolve(name);
      assert.ok(r, `"${name}" (${f.key}) does not resolve`);
      assert.equal(r.food.key, f.key, `"${name}" resolves to ${r.food.key}, not ${f.key}`);
    }
  }
});
