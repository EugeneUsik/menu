#!/usr/bin/env node
'use strict';

/**
 * Turn a terse spec — which dishes, which slot, which foods — into a full, correctly scaled plan.
 *
 * Authoring a plan by hand means writing ~400 lines of JSON, of which only a fraction is a
 * decision. The rest is arithmetic and convention: quantities scaled to the calibration median,
 * the `for:`-tagged rows every passing week carries, the cook-once dinner wired to the next day's
 * lunch, `meal_types`, cooking times. All of that is derivable, and deriving it removes the two
 * things that actually cost W36its rounds — a mis-scaled first draft, and a forgotten
 * `for: "husband"` row.
 *
 * What the spec still has to say is exactly what a human decides:
 *
 *   {
 *     "week": "2026-W37",
 *     "days": [
 *       { "breakfast": { "title": "Овсянка с черникой", "id": "oats-blueberry", "base": "oats",
 *                        "foods": ["хлопья овсяные", "скир 0–2%", "черника", "семена тыквы"] },
 *         "lunch":     { "title": "Суп из чечевицы", "id": "lentil-soup",
 *                        "foods": ["чечевица красная", "морковь", "шпинат свежий", "масло оливковое"] },
 *         "dinner":    { "title": "Скумбрия с киноа", "id": "mackerel-quinoa", "format": "tray_bake",
 *                        "carry": true,
 *                        "foods": ["филе скумбрии", "киноа", "брокколи", "масло оливковое"] },
 *         "snack":     { "title": "Кефир с малиной", "id": "kefir-raspberry", "snack_format": "yogurt_based",
 *                        "foods": ["кефир 1–2,5%", "малина", "семена льна молотые"] } },
 *       ... 7 days, Monday first
 *     ]
 *   }
 *
 * `carry: true` on a dinner wires the next day's lunch to the same recipe, so that lunch may be
 * omitted. A food may pin its own quantity — `"филе лосося=520"` — when the split needs a hand.
 *
 * The output is a normalised plan: `serves`, dates, label and day scaffolding are all filled, so
 * the next command is validate-plan.js. Nothing here is a gate, and nothing here is trusted —
 * every number it writes is checked downstream exactly as a hand-written one would be.
 *
 * Usage
 *   node scripts/scaffold-plan.js <spec.json>                 # writes data/weeks/{week}-plan.json
 *   node scripts/scaffold-plan.js <spec.json> --dry-run
 */

const fs   = require('fs');
const path = require('path');
const F    = require('./lib/foods.js');
const { analyze, loadTargets } = require('./lib/analyze.js');
const { normalisePlan }        = require('./normalise-plan.js');
const { tidy }                 = require('./patch-plan.js');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'weeks', 'recent-history.json');
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Energy share by role, per slot — MEASURED from the last passing week rather than guessed.
 *
 * A guess here is not harmless: too high a protein share is what put the husband 10–15% over his
 * protein ceiling on four days of the first W36 draft, and too low a fat share is what put him
 * under his 25%-of-energy floor on three. These are the shares that actually passed.
 *
 * Regenerate with the one-liner in docs/OPERATIONS.md when a week changes the pattern materially.
 */
const ROLE_SHARE = {
  breakfast:      { starch: 0.44, dairy: 0.26, fat: 0.15, produce: 0.08, protein: 0.06 },
  lunch:          { protein: 0.40, starch: 0.30, fat: 0.14, produce: 0.12, dairy: 0.03 },
  dinner:         { starch: 0.38, protein: 0.34, produce: 0.14, fat: 0.13 },
  'dinner+lunch': { starch: 0.41, protein: 0.33, fat: 0.15, produce: 0.11 },
  shared_snack:   { dairy: 0.24, produce: 0.21, protein: 0.20, starch: 0.19, fat: 0.16 }
};

/** Fallback recipe totals, used only when no calibration exists yet (a first week, or no history). */
const FALLBACK_KCAL = {
  'breakfast (serves 3)': 1790, 'lunch (serves 2)': 1280, 'lunch (serves 3)': 1700,
  'dinner (serves 3)': 1900, 'dinner+lunch (serves 5)': 3200, 'dinner+lunch (serves 6)': 3300,
  'shared_snack (serves 3)': 850
};

