#!/usr/bin/env node
'use strict';

/**
 * Adjust a plan's quantities until every hard budget holds at once.
 *
 * This replaces iterating by hand, which does not work well and never did. Generating W37 took
 * four patch rounds of pure whack-a-mole: cutting the husband's protein broke the wife's, adding
 * skyr to fix that broke his energy, trimming that broke Saturday's fat share. `diagnose-plan.js`
 * gives the delta for one nutrient and says nothing about what else that delta moves, so each
 * round fixed one budget and broke another.
 *
 * That was never a judgement problem. **Every budget is linear in ingredient grams.** Energy,
 * protein, fat, saturated fat, fibre, sodium, calcium and vegetable weight are all
 * `(per-100 g value) x grams`, and each person's share of a recipe is a fixed coefficient — the
 * portion weight over the weight demand. Even the energy-share budgets are linear once written
 * as `9*fat - max*kcal <= 0` rather than as a ratio. So "does this week satisfy 3 people x 7 days
 * x 12 budgets" is a system of linear inequalities over the quantity vector, boxed by the
 * plausibility bands, and finding a point inside it is arithmetic rather than search.
 *
 * The method is cyclic projection onto convex sets: walk the violated constraints, project onto
 * each, clamp back into the bands, repeat. It starts from the scaffolded quantities, so it lands
 * on a nearby feasible point rather than an arbitrary one — the role balance that made the recipe
 * look like food is preserved.
 *
 * Warn-level budgets are included as *soft* constraints, projected only after the hard ones are
 * satisfied and never at their expense. That is how sodium gets handled: it is warn-level by
 * design because it is an ingredient-only lower bound, but a week that runs the child 113% over
 * is still a bad week, and nothing was pushing back on it before.
 *
 * Not a gate. `validate-plan.js` still decides what passes, and this script's own report ends
 * with what it could not satisfy.
 *
 * Usage
 *   node scripts/solve-plan.js data/weeks/2026-W37-plan.json
 *   node scripts/solve-plan.js data/weeks/2026-W37-plan.json --dry-run
 *   node scripts/solve-plan.js data/weeks/2026-W37-plan.json --no-soft   # hard budgets only
 */

const fs   = require('fs');
const path = require('path');
const F    = require('./lib/foods.js');
const { analyze, ALL_SLOTS, MAIN_SLOTS } = require('./lib/analyze.js');
const { DAILY_KEYS, WEEKLY_AVG_KEYS, RATIO_KEYS } = require('./lib/budgets.js');
const { bandFor } = require('./scaffold-plan.js');
const { tidy }    = require('./patch-plan.js');

/**
 * Aim this far inside every bound.
 *
 * Quantities are rounded to buyable amounts at the end (5 g steps above 20 g), and rounding a
 * hundred rows can walk a constraint that was satisfied exactly back over its line. Solving to a
 * 3% interior absorbs that without meaningfully narrowing the feasible region.
 */
const MARGIN = 0.03;
const MAX_PASSES = 4000;
const TOLERANCE  = 1e-4;

/** Rows a solver must not touch: a discrete retail product, or a seasoning. */
function isFixedRow(food, ing) {
  // The sterol drink is one 100 ml bottle delivering the 2 g the LDL protocol asks for. 118 ml is
  // not a thing anyone can buy, and it is the highest-yield single item in that protocol.
  if (F.hasTag(food, 'sterol')) return true;
  if (F.hasTag(food, 'herb') || F.hasTag(food, 'spice') || F.hasTag(food, 'salt')) return true;
  return false;
}

/** Per-gram value of one nutrient for a food, including the veg_fruit_g pseudo-nutrient. */
function perGram(food, key) {
  return F.nutritionFor(food, 1)[key] || 0;
}

/**
 * How far a `for:`-tagged row may move from the quantity a passing week used.
 *
 * The plausibility band alone is not enough protection for these, and letting the solver find out
 * the hard way cost two attempts. Banded per recipe portion, it pushed the wife's walnuts to 55 g;
 * banded per person, it pulled them down to 15 g and the husband's carbohydrate row from 90 g to
 * its 35 g floor. Both satisfied every budget, because neither "30 g of nuts a day" nor "the
 * husband's energy comes from a tagged carbohydrate" is a budget — the first is an LDL and ALA
 * target with no gram check anywhere, and the second is a convention.
 *
 * So the conventions come from `portion_calibration.tagged_rows`, which records what a week that
 * actually passed used, and the solver may vary them by a quarter down or a half up. That leaves
 * the husband's row a real lever — 90 g of flakes becomes 67-135 g, worth ~250 kcal of swing —
 * without letting it stop being the lever.
 */
