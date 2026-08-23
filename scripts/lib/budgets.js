'use strict';

/**
 * Daily and weekly nutrition budget checks, shared by validate-plan.js and
 * validate-week.js.
 *
 * These two scripts carried near-identical copies of this logic. That duplication is
 * exactly the drift this repo keeps paying for elsewhere (a threshold in one place and
 * not the other), so the budget loop lives here and both callers use it.
 *
 * Two kinds of budget:
 *
 *   ABSOLUTE   a straight per-day amount — kcal, protein_g, veg_fruit_g, calcium_mg …
 *   RATIO      a share of that day's energy — fat_pct_energy, protein_pct_energy.
 *              Ratios are scale-free, which is the point: a gram ceiling has to be
 *              re-derived every time the energy band moves, and the child's protein
 *              guard was rejecting valid weeks precisely because it had not been.
 *
 * Severity comes from the threshold itself (`"severity": "warn"`), not from this code —
 * see the _severity_rule note in data/targets.json for why each one is set where it is.
 */

/** Absolute per-day budgets, in the order they should be reported. */
const DAILY_KEYS = [
  'kcal', 'protein_g', 'fiber_g', 'sat_fat_g',
  'veg_fruit_g', 'free_sugar_g', 'sodium_mg',
  'calcium_mg', 'iron_mg', 'zinc_mg',
  'viscous_fiber_g', 'sterol_g'
];

/** Budgets also held to the tighter weekly-average band. */
const WEEKLY_AVG_KEYS = [
  'kcal', 'protein_g', 'fiber_g',
  'veg_fruit_g', 'sodium_mg', 'calcium_mg', 'iron_mg', 'zinc_mg',
  'viscous_fiber_g', 'sterol_g'
];

/** Ratio budgets: key → numerator kcal per gram of the nutrient it measures. */
const RATIO_KEYS = {
  fat_pct_energy:     { field: 'fat_g',     kcalPerG: 9, label: 'fat' },
  protein_pct_energy: { field: 'protein_g', kcalPerG: 4, label: 'protein' }
};

const UNITS = {
  kcal: 'kcal', protein_g: 'g', fiber_g: 'g', sat_fat_g: 'g',
  veg_fruit_g: 'g', free_sugar_g: 'g', sodium_mg: 'mg',
  calcium_mg: 'mg', iron_mg: 'mg', zinc_mg: 'mg',
  viscous_fiber_g: 'g', sterol_g: 'g'
};

function r1(n)  { return Math.round(n * 10) / 10; }
function pct(n) { return `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`; }
function isWarn(spec) { return spec.severity === 'warn'; }

/**
 * Check every daily and weekly budget for every person.
 *
 * @param A       the object returned by analyze()
 * @returns {{errors: string[], warnings: string[], notes: string[]}}
 */
function checkBudgets(A) {
  const errors = [], warnings = [], notes = [];
  const { targets, people, daily } = A;
  const tol = targets.tolerance;

  /** Route a breach to fail or warn: warn-level specs and near-misses never fail. */
  const emit = (spec, off, msg) => {
    if (isWarn(spec) || Math.abs(off) <= tol.day_pct) warnings.push(msg);
    else errors.push(msg);
  };

  // ── Per-day absolute budgets ────────────────────────────────────────────────
  for (const d of daily) {
    for (const p of people) {
      const t = targets.daily[p], v = d.totals[p];
      if (!t) continue;

      for (const key of DAILY_KEYS) {
        const spec = t[key];
        if (!spec) continue;
        const actual = v[key];
        if (actual == null) continue;
        const u = UNITS[key] || '';

        if (spec.min != null && actual < spec.min) {
          const off = (actual - spec.min) / spec.min;
          emit(spec, off, `${d.day_name} ${p} ${key} ${r1(actual)}${u} below min ${spec.min}${u} (${pct(off)})`);
        }
        if (spec.max != null && actual > spec.max) {
          const off = (actual - spec.max) / spec.max;
          emit(spec, off, `${d.day_name} ${p} ${key} ${r1(actual)}${u} above max ${spec.max}${u} (${pct(off)})`);
        }
      }

      // ── Per-day ratio budgets ──────────────────────────────────────────────
      for (const [key, cfg] of Object.entries(RATIO_KEYS)) {
        const spec = t[key];
        if (!spec || !(v.kcal > 0)) continue;
        const share = (v[cfg.field] * cfg.kcalPerG) / v.kcal;
        const show  = `${Math.round(share * 100)}%`;

        if (spec.min != null && share < spec.min) {
          const off = (share - spec.min) / spec.min;
          emit(spec, off, `${d.day_name} ${p} ${cfg.label} is ${show} of energy, below min ${Math.round(spec.min * 100)}% (${pct(off)})`);
        }
        if (spec.max != null && share > spec.max) {
          const off = (share - spec.max) / spec.max;
          emit(spec, off, `${d.day_name} ${p} ${cfg.label} is ${show} of energy, above max ${Math.round(spec.max * 100)}% (${pct(off)})`);
        }
      }
    }
  }

  // ── Weekly averages — tighter band than any individual day ──────────────────
  for (const p of people) {
    const t = targets.daily[p];
    if (!t) continue;
    for (const key of WEEKLY_AVG_KEYS) {
      const spec = t[key];
      if (!spec) continue;
      const avg = daily.reduce((s, d) => s + (d.totals[p][key] || 0), 0) / daily.length;
      const u   = UNITS[key] || '';

      if (spec.min != null && avg < spec.min * (1 - tol.avg_pct)) {
        const msg = `Weekly average ${p} ${key} ${r1(avg)}${u} below min ${spec.min}${u}`;
        isWarn(spec) ? warnings.push(msg) : errors.push(msg);
      }
      if (spec.max != null && avg > spec.max * (1 + tol.avg_pct)) {
        const msg = `Weekly average ${p} ${key} ${r1(avg)}${u} above max ${spec.max}${u}`;
        isWarn(spec) ? warnings.push(msg) : errors.push(msg);
      }
      const range = spec.min != null
        ? ` (target ${spec.min}${spec.max != null ? `-${spec.max}` : '+'}${u})`
        : ` (max ${spec.max}${u})`;
      notes.push(`avg ${p} ${key}: ${r1(avg)}${u}${range}${isWarn(spec) ? ' [warn-level]' : ''}`);
    }
  }

  return { errors, warnings, notes };
}

