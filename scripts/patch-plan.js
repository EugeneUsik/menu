#!/usr/bin/env node
'use strict';

/**
 * Change ingredient quantities in a plan, by recipe id and ingredient name.
 *
 * The generation flow says to fix `[FAIL]` lines with targeted edits and never regenerate the
 * plan, and there is a good reason for the rule: a rewrite re-derives quantities that already
 * passed, so it can reopen a constraint that was settled. But a normalised plan is
 * pretty-printed one field per line, which means `"quantity": 750` is not a unique string
 * anywhere in the file, and a text edit cannot safely target it. The W36 plan was rewritten
 * whole twice for want of this script — the second rewrite changed fourteen numbers.
 *
 * So: address a quantity the way a human describes it — which recipe, which ingredient.
 * Names resolve through the catalog, so `оливковое масло` finds `масло оливковое`.
 *
 * Touches `ingredients` only. Everything mechanical stays the property of normalise-plan.js,
 * and nothing here can change `serves`, the menu or the week metadata.
 *
 * Usage
 *   # set quantities (the common case)
 *   node scripts/patch-plan.js <plan> chicken-barley-kale "грудка куриная=700" "крупа перловая=380"
 *
 *   # disambiguate when one name appears twice — once shared, once tagged
 *   node scripts/patch-plan.js <plan> cottage-cheese-blackberry-chia "хлеб цельнозерновой#husband=120"
 *   node scripts/patch-plan.js <plan> cottage-cheese-blackberry-chia "хлеб цельнозерновой#shared=150"
 *
 *   # add a row, optionally tagged and with a unit
 *   node scripts/patch-plan.js <plan> mussels-soba-noodles --add "масло растительное=25,ml"
 *   node scripts/patch-plan.js <plan> barley-porridge-plum  --add "скир 0–2%=90,g,husband"
 *
 *   # remove a row
 *   node scripts/patch-plan.js <plan> hummus-veg-sticks --remove "хлебцы ржаные"
 *
 *   # scale every quantity in one recipe (seeding from portion_calibration)
 *   node scripts/patch-plan.js <plan> mackerel-quinoa-broccoli --scale 1.15
 *   node scripts/patch-plan.js <plan> mackerel-quinoa-broccoli --kcal 3200
 *
 *   --dry-run prints the diff without writing.
 */

const fs   = require('fs');
const path = require('path');
const F    = require('./lib/foods.js');

/**
 * Find the one ingredient row a selector names.
 *
 * `name` on its own must be unambiguous. `name#husband` picks the row tagged for that person,
 * `name#shared` the untagged one. Refusing to guess matters here: the same food legitimately
 * appears twice in a recipe — a shared portion plus a `for:`-tagged top-up — and silently
 * patching the wrong one would move the nutrient to the wrong person, which is invisible in
 * the recipe total and only shows up as a per-person budget miss rounds later.
 */
function findRow(recipe, selector) {
  const [rawName, qualifier] = String(selector).split('#');
  const wanted = F.normalise(rawName);
  const resolved = F.resolve(rawName);

  const matches = recipe.ingredients.filter(ing => {
    const sameName = F.normalise(ing.name) === wanted ||
      (resolved && F.resolve(ing.name)?.food.key === resolved.food.key);
    if (!sameName) return false;
    if (qualifier === undefined) return true;
    if (qualifier === 'shared') return !ing.for;
    return ing.for === qualifier;
  });

  if (!matches.length) {
    const have = recipe.ingredients.map(i => i.for ? `${i.name}#${i.for}` : i.name);
    throw new Error(`"${rawName}"${qualifier ? `#${qualifier}` : ''} not in ${recipe.id}. ` +
                    `Has: ${have.join(', ')}`);
  }
  if (matches.length > 1) {
    const opts = matches.map(i => i.for ? `${rawName}#${i.for}` : `${rawName}#shared`);
    throw new Error(`"${rawName}" matches ${matches.length} rows in ${recipe.id} — ` +
                    `qualify it: ${opts.join(' or ')}`);
  }
  return matches[0];
}