const CONVENTION_DOWN = 0.75;
const CONVENTION_UP   = 1.5;

function conventionBands() {
  const bands = new Map();
  const p = path.join(__dirname, '..', 'data', 'weeks', 'recent-history.json');
  if (!fs.existsSync(p)) return bands;

  let rows;
  try { rows = JSON.parse(fs.readFileSync(p, 'utf8')).portion_calibration?.tagged_rows || []; }
  catch { return bands; }

  for (const row of rows) {
    const res = F.resolve(row.name);
    if (!res) continue;
    const grams = F.toGrams(res.food, row.quantity, row.unit).grams;
    if (!Number.isFinite(grams) || grams <= 0) continue;

    // The same tagged row shows up at several quantities across a week; span them all so the
    // solver is bounded by what was used, not by whichever entry happened to be listed first.
    const key  = `${row.for}|${res.food.key}`;
    const prev = bands.get(key);
    const lo = grams * CONVENTION_DOWN, hi = grams * CONVENTION_UP;
    bands.set(key, prev ? { lo: Math.min(prev.lo, lo), hi: Math.max(prev.hi, hi) } : { lo, hi });
  }
  return bands;
}

/**
 * Build the linear model: variables (grams per ingredient row), and constraints over them.
 *
 * Constraint shape is `lo <= k + c.x <= hi`, where `k` collects everything the solver cannot move:
 * the external school lunch, and the fixed rows above.
 */
