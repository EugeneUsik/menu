#!/usr/bin/env node
'use strict';

/**
 * Derive per-person nutrition for every recipe from its ingredient list.
 *
 * Replaces LLM-authored nutrition guesses. Before this script, recipes carried
 * hand-written per-person numbers that nothing could check: recipes have no
 * declared serving count, ingredient quantities are recipe totals while
 * nutrition is per person, so the two were never reconcilable. Spot-checks
 * showed 15-20% errors, and macro/kcal self-consistency degraded week over week.
 *
 * Convention
 *   recipe.serves       total person-portions the ingredient quantities produce.
 *                       A dinner for 3 that also covers next-day lunch: serves = 6.
 *   ingredient.for      optional "husband" | "wife" | "child" — that quantity goes
 *                       entirely to one person (e.g. the wife's extra walnuts),
 *                       split across meal occasions rather than across people.
 *
 * Split: each person's share of an untagged ingredient is
 *   grams * portion_weights[person] / serves
 * with portion_weights from data/targets.json (derived from the energy targets and
 * summing to the number of people, so one occasion consumes serves/3 of the total).
 *
 * Usage
 *   node scripts/compute-nutrition.js data/weeks/2026-W27.json
 *   node scripts/compute-nutrition.js data/weeks/2026-W27.json --check   # report, don't write
 *   node scripts/compute-nutrition.js data/weeks/2026-W25.json --infer-serves --check
 */

const fs   = require('fs');
const path = require('path');
const F    = require('./lib/foods.js');
const { analyze: A_analyze } = require('./lib/analyze.js');

const TARGETS_PATH = path.join(__dirname, '..', 'data', 'targets.json');

function round(n, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** How many menu slots reference each recipe id. */
function slotCounts(weekData) {
  const counts = new Map();
  for (const day of (weekData.menu || [])) {
    for (const slot of ['breakfast', 'lunch', 'dinner', 'shared_snack']) {
      const id = day[slot]?.recipe_id;
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return counts;
}

/**
 * @returns {{recipes: Map<string,object>, errors: string[], warnings: string[]}}
 */
function computeWeek(weekData, opts = {}) {
  const targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));
  const people  = targets.people;

  const errors   = [];
  const warnings = [];
  const results  = new Map();

  const A = A_analyze(weekData);
  A.problems.forEach(p => errors.push(p));

  for (const recipe of (weekData.recipes || [])) {
    const rid   = recipe.id || '(no id)';
    const facts = A.recipeFacts.get(recipe.id);
    if (!facts) continue;

    const expected = facts.expectedServes;
    const declared = Number(recipe.serves);

    if (!Number.isFinite(declared) || declared <= 0) {
      if (opts.inferServes) {
        warnings.push(`${rid}: no serves declared — using ${expected} derived from the menu`);
      } else {
        errors.push(`${rid}: missing or invalid "serves" (expected ${expected} from ${describeOccasions(facts.occasions)})`);
        continue;
      }
    } else if (expected > 0 && declared !== expected) {
      errors.push(
        `${rid}: serves=${declared} but the menu needs ${expected} portion(s) — ${describeOccasions(facts.occasions)}. ` +
        `Shopping quantities are summed once per recipe, so a mismatch silently over- or under-buys.`
      );
      continue;
    }

    // Flag names that only matched by word order, so canonical spellings win over time.
    for (const ing of (recipe.ingredients || [])) {
      const res = F.resolve(ing.name);
      if (res && res.match === 'wordset') {
        warnings.push(`${rid}: "${ing.name}" matched ${res.food.key} only by word order — canonical spelling is "${res.food.name_ru}"`);
      }
      if (ing.for && !people.includes(ing.for)) {
        errors.push(`${rid}: ingredient "${ing.name}" has for="${ing.for}", expected one of ${people.join(', ')}`);
      }
    }

    const perPerson = {};
    for (const p of people) {
      const acc = facts.perPerson[p];
      perPerson[p] = {
        kcal:      Math.round(acc.kcal),
        protein_g: round(acc.protein_g),
        carbs_g:   round(acc.carbs_g),
        fat_g:     round(acc.fat_g),
        fiber_g:   round(acc.fiber_g),
        sat_fat_g: round(acc.sat_fat_g),
        sodium_mg: Math.round(acc.sodium_mg)
      };
    }
    results.set(recipe.id, { serves: expected || declared, perPerson, occasions: facts.occasions });
  }

  return { recipes: results, errors, warnings };
}

/** "Wednesday dinner (3 eaters) + Thursday lunch (2 eaters)" */
function describeOccasions(occasions) {
  if (!occasions.length) return 'no menu slot';
  return occasions.map(o => `${o.dayName} ${o.slot} (${o.eaters.length} eater${o.eaters.length === 1 ? '' : 's'})`).join(' + ');
}

/** Compare derived values against whatever the file currently claims. */
function diffReport(weekData, results, people) {
  const rows = [];
  for (const recipe of (weekData.recipes || [])) {
    const derived = results.get(recipe.id);
    if (!derived) continue;
    const claimed = recipe.nutrition_estimate_per_person || {};
    for (const p of people) {
      const c = claimed[p], d = derived.perPerson[p];
      if (!c || c.kcal == null) continue;
      for (const key of ['kcal', 'protein_g']) {
        const was = Number(c[key]), now = d[key];
        if (!Number.isFinite(was) || was === 0) continue;
        const pct = (now - was) / was;
        if (Math.abs(pct) > 0.15) {
          rows.push(`${recipe.id}/${p} ${key}: claimed ${was} → derived ${now} (${pct > 0 ? '+' : ''}${Math.round(pct * 100)}%)`);
        }
      }
    }
  }
  return rows;
}

if (require.main === module) {
  const args     = process.argv.slice(2);
  const weekPath = args.find(a => !a.startsWith('--'));
  const check    = args.includes('--check');
  const infer    = args.includes('--infer-serves');

  if (!weekPath) {
    console.error('Usage: node compute-nutrition.js <week.json> [--check] [--infer-serves]');
    process.exit(1);
  }
  const resolved = path.resolve(weekPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const weekData = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const targets  = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));
  const out      = computeWeek(weekData, { inferServes: infer });

  out.warnings.forEach(w => console.warn(`[WARN] ${w}`));

  if (out.errors.length) {
    out.errors.forEach(e => console.error(`[FAIL] ${e}`));
    console.error(`\n${out.errors.length} error(s) — nutrition not written.`);
    process.exit(1);
  }

  const diffs = diffReport(weekData, out.recipes, targets.people);
  if (diffs.length) {
    console.log(`\n${diffs.length} value(s) shifted >15% from the previous estimate:`);
    diffs.forEach(d => console.log(`  ${d}`));
  }

  if (check) {
    console.log(`\n[CHECK] ${out.recipes.size} recipe(s) computed. Nothing written.`);
    process.exit(0);
  }

  for (const recipe of (weekData.recipes || [])) {
    const derived = out.recipes.get(recipe.id);
    if (!derived) continue;
    recipe.serves = derived.serves;
    recipe.nutrition_estimate_per_person = derived.perPerson;
  }
  weekData.nutrition_source = 'computed';

  fs.writeFileSync(resolved, JSON.stringify(weekData, null, 2), 'utf8');
  console.log(`Wrote computed nutrition for ${out.recipes.size} recipe(s) to ${path.basename(resolved)}`);
}

module.exports = { computeWeek, slotCounts };
