#!/usr/bin/env node
'use strict';

/**
 * Self-test for data/foods.json.
 *
 * The catalog is now load-bearing: it supplies nutrition, shopping categories, unit
 * conversions and the canonical ingredient vocabulary. A bad entry breaks a whole week,
 * so these checks run in CI rather than being discovered during generation.
 *
 * The banned-term check exists because catalog keys end up inside shopping item ids.
 * A key like "cherry-tomato" put the substring "cherry" into every week that used it and
 * failed the allergy scanner — a real failure found only at the last step of the pipeline.
 *
 * Usage
 *   node scripts/validate-foods.js
 */

const F = require('./lib/foods.js');
const S = require('./lib/scan.js');

const errors = [], warnings = [];

const cat = F.loadCatalog();
cat.conflicts.forEach(c => errors.push(c));

const BANNED = [...S.BANNED_FRUITS, ...S.PROCESSED_MEATS];
const NUM_FIELDS = ['kcal', 'p', 'c', 'f', 'sf', 'fib', 'na', 'ca', 'fe', 'zn'];
/** Present only where non-zero; absent means zero. */
const OPTIONAL_NUM_FIELDS = ['fs', 'st', 'vf'];

/**
 * A boolean tag and its numeric field must agree, or the tag-driven variety rules and
 * the quantity-driven budgets tell different stories about the same food.
 *
 * `bidirectional` also warns on a non-zero number WITHOUT the tag. That only makes sense
 * where any amount at all is material: free sugars and sterols. The mineral and
 * viscous-fibre tags mean "notable source" and drive the priority rules, so plenty of
 * foods legitimately carry a small amount without earning the tag — tagging rye bread
 * `viscous_fiber` would dilute the tag for the wife's LDL protocol, which is its job.
 *
 * [tag, per100g field, minimum value that justifies the tag, bidirectional]
 */
const TAG_BACKING = [
  ['calcium',       'ca', 80,  false],
  ['iron',          'fe', 2,   false],
  ['zinc',          'zn', 2,   false],
  ['viscous_fiber', 'vf', 0.5, false],
  ['free_sugar',    'fs', 1,   true],
  ['sterol',        'st', 0.5, true]
];

for (const food of cat.foods) {
  const at = `food "${food.key || '(no key)'}"`;

  if (!food.key)     errors.push(`${at}: missing key`);
  if (!food.name_ru) errors.push(`${at}: missing name_ru`);
  if (!food.cat)     errors.push(`${at}: missing cat (shopping category)`);

  if (food.key && !/^[a-z0-9-]+$/.test(food.key)) {
    errors.push(`${at}: key must be lowercase ASCII slug`);
  }

  // Keys and names must not embed a banned term — they surface in shopping item ids.
  for (const term of BANNED) {
    for (const [label, value] of [['key', food.key], ['name_ru', food.name_ru], ['cat', food.cat]]) {
      if (value && S.containsTerm(value, term)) {
        errors.push(`${at}: ${label} "${value}" contains banned term "${term}" — it would leak into shopping item ids`);
      }
    }
  }

  const p = food.per100g;
  if (!p) {
    errors.push(`${at}: missing per100g`);
  } else {
    for (const key of NUM_FIELDS) {
      if (p[key] == null) { warnings.push(`${at}: per100g.${key} not set`); continue; }
      if (typeof p[key] !== 'number' || p[key] < 0) errors.push(`${at}: per100g.${key} must be a non-negative number`);
    }
    // Macros must roughly account for the stated energy. Fiber is included in the carb
    // figure but yields ~2 kcal/g rather than 4, which matters a lot for spices, cocoa
    // and citrus — a naive 4/4/9 sum overstates those by 40-90%.
    const fiber      = Math.min(p.fib || 0, p.c || 0);
    const netCarbs   = (p.c || 0) - fiber;
    const fromMacros = 4 * (p.p || 0) + 4 * netCarbs + 2 * fiber + 9 * (p.f || 0);
    // Some foods legitimately break the Atwater model (organic acids, unavailable carbs,
    // mineral carbonates). Those carry an explicit kcal_exempt reason rather than fudged numbers.
    if (!food.kcal_exempt && p.kcal > 20 && Math.abs(fromMacros - p.kcal) / p.kcal > 0.35) {
      warnings.push(`${at}: per100g kcal ${p.kcal} vs ${Math.round(fromMacros)} implied by macros ` +
                    `(${Math.round(100 * (fromMacros - p.kcal) / p.kcal)}%) — check the numbers`);
    }
    if ((p.sf || 0) > (p.f || 0) + 0.01) {
      errors.push(`${at}: saturated fat ${p.sf} exceeds total fat ${p.f}`);
    }
    for (const key of OPTIONAL_NUM_FIELDS) {
      if (p[key] == null) continue;
      if (typeof p[key] !== 'number' || p[key] < 0) errors.push(`${at}: per100g.${key} must be a non-negative number`);
    }
    // Free sugars and viscous fibre are subsets of the carbohydrate and fibre figures.
    if ((p.fs || 0) > (p.c || 0) + 0.01) errors.push(`${at}: free sugars ${p.fs} exceed total carbs ${p.c}`);
    if ((p.vf || 0) > (p.fib || 0) + 0.01) errors.push(`${at}: viscous fibre ${p.vf} exceeds total fibre ${p.fib}`);

    // Tag and number must agree.
    for (const [tag, field, min, bidirectional] of TAG_BACKING) {
      const tagged = Array.isArray(food.tags) && food.tags.includes(tag);
      const value  = p[field] || 0;
      if (tagged && value < min) {
        errors.push(`${at}: tagged "${tag}" but per100g.${field} is ${value} (expected >= ${min}) — tag and number disagree`);
      }
      if (bidirectional && !tagged && value > 0) {
        errors.push(`${at}: per100g.${field} is ${value} but the food is not tagged "${tag}"`);
      }
    }
  }

  if (food.density != null && (typeof food.density !== 'number' || food.density <= 0 || food.density > 2)) {
    errors.push(`${at}: implausible density ${food.density}`);
  }
  for (const [unit, grams] of Object.entries(food.g_per || {})) {
    if (typeof grams !== 'number' || grams <= 0) errors.push(`${at}: g_per.${unit} must be a positive number`);
  }
  if (food.basis && food.basis !== 'dry') {
    errors.push(`${at}: basis must be "dry" if present, found "${food.basis}"`);
  }
}

// Aliases must round-trip: resolving a food's own canonical name must return that food.
for (const food of cat.foods) {
  const res = F.resolve(food.name_ru);
  if (!res) errors.push(`food "${food.key}": its own name_ru "${food.name_ru}" does not resolve`);
  else if (res.food.key !== food.key) {
    errors.push(`food "${food.key}": name_ru "${food.name_ru}" resolves to "${res.food.key}" instead`);
  }
}

warnings.forEach(w => console.warn(`[WARN] ${w}`));
if (errors.length) {
  errors.forEach(e => console.error(`[FAIL] ${e}`));
  console.log(`\nResult: FAIL (${errors.length} error(s))`);
  process.exit(1);
}
console.log(`[PASS] data/foods.json — ${cat.foods.length} foods, all checks passed`);
if (warnings.length) console.log(`       (${warnings.length} warning(s))`);
