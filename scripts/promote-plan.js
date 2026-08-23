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
 * ── Why this script validates ──────────────────────────────────────────────────────
 *
 * That guarantee used to rest on the operator reading an exit code. It did not hold: a
 * plan with seven hard failures promoted cleanly, and compute-nutrition.js and
 * generate-shopping-list.js then wrote into it. Every global constraint -- nutrition
 * budgets, variety, cross-week history -- is checked ONLY at the plan stage, so promoting
 * a failing plan launders those failures into a published week that validate-week.js
 * cannot detect (it scores budgets but no variety rule at all).
 *
 * So the gate lives here, in code. --force still exists, because a deliberate override
 * is legitimate; silently promoting a broken plan is not.
 *
 * Usage
 *   node scripts/promote-plan.js data/weeks/2026-W35-plan.json
 *   node scripts/promote-plan.js data/weeks/2026-W35-plan.json --force   # overwrite / ignore failures
 */

const fs   = require('fs');
const path = require('path');
const { validatePlan } = require('./validate-plan.js');

const TARGETS_PATH = path.join(__dirname, '..', 'data', 'targets.json');

/**
 * Build the published week skeleton from a plan object.
 * Pure: no filesystem writes, so tests can exercise the shape directly.
 */
function buildWeek(plan) {
  // The frontend only ever fetches the week file, so the external school-lunch values
  // have to be embedded here rather than left in data/targets.json.
  const targets     = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));
  const schoolLunch = plan.fixed_school_lunch || targets.fixed_school_lunch;

  // Copy every declared *_estimate rather than naming them one by one. The hand-written
  // list here and in analyze.js was written for 7 nutrients and silently ignored the
  // rest once the model grew to 14.
  const estimates = Object.fromEntries(
    Object.entries(schoolLunch).filter(([k]) => k.endsWith('_estimate'))
  );

  return {
    schema_version: '2.1',
    language: plan.language || 'ru',
    week: plan.week,
    fixed_school_lunch: {
      title: schoolLunch.title || 'Обед в школе (внешний)',
      description: schoolLunch.description
        || 'Горячий обед в школьной столовой — не входит в меню, учитывается в дневных итогах ребёнка',
      ...estimates,
      assumed: schoolLunch.assumed === true
    },
    menu: plan.menu,
    recipes: (plan.recipes || []).map(r => ({
      id:    r.id,
      title: r.title,
      meal_types: r.meal_types,
      serves: r.serves,
      ...(r.format       ? { format: r.format }              : {}),
      ...(r.base         ? { base: r.base }                  : {}),
      ...(r.snack_format ? { snack_format: r.snack_format }   : {}),
      active_time_min: r.active_time_min,
      total_time_min:  r.total_time_min != null ? r.total_time_min : r.active_time_min,
      ingredients: r.ingredients || [],
      instructions: []
    })),
    shopping_list: [],
    daily_nutrition: []
  };
}

/**
 * @returns {{ok: true, outPath: string, week: object} | {ok: false, reason: string, errors?: string[]}}
 */
function promotePlan(planPath, opts = {}) {
  const resolvedPlan = path.resolve(planPath);
  if (!fs.existsSync(resolvedPlan)) {
    return { ok: false, reason: `File not found: ${resolvedPlan}` };
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(resolvedPlan, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `JSON parse error: ${err.message}` };
  }

  const weekId = plan.week?.id;
  if (!weekId) return { ok: false, reason: 'Plan is missing week.id' };

  const outPath = path.join(path.dirname(resolvedPlan), `${weekId}.json`);
  if (fs.existsSync(outPath) && !opts.force) {
    return { ok: false, reason: `${path.basename(outPath)} already exists. Pass --force to overwrite.` };
  }

  const result = validatePlan(plan);
  if (!result.pass && !opts.force) {
    return {
      ok: false,
      reason: `${path.basename(resolvedPlan)} does not pass validate-plan.js — refusing to promote`,
      errors: result.errors
    };
  }

  const week = buildWeek(plan);
  if (!opts.dryRun) fs.writeFileSync(outPath, JSON.stringify(week, null, 2), 'utf8');

  return { ok: true, outPath, week, overridden: !result.pass, errors: result.errors };
}

function main(argv) {
  const args     = argv.slice(2);
  const planPath = args.find(a => !a.startsWith('--'));
  const force    = args.includes('--force');

  if (!planPath) {
    console.error('Usage: node promote-plan.js <plan.json> [--force]');
    return 1;
  }

  const out = promotePlan(planPath, { force });

  if (!out.ok) {
    console.error(`[FAIL] ${out.reason}`);
    (out.errors || []).forEach(e => console.error(`       ${e}`));
    if (out.errors?.length) {
      console.error('\nFix the plan and re-run validate-plan.js. Iterating on the ~9 KB plan is the');
      console.error('cheap loop; promoting a failing plan moves those failures into a 78 KB week file');
      console.error('where the variety and cross-week rules are never checked again.');
    }
    return 1;
  }

  if (out.overridden) {
    console.warn(`[WARN] --force: promoted a plan with ${out.errors.length} unresolved failure(s):`);
    out.errors.forEach(e => console.warn(`       ${e}`));
  }

  console.log(`Wrote ${path.basename(out.outPath)} — ${out.week.recipes.length} recipe(s), ${out.week.menu.length} day(s).`);
  console.log('Next: fill instructions[] (3-6 steps each) and add any remaining minor ingredients, then run:');
  const rel = path.relative(process.cwd(), out.outPath);
  console.log(`  node scripts/compute-nutrition.js ${rel}`);
  console.log(`  node scripts/generate-shopping-list.js ${rel}`);
  console.log(`  node scripts/validate-week.js ${rel}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { promotePlan, buildWeek };