/**
 * Plausible grams PER PORTION for a food, as a band rather than a ceiling.
 *
 * A ceiling alone is not enough, and the first scaffolded week showed why: energy that hit the
 * vegetable cap was redistributed into whatever still had room, which produced 1,600 g of soy
 * milk in a snack, 135 g of fresh dill, 1.2 eggs across an omelette for three, and 12 g of
 * almonds in a dish called "Миндаль с апельсином". Every one of those passed `validate-plan.js`,
 * because per-person nutrition was in range — the gate checks budgets and variety, not whether a
 * human would cook the result. Plausibility has to be a constraint here or it is nowhere.
 *
 * The dry-grain figure is the one with teeth beyond plausibility: 16 catalog foods carry per-100 g
 * nutrition on a DRY basis, so a cooked weight against one of them overstates energy ~3x and
 * over-buys ~3x. It comes from targets.json so it cannot drift from the warning the gate emits.
 */
function bandFor(food, targets) {
  const dryCap = targets.cooking?.dry_grain_g_per_portion_max || 150;
  const has = t => F.hasTag(food, t);

  // Herbs, spices and salt are garnish and seasoning: they belong to expansion, where they are
  // stated in grams, not to an energy allocation that would scale them into the main event.
  if (has('herb') || has('spice') || has('salt')) return { min: 1, max: 4, fixed: true };

  if (food.basis === 'dry')                        return { min: 35, max: dryCap };
  if (has('fat') && !has('fruit'))                 return { min: 3,  max: 15 };   // oils
  if (has('nut') || has('seed'))                   return { min: 8,  max: 35 };
  if (has('grain_bread') || has('grain'))          return { min: 25, max: 110 };
  if (has('vegetable_starchy'))                    return { min: 110, max: 320 };
  if (has('eggs'))                                 return { min: 55, max: 130 };
  // One band for dairy whether it is poured or spooned. Keying off `density` looked like the way
  // to tell a drink from a bowl, but water-like foods omit the field entirely — so milk, which is
  // measured in ml, was getting the narrower band and failing at a perfectly ordinary 250 ml.
  if (has('dairy'))                                return { min: 50, max: 250 };
  if (has('soy') || has('legume'))                 return { min: 50, max: 220 };
  if (has('fatty_fish') || has('white_fish') || has('seafood') ||
      has('poultry')    || has('red_meat'))        return { min: 90, max: 230 };
  if (has('vegetable'))                            return { min: 50, max: 300 };
  if (has('fruit'))                                return { min: 50, max: 260 };
  return { min: 5, max: 300 };
}

function roleOf(food) {
  const t = food.tags || [];
  if (t.some(x => ['fatty_fish', 'white_fish', 'seafood', 'poultry', 'red_meat', 'eggs', 'legume', 'soy'].includes(x))) {
    return 'protein';
  }
  if (t.includes('dairy')) return 'dairy';
  if (t.some(x => x.startsWith('grain')) || t.includes('vegetable_starchy')) return 'starch';
  if (t.includes('fat') || t.includes('nut') || t.includes('seed')) return 'fat';
  if (t.includes('vegetable') || t.includes('fruit')) return 'produce';
  return 'other';
}

/**
 * The `for:`-tagged conventions every breakfast carries.
 *
 * These are not seasoning. A shared ingredient reaches the child at 1.1/3.0 and the wife at
 * 0.75/3.0, so anything that has to hit a per-person number has to be tagged or it arrives at a
 * third of the intended amount. The husband's row is the one that gets forgotten, and it is the
 * widest-failing omission in the whole flow: without it he is ~400 kcal short on all seven days
 * plus the weekly average, and his breakfast protein drops under the 35 g pre-training floor.
 *
 * His carbohydrate rotates between oat and barley flakes rather than bread on purpose — flakes
 * carry no `grain_bread` pressure, and `grain_base_meals_max` is 3 across 21 main meals.
 */
function taggedRows(dayIndex) {
  const husbandCarb = dayIndex % 2 === 0
    ? { name: 'хлопья овсяные',  quantity: 90, unit: 'g', prep: 'сухой вес', for: 'husband' }
    : { name: 'хлопья ячменные', quantity: 95, unit: 'g', prep: 'сухой вес', for: 'husband' };
  return [
    husbandCarb,
    { name: 'молоко 2%',           quantity: 250, unit: 'ml', for: 'child' },
    { name: 'йогурт греческий 2%', quantity: 150, unit: 'g',  for: 'child' },
    { name: 'орехи грецкие',       quantity: 25,  unit: 'g',  for: 'wife' },
    { name: 'напиток кисломолочный с фитостеролами', quantity: 100, unit: 'ml', for: 'wife' }
  ];
}