/**
 * Recipe kcal, split into the part a scale operation may move and the part it may not.
 *
 * `portion_calibration.recipe_total_kcal` is a total over every row, tagged included, so a
 * `--kcal` target has to be measured against the same thing. But the tagged rows are not free
 * variables: they are the conventions a passing week established — the child's 250 ml of milk,
 * the wife's 25 g of walnuts, and above all her sterol drink, which is one 100 ml bottle
 * delivering the 2 g the LDL protocol asks for. Scaling that to 125 ml asks for something the
 * shop does not sell, and quietly reprices the highest-yield single item in her LDL protocol.
 * So scaling moves the shared rows and holds the tagged ones, and the factor is solved on the
 * shared portion alone.
 */
function recipeKcal(recipe) {
  let shared = 0, tagged = 0;
  for (const ing of recipe.ingredients) {
    const res = F.resolve(ing.name);
    if (!res) throw new Error(`unknown ingredient "${ing.name}" in ${recipe.id}`);
    const conv = F.toGrams(res.food, ing.quantity, ing.unit);
    if (conv.error) throw new Error(`${recipe.id}: ${conv.error}`);
    const kcal = F.nutritionFor(res.food, conv.grams).kcal;
    if (ing.for) tagged += kcal; else shared += kcal;
  }
  return { shared, tagged, total: shared + tagged };
}

/**
 * Round a scaled quantity to something a shopping list can be written against.
 *
 * Grams and millilitres go to 5s above 20 and to whole numbers below, because nobody weighs
 * 47.3 g of broccoli; counted units (pcs, slice, cloves) go to whole numbers because half an
 * egg is not a thing the plan should ever ask for.
 */
function tidy(quantity, unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'g' || u === 'ml') {
    return quantity >= 20 ? Math.round(quantity / 5) * 5 : Math.round(quantity);
  }
  return Math.max(1, Math.round(quantity));
}

