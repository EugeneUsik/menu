#!/usr/bin/env node
'use strict';

/**
 * Validate a published week file.
 *
 * Structure and safety checks apply to every schema version. Nutrition-budget and
 * serving-count checks apply from schema_version 2.1 onward, because 2.0 files carry
 * hand-written per-person nutrition with no declared serving count and cannot be
 * held to a computed budget. For 2.0 files those checks downgrade to warnings.
 *
 * Usage
 *   node scripts/validate-week.js data/weeks/2026-W27.json
 */

const fs   = require('fs');
const path = require('path');
const { scanSafety } = require('./lib/scan.js');
const { analyze, loadTargets, eatersFor, MAIN_SLOTS, ALL_SLOTS } = require('./lib/analyze.js');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function r1(n) { return Math.round(n * 10) / 10; }
function pct(n) { return `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`; }

function validateWeek(filePath) {
  const errors   = [];
  const warnings = [];
  const add  = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);

  if (!fs.existsSync(filePath)) {
    add(`File not found: ${filePath}`);
    return { pass: false, errors, warnings };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    add(`JSON parse error: ${err.message}`);
    return { pass: false, errors, warnings };
  }

  // ── Required top-level fields ───────────────────────────────────────────────
  const required = ['schema_version', 'week', 'menu', 'recipes', 'shopping_list', 'daily_nutrition'];
  const missing  = required.filter(f => data[f] == null);
  if (missing.length) add(`Missing required fields: ${missing.join(', ')}`);

  const week = data.week || {};
  if (!week.id)         add('Missing week.id');
  if (!week.start_date) add('Missing week.start_date');
  if (!week.end_date)   add('Missing week.end_date');

  const modern = String(data.schema_version || '') >= '2.1';

  // ── menu shape ─────────────────────────────────────────────────────────────
  if (!Array.isArray(data.menu)) {
    add('menu is not an array');
  } else if (data.menu.length !== 7) {
    add(`menu must have exactly 7 days, found ${data.menu.length}`);
  } else {
    data.menu.forEach((day, i) => {
      const name = day.day_name || `Day ${i + 1}`;
      for (const slot of MAIN_SLOTS) {
        if (!day[slot] || !day[slot].title) add(`${name}: missing or empty ${slot}.title`);
      }
      if (modern && day.day_name !== DAY_NAMES[i]) {
        add(`menu[${i}].day_name should be "${DAY_NAMES[i]}", found "${day.day_name}"`);
      }
      if (modern && day.includes_fixed_school_lunch === undefined) {
        add(`${name}: missing includes_fixed_school_lunch (true Mon-Fri, false Sat-Sun)`);
      }
    });
  }

  // ── recipes ────────────────────────────────────────────────────────────────
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

    // Every recipe needs real cooking instructions (>= 2 non-empty steps)
    for (const r of data.recipes) {
      const steps = Array.isArray(r.instructions)
        ? r.instructions.filter(s => typeof s === 'string' && s.trim().length > 0)
        : [];
      if (steps.length < 2) {
        add(`Recipe "${r.id || r.title || '(unknown)'}" must have at least 2 non-empty instruction steps, found ${steps.length}`);
      }
    }
  }

  // ── recipe_id references + serving-count agreement ─────────────────────────
  const slotUse = new Map();
  if (Array.isArray(data.menu)) {
    data.menu.forEach((day, i) => {
      for (const slot of ALL_SLOTS) {
        const id = day[slot]?.recipe_id;
        if (!id) continue;
        if (!slotUse.has(id)) slotUse.set(id, []);
        slotUse.get(id).push({ day: i, slot, dayName: day.day_name || `Day ${i + 1}` });
      }
    });
  }

  if (Array.isArray(data.recipes)) {
    const recipeIds = new Set(data.recipes.map(r => r.id).filter(Boolean));
    const broken = [...slotUse.keys()].filter(id => !recipeIds.has(id));
    if (broken.length) add(`Broken recipe_id references: ${broken.join(', ')}`);

    const targets = loadTargets();
    for (const r of data.recipes) {
      const uses = slotUse.get(r.id) || [];
      if (!uses.length) {
        warn(`Recipe "${r.id}" is never referenced by the menu`);
        continue;
      }
      // Portion count depends on WHO eats each occasion: the child has lunch at school
      // Mon-Fri, so a dinner carrying into a weekday lunch is 5 portions, not 6.
      const expected = uses.reduce(
        (n, u) => n + eatersFor(u.slot, data.menu[u.day], targets).length, 0
      );

      if (modern) {
        if (!Number.isFinite(Number(r.serves)) || Number(r.serves) <= 0) {
          add(`Recipe "${r.id}" is missing a valid "serves"`);
        } else if (Number(r.serves) !== expected) {
          const detail = uses
            .map(u => `${u.dayName} ${u.slot} → ${eatersFor(u.slot, data.menu[u.day], targets).length}`)
            .join('; ');
          add(`Recipe "${r.id}": serves=${r.serves} but the menu needs ${expected} portion(s) — ${detail}. ` +
              `Shopping quantities are summed once per recipe, so a mismatch silently over- or under-buys.`);
        }
      }

      // A recipe in more than one slot must be a dinner → next-day-lunch pair.
      // Anything else means the shopping list is wrong: quantities are summed once
      // per recipe, so a snack repeated on two separate days is bought only once.
      if (uses.length > 1) {
        const dinner = uses.find(u => u.slot === 'dinner');
        const lunch  = uses.find(u => u.slot === 'lunch');
        const legit  = uses.length === 2 && dinner && lunch && lunch.day === dinner.day + 1;
        if (!legit) {
          const where = uses.map(u => `${u.dayName}/${u.slot}`).join(', ');
          const msg = `Recipe "${r.id}" is used in ${uses.length} slots (${where}) but only a dinner → next-day-lunch ` +
                      `pair is supported; shopping quantities are summed once per recipe. Split it into separate recipes.`;
          modern ? add(msg) : warn(msg);
        }
      }
    }
  }

  // cook_once_eat_twice / leftover_from consistency
  if (Array.isArray(data.menu)) {
    for (let i = 0; i < data.menu.length - 1; i++) {
      const dinner = data.menu[i].dinner;
      if (!dinner?.cook_once_eat_twice) continue;
      const nextLunch = data.menu[i + 1].lunch;
      if (nextLunch?.recipe_id !== dinner.recipe_id) {
        add(`menu[${i}] dinner cook_once_eat_twice=true but menu[${i + 1}] lunch recipe_id doesn't match`);
      }
      if (!nextLunch?.leftover_from) {
        warn(`menu[${i + 1}] lunch missing leftover_from (expected since previous dinner is cook_once_eat_twice)`);
      }
    }
  }

  // ── shopping list ──────────────────────────────────────────────────────────
  if (!Array.isArray(data.shopping_list)) {
    add('shopping_list is not an array');
  } else {
    const itemIds = [];
    for (const cat of data.shopping_list) {
      for (const item of (cat.items || [])) if (item.id) itemIds.push(item.id);
    }
    if (new Set(itemIds).size !== itemIds.length) {
      const dupes = itemIds.filter((id, i) => itemIds.indexOf(id) !== i);
      add(`Duplicate shopping item IDs: ${[...new Set(dupes)].join(', ')}`);
    }
    if (modern && itemIds.length === 0 && Array.isArray(data.recipes) && data.recipes.length) {
      add('shopping_list is empty — run scripts/generate-shopping-list.js');
    }
  }

  // ── daily_nutrition ───────────────────────────────────────────────────────
  if (!Array.isArray(data.daily_nutrition)) {
    add('daily_nutrition is not an array');
  } else if (data.daily_nutrition.length !== 0 && data.daily_nutrition.length !== 7) {
    add(`daily_nutrition must be empty [] or have 7 entries, found ${data.daily_nutrition.length}`);
  } else if (data.daily_nutrition.length === 7) {
    data.daily_nutrition.forEach((d, i) => {
      if (!d.child || d.child.includes_fixed_school_snack === undefined) {
        warn(`daily_nutrition[${i}].child missing includes_fixed_school_snack field`);
      }
    });
  }

  // ── Safety scan ───────────────────────────────────────────────────────────
  scanSafety(data).forEach(add);

  // ── Derived nutrition budgets ─────────────────────────────────────────────
  // Requires schema 2.1. A 2.0 file declares no `serves`, so portion size is unknown
  // and every derived total would be off by the recipe's true serving count — scoring
  // those against a budget produces dozens of meaningless warnings, not information.
  if (!modern) {
    warnings.push(`schema_version ${data.schema_version || '(none)'}: nutrition budgets not checked ` +
                  `(needs 2.1 with per-recipe "serves"). Structure and safety checks did run.`);
  } else if (Array.isArray(data.menu) && Array.isArray(data.recipes) && errors.length === 0) {
    const A = analyze(data);
    const report = add;

    A.problems.forEach(p => report(p));

    if (!A.problems.length) {
      const { targets, people, daily } = A;
      const tol = targets.tolerance;

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
              Math.abs(off) > tol.day_pct ? report(msg) : warn(msg);
            }
            if (spec.max != null && actual > spec.max) {
              const off = (actual - spec.max) / spec.max;
              const msg = `${d.day_name} ${p} ${key} ${r1(actual)} above max ${spec.max} (${pct(off)})`;
              Math.abs(off) > tol.day_pct ? report(msg) : warn(msg);
            }
          }
        }
      }

      for (const p of people) {
        const t = targets.daily[p];
        for (const key of ['kcal', 'protein_g', 'fiber_g']) {
          const spec = t[key];
          if (!spec) continue;
          const avg = daily.reduce((s, d) => s + d.totals[p][key], 0) / daily.length;
          if (spec.min != null && avg < spec.min * (1 - tol.avg_pct)) {
            report(`Weekly average ${p} ${key} ${r1(avg)} below min ${spec.min}`);
          }
          if (spec.max != null && avg > spec.max * (1 + tol.avg_pct)) {
            report(`Weekly average ${p} ${key} ${r1(avg)} above max ${spec.max}`);
          }
        }
      }
    }
  }

  return { pass: errors.length === 0, errors, warnings };
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node validate-week.js <path-to-week.json>');
    process.exit(1);
  }

  const result = validateWeek(path.resolve(filePath));

  if (result.warnings.length) result.warnings.forEach(w => console.warn(`[WARN] ${w}`));
  if (result.errors.length) {
    result.errors.forEach(e => console.error(`[FAIL] ${e}`));
    console.log('\nResult: FAIL');
    process.exit(1);
  }

  console.log(`[PASS] ${path.basename(filePath)} — all checks passed`);
  if (result.warnings.length) console.log(`       (${result.warnings.length} warning(s))`);
}

module.exports = { validateWeek };
