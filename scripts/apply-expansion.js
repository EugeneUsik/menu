#!/usr/bin/env node
'use strict';

/**
 * Merge expansion fragments into a promoted week file.
 *
 * Expansion is the slowest part of generation and the most parallel: 24 recipes each need minor
 * ingredients and 3–6 Russian instruction steps, and no recipe depends on any other. Splitting it
 * across several workers is the single biggest wall-clock saving available — but several workers
 * cannot write one JSON file, and passing the whole payload back through a return channel is
 * both large and lossy.
 *
 * So each worker writes its own fragment and this merges them, checking the things that would
 * otherwise only surface at the very last gate:
 *
 *   { "cod-potato": {
 *       "add": [ { "name": "чеснок", "quantity": 12, "unit": "g" },
 *                { "name": "соль",   "quantity": 2,  "unit": "g" } ],
 *       "instructions": [ "Разогреть духовку до 200 °C…", "…", "…" ] } }
 *
 * Refuses partial work. A week missing one recipe's instructions fails `validate-week.js`
 * anyway; failing here names the recipe and the worker instead of the field.
 *
 * Usage
 *   node scripts/apply-expansion.js data/weeks/2026-W37.json data/weeks/2026-W37-exp-*.json
 *   node scripts/apply-expansion.js <week> <fragments...> --dry-run
 */

const fs   = require('fs');
const path = require('path');
const F    = require('./lib/foods.js');

const MIN_STEPS = 2;   // validate-week.js requires >= 2 non-empty steps
const MAX_STEPS = 8;

function loadFragments(files) {
  const merged = new Map();
  const problems = [];

  for (const file of files) {
    let frag;
    try {
      frag = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    } catch (err) {
      problems.push(`${path.basename(file)}: ${err.message}`);
      continue;
    }
    for (const [id, spec] of Object.entries(frag)) {
      if (merged.has(id)) {
        problems.push(`${id}: supplied by two fragments (${merged.get(id).source} and ${path.basename(file)})`);
        continue;
      }
      merged.set(id, { ...spec, source: path.basename(file) });
    }
  }
  return { merged, problems };
}

function applyExpansion(week, fragments) {
  const problems = [];
  const applied  = [];
  const byId     = new Map((week.recipes || []).map(r => [r.id, r]));

  for (const [id, spec] of fragments) {
    const recipe = byId.get(id);
    if (!recipe) { problems.push(`${spec.source}: no recipe "${id}" in the week file`); continue; }

    const steps = spec.instructions;
    if (!Array.isArray(steps) || steps.length < MIN_STEPS) {
      problems.push(`${id}: needs at least ${MIN_STEPS} instruction steps (${spec.source})`);
      continue;
    }
    if (steps.length > MAX_STEPS) {
      problems.push(`${id}: ${steps.length} instruction steps, more than ${MAX_STEPS} (${spec.source})`);
      continue;
    }
    if (steps.some(s => typeof s !== 'string' || !s.trim())) {
      problems.push(`${id}: an instruction step is empty (${spec.source})`);
      continue;
    }

    // A name the catalog cannot resolve is a hard failure two steps later in
    // compute-nutrition.js, with no indication of which worker produced it.
    const add = spec.add || [];
    let bad = false;
    for (const ing of add) {
      if (!ing?.name || !F.resolve(ing.name)) {
        problems.push(`${id}: unknown ingredient "${ing?.name}" (${spec.source})`);
        bad = true; continue;
      }
      const conv = F.toGrams(F.resolve(ing.name).food, ing.quantity, ing.unit);
      if (conv.error) { problems.push(`${id}: ${conv.error} (${spec.source})`); bad = true; }
    }
    if (bad) continue;

    recipe.ingredients.push(...add.map(({ name, quantity, unit, prep }) => ({
      name: F.resolve(name).food.name_ru, quantity, unit, ...(prep ? { prep } : {})
    })));
    recipe.instructions = steps;
    applied.push(id);
  }

  // Partial expansion is worse than none: it passes here and fails at the final gate with a
  // message about an empty instructions array rather than about the missing worker.
  const missing = (week.recipes || []).filter(r => !applied.includes(r.id)).map(r => r.id);
  if (missing.length) problems.push(`no expansion supplied for: ${missing.join(', ')}`);

  return { applied, problems };
}

if (require.main === module) {
  const args  = process.argv.slice(2).filter(a => a !== '--dry-run');
  const dry   = process.argv.includes('--dry-run');
  const [weekFile, ...fragFiles] = args;

  if (!weekFile || !fragFiles.length) {
    console.error('Usage: node apply-expansion.js <week.json> <fragment.json...> [--dry-run]');
    process.exit(1);
  }

  let week;
  try {
    week = JSON.parse(fs.readFileSync(path.resolve(weekFile), 'utf8'));
  } catch (err) {
    console.error(`[FAIL] cannot read ${weekFile}: ${err.message}`);
    process.exit(1);
  }

  const { merged, problems: loadProblems } = loadFragments(fragFiles);
  const { applied, problems } = applyExpansion(week, merged);
  const all = [...loadProblems, ...problems];

  if (all.length) {
    all.forEach(p => console.error(`[FAIL] ${p}`));
    console.error(`\nApplied nothing. ${applied.length}/${week.recipes.length} recipe(s) were well-formed.`);
    process.exit(1);
  }

  if (dry) {
    console.log(`--dry-run: ${applied.length} recipe(s) would be expanded from ${fragFiles.length} fragment(s).`);
    process.exit(0);
  }

  fs.writeFileSync(path.resolve(weekFile), JSON.stringify(week, null, 2) + '\n');
  console.log(`Expanded ${applied.length} recipe(s) from ${fragFiles.length} fragment(s).`);
  console.log(`Next: compute-nutrition.js → generate-shopping-list.js → validate-week.js`);
}

module.exports = { applyExpansion, loadFragments };