function buildModel(plan, opts = {}) {
  const A = analyze(plan);
  if (A.problems.length) return { problems: A.problems };

  const { targets, people, recipeFacts, daily, external } = A;
  const weights     = targets.portion_weights;
  const conventions = conventionBands();

  // ── variables ──
  const vars = [];
  const varIndex = new Map();                       // `${recipeId}#${rowIdx}` → variable index
  for (const recipe of plan.recipes) {
    const facts  = recipeFacts.get(recipe.id);
    if (!facts) continue;
    const serves = facts.expectedServes || Number(recipe.serves) || 3;
    recipe.ingredients.forEach((ing, idx) => {
      const res = F.resolve(ing.name);
      if (!res) return;
      const food = res.food;
      const band = bandFor(food, targets);
      if (band.fixed || isFixedRow(food, ing)) return;

      const gramsPerUnit = F.toGrams(food, 1, ing.unit).grams;
      const grams        = F.toGrams(food, ing.quantity, ing.unit).grams;
      if (!Number.isFinite(gramsPerUnit) || !Number.isFinite(grams)) return;

      // A band is grams PER PORTION, so it scales by how many portions the row actually feeds.
      // An untagged row feeds every portion; a `for:`-tagged row feeds one person, once per
      // occasion they attend. Scaling a tagged row by `serves` makes its band three times too
      // wide, which is how the wife's 25 g of walnuts drifted to 55 g — still inside a nonsense
      // band, and well outside the convention the calibration recorded.
      const portions = ing.for
        ? Math.max(1, facts.occasions.filter(o => o.eaters.includes(ing.for)).length)
        : serves;

      let lo = band.min * portions, hi = band.max * portions;

      // A tagged row that matches a recorded convention is bounded by that convention instead.
      // It wins outright rather than being intersected: where the two disagree, the quantity a
      // passing week actually used is the better evidence than a per-role guess.
      const conv = ing.for ? conventions.get(`${ing.for}|${food.key}`) : null;
      if (conv) { lo = conv.lo * portions; hi = conv.hi * portions; }

      varIndex.set(`${recipe.id}#${idx}`, vars.length);
      vars.push({
        recipeId: recipe.id, idx, food, unit: ing.unit, gramsPerUnit,
        start: grams, grams, lo, hi,
        for: ing.for || null
      });
    });
  }

  /**
   * How much of one gram of a row reaches one person on one day.
   *
   * Untagged: the portion weight over the total weight demand, counted once per slot on that day
   * that uses the recipe and that the person eats. Tagged: the whole row divided by the occasions
   * its owner attends, and zero for anybody else. This is the same split lib/analyze.js applies —
   * it is restated per-variable here because a solver needs the coefficient, not the total.
   */
  const shareOf = (recipeId, rowFor, person, day) => {
    const facts = recipeFacts.get(recipeId);
    if (!facts) return 0;
    let occurrences = 0;
    for (const slot of ALL_SLOTS) {
      if (day.day[slot]?.recipe_id !== recipeId) continue;
      if (!(day.bySlot[slot]?._eaters || []).includes(person)) continue;
      occurrences++;
    }
    if (!occurrences) return 0;

    if (rowFor) {
      if (rowFor !== person) return 0;
      const attended = facts.occasions.filter(o => o.eaters.includes(person)).length;
      return attended > 0 ? occurrences / attended : 0;
    }
    const demand = facts.occasions.reduce(
      (s, o) => s + o.eaters.reduce((a, e) => a + (weights[e] || 0), 0), 0);
    return demand > 0 ? occurrences * (weights[person] || 0) / demand : 0;
  };

  /** Coefficient vector and fixed constant for one (day, person, nutrient). */
  const rowFor = (day, person, key) => {
    const c = new Map();
    let k = 0;

    for (const slot of ALL_SLOTS) {
      const id = day.day[slot]?.recipe_id;
      if (!id) continue;
      const recipe = plan.recipes.find(r => r.id === id);
      if (!recipe) continue;

      recipe.ingredients.forEach((ing, idx) => {
        const res = F.resolve(ing.name);
        if (!res) return;
        const share = shareOf(id, ing.for || null, person, day);
        if (!share) return;
        const per = perGram(res.food, key) * share;
        if (!per) return;

        const vi = varIndex.get(`${id}#${idx}`);
        if (vi === undefined) {
          // A fixed row: its contribution is a constant, at its current quantity.
          k += per * F.toGrams(res.food, ing.quantity, ing.unit).grams;
        } else {
          c.set(vi, (c.get(vi) || 0) + per);
        }
      });
    }

    // The external school meal is not editable and must not be omitted, or every ceiling it
    // contributes to becomes falsely lenient.
    if (person === 'child' && day.schoolLunch) {
      const est = external[`${key}_estimate`];
      if (Number.isFinite(est)) k += est;
    }
    return { c, k };
  };

  // ── constraints ──
  const hard = [], soft = [];
  // The gate routes a breach within tolerance.day_pct to [WARN], not [FAIL]. Carrying the same
  // fraction here is what stops the solver reporting "could not satisfy" for a plan that passes.
  const tol = targets.tolerance;
  const push = (spec, con, blockAt = tol.day_pct) =>
    ((spec.severity === 'warn' ? soft : hard).push({ ...con, blockAt }));

  // Solve against a tightened bound, but REPORT against the real one. Conflating the two makes
  // the solver cry wolf: it would list a dozen "could not satisfy" lines for a plan the gate
  // passes cleanly, which is worse than saying nothing.
  const inset = (lo, hi) => ({
    lo: lo != null ? lo + Math.abs(lo) * MARGIN : null,
    hi: hi != null ? hi - Math.abs(hi) * MARGIN : null,
    rawLo: lo ?? null, rawHi: hi ?? null
  });

  for (const day of daily) {
    for (const person of people) {
      const t = targets.daily[person];
      if (!t) continue;

      for (const key of DAILY_KEYS) {
        const spec = t[key];
        if (!spec) continue;
        const { c, k } = rowFor(day, person, key);
        if (!c.size) continue;
        push(spec, { ...inset(spec.min, spec.max), c, k,
                     label: `${day.day_name} ${person} ${key}` });
      }

      // Energy shares are linear once written as `kcalPerG*share*g - limit*kcal <= 0`, which is
      // why they can live in the same system as everything else rather than needing an outer loop.
      for (const [key, cfg] of Object.entries(RATIO_KEYS)) {
        const spec = t[key];
        if (!spec) continue;
        const nut  = rowFor(day, person, cfg.field);
        const kcal = rowFor(day, person, 'kcal');
        if (!nut.c.size && !kcal.c.size) continue;

        for (const bound of ['min', 'max']) {
          const limit = spec[bound];
          if (limit == null) continue;
          const c = new Map();
          for (const [i, v] of nut.c)  c.set(i, (c.get(i) || 0) + v * cfg.kcalPerG);
          for (const [i, v] of kcal.c) c.set(i, (c.get(i) || 0) - v * limit);
          const k = nut.k * cfg.kcalPerG - kcal.k * limit;
          // Scale is the energy this nutrient is allowed, not the bound: the bound IS zero.
          const scale = limit * (t.kcal?.max ?? t.kcal?.min ?? 2500);
          push(spec, bound === 'max'
            ? { hi: 0, lo: null, rawHi: 0, rawLo: null, scale, c, k,
                label: `${day.day_name} ${person} ${cfg.label} <= ${Math.round(limit * 100)}% of energy` }
            : { lo: 0, hi: null, rawLo: 0, rawHi: null, scale, c, k,
                label: `${day.day_name} ${person} ${cfg.label} >= ${Math.round(limit * 100)}% of energy` });
        }
      }
    }
  }

  // Weekly averages bind tighter than any single day, so a week can satisfy all seven and still
  // fail here. Expressed as a sum over the week against 7x the daily bound.
  for (const person of people) {
    const t = targets.daily[person];
    if (!t) continue;
    for (const key of WEEKLY_AVG_KEYS) {
      const spec = t[key];
      if (!spec) continue;
      const c = new Map();
      let k = 0;
      for (const day of daily) {
        const r = rowFor(day, person, key);
        for (const [i, v] of r.c) c.set(i, (c.get(i) || 0) + v);
        k += r.k;
      }
      if (!c.size) continue;
      const n = daily.length;
      push(spec, { ...inset(spec.min != null ? spec.min * n : null,
                            spec.max != null ? spec.max * n : null),
                   c, k, label: `weekly avg ${person} ${key}` }, tol.avg_pct);
    }
  }

  // The per-meal rules that are linear. The anchor-count rules are combinatorial and stay with
  // the gate, but the husband's pre-training breakfast and both of the child's home anchors are
  // straight per-meal minimums, and they are the ones a quantity solve can actually honour.
  const ms = targets.meal_structure;
  for (const day of daily) {
    const only = (slot, person, key) => {
      const id = day.day[slot]?.recipe_id;
      if (!id) return null;
      const single = { day: { [slot]: day.day[slot] }, bySlot: { [slot]: day.bySlot[slot] },
                       schoolLunch: false };
      return rowFor(single, person, key);
    };
    const add = (slot, person, key, min, label) => {
      const r = only(slot, person, key);
      if (!r || !r.c.size) return;
      hard.push({ lo: min + min * MARGIN, rawLo: min, rawHi: null, hi: null,
                  c: r.c, k: r.k, label, blockAt: tol.day_pct });
    };
    add('breakfast', 'husband', 'protein_g', ms.husband_breakfast_protein_min_g,
        `${day.day_name} husband breakfast protein`);
    add('breakfast', 'husband', 'carbs_g', ms.husband_breakfast_carbs_min_g,
        `${day.day_name} husband breakfast carbs`);
    for (const slot of ['breakfast', 'dinner']) {
      add(slot, 'child', 'protein_g', ms.anchor_protein_min_g.child,
          `${day.day_name} child ${slot} protein anchor`);
    }
  }

  return { vars, hard, soft: opts.noSoft ? [] : soft, problems: [] };
}