function loadCalibration() {
  if (!fs.existsSync(HISTORY_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')).portion_calibration || null;
  } catch { return null; }
}

/** Parse `"филе лосося=520"` into a name and an optional pinned quantity. */
function parseFood(entry) {
  const s = String(entry);
  const i = s.lastIndexOf('=');
  if (i < 0) return { name: s.trim(), pinned: null };
  const pinned = Number(s.slice(i + 1));
  if (!Number.isFinite(pinned) || pinned <= 0) throw new Error(`bad pinned quantity in "${s}"`);
  return { name: s.slice(0, i).trim(), pinned };
}

/** A food's natural unit: ml for things measured by volume, g otherwise. */
function unitFor(food) {
  return food.density != null || F.hasTag(food, 'fat') && (food.g_per || {}).ml ? 'ml' : 'g';
}

/* ── skeleton ─────────────────────────────────────────────────────────────────────────────── */

function buildSkeleton(spec) {
  if (!spec?.week) throw new Error('spec needs "week" (e.g. "2026-W37")');
  if (!Array.isArray(spec.days) || spec.days.length !== 7) {
    throw new Error(`spec needs exactly 7 "days" entries, Monday first — found ${spec.days?.length}`);
  }

  const recipes = new Map();
  const menu = spec.days.map(() => ({}));

  spec.days.forEach((day, i) => {
    for (const slot of SLOTS) {
      const s = day[slot];
      if (!s) continue;
      if (!s.id || !s.title) throw new Error(`day ${i + 1} ${slot}: needs "id" and "title"`);
      if (!Array.isArray(s.foods) || !s.foods.length) throw new Error(`${s.id}: needs "foods"`);

      const menuSlot = slot === 'snack' ? 'shared_snack' : slot;
      menu[i][menuSlot] = { title: s.title, recipe_id: s.id };

      if (!recipes.has(s.id)) {
        const weekend = i >= 5;
        recipes.set(s.id, {
          id: s.id, title: s.title,
          meal_types: [menuSlot],
          ...(s.base         ? { base: s.base }                 : {}),
          ...(s.format       ? { format: s.format }             : {}),
          ...(s.snack_format ? { snack_format: s.snack_format }  : {}),
          active_time_min: s.active_time_min ?? (slot === 'dinner' ? (weekend ? 35 : 25)
                                              : slot === 'snack'  ? 10 : 20),
          total_time_min:  s.total_time_min  ?? (slot === 'dinner' ? (weekend ? 50 : 40)
                                              : slot === 'snack'  ? 10 : 25),
          _spec: s, _dayIndex: i, _slot: slot
        });
      }

      // A cook-once dinner becomes the next day's lunch. Wiring it here is what makes `serves`
      // come out as 5 on a school day and 6 at the weekend without anyone declaring it.
      if (slot === 'dinner' && s.carry) {
        if (i === 6) throw new Error(`${s.id}: a Sunday dinner has no next day to carry into`);
        menu[i][menuSlot].cook_once_eat_twice = true;
        menu[i + 1].lunch = {
          title: s.title, recipe_id: s.id,
          leftover_from: `${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]} dinner`
        };
        const r = recipes.get(s.id);
        if (!r.meal_types.includes('lunch')) r.meal_types.push('lunch');
      }
    }
  });

  for (const r of recipes.values()) {
    // Placeholder quantities: normalisePlan and analyze only need the rows to resolve, and the
    // real numbers cannot be chosen until `serves` is known.
    r.ingredients = r._spec.foods.map(entry => {
      const { name, pinned } = parseFood(entry);
      const res = F.resolve(name);
      if (!res) {
        throw new Error(`unknown ingredient "${name}" in ${r.id} — add it to data/foods.json first`);
      }
      return { name: res.food.name_ru, quantity: pinned ?? 1, unit: unitFor(res.food), _pinned: pinned != null };
    });
  }

  return {
    language: 'ru',
    week: { id: spec.week },
    menu,
    recipes: [...recipes.values()]
  };
}

/* ── quantities ───────────────────────────────────────────────────────────────────────────── */

function allocate(plan, cal, targets) {
  const A = analyze(plan);
  const notes = [];

  for (const recipe of plan.recipes) {
    const facts  = A.recipeFacts.get(recipe.id);
    const serves = facts?.expectedServes || Number(recipe.serves) || 3;
    const slots  = [...new Set((facts?.occasions || []).map(o => o.slot))].sort().join('+');
    const key    = `${slots} (serves ${serves})`;

    const target = cal?.recipe_total_kcal?.[key]?.median ?? FALLBACK_KCAL[key] ?? null;
    if (target == null) {
      notes.push(`${recipe.id}: no calibration for "${key}" — quantities left as placeholders`);
      continue;
    }

    // Breakfasts carry the tagged conventions, and the calibration total INCLUDES them, so their
    // energy comes off the top before anything is shared out.
    if (recipe._slot === 'breakfast' && !recipe._spec.no_tagged_rows) {
      for (const row of taggedRows(recipe._dayIndex)) {
        if (!recipe.ingredients.some(i => F.normalise(i.name) === F.normalise(row.name) && i.for === row.for)) {
          recipe.ingredients.push(row);
        }
      }
    }

    const rows = recipe.ingredients.map(ing => {
      const food = F.resolve(ing.name).food;
      const conv = F.toGrams(food, 1, ing.unit);
      return { ing, food, gramsPerUnit: conv.grams || 1, kcalPer100: food.per100g?.kcal || 0 };
    });

    let budget = target;
    for (const r of rows) {
      if (!r.ing.for && !r.ing._pinned) continue;
      const grams = r.gramsPerUnit * r.ing.quantity;
      budget -= (r.kcalPer100 / 100) * grams;
    }

    const free = rows.filter(r => !r.ing.for && !r.ing._pinned && r.kcalPer100 > 0);
    if (!free.length || budget <= 0) {
      notes.push(`${recipe.id}: nothing left to scale after tagged and pinned rows`);
      continue;
    }

    // Share the remaining energy out by role, renormalised over the roles actually present, then
    // split each role's slice equally between the foods filling it.
    const shares = ROLE_SHARE[slots] || ROLE_SHARE.dinner;
    const byRole = new Map();
    for (const r of free) {
      const role = roleOf(r.food);
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role).push(r);
    }
    const weightSum = [...byRole.keys()].reduce((s, role) => s + (shares[role] ?? 0.05), 0);

    for (const [role, group] of byRole) {
      const roleKcal = budget * ((shares[role] ?? 0.05) / weightSum);
      for (const r of group) r.targetKcal = roleKcal / group.length;
    }

    // Energy shares alone do not pin a recipe's shape, because "protein role" spans foods of
    // wildly different protein density: 40% of a lunch's energy is reasonable as red lentils
    // (24% protein, 60% carbohydrate) and absurd as chicken breast (23% protein, no carbohydrate)
    // — it works out to ~107 g of protein and puts the husband 26% over his ceiling. So solve for
    // energy AND protein together: two groups, two unknowns, one 2x2 system.
    //
    //   a·Ka + b·Kb = Kbudget        a scales the protein-dense rows
    //   a·Pa + b·Pb = Pbudget        b scales everything else
    //
    // Falls back to the energy-only allocation when the system is singular or the solution is
    // silly, which happens when a recipe simply has no way to reach the protein target.
    const proteinTarget = cal?.recipe_total_protein_g?.[key]?.median ?? null;
    if (proteinTarget != null) {
      let fixedP = 0;
      for (const r of rows) {
        if (!r.ing.for && !r.ing._pinned) continue;
        const grams = r.gramsPerUnit * r.ing.quantity;
        fixedP += ((r.food.per100g?.p || 0) / 100) * grams;
      }

      const dense = r => {
        const p = r.food.per100g?.p || 0, k = r.kcalPer100 || 1;
        return (p * 4) / k > 0.25;
      };
      const A2 = free.filter(dense), B2 = free.filter(r => !dense(r));
      const baseK = r => (r.targetKcal / r.kcalPer100) * 100 * (r.kcalPer100 / 100);
      const baseP = r => (r.targetKcal / r.kcalPer100) * 100 * ((r.food.per100g?.p || 0) / 100);

      const Ka = A2.reduce((s, r) => s + baseK(r), 0), Kb = B2.reduce((s, r) => s + baseK(r), 0);
      const Pa = A2.reduce((s, r) => s + baseP(r), 0), Pb = B2.reduce((s, r) => s + baseP(r), 0);
      const Pbudget = proteinTarget - fixedP;

      const det = Ka * Pb - Kb * Pa;
      if (A2.length && B2.length && Math.abs(det) > 1e-6) {
        const a = (budget * Pb - Kb * Pbudget) / det;
        const b = (Ka * Pbudget - Pa * budget) / det;
        if (a >= 0.25 && a <= 3 && b >= 0.25 && b <= 3) {
          for (const r of A2) r.targetKcal *= a;
          for (const r of B2) r.targetKcal *= b;
        } else {
          notes.push(`${recipe.id}: protein target ${proteinTarget} g not reachable from these ` +
                     `foods (solve wanted x${a.toFixed(2)}/x${b.toFixed(2)}) — energy-only scaling`);
        }
      }
    }

    // Convert to a quantity, then clamp into the plausible band. Energy that does not fit is
    // offered ONCE to the rows that still have headroom, and whatever is left over is reported
    // rather than forced somewhere it does not belong. A recipe 10% under its median is a note;
    // a recipe with 1,600 g of soy milk in it is a week nobody cooks.
    for (const r of free) {
      const band = bandFor(r.food, targets);
      r.band = { min: band.min * serves, max: band.max * serves, fixed: !!band.fixed };
      const wanted = (r.targetKcal / r.kcalPer100) * 100;
      r.grams = r.band.fixed ? r.band.min
                             : Math.min(r.band.max, Math.max(r.band.min, wanted));
    }

    let residual = budget - free.reduce((s, r) => s + r.grams * (r.kcalPer100 / 100), 0);
    if (Math.abs(residual) > 1) {
      const room = free.filter(r => !r.band.fixed &&
        (residual > 0 ? r.grams < r.band.max : r.grams > r.band.min));
      const capacity = room.reduce((s, r) => s +
        Math.abs((residual > 0 ? r.band.max - r.grams : r.grams - r.band.min)) * (r.kcalPer100 / 100), 0);
      if (capacity > 0) {
        const take = Math.min(Math.abs(residual), capacity) / capacity;
        for (const r of room) {
          const headroom = residual > 0 ? r.band.max - r.grams : r.band.min - r.grams;
          r.grams += headroom * take;
        }
        residual -= Math.sign(residual) * Math.min(Math.abs(residual), capacity);
      }
    }

    if (Math.abs(residual) / target > 0.1) {
      notes.push(`${recipe.id}: ${residual > 0 ? 'under' : 'over'} its ${target} kcal median by ` +
                 `${Math.abs(Math.round(residual))} kcal once every food is held to a plausible ` +
                 `portion — add or drop a food in the spec`);
    }

    for (const r of free) r.ing.quantity = tidy(r.grams / r.gramsPerUnit, r.ing.unit);
  }

  // Strip the bookkeeping so the written plan is exactly what a hand-authored one looks like.
  for (const recipe of plan.recipes) {
    delete recipe._spec; delete recipe._dayIndex; delete recipe._slot;
    for (const ing of recipe.ingredients) delete ing._pinned;
  }

  return notes;
}

