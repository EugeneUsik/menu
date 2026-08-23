'use strict';

/**
 * Regression tests for the banned-term scanner.
 *
 * Every "missed" case below was a real miss: the scanner required a word boundary on BOTH
 * sides of a whole word-form, so no inflected form could ever match. Russian and Lithuanian
 * ingredient lines are overwhelmingly inflected — "100 г груш" (genitive plural) is the
 * normal way to write a quantity — so the guard leaked in the commonest phrasing.
 *
 * The must-not-match cases are the false positives that constrain the fix: `pearl-barley` is
 * a live catalog key that appears in published shopping item IDs, and "помидоры черри" is a
 * tomato, not a cherry.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../scripts/lib/scan.js');

/* ── Inflected forms that used to slip through ── */

const MUST_MATCH_FRUIT = [
  // Russian genitive plural — the commonest form in an ingredient line
  ['200 г яблок',          'apple, genitive plural'],
  ['100 г груш',           'pear, genitive plural'],
  ['300 г персиков',       'peach, genitive plural'],
  ['компот из абрикосов',  'apricot, genitive plural'],
  ['150 г вишен',          'sour cherry, genitive plural'],
  // Russian adjectival forms
  ['сок яблочный',         'apple, adjective'],
  ['грушевый сироп',       'pear, adjective'],
  ['персиковый джем',      'peach, adjective'],
  ['вишнёвое варенье',     'sour cherry, adjective'],
  // Other cases
  ['яблоками посыпать',    'apple, instrumental plural'],
  ['пюре из груш',         'pear in a phrase'],
  // Sweet cherry — a distinct word that was absent from the list entirely
  ['черешня 200 г',        'sweet cherry, nominative'],
  ['варенье из черешни',   'sweet cherry, genitive'],
  // Nominative singular/plural must still work
  ['200 г яблоко',         'apple, nominative'],
  ['вишня',                'sour cherry, nominative'],
  // Lithuanian
  ['obuolių tyrė',         'apple, Lithuanian genitive plural'],
  ['kriaušių',             'pear, Lithuanian genitive plural'],
  ['trešnės',              'sweet cherry, Lithuanian'],
  ['vyšnių sultys',        'sour cherry, Lithuanian genitive plural'],
  ['abrikosų džemas',      'apricot, Lithuanian genitive plural'],
  // English
  ['apple cider vinegar',  'apple, English'],
  ['dried apricots',       'apricot, English plural']
];

const MUST_NOT_MATCH_FRUIT = [
  ['pearl-barley',        'catalog key — "pear" must stay whole-word or this breaks W21'],
  ['pearl barley',        'the same as an alias'],
  ['Pearl barley',        'and as a shopping display name'],
  ['помидоры черри',      'cherry tomato is a tomato, not a cherry'],
  ['tomato-cocktail',     'the catalog key for the same food'],
  ['крупа перловая',      'pearl barley in Russian'],
  ['картофель',           'ordinary vegetable'],
  ['брокколи',            'ordinary vegetable'],
  ['чернослив',           'prunes — not on the exclusion list'],
  ['persimmon',           'unrelated fruit that starts like "persik"']
];

test('banned fruit: inflected and adjectival forms are caught', () => {
  for (const [text, why] of MUST_MATCH_FRUIT) {
    assert.ok(S.findBannedFruit(text), `expected a hit for ${JSON.stringify(text)} (${why})`);
  }
});

test('banned fruit: legitimate lookalikes are not flagged', () => {
  for (const [text, why] of MUST_NOT_MATCH_FRUIT) {
    assert.equal(S.findBannedFruit(text), null,
      `expected no hit for ${JSON.stringify(text)} (${why})`);
  }
});

/* ── Word-boundary mechanics ── */

test('containsTerm checks every occurrence, not just the first', () => {
  // The first occurrence is glued to a letter; a later one is clean. The old single-indexOf
  // implementation returned false here.
  assert.ok(S.containsTerm('грушевидный груша', 'груша'));
  assert.ok(S.containsTerm('applesauce and an apple', 'apple'));
});

test('containsTerm requires a boundary on both sides', () => {
  assert.ok(!S.containsTerm('pearl', 'pear'));
  assert.ok(!S.containsTerm('grapple', 'apple'));
  assert.ok(S.containsTerm('an apple, please', 'apple'));
});

test('containsStem requires a boundary only on the left', () => {
  assert.ok(S.containsStem('яблоками', 'яблок'));
  assert.ok(S.containsStem('груш', 'груш'));
  assert.ok(!S.containsStem('виноградяблок', 'яблок'), 'glued on the left must not match');
});

test('word boundaries work for Cyrillic and Lithuanian diacritics', () => {
  // \b would fail both of these, which is why the boundary check is manual.
  assert.ok(S.containsTerm('вишня спелая', 'вишня'));
  assert.ok(S.containsTerm('vyšnios sultys', 'vyšnios'));
  assert.ok(!S.containsTerm('авишня', 'вишня'));
});

/* ── Processed meat ── */

test('processed meat is caught in EN, LT and RU', () => {
  for (const text of ['smoked ham', 'dešra', 'колбаса варёная', 'бекон', 'saliamis']) {
    assert.ok(S.findProcessedMeat(text), `expected a hit for ${JSON.stringify(text)}`);
  }
});

test('processed meat scan skips the external school lunch, under either schema name', () => {
  const lunch21 = { fixed_school_lunch: { description: 'Суп, котлета, хлеб, иногда колбаса' } };
  const lunch20 = { fixed_school_snack: { description: 'Тортилья с ветчиной' } };
  assert.deepEqual(S.scanSafety(lunch21), [], 'schema 2.1 field must be skipped');
  assert.deepEqual(S.scanSafety(lunch20), [], 'schema 2.0 field must still be skipped');
});

test('processed meat is rejected everywhere other than the school lunch', () => {
  const week = { recipes: [{ ingredients: [{ name: 'колбаса' }] }] };
  assert.equal(S.scanSafety(week).length, 1);
  assert.match(S.scanSafety(week)[0], /Processed meat/);
});

/* ── Whole-object scan ── */

test('scanSafety reports the path of a hit', () => {
  const week = { recipes: [{ id: 'r1', ingredients: [{ name: '100 г груш' }] }] };
  const hits = S.scanSafety(week);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /recipes\.0\.ingredients\.0\.name/);
});

test('scanSafety skips administrative fields', () => {
  // META_SKIP exists so an admin field describing the exclusion list does not trip the scan.
  const data = { safety: { notes: ['No cherries, apples, pears, apricots or peaches'] } };
  assert.deepEqual(S.scanSafety(data), []);
});

test('scanSafety walks arrays and nested objects', () => {
  const data = { menu: [{ dinner: { title: 'Пирог с яблоками' } }] };
  assert.equal(S.scanSafety(data).length, 1);
});