/* ── the solve ───────────────────────────────────────────────────────────────────────────── */

const value = (con, x) => {
  let v = con.k;
  for (const [i, c] of con.c) v += c * x[i];
  return v;
};

/**
 * Signed distance to feasibility: 0 when satisfied, else how far the value must move.
 * `raw` measures against the real budget rather than the tightened one the solver aims at.
 */
function violation(con, x, raw = false) {
  const v  = value(con, x);
  const lo = raw ? (con.rawLo ?? con.lo) : con.lo;
  const hi = raw ? (con.rawHi ?? con.hi) : con.hi;
  if (hi != null && v > hi) return hi - v;
  if (lo != null && v < lo) return lo - v;
  return 0;
}

function relative(con, viol, raw = false) {
  const lo = raw ? (con.rawLo ?? con.lo) : con.lo;
  const hi = raw ? (con.rawHi ?? con.hi) : con.hi;
  const scale = con.scale ?? (Math.abs(hi ?? lo) || 1);
  return Math.abs(viol) / (Math.abs(scale) || 1);
}

/**
 * Cyclic projection onto the constraints, clamped into the bands after every step.
 *
 * Hard constraints are projected on every pass. Soft ones are projected too, but only with what
 * room is left: after each soft projection the hard set is re-projected, so a warn-level budget
 * can never push a hard one out. That ordering is the whole reason sodium can be pursued at all —
 * it is warn-level because the measurement is a lower bound, not because it does not matter.
 */