/**
 * The per-meal rules that survived the move to daily budgets, plus the child's
 * home-food anchor requirement.
 */
function checkMealStructure(A, recipeFacts, MAIN_SLOTS) {
  const errors = [], warnings = [];
  const { targets, people, daily } = A;
  const ms  = targets.meal_structure;
  const tol = targets.tolerance;

  for (const d of daily) {
    const hb = d.bySlot.breakfast?.husband;
    if (hb) {
      if (hb.protein_g < ms.husband_breakfast_protein_min_g * (1 - tol.day_pct)) {
        errors.push(`${d.day_name}: husband breakfast protein ${r1(hb.protein_g)} g below ${ms.husband_breakfast_protein_min_g} g (pre-training meal)`);
      }
      if (hb.carbs_g < ms.husband_breakfast_carbs_min_g * (1 - tol.day_pct)) {
        warnings.push(`${d.day_name}: husband breakfast carbs ${r1(hb.carbs_g)} g below ${ms.husband_breakfast_carbs_min_g} g (pre-training fuel)`);
      }
    }

    for (const p of people) {
      // Only meals this person actually eats. On a school day the child's midday meal
      // is the external school lunch, not the family lunch slot.
      //
      // The school lunch counts as a main meal for everyone's arithmetic EXCEPT the
      // child's anchor rule, where child_anchor_meals_home_only excludes it: its
      // protein figure is an estimate, and depending on it left exactly one verified
      // anchor meal in the child's day.
      const homeOnly    = p === 'child' && ms.child_anchor_meals_home_only;
      const slotNames   = homeOnly ? [...MAIN_SLOTS] : [...MAIN_SLOTS, 'school_lunch'];
      const mains = slotNames
        .map(s => d.bySlot[s])
        .filter(b => b && b._eaters.includes(p) && b[p])
        .map(b => b[p]);

      const atAnchor = mains.filter(m => m.protein_g >= ms.anchor_protein_min_g[p]).length;
      if (atAnchor < ms.min_main_meals_at_anchor) {
        errors.push(`${d.day_name} ${p}: only ${atAnchor} of ${mains.length} ` +
                    `${homeOnly ? 'home ' : ''}main meals reach the ${ms.anchor_protein_min_g[p]} g protein anchor ` +
                    `(need ${ms.min_main_meals_at_anchor})`);
      }

      // Don't dump the whole day's protein into one dish. The cap comes from the gram
      // ceiling where there is one; the child has none by design, so it falls back to
      // the protein-share ceiling applied to their maximum energy.
      const spec = targets.daily[p] || {};
      const dayMaxProtein = spec.protein_g?.max
        ?? (spec.protein_pct_energy?.max != null && spec.kcal?.max != null
              ? (spec.protein_pct_energy.max * spec.kcal.max) / 4
              : null);
      if (dayMaxProtein != null) {
        const cap   = dayMaxProtein * ms.max_single_meal_protein_share;
        const worst = mains.reduce((m, x) => Math.max(m, x.protein_g), 0);
        if (worst > cap) {
          warnings.push(`${d.day_name} ${p}: a single main meal carries ${r1(worst)} g protein, over ${r1(cap)} g ` +
                        `(${Math.round(ms.max_single_meal_protein_share * 100)}% of the daily max) — spread it out`);
        }
      }
    }

    if (!d.day.shared_snack?.recipe_id) continue;
    const snackFacts = recipeFacts.get(d.day.shared_snack.recipe_id);
    if (snackFacts && !snackFacts.hasCalcium) {
      warnings.push(`${d.day_name}: shared snack has no calcium source (child's calcium target)`);
    }
  }

  return { errors, warnings };
}

module.exports = { checkBudgets, checkMealStructure, DAILY_KEYS, WEEKLY_AVG_KEYS, RATIO_KEYS, UNITS };