function applyOps(recipe, ops) {
  const changes = [];

  if (ops.scale != null || ops.kcal != null) {
    const kcal = recipeKcal(recipe);
    let factor;
    if (ops.scale != null) {
      factor = ops.scale;
    } else {
      const room = ops.kcal - kcal.tagged;
      if (room <= 0) {
        throw new Error(`${recipe.id}: --kcal ${ops.kcal} is at or below the ${Math.round(kcal.tagged)} kcal ` +
                        `already in for:-tagged rows, which scaling holds fixed. ` +
                        `Set those quantities explicitly if they really need to move.`);
      }
      if (kcal.shared <= 0) throw new Error(`${recipe.id}: no untagged rows to scale`);
      factor = room / kcal.shared;
    }

    const held = [];
    for (const ing of recipe.ingredients) {
      if (ing.for) { held.push(`${ing.name}#${ing.for}`); continue; }
      const before = ing.quantity;
      ing.quantity = tidy(Number(before) * factor, ing.unit);
      if (ing.quantity !== before) {
        changes.push(`${ing.name}: ${before} → ${ing.quantity} ${ing.unit}`);
      }
    }
    if (held.length) changes.push(`(held for:-tagged rows unchanged: ${held.join(', ')})`);
  }

  for (const [selector, value] of ops.set) {
    const row = findRow(recipe, selector);
    const before = row.quantity;
    row.quantity = value;
    changes.push(`${row.name}${row.for ? `#${row.for}` : ''}: ${before} → ${value} ${row.unit}`);
  }

  for (const spec of ops.add) {
    const [namePart, rest] = spec.split('=');
    if (rest === undefined) throw new Error(`--add needs name=quantity[,unit[,for]] — got "${spec}"`);
    const [qty, unit = 'g', forWhom] = rest.split(',').map(s => s.trim());
    const name = namePart.trim();

    if (!F.resolve(name)) {
      throw new Error(`unknown ingredient "${name}" — add it to data/foods.json first ` +
                      `(see docs/OPERATIONS.md), do not rename around the catalog`);
    }
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`bad quantity in "${spec}"`);

    const row = { name, quantity, unit };
    if (forWhom) row.for = forWhom;
    recipe.ingredients.push(row);
    changes.push(`+ ${name}${forWhom ? `#${forWhom}` : ''}: ${quantity} ${unit}`);
  }

  for (const selector of ops.remove) {
    const row = findRow(recipe, selector);
    recipe.ingredients.splice(recipe.ingredients.indexOf(row), 1);
    changes.push(`- ${row.name}${row.for ? `#${row.for}` : ''} (was ${row.quantity} ${row.unit})`);
  }

  return changes;
}

function patchPlan(plan, recipeId, ops) {
  const recipe = (plan.recipes || []).find(r => r.id === recipeId);
  if (!recipe) {
    throw new Error(`no recipe "${recipeId}". Have: ${(plan.recipes || []).map(r => r.id).join(', ')}`);
  }
  if (!Array.isArray(recipe.ingredients)) throw new Error(`${recipeId} has no ingredients[]`);
  return { recipe, changes: applyOps(recipe, ops) };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const ops = { set: [], add: [], remove: [], scale: null, kcal: null };
  const positional = [];
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run')      { dryRun = true; continue; }
    if (a === '--add')          { ops.add.push(argv[++i]); continue; }
    if (a === '--remove')       { ops.remove.push(argv[++i]); continue; }
    if (a === '--scale')        { ops.scale = Number(argv[++i]); continue; }
    if (a === '--kcal')         { ops.kcal = Number(argv[++i]); continue; }
    if (a.startsWith('--'))     throw new Error(`unknown flag ${a}`);

    // A bare argument with an "=" is a set; the first two without one are file and recipe id.
    if (positional.length >= 2 && a.includes('=')) {
      const idx = a.indexOf('=');
      const value = Number(a.slice(idx + 1));
      if (!Number.isFinite(value) || value < 0) throw new Error(`bad quantity in "${a}"`);
      ops.set.push([a.slice(0, idx).trim(), value]);
    } else {
      positional.push(a);
    }
  }
  return { file: positional[0], recipeId: positional[1], ops, dryRun };
}

if (require.main === module) {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[FAIL] ${err.message}`);
    process.exit(1);
  }

  const { file, recipeId, ops, dryRun } = parsed;
  const hasOps = ops.set.length || ops.add.length || ops.remove.length ||
                 ops.scale != null || ops.kcal != null;
  if (!file || !recipeId || !hasOps) {
    console.error('Usage: node patch-plan.js <plan.json> <recipe-id> "ingredient=QTY" ...');
    console.error('       [--add "name=QTY[,unit[,for]]"] [--remove "name"] [--scale N] [--kcal N] [--dry-run]');
    process.exit(1);
  }

  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`[FAIL] File not found: ${resolved}`);
    process.exit(1);
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    console.error(`[FAIL] JSON parse error: ${err.message}`);
    process.exit(1);
  }

  let result;
  try {
    result = patchPlan(plan, recipeId, ops);
  } catch (err) {
    console.error(`[FAIL] ${err.message}`);
    process.exit(1);
  }

  if (!result.changes.length) {
    console.log(`${recipeId}: nothing changed.`);
    process.exit(0);
  }

  console.log(`${recipeId}:`);
  result.changes.forEach(c => console.log(`  ${c}`));

  if (dryRun) {
    console.log('\n--dry-run: not written.');
    process.exit(0);
  }

  fs.writeFileSync(resolved, JSON.stringify(plan, null, 2) + '\n');
  console.log(`\nWrote ${path.basename(resolved)}. Re-run validate-plan.js.`);
}

module.exports = { patchPlan, findRow, recipeKcal, tidy, parseArgs };