function solve(model) {
  const { vars, hard, soft } = model;
  const x = vars.map(v => v.grams);
  const clamp = i => { x[i] = Math.min(vars[i].hi, Math.max(vars[i].lo, x[i])); };

  const project = con => {
    const viol = violation(con, x);
    if (!viol) return 0;
    let norm2 = 0;
    for (const [, c] of con.c) norm2 += c * c;
    if (norm2 <= 0) return relative(con, viol);
    const step = viol / norm2;
    for (const [i, c] of con.c) { x[i] += step * c; clamp(i); }
    return relative(con, viol);
  };

  let passes = 0, worstHard = Infinity;
  for (; passes < MAX_PASSES; passes++) {
    worstHard = 0;
    for (const con of hard) worstHard = Math.max(worstHard, project(con));
    if (worstHard < TOLERANCE) break;
  }

  // Only chase the soft budgets once the hard ones are actually satisfiable.
  if (worstHard < TOLERANCE && soft.length) {
    for (let p = 0; p < MAX_PASSES / 4; p++) {
      let worstSoft = 0;
      for (const con of soft) {
        worstSoft = Math.max(worstSoft, project(con));
        for (const h of hard) project(h);          // hard set always wins
      }
      if (worstSoft < TOLERANCE) break;
    }
    for (let p = 0; p < 200; p++) { let w = 0; for (const con of hard) w = Math.max(w, project(con)); if (w < TOLERANCE) break; }
  }

  vars.forEach((v, i) => { v.grams = x[i]; });
  return { passes, x };
}

function applySolution(plan, vars) {
  const changes = [];
  const byRecipe = new Map(plan.recipes.map(r => [r.id, r]));
  for (const v of vars) {
    const recipe = byRecipe.get(v.recipeId);
    const ing    = recipe.ingredients[v.idx];
    const before = ing.quantity;
    const after  = tidy(v.grams / v.gramsPerUnit, ing.unit);
    if (after !== before) {
      ing.quantity = after;
      changes.push({ recipeId: v.recipeId, name: ing.name, for: v.for, before, after, unit: ing.unit });
    }
  }
  return changes;
}

function solvePlan(plan, opts = {}) {
  const model = buildModel(plan, opts);
  if (model.problems?.length) return { problems: model.problems };

  const { passes } = solve(model);
  const changes = applySolution(plan, model.vars);

  // Re-measure on the ROUNDED quantities, not the solver's internal ones — the rounding is what
  // ships, and reporting the pre-rounding state would be reporting a plan that does not exist.
  const after = buildModel(plan, opts);
  const x = after.vars.map(v => v.grams);
  const unmet = [...after.hard, ...after.soft]
    .map(con => ({ con, viol: violation(con, x, true) }))
    .filter(({ con, viol }) => viol && relative(con, viol, true) > (con.blockAt ?? 0.01))
    .map(({ con, viol }) => ({ label: con.label, off: viol, soft: after.soft.includes(con) }));

  return { changes, passes, unmet, problems: [],
           counts: { vars: model.vars.length, hard: model.hard.length, soft: model.soft.length } };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────── */

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node solve-plan.js <plan.json> [--dry-run] [--no-soft]');
    process.exit(1);
  }
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) { console.error(`File not found: ${resolved}`); process.exit(1); }

  let plan;
  try { plan = JSON.parse(fs.readFileSync(resolved, 'utf8')); }
  catch (err) { console.error(`[FAIL] JSON parse error: ${err.message}`); process.exit(1); }

  const res = solvePlan(plan, { noSoft: args.includes('--no-soft') });
  if (res.problems?.length) { res.problems.forEach(p => console.error(`[FAIL] ${p}`)); process.exit(1); }

  console.log(`${res.counts.vars} free quantities, ${res.counts.hard} hard and ${res.counts.soft} ` +
              `soft constraints; ${res.passes >= 4000 ? `stopped at ${res.passes} passes` : `converged in ${res.passes} pass(es)`}.`);
  console.log(`Moved ${res.changes.length} quantity/ies:`);
  for (const c of res.changes) {
    console.log(`  ${c.recipeId.padEnd(28)} ${(c.name + (c.for ? `#${c.for}` : '')).padEnd(42)} ` +
                `${String(c.before).padStart(5)} → ${String(c.after).padStart(5)} ${c.unit}`);
  }

  const hardUnmet = res.unmet.filter(u => !u.soft);
  const softUnmet = res.unmet.filter(u => u.soft);
  if (hardUnmet.length) {
    console.log('\nCould not satisfy (hard):');
    hardUnmet.forEach(u => console.log(`  ${u.label}: off by ${Math.round(u.off * 10) / 10}`));
    console.log('  → the menu itself needs a different food, not a different quantity');
  }
  if (softUnmet.length) {
    console.log('\nStill outside a warn-level budget:');
    softUnmet.forEach(u => console.log(`  ${u.label}: off by ${Math.round(u.off * 10) / 10}`));
  }

  if (args.includes('--dry-run')) { console.log('\n--dry-run: not written.'); process.exit(0); }

  fs.writeFileSync(resolved, JSON.stringify(plan, null, 2) + '\n');
  console.log(`\nWrote ${path.basename(resolved)}. Re-run validate-plan.js.`);
}

module.exports = { solvePlan, buildModel, solve, isFixedRow };