function scaffold(spec) {
  const targets  = loadTargets();
  const skeleton = buildSkeleton(spec);

  // normalisePlan first: `serves` decides which calibration bucket a recipe belongs to, and it is
  // derived from who eats the slots — never declared.
  const { plan, errors } = normalisePlan(skeleton);
  if (errors.length) throw new Error(`normalise failed: ${errors.join('; ')}`);

  const notes = allocate(plan, loadCalibration(), targets);
  return { plan, notes };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────── */

if (require.main === module) {
  const args    = process.argv.slice(2);
  const specArg = args.find(a => !a.startsWith('--'));
  if (!specArg) {
    console.error('Usage: node scaffold-plan.js <spec.json> [--dry-run]');
    process.exit(1);
  }

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(path.resolve(specArg), 'utf8'));
  } catch (err) {
    console.error(`[FAIL] cannot read spec: ${err.message}`);
    process.exit(1);
  }

  let result;
  try {
    result = scaffold(spec);
  } catch (err) {
    console.error(`[FAIL] ${err.message}`);
    process.exit(1);
  }

  const { plan, notes } = result;
  const out = path.join(__dirname, '..', 'data', 'weeks', `${plan.week.id}-plan.json`);

  for (const r of plan.recipes) {
    const kcal = r.ingredients.reduce((s, ing) => {
      const food = F.resolve(ing.name).food;
      return s + F.nutritionFor(food, F.toGrams(food, ing.quantity, ing.unit).grams).kcal;
    }, 0);
    console.log(`  ${r.id.padEnd(32)} serves ${String(r.serves).padStart(2)}  ${String(Math.round(kcal)).padStart(5)} kcal  ` +
                `${r.ingredients.length} rows`);
  }
  notes.forEach(n => console.warn(`  ! ${n}`));

  if (args.includes('--dry-run')) {
    console.log('\n--dry-run: not written.');
    process.exit(0);
  }

  fs.writeFileSync(out, JSON.stringify(plan, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(process.cwd(), out)} — already normalised.`);
  console.log(`Next: node scripts/validate-plan.js ${path.relative(process.cwd(), out)}`);
}

module.exports = { scaffold, buildSkeleton, allocate, roleOf, taggedRows, bandFor, ROLE_SHARE };
