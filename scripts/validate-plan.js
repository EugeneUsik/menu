#!/usr/bin/env node
'use strict';

/**
 * Validate a week PLAN — the cheap artifact, before any recipe prose exists.
 *
 * Why this script is the centre of the pipeline: the nutrition and variety rules are
 * global properties of the whole 7-day week, but they used to be checked only after
 * ~78 KB of Russian JSON had been written. Any failure meant editing recipes, which
 * invalidated the shopping metadata, which forced re-running the downstream steps.
 * A plan is ~9 KB, so iterating here is roughly an order of magnitude cheaper, and
 * once a plan passes, expanding it into recipes introduces no new global constraints.
 *
 * Every rule below is deterministic and reads its thresholds from data/targets.json.
 * Variety facts are DERIVED from data/foods.json, not self-reported by the model.
 *
 * Usage
 *   node scripts/validate-plan.js data/weeks/2026-W27-plan.json
 *   node scripts/validate-plan.js data/weeks/2026-W27-plan.json --json
 */

const fs   = require('fs');
const path = require('path');
const { analyze, MAIN_SLOTS, ALL_SLOTS } = require('./lib/analyze.js');
const { scanSafety } = require('./lib/scan.js');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function pct(n) { return `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`; }
function r0(n)  { return Math.round(n); }
function r1(n)  { return Math.round(n * 10) / 10; }

