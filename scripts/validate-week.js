#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const BANNED_FRUITS = [
  'cherry','cherries','vyšnia','vyšnios','vyšnių','вишня','вишни',
  'apple','apples','obuolys','obuoliai','obuolių','яблоко','яблоки','яблочный',
  'pear','pears','kriaušė','kriaušės','kriaušių','груша','груши',
  'apricot','apricots','abrikosas','abrikosai','abrikosų','абрикос','абрикосы',
  'peach','peaches','persikas','persikai','persikų','персик','персики'
];

const PROCESSED_MEATS = [
  'ham','bacon','sausage','sausages','salami','hot dog','hotdog',
  'deli meat','processed meat','smoked sausage','smoked ham',
  'kumpis','dešra','dešros','dešrelė','dešrelės','šoninė','saliamis',
  'ветчина','бекон','колбаса','колбаски','сосиска','сосиски','салями'
];

function containsTerm(text, term) {
  if (!text) return false;
  if (term.includes(' ')) return text.toLowerCase().includes(term.toLowerCase());
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

// skipKeys: Set or array of key names to skip entirely when recursing
function scanTerms(obj, terms, skipKeys, path = '') {
  const hits = [];
  const skip = new Set(Array.isArray(skipKeys) ? skipKeys : (skipKeys ? [skipKeys] : []));
  if (obj === null || obj === undefined) return hits;
  if (typeof obj === 'string') {
    for (const term of terms) {
      if (containsTerm(obj, term)) hits.push({ term, path, value: obj.slice(0, 80) });
    }
    return hits;
  }
  if (typeof obj !== 'object') return hits;
  for (const key of Object.keys(obj)) {
    if (skip.has(key)) continue;
    const childPath = path ? `${path}.${key}` : key;
    hits.push(...scanTerms(obj[key], terms, skipKeys, childPath));
  }
  return hits;
}

function validateWeek(filePath) {
  const errors   = [];
  const warnings = [];
  const add  = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);

  // 1. File exists
  if (!fs.existsSync(filePath)) {
    add(`File not found: ${filePath}`);
    return { pass: false, errors, warnings };
  }

  // 2. JSON parses
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    add(`JSON parse error: ${err.message}`);
    return { pass: false, errors, warnings };
  }

  // 3. Required top-level fields
  const required = ['schema_version','week','menu','recipes','shopping_list','daily_nutrition','weekly_validation','safety'];
  const missing  = required.filter(f => data[f] == null);
  if (missing.length) add(`Missing required fields: ${missing.join(', ')}`);

  // 4. week sub-fields
  const week = data.week || {};
  if (!week.id)         add('Missing week.id');
  if (!week.start_date) add('Missing week.start_date');
  if (!week.end_date)   add('Missing week.end_date');

  // 5. menu length = 7
  if (!Array.isArray(data.menu)) {
    add('menu is not an array');
  } else if (data.menu.length !== 7) {
    add(`menu must have exactly 7 days, found ${data.menu.length}`);
  } else {
    // 6. Each day has required meal slots with non-empty titles
    data.menu.forEach((day, i) => {
      const name = day.day_name || `Day ${i + 1}`;
      for (const slot of ['breakfast','lunch','dinner']) {
        if (!day[slot] || !day[slot].title) {
          add(`${name}: missing or empty ${slot}.title`);
        }
      }
    });
  }

  // 7. recipes non-empty + no duplicate IDs
  if (!Array.isArray(data.recipes)) {
    add('recipes is not an array');
  } else if (data.recipes.length === 0) {
    add('recipes array is empty');
  } else {
    const ids    = data.recipes.map(r => r.id).filter(Boolean);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      add(`Duplicate recipe IDs: ${[...new Set(dupes)].join(', ')}`);
    }
  }

  // 8. recipe_id references resolve
  if (Array.isArray(data.recipes) && Array.isArray(data.menu)) {
    const recipeIds = new Set(data.recipes.map(r => r.id).filter(Boolean));
    const broken    = [];
    for (const day of data.menu) {
      for (const slot of ['breakfast','lunch','dinner','shared_snack']) {
        const meal = day[slot];
        if (meal && meal.recipe_id && !recipeIds.has(meal.recipe_id)) {
          broken.push(meal.recipe_id);
        }
      }
    }
    const unique = [...new Set(broken)];
    if (unique.length) add(`Broken recipe_id references: ${unique.join(', ')}`);
  }

  // 9. shared_snack count >= 4
  if (Array.isArray(data.menu)) {
    const count = data.menu.filter(d => d.shared_snack && d.shared_snack.title).length;
    if (count < 4) add(`shared_snack must appear on ≥4 days, found ${count}`);
  }

  // 10. shopping_list is array
  if (!Array.isArray(data.shopping_list)) {
    add('shopping_list is not an array');
  } else {
    // 11. No duplicate shopping item IDs
    const itemIds = [];
    for (const cat of data.shopping_list) {
      for (const item of (cat.items || [])) {
        if (item.id) itemIds.push(item.id);
      }
    }
    const uniqueItemIds = new Set(itemIds);
    if (uniqueItemIds.size !== itemIds.length) {
      const dupes = itemIds.filter((id, i) => itemIds.indexOf(id) !== i);
      add(`Duplicate shopping item IDs: ${[...new Set(dupes)].join(', ')}`);
    }
  }

  // 12. daily_nutrition length = 7
  if (!Array.isArray(data.daily_nutrition)) {
    add('daily_nutrition is not an array');
  } else if (data.daily_nutrition.length !== 7) {
    add(`daily_nutrition must have 7 entries, found ${data.daily_nutrition.length}`);
  } else {
    // 13. child entries have includes_fixed_school_snack
    data.daily_nutrition.forEach((d, i) => {
      if (!d.child || d.child.includes_fixed_school_snack === undefined) {
        warn(`daily_nutrition[${i}].child missing includes_fixed_school_snack field`);
      }
    });
  }

  // 14. safety.fixed_child_snack_accounted_for
  const safety = data.safety || {};
  if (safety.fixed_child_snack_accounted_for === undefined) {
    add('safety.fixed_child_snack_accounted_for is missing');
  }

  // Meta fields are administrative summaries — skip them in term scans
  const META_SKIP = ['safety', 'weekly_validation', 'assumptions', 'household_context_version', 'schema_version', 'language'];

  // 15. Banned fruit scan (food content only; skip meta + child_fixed_school_snack is already safe since fruits aren't expected there)
  const fruitHits = scanTerms(data, BANNED_FRUITS, META_SKIP);
  if (fruitHits.length) {
    fruitHits.forEach(h => add(`Banned fruit term "${h.term}" at path: ${h.path}`));
  }

  // 16. Processed meat scan (food content; skip meta + child_fixed_school_snack)
  const meatHits = scanTerms(data, PROCESSED_MEATS, [...META_SKIP, 'child_fixed_school_snack']);
  if (meatHits.length) {
    meatHits.forEach(h => add(`Processed meat term "${h.term}" at path: ${h.path}`));
  }

  return {
    pass:     errors.length === 0,
    errors,
    warnings
  };
}

// CLI entry point
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node validate-week.js <path-to-week.json>');
    process.exit(1);
  }

  const result = validateWeek(path.resolve(filePath));

  if (result.warnings.length) {
    result.warnings.forEach(w => console.warn(`[WARN] ${w}`));
  }
  if (result.errors.length) {
    result.errors.forEach(e => console.error(`[FAIL] ${e}`));
    console.log('\nResult: FAIL');
    process.exit(1);
  }

  console.log(`[PASS] ${path.basename(filePath)} — all checks passed`);
  if (result.warnings.length) console.log(`       (${result.warnings.length} warning(s))`);
}

module.exports = { validateWeek };
