#!/usr/bin/env node
'use strict';

/**
 * Expand a validated plan into the week-file skeleton.
 *
 * The plan already contains the week metadata, the 7-day menu, and each recipe's
 * nutritionally dominant ingredients. This script copies that into the published
 * shape and leaves exactly two things for the model to fill in during expansion:
 * the remaining minor ingredients (aromatics, seasoning) and the instruction steps.
 *
 * Nothing here re-decides anything the plan settled, which is the point: once
 * validate-plan.js passes, no global constraint can be reopened by expansion.
 *
 * Usage
 *   node scripts/promote-plan.js data/weeks/2026-W27-plan.json
 *   node scripts/promote-plan.js data/weeks/2026-W27-plan.json --force   # overwrite existing week file
 */

const fs   = require('fs');
const path = require('path');

const args     = process.argv.slice(2);
const planPath = args.find(a => !a.startsWith('--'));
const force    = args.includes('--force');

if (!planPath) {
  console.error('Usage: node promote-plan.js <plan.json> [--force]');
  process.exit(1);
}

const resolvedPlan = path.resolve(planPath);
if (!fs.existsSync(resolvedPlan)) {
  console.error(`File not found: ${resolvedPlan}`);
  process.exit(1);
}

const plan   = JSON.parse(fs.readFileSync(resolvedPlan, 'utf8'));
const weekId = plan.week?.id;
if (!weekId) {
  console.error('Plan is missing week.id');
  process.exit(1);
}

const outPath = path.join(path.dirname(resolvedPlan), `${weekId}.json`);
if (fs.existsSync(outPath) && !force) {
  console.error(`${path.basename(outPath)} already exists. Pass --force to overwrite.`);
  process.exit(1);
}

// The frontend only ever fetches the week file, so the external school-lunch values
// have to be embedded here rather than left in data/targets.json.
const targets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'targets.json'), 'utf8'));
const schoolLunch = plan.fixed_school_lunch || targets.fixed_school_lunch;

const week = {
  schema_version: '2.1',
  language: plan.language || 'ru',
  week: plan.week,
  fixed_school_lunch: {
    title: schoolLunch.title || 'Обед в школе (внешний)',
    description: schoolLunch.description || 'Горячий обед в школьной столовой — не входит в меню, учитывается в дневных итогах ребёнка',
    kcal_estimate:      schoolLunch.kcal_estimate,
    protein_g_estimate: schoolLunch.protein_g_estimate,
    carbs_g_estimate:   schoolLunch.carbs_g_estimate,
    fat_g_estimate:     schoolLunch.fat_g_estimate,
    sat_fat_g_estimate: schoolLunch.sat_fat_g_estimate,
    fiber_g_estimate:   schoolLunch.fiber_g_estimate,
    sodium_mg_estimate: schoolLunch.sodium_mg_estimate,
    assumed:            schoolLunch.assumed === true
  },
  menu: plan.menu,
  recipes: (plan.recipes || []).map(r => ({
    id:    r.id,
    title: r.title,
    meal_types: r.meal_types,
    serves: r.serves,
    ...(r.format       ? { format: r.format }             : {}),
    ...(r.base         ? { base: r.base }                 : {}),
    ...(r.snack_format ? { snack_format: r.snack_format }  : {}),
    active_time_min: r.active_time_min,
    total_time_min:  r.total_time_min != null ? r.total_time_min : r.active_time_min,
    ingredients: r.ingredients || [],
    instructions: []
  })),
  shopping_list: [],
  daily_nutrition: []
};

fs.writeFileSync(outPath, JSON.stringify(week, null, 2), 'utf8');

const needSteps = week.recipes.length;
console.log(`Wrote ${path.basename(outPath)} — ${needSteps} recipe(s), ${week.menu.length} day(s).`);
console.log('Next: fill instructions[] (3-6 steps each) and add any remaining minor ingredients, then run:');
console.log(`  node scripts/compute-nutrition.js ${path.relative(process.cwd(), outPath)}`);
console.log(`  node scripts/generate-shopping-list.js ${path.relative(process.cwd(), outPath)}`);
console.log(`  node scripts/validate-week.js ${path.relative(process.cwd(), outPath)}`);