function validatePlan(plan) {
  const errors = [], warnings = [], notes = [];
  const fail = m => errors.push(m);
  const warn = m => warnings.push(m);

  // ── 1. Structure ────────────────────────────────────────────────────────────
  if (!plan.week?.id)         fail('Missing week.id');
  if (!plan.week?.start_date) fail('Missing week.start_date');
  if (!Array.isArray(plan.menu))    { fail('menu is not an array'); return { pass: false, errors, warnings, notes }; }
  if (!Array.isArray(plan.recipes)) { fail('recipes is not an array'); return { pass: false, errors, warnings, notes }; }
  if (plan.menu.length !== 7) fail(`menu must have exactly 7 days, found ${plan.menu.length}`);

  plan.menu.forEach((day, i) => {
    if (day.day_name !== DAY_NAMES[i]) fail(`menu[${i}].day_name should be "${DAY_NAMES[i]}", found "${day.day_name}"`);
    for (const slot of MAIN_SLOTS) {
      if (!day[slot]?.title)     fail(`${day.day_name || i}: missing ${slot}.title`);
      if (!day[slot]?.recipe_id) fail(`${day.day_name || i}: missing ${slot}.recipe_id`);
    }
    if (day.includes_fixed_school_lunch === undefined) {
      fail(`${day.day_name || i}: missing includes_fixed_school_lunch (true Mon-Fri, false Sat-Sun)`);
    }
    // The child is not home for lunch on a school day, so a lunch slot there feeds two.
    if (day.includes_fixed_school_lunch && day.lunch?.child_portion) {
      fail(`${day.day_name}: lunch cannot include a child portion — the child eats lunch at school`);
    }
  });

  const ids = plan.recipes.map(r => r.id).filter(Boolean);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) fail(`Duplicate recipe IDs: ${[...new Set(dupes)].join(', ')}`);

  // Every recipe needs at least the nutritionally dominant ingredients, so the plan's
  // numbers are real. Aromatics and seasoning get added during expansion.
  for (const r of plan.recipes) {
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) {
      fail(`Recipe "${r.id}" needs at least 2 core ingredients in the plan (the protein, starch and main vegetable)`);
    }
    if (!Number.isFinite(Number(r.serves)) || Number(r.serves) <= 0) {
      fail(`Recipe "${r.id}" is missing a valid "serves" (total person-portions the quantities produce)`);
    }
  }

  // ── 2. Recipe references and serves/slot agreement ──────────────────────────
  const slotUse = new Map();
  plan.menu.forEach((day, i) => {
    for (const slot of ALL_SLOTS) {
      const id = day[slot]?.recipe_id;
      if (!id) continue;
      if (!slotUse.has(id)) slotUse.set(id, []);
      slotUse.get(id).push({ day: i, slot, dayName: day.day_name });
    }
  });

  const known = new Set(ids);
  for (const [id, uses] of slotUse) {
    if (!known.has(id)) fail(`Broken recipe_id reference: ${id} (used ${uses.length}x)`);
  }
  for (const r of plan.recipes) {
    if (!slotUse.has(r.id)) warn(`Recipe "${r.id}" is never referenced by the menu`);
  }

  // serves is checked against the derived eater sets further down, once analyze() has run.
  for (const r of plan.recipes) {
    const uses = slotUse.get(r.id) || [];
    if (uses.length <= 1) continue;
    // Multi-slot recipes must be a dinner → next-day-lunch pair, or the shopping list is wrong.
    const dinner = uses.find(u => u.slot === 'dinner');
    const lunch  = uses.find(u => u.slot === 'lunch');
    const legit  = uses.length === 2 && dinner && lunch && lunch.day === dinner.day + 1;
    if (!legit) {
      fail(`Recipe "${r.id}" is used in ${uses.length} slots (${uses.map(u => `${u.dayName}/${u.slot}`).join(', ')}) ` +
           `but only a dinner → next-day-lunch pair is supported; shopping quantities are summed once per recipe. ` +
           `Split it into separate recipes.`);
    }
  }

  // cook_once_eat_twice / leftover_from consistency
  for (let i = 0; i < plan.menu.length - 1; i++) {
    const dinner = plan.menu[i].dinner;
    if (!dinner?.cook_once_eat_twice) continue;
    const nextLunch = plan.menu[i + 1].lunch;
    if (nextLunch?.recipe_id !== dinner.recipe_id) {
      fail(`${plan.menu[i].day_name} dinner has cook_once_eat_twice but ${plan.menu[i + 1].day_name} lunch is a different recipe`);
    } else if (!nextLunch.leftover_from) {
      warn(`${plan.menu[i + 1].day_name} lunch is leftovers but missing leftover_from`);
    }
  }

  // ── 3. Safety ───────────────────────────────────────────────────────────────
  scanSafety(plan).forEach(fail);

  // ── 4. Derived nutrition and variety ────────────────────────────────────────
  const A = analyze(plan);
  A.problems.forEach(fail);
  if (errors.length) return { pass: false, errors, warnings, notes };

  const { targets, people, recipeFacts, daily } = A;
  const tol = targets.tolerance;

  // 4a-pre. serves must match who actually eats the recipe.
  // A dinner for three that becomes next-day school lunch for two is 5 portions, not 6.
  for (const [id, facts] of recipeFacts) {
    if (!facts.occasions.length) continue;
    const declared = Number(facts.recipe.serves);
    if (declared !== facts.expectedServes) {
      const detail = facts.occasions
        .map(o => `${o.dayName} ${o.slot} → ${o.eaters.length} portion(s) [${o.eaters.join(', ')}]`)
        .join('; ');
      fail(`Recipe "${id}": serves=${declared} but the menu needs ${facts.expectedServes} — ${detail}. ` +
           `Scale the ingredient quantities to ${facts.expectedServes} portions.`);
    }
  }

  // 4a. Daily budgets
  for (const d of daily) {
    for (const p of people) {
      const t = targets.daily[p], v = d.totals[p];
      for (const key of ['kcal', 'protein_g', 'fiber_g', 'sat_fat_g']) {
        const spec = t[key];
        if (!spec) continue;
        const actual = v[key];
        if (spec.min != null && actual < spec.min) {
          const off = (actual - spec.min) / spec.min;
          const msg = `${d.day_name} ${p} ${key} ${r1(actual)} below min ${spec.min} (${pct(off)})`;
          Math.abs(off) > tol.day_pct ? fail(msg) : warn(msg);
        }
        if (spec.max != null && actual > spec.max) {
          const off = (actual - spec.max) / spec.max;
          const msg = `${d.day_name} ${p} ${key} ${r1(actual)} above max ${spec.max} (${pct(off)})`;
          Math.abs(off) > tol.day_pct ? fail(msg) : warn(msg);
        }
      }
    }
  }

  // 4b. Weekly averages — tighter band than individual days
  for (const p of people) {
    const t = targets.daily[p];
    for (const key of ['kcal', 'protein_g', 'fiber_g']) {
      const spec = t[key];
      if (!spec) continue;
      const avg = daily.reduce((s, d) => s + d.totals[p][key], 0) / daily.length;
      if (spec.min != null && avg < spec.min * (1 - tol.avg_pct)) {
        fail(`Weekly average ${p} ${key} ${r1(avg)} below min ${spec.min}`);
      }
      if (spec.max != null && avg > spec.max * (1 + tol.avg_pct)) {
        fail(`Weekly average ${p} ${key} ${r1(avg)} above max ${spec.max}`);
      }
      notes.push(`avg ${p} ${key}: ${r1(avg)}${spec.min != null ? ` (target ${spec.min}${spec.max != null ? `-${spec.max}` : '+'})` : ''}`);
    }
  }

  // 4c. Meal structure — the few per-meal rules that survived
  const ms = targets.meal_structure;
  for (const d of daily) {
    const hb = d.bySlot.breakfast?.husband;
    if (hb) {
      if (hb.protein_g < ms.husband_breakfast_protein_min_g * (1 - tol.day_pct)) {
        fail(`${d.day_name}: husband breakfast protein ${r1(hb.protein_g)} g below ${ms.husband_breakfast_protein_min_g} g (pre-training meal)`);
      }
      if (hb.carbs_g < ms.husband_breakfast_carbs_min_g * (1 - tol.day_pct)) {
        warn(`${d.day_name}: husband breakfast carbs ${r1(hb.carbs_g)} g below ${ms.husband_breakfast_carbs_min_g} g (pre-training fuel)`);
      }
    }
    for (const p of people) {
      // Only meals this person actually eats. On a school day the child's midday meal
      // is the external school lunch, not the family lunch slot.
      const mainSlotNames = [...MAIN_SLOTS, 'school_lunch'];
      const mains = mainSlotNames
        .map(s => d.bySlot[s])
        .filter(b => b && b._eaters.includes(p) && b[p])
        .map(b => b[p]);
      const atAnchor = mains.filter(m => m.protein_g >= ms.anchor_protein_min_g[p]).length;
      if (atAnchor < ms.min_main_meals_at_anchor) {
        fail(`${d.day_name} ${p}: only ${atAnchor} of ${mains.length} main meals reach the ${ms.anchor_protein_min_g[p]} g protein anchor (need ${ms.min_main_meals_at_anchor})`);
      }
      const dayProtein = targets.daily[p].protein_g;
      if (dayProtein?.max) {
        const cap = dayProtein.max * ms.max_single_meal_protein_share;
        const worst = mains.reduce((m, x) => Math.max(m, x.protein_g), 0);
        if (worst > cap) {
          warn(`${d.day_name} ${p}: a single main meal carries ${r1(worst)} g protein, over ${r1(cap)} g (${Math.round(ms.max_single_meal_protein_share * 100)}% of the daily max) — spread it out`);
        }
      }
    }
    if (!d.day.shared_snack?.recipe_id) continue;
    const snackFacts = recipeFacts.get(d.day.shared_snack.recipe_id);
    if (snackFacts && !snackFacts.hasCalcium) {
      warn(`${d.day_name}: shared snack has no calcium source (child's calcium target)`);
    }
  }

  // 4d. Weekly counts
  const W = targets.weekly;
  const dayHas = predicate => daily.filter(d =>
    ALL_SLOTS.some(s => {
      const id = d.day[s]?.recipe_id;
      return id && recipeFacts.has(id) && predicate(recipeFacts.get(id));
    })
  ).length;

  const counts = {
    shared_snack_days:            daily.filter(d => d.day.shared_snack?.title).length,
    fatty_fish_days:              dayHas(f => f.hasFattyFish),
    white_fish_or_seafood_days:   dayHas(f => f.hasWhiteFishOrSeafood),
    legume_days:                  dayHas(f => f.hasLegume),
    soy_days:                     dayHas(f => f.hasSoy),
    oats_or_barley_days:          dayHas(f => f.hasOatsBarley),
    red_meat_days:                dayHas(f => f.hasRedMeat),
    walnut_or_ldl_nut_days:       dayHas(f => f.hasLdlNut)
  };
  const checkMin = (label, actual, min) => {
    notes.push(`${label}: ${actual} (min ${min})`);
    if (actual < min) fail(`${label} = ${actual}, need at least ${min}`);
  };
  checkMin('shared_snack_days',          counts.shared_snack_days,          W.shared_snack_days_min);
  checkMin('fatty_fish_days',            counts.fatty_fish_days,            W.fatty_fish_days_min);
  checkMin('white_fish_or_seafood_days', counts.white_fish_or_seafood_days, W.white_fish_or_seafood_days_min);
  checkMin('legume_days',                counts.legume_days,                W.legume_days_min);
  checkMin('soy_days',                   counts.soy_days,                   W.soy_days_min);
  checkMin('oats_or_barley_days',        counts.oats_or_barley_days,        W.oats_or_barley_days_min);
  checkMin('walnut_or_ldl_nut_days',     counts.walnut_or_ldl_nut_days,     W.walnut_or_ldl_nut_days_min);
  notes.push(`red_meat_days: ${counts.red_meat_days} (max ${W.red_meat_days_max})`);
  if (counts.red_meat_days > W.red_meat_days_max) {
    fail(`red_meat_days = ${counts.red_meat_days}, max ${W.red_meat_days_max}`);
  }

  // Wife's legume servings are counted per meal, not per day
  let wifeLegumeServings = 0;
  for (const d of daily) {
    for (const s of ALL_SLOTS) {
      const id = d.day[s]?.recipe_id;
      if (id && recipeFacts.get(id)?.hasLegume) wifeLegumeServings++;
    }
  }
  notes.push(`wife_legume_servings: ${wifeLegumeServings} (min ${W.wife_legume_servings_min})`);
  if (wifeLegumeServings < W.wife_legume_servings_min) {
    fail(`wife_legume_servings = ${wifeLegumeServings}, need at least ${W.wife_legume_servings_min}`);
  }

  // ── 5. Variety ──────────────────────────────────────────────────────────────
  const V = targets.variety;
  const dinners = daily.map(d => d.day.dinner?.recipe_id).filter(Boolean)
    .map(id => recipeFacts.get(id)).filter(Boolean);
  // A cook-once dinner reappears as lunch; count each dinner occasion once
  const uniqueDinners = [...new Map(dinners.map(f => [f.recipe.id, f])).values()];

  const tally = arr => arr.reduce((m, k) => (k == null ? m : (m.set(k, (m.get(k) || 0) + 1), m)), new Map());

  const proteinItems = tally(uniqueDinners.map(f => f.proteinItem));
  for (const [item, n] of proteinItems) {
    if (n > V.dinner_protein_item_max) fail(`Dinner protein "${item}" headlines ${n} dinners, max ${V.dinner_protein_item_max}`);
  }
  const proteinCats = new Set(uniqueDinners.map(f => f.proteinCat).filter(Boolean));
  notes.push(`dinner protein categories: ${[...proteinCats].join(', ')} (${proteinCats.size}, min ${V.dinner_protein_categories_min})`);
  if (proteinCats.size < V.dinner_protein_categories_min) {
    fail(`Only ${proteinCats.size} distinct dinner protein categories, need ${V.dinner_protein_categories_min}`);
  }

  const species = tally([...recipeFacts.values()].filter(f => f.fishSpecies).map(f => f.fishSpecies));
  for (const [sp, n] of species) {
    if (n > V.fish_species_repeat_max) fail(`Fish species "${sp}" used in ${n} recipes, max ${V.fish_species_repeat_max} — use a different species`);
  }

  const legumeSp = new Map();
  for (const f of recipeFacts.values()) {
    for (const sp of f.legumeSpecies) legumeSp.set(sp, (legumeSp.get(sp) || 0) + 1);
  }
  for (const [sp, n] of legumeSp) {
    if (n > V.legume_species_max) fail(`Legume "${sp}" used in ${n} recipes, max ${V.legume_species_max}`);
  }

  // Grain-base and vegetable variety are rules about MAIN meals; a crispbread
  // alongside a snack is not the week's starch base.
  const mainSlotUse = new Map();
  for (const [id, uses] of slotUse) {
    const mains = uses.filter(u => MAIN_SLOTS.includes(u.slot));
    if (mains.length) mainSlotUse.set(id, mains);
  }

  const grainUse = tally([...mainSlotUse.keys()].flatMap(id => {
    const f = recipeFacts.get(id);
    return f?.grainBase ? Array(mainSlotUse.get(id).length).fill(f.grainBase) : [];
  }));
  notes.push(`grain bases: ${[...grainUse.entries()].map(([g, n]) => `${g}x${n}`).join(', ')} (${grainUse.size} distinct, min ${V.grain_bases_min})`);
  if (grainUse.size < V.grain_bases_min) fail(`Only ${grainUse.size} distinct grain/starch bases, need ${V.grain_bases_min}`);
  for (const [g, n] of grainUse) {
    if (n > V.grain_base_meals_max) fail(`Grain base "${g}" appears in ${n} meals, max ${V.grain_base_meals_max}`);
  }

  const allVeg = new Set();
  for (const id of mainSlotUse.keys()) {
    const f = recipeFacts.get(id);
    if (f) for (const v of f.vegetables) allVeg.add(v);
  }
  notes.push(`distinct vegetables: ${allVeg.size} (min ${V.distinct_vegetables_min})`);
  if (allVeg.size < V.distinct_vegetables_min) {
    fail(`Only ${allVeg.size} distinct vegetables across the week, need ${V.distinct_vegetables_min}`);
  }
  const vegHead = tally(uniqueDinners.map(f => f.vegHeadline));
  for (const [v, n] of vegHead) {
    if (n > V.vegetable_headline_max) warn(`Vegetable "${v}" headlines ${n} dinners, max ${V.vegetable_headline_max}`);
  }

  // Declared-only facts: format / base / snack_format
  const breakfastIds = daily.map(d => d.day.breakfast?.recipe_id).filter(Boolean);
  const bases = breakfastIds.map(id => recipeFacts.get(id)?.recipe.base || null);
  if (bases.some(b => !b)) {
    fail('Every breakfast recipe must declare "base" (one of targets.json enums.breakfast_base)');
  } else {
    const baseTally = tally(bases);
    notes.push(`breakfast bases: ${[...baseTally.entries()].map(([b, n]) => `${b}x${n}`).join(', ')}`);
    if (baseTally.size < V.breakfast_base_types_min) {
      fail(`Only ${baseTally.size} distinct breakfast base types, need ${V.breakfast_base_types_min}`);
    }
    const oatish = (baseTally.get('oats') || 0);
    if (oatish > V.oat_breakfast_max) fail(`${oatish} oat-based breakfasts, max ${V.oat_breakfast_max}`);
    for (const b of bases) {
      if (b && !targets.enums.breakfast_base.includes(b)) fail(`Unknown breakfast base "${b}"`);
    }
  }

  const dinnerFormats = uniqueDinners.map(f => f.recipe.format || null);
  if (dinnerFormats.some(f => !f)) {
    fail('Every dinner recipe must declare "format" (one of targets.json enums.dinner_format)');
  } else {
    const fTally = tally(dinnerFormats);
    notes.push(`dinner formats: ${[...fTally.entries()].map(([f, n]) => `${f}x${n}`).join(', ')}`);
    if (fTally.size < V.dinner_formats_min) fail(`Only ${fTally.size} distinct dinner formats, need ${V.dinner_formats_min}`);
    if ((fTally.get('one_pot') || 0) > V.one_pot_dinner_max) {
      fail(`${fTally.get('one_pot')} one-pot dinners, max ${V.one_pot_dinner_max}`);
    }
    for (const f of dinnerFormats) {
      if (f && !targets.enums.dinner_format.includes(f)) fail(`Unknown dinner format "${f}"`);
    }
  }

  const snackIds = daily.map(d => d.day.shared_snack?.recipe_id).filter(Boolean);
  const snackTally = tally(snackIds);
  for (const [id, n] of snackTally) {
    if (n > V.snack_repeat_max) fail(`Shared snack "${id}" repeats on ${n} days, max ${V.snack_repeat_max}`);
  }
  const snackFormats = new Set(snackIds.map(id => recipeFacts.get(id)?.recipe.snack_format).filter(Boolean));
  notes.push(`snack formats: ${[...snackFormats].join(', ')}`);

  const soyForms = new Set();
  for (const id of slotUse.keys()) {
    const f = recipeFacts.get(id);
    if (f) for (const s of f.soyForms) soyForms.add(s);
  }
  notes.push(`soy delivery forms: ${[...soyForms].join(', ') || 'none'} (min ${V.soy_forms_min})`);
  if (soyForms.size < V.soy_forms_min) {
    fail(`Only ${soyForms.size} soy delivery form(s), need ${V.soy_forms_min} — vary tofu / soy milk / soy yogurt / edamame`);
  }

  // ── 6. Cooking time ────────────────────────────────────────────────────────
  daily.forEach((d, i) => {
    const weekend = i >= 5;
    const cap = weekend ? targets.cooking.weekend_active_min_max : targets.cooking.weekday_active_min_max;
    for (const slot of ALL_SLOTS) {
      const id = d.day[slot]?.recipe_id;
      if (!id) continue;
      if (d.day[slot].leftover_from) continue;   // reheating leftovers costs nothing
      const r = recipeFacts.get(id)?.recipe;
      const t = Number(r?.active_time_min);
      if (Number.isFinite(t) && t > cap) {
        fail(`${d.day_name} ${slot} "${id}": active_time_min ${t} exceeds the ${weekend ? 'weekend' : 'weekday'} cap of ${cap} min`);
      }
    }
  });

  // ── 7. Cross-week history ──────────────────────────────────────────────────
  // __dirname, not require.main — this module is imported by tests and by other scripts,
  // where require.main is a different file or undefined entirely.
  const historyPath = path.join(__dirname, '..', 'data', 'weeks', 'recent-history.json');
  if (targets.history.block_repeat_protein_grain_pairing && fs.existsSync(historyPath)) {
    const hist = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    const recent = (hist.weeks || []).filter(w => w.id !== plan.week?.id).slice(0, targets.history.lookback_weeks);
    const seenPairs = new Set(recent.flatMap(w => w.dinner_pairings || []));
    for (const f of uniqueDinners) {
      const pair = `${f.proteinItem}+${f.grainBase}`;
      if (seenPairs.has(pair)) {
        fail(`Dinner pairing "${pair}" was already used in the last ${targets.history.lookback_weeks} weeks — pick a different protein/starch combination`);
      }
    }
    const lastWeek = recent[0];
    if (lastWeek) {
      const overlap = daily.map(d => d.day.dinner?.title).filter(t => (lastWeek.dinner_titles || []).includes(t));
      if (overlap.length > targets.history.max_shared_dinner_titles_with_last_week) {
        fail(`${overlap.length} dinner titles repeat last week (${overlap.join(', ')}), max ${targets.history.max_shared_dinner_titles_with_last_week}`);
      }
    }
    notes.push(`history: compared against ${recent.length} recent week(s)`);
  } else {
    notes.push('history: data/weeks/recent-history.json absent — cross-week variety not checked (run scripts/derive-history.js)');
  }

  return { pass: errors.length === 0, errors, warnings, notes };
}

if (require.main === module) {
  const args     = process.argv.slice(2);
  const planPath = args.find(a => !a.startsWith('--'));
  if (!planPath) {
    console.error('Usage: node validate-plan.js <plan.json> [--json]');
    process.exit(1);
  }
  const resolved = path.resolve(planPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    console.error(`[FAIL] JSON parse error: ${err.message}`);
    process.exit(1);
  }

  const result = validatePlan(plan);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.pass ? 0 : 1);
  }

  result.notes.forEach(n => console.log(`  · ${n}`));
  if (result.warnings.length) {
    console.log('');
    result.warnings.forEach(w => console.warn(`[WARN] ${w}`));
  }
  if (result.errors.length) {
    console.log('');
    result.errors.forEach(e => console.error(`[FAIL] ${e}`));
    console.log(`\nResult: FAIL (${result.errors.length} error(s))`);
    process.exit(1);
  }
  console.log(`\n[PASS] ${path.basename(resolved)} — plan is publishable, proceed to expansion`);
  if (result.warnings.length) console.log(`       (${result.warnings.length} warning(s))`);
}

module.exports = { validatePlan };
