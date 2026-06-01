#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function aggregateIngredients(weekData) {
  const map = new Map();
  for (const recipe of (weekData.recipes || [])) {
    for (const ing of (recipe.ingredients || [])) {
      const key = `${ing.name.toLowerCase()}|${ing.unit}`;
      if (map.has(key)) {
        map.get(key).quantity += Number(ing.quantity) || 0;
      } else {
        map.set(key, { name: ing.name.toLowerCase(), unit: ing.unit, quantity: Number(ing.quantity) || 0 });
      }
    }
  }
  return map;
}

function templateMode(weekPath) {
  const weekData = JSON.parse(fs.readFileSync(weekPath, 'utf8'));
  const agg = aggregateIngredients(weekData);

  const entries = [...agg.values()].map(({ name, unit }) => ({
    recipe_key:   name,
    unit,
    display_name: null,
    category:     null,
    note:         null
  }));

  const weekId  = weekData.week?.id || path.basename(weekPath, '.json');
  const outPath = path.join(path.dirname(weekPath), `${weekId}-shopping-meta.json`);
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf8');
  console.log(`Wrote ${entries.length} ingredient entries to ${outPath}`);
}

function assembleMode(weekPath, metaPath) {
  const weekData = JSON.parse(fs.readFileSync(weekPath, 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const agg = aggregateIngredients(weekData);

  // Build lookup from (recipe_key, unit) → meta entry
  const metaMap = new Map();
  for (const m of metadata) {
    metaMap.set(`${m.recipe_key}|${m.unit}`, m);
  }

  // Check for unmatched ingredients
  const unmatched = [];
  for (const [key, ing] of agg) {
    if (!metaMap.has(key)) {
      unmatched.push(ing);
    }
  }
  if (unmatched.length) {
    for (const u of unmatched) {
      console.error(`[WARN] No metadata for: "${u.name}" (unit: ${u.unit})`);
    }
    process.exit(1);
  }

  // Group by category, preserving first-seen order
  const categoryMap = new Map();
  for (const [key, ing] of agg) {
    const meta = metaMap.get(key);
    const cat  = meta.category;
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    const item = {
      id:       `${toSlug(meta.display_name || ing.name)}|${ing.unit}`,
      name:     meta.display_name || ing.name,
      quantity: String(Math.round(ing.quantity)),
      unit:     ing.unit
    };
    if (meta.note != null) item.note = meta.note;
    categoryMap.get(cat).push(item);
  }

  const shoppingList = [...categoryMap.entries()].map(([category, items]) => ({ category, items }));

  // Write back into week JSON
  const raw     = fs.readFileSync(weekPath, 'utf8');
  const updated = JSON.parse(raw);
  updated.shopping_list = shoppingList;
  fs.writeFileSync(weekPath, JSON.stringify(updated, null, 2), 'utf8');

  const itemCount = shoppingList.reduce((t, c) => t + c.items.length, 0);
  console.log(`Wrote ${shoppingList.length} categories, ${itemCount} items to ${path.basename(weekPath)}`);
}

// CLI
const [,, weekPath, second] = process.argv;
if (!weekPath) {
  console.error('Usage:');
  console.error('  node generate-shopping-list.js <week.json> --template');
  console.error('  node generate-shopping-list.js <week.json> <shopping-meta.json>');
  process.exit(1);
}

const resolvedWeek = path.resolve(weekPath);
if (!fs.existsSync(resolvedWeek)) {
  console.error(`File not found: ${resolvedWeek}`);
  process.exit(1);
}

if (second === '--template') {
  templateMode(resolvedWeek);
} else if (second) {
  const resolvedMeta = path.resolve(second);
  if (!fs.existsSync(resolvedMeta)) {
    console.error(`Metadata file not found: ${resolvedMeta}`);
    process.exit(1);
  }
  assembleMode(resolvedWeek, resolvedMeta);
} else {
  console.error('Missing second argument: --template or <shopping-meta.json>');
  process.exit(1);
}
