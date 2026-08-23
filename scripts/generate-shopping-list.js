#!/usr/bin/env node
'use strict';

/**
 * Assemble shopping_list[] from recipe ingredients, using data/foods.json for the
 * display name, category and purchase unit.
 *
 * This used to be a two-step flow: emit a template of every ingredient key, have the
 * model fill in a Russian display_name / category / note for each, then assemble.
 * That was a whole generation pass per week and it produced 27 different category
 * headings across 5 weeks, with 79 ingredients filed under different headings in
 * different weeks (картофель appeared under four). The catalog makes that
 * deterministic and free.
 *
 * Quantities are correct because recipe.serves is validated against the number of
 * menu slots the recipe fills, so summing each recipe's totals exactly once is right.
 *
 * Usage
 *   node scripts/generate-shopping-list.js data/weeks/2026-W27.json
 *   node scripts/generate-shopping-list.js data/weeks/2026-W27.json --notes data/weeks/2026-W27-notes.json
 *   node scripts/generate-shopping-list.js data/weeks/2026-W27.json --dry-run
 */

const fs   = require('fs');
const path = require('path');
const F    = require('./lib/foods.js');

/** Category print order — walk the shop rather than bounce around it. */
const CATEGORY_ORDER = [
  'Рыба и морепродукты',
  'Мясо и птица',
  'Яйца и молочные продукты',
  'Молочное растительное и соя',
  'Овощи и зелень',
  'Фрукты и ягоды',
  'Крупы и бакалея',
  'Хлеб и хлебцы',
  'Бобовые и консервы',
  'Орехи и семена',
  'Масла и соусы',
  'Специи и приправы',
  'Прочее'
];

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Aggregate every ingredient row into grams per catalog food, remembering which
 * source units were used so the output unit can be chosen sensibly.
 */
function aggregate(weekData) {
  const byFood = new Map();
  const errors = [];

  for (const recipe of (weekData.recipes || [])) {
    for (const ing of (recipe.ingredients || [])) {
      const res = F.resolve(ing.name);
      if (!res) {
        errors.push(`Unknown ingredient "${ing.name}" in recipe "${recipe.id}" — add it to data/foods.json`);
        continue;
      }
      const conv = F.toGrams(res.food, ing.quantity, ing.unit);
      if (conv.error) {
        errors.push(`Recipe "${recipe.id}": "${ing.name}" — ${conv.error}`);
        continue;
      }
      const key = res.food.key;
      if (!byFood.has(key)) {
        byFood.set(key, { food: res.food, grams: 0, units: new Set(), names: new Set() });
      }
      const entry = byFood.get(key);
      entry.grams += conv.grams;
      entry.units.add(String(ing.unit || '').toLowerCase());
      entry.names.add(ing.name);
    }
  }
  return { byFood, errors };
}

/** Pick the unit a human would buy in, and convert. */
function presentQuantity(entry) {
  const { food, grams, units } = entry;
  const gPer = food.g_per || {};

  // Whole items people count rather than weigh
  if (gPer.pcs != null && (units.has('pcs') || units.has('pc') || units.has('piece') ||
                           units.has('cloves') || units.has('slice') || units.has('slices') ||
                           units.has('stalks') || units.has('medium') || units.has('large') || units.has('small') ||
                           units.has('whole'))) {
    return { quantity: String(Math.max(1, Math.ceil(grams / gPer.pcs))), unit: 'pcs' };
  }

  // Liquids stay liquid
  const liquidOnly = [...units].every(u => u === 'ml' || u === 'l' || u === 'мл');
  if (liquidOnly && units.size > 0) {
    const density = food.density != null ? food.density : 1.0;
    return { quantity: String(Math.round(grams / density)), unit: 'ml' };
  }

  // Spice-sized amounts read better rounded to whole grams with a floor of 1
  return { quantity: String(Math.max(1, Math.round(grams))), unit: 'g' };
}

function buildShoppingList(weekData, noteOverrides = {}) {
  const { byFood, errors } = aggregate(weekData);
  if (errors.length) return { errors, shoppingList: null };

  const groups = new Map();
  for (const entry of byFood.values()) {
    const cat = entry.food.cat || 'Прочее';
    if (!groups.has(cat)) groups.set(cat, []);

    const { quantity, unit } = presentQuantity(entry);
    const item = {
      id:       `${entry.food.key}|${unit}`,
      name:     capitalise(entry.food.name_ru),
      quantity,
      unit
    };
    const note = noteOverrides[entry.food.key] !== undefined
      ? noteOverrides[entry.food.key]
      : (entry.food.note != null ? entry.food.note : null);
    if (note) item.note = note;

    groups.get(cat).push(item);
  }

  const ordered = [...groups.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const shoppingList = ordered.map(category => ({
    category,
    items: groups.get(category).sort((x, y) => x.name.localeCompare(y.name, 'ru'))
  }));

  return { errors: [], shoppingList };
}

if (require.main === module) {
  const args     = process.argv.slice(2);
  const notesIdx = args.indexOf('--notes');
  const notesArg = notesIdx !== -1 ? args[notesIdx + 1] : null;
  const dryRun   = args.includes('--dry-run');
  // Positional args, excluding the value that belongs to --notes
  const notesValueIdx = notesIdx === -1 ? -1 : notesIdx + 1;
  const week = args.filter((a, i) => !a.startsWith('--') && i !== notesValueIdx)[0];

  if (!week) {
    console.error('Usage: node generate-shopping-list.js <week.json> [--notes <notes.json>] [--dry-run]');
    process.exit(1);
  }
  const resolved = path.resolve(week);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  let noteOverrides = {};
  if (notesArg) {
    const np = path.resolve(notesArg);
    if (!fs.existsSync(np)) {
      console.error(`Notes file not found: ${np}`);
      process.exit(1);
    }
    noteOverrides = JSON.parse(fs.readFileSync(np, 'utf8'));
  }

  const weekData = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const { errors, shoppingList } = buildShoppingList(weekData, noteOverrides);

  if (errors.length) {
    errors.forEach(e => console.error(`[FAIL] ${e}`));
    process.exit(1);
  }

  const itemCount = shoppingList.reduce((t, c) => t + c.items.length, 0);

  if (dryRun) {
    for (const cat of shoppingList) {
      console.log(`\n${cat.category}`);
      cat.items.forEach(i => console.log(`  ${i.name} — ${i.quantity} ${i.unit}${i.note ? `  (${i.note})` : ''}`));
    }
    console.log(`\n[DRY RUN] ${shoppingList.length} categories, ${itemCount} items. Nothing written.`);
    process.exit(0);
  }

  weekData.shopping_list = shoppingList;
  fs.writeFileSync(resolved, JSON.stringify(weekData, null, 2), 'utf8');
  console.log(`Wrote ${shoppingList.length} categories, ${itemCount} items to ${path.basename(resolved)}`);
}

module.exports = { buildShoppingList, aggregate, CATEGORY_ORDER };
