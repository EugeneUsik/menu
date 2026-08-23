'use strict';

/**
 * Derive nutrition totals and variety facts from a week (or plan) object.
 *
 * Everything here is DERIVED from data/foods.json rather than asserted by the model.
 * Previously the generation prompt asked the LLM to self-report protein categories,
 * grain bases, vegetable counts and fish species in a 40-item checklist while it was
 * writing 78 KB of Russian JSON. Those claims were unverifiable and unchecked.
 * The only things the model still has to declare are the ones the catalog cannot know:
 * a dinner's cooking format, a breakfast's base type, and a snack's format.
 */

const fs   = require('fs');
const path = require('path');
const F    = require('./foods.js');

const MAIN_SLOTS = ['breakfast', 'lunch', 'dinner'];
const ALL_SLOTS  = ['breakfast', 'lunch', 'dinner', 'shared_snack'];

function loadTargets() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'targets.json'), 'utf8'));
}

function recipeMap(weekData) {
  return new Map((weekData.recipes || []).map(r => [r.id, r]));
}

/** True when the child eats lunch at school that day (2.0 files used a snack instead). */
function isSchoolLunchDay(day) {
  if (day.includes_fixed_school_lunch !== undefined) return !!day.includes_fixed_school_lunch;
  return !!day.includes_fixed_school_snack;   // legacy 2.0
}

/**
 * Who actually eats a given slot on a given day.
 * The child has lunch at school Monday-Friday, so a weekday lunch feeds two people.
 * Derived from the menu — never declared by the model.
 */
function eatersFor(slot, day, targets) {
  const e = targets.eaters || { default: targets.people, lunch_on_school_days: targets.people };
  if (slot === 'lunch' && isSchoolLunchDay(day)) return e.lunch_on_school_days;
  return e.default;
}

/**
 * Every (slot, day) occasion a recipe covers, with the eaters at each.
 * A dinner that also becomes next-day school lunch feeds 3 then 2 — five portions,
 * not six — so quantities and per-person shares both depend on this.
 */
function occasionsFor(recipeId, weekData, targets) {
  const out = [];
  (weekData.menu || []).forEach((day, i) => {
    for (const slot of ALL_SLOTS) {
      if (day[slot]?.recipe_id !== recipeId) continue;
      out.push({ dayIndex: i, dayName: day.day_name, slot, eaters: eatersFor(slot, day, targets) });
    }
  });
  return out;
}

/** Total portion-weight demand across all occasions — the divisor for ingredient totals. */
function weightDemand(occasions, targets) {
  return occasions.reduce(
    (sum, o) => sum + o.eaters.reduce((s, p) => s + targets.portion_weights[p], 0),
    0
  );
}

/** Human-meaningful portion count: how many person-servings the quantities must cover. */
function expectedServes(occasions) {
  return occasions.reduce((n, o) => n + o.eaters.length, 0);
}

/**
 * Resolve every ingredient of a recipe to {food, grams, nutrition, for}.
 * Unresolvable rows are returned in `problems` rather than thrown.
 */
function resolveRecipe(recipe) {
  const rows = [], problems = [];
  for (const ing of (recipe.ingredients || [])) {
    const res = F.resolve(ing.name);
    if (!res) { problems.push(`unknown ingredient "${ing.name}"`); continue; }
    const conv = F.toGrams(res.food, ing.quantity, ing.unit);
    if (conv.error) { problems.push(`"${ing.name}" — ${conv.error}`); continue; }
    rows.push({
      food:  res.food,
      grams: conv.grams,
      for:   ing.for || null,
      nut:   F.nutritionFor(res.food, conv.grams)
    });
  }
  return { rows, problems };
}

/**
 * Per-person nutrition for one serving of a recipe.
 *
 * An untagged ingredient's total is split by portion weight across every eater of
 * every occasion the recipe covers, so a person's share is
 *   grams * weight[person] / (sum of weights over all occasions and eaters).
 * An ingredient tagged `for: "wife"` goes entirely to her, divided by the number of
 * occasions she is actually present for.
 *
 * @param occasions from occasionsFor(); falls back to a single all-eaters occasion
 *                  scaled by recipe.serves when the recipe is not on the menu.
 */
function perPerson(recipe, rows, targets, occasions) {
  const people  = targets.people;
  const weights = targets.portion_weights;

  let occ = occasions;
  if (!occ || !occ.length) {
    // Not referenced by the menu: assume all three eat it, serves/3 times.
    const n = Math.max(1, Math.round((Number(recipe.serves) || people.length) / people.length));
    occ = Array.from({ length: n }, () => ({ eaters: people }));
  }

  const demand = weightDemand(occ, targets);

  const shared = F.EMPTY();
  const tagged = Object.fromEntries(people.map(p => [p, F.EMPTY()]));
  for (const r of rows) {
    if (r.for && tagged[r.for]) F.addInto(tagged[r.for], r.nut);
    else F.addInto(shared, r.nut);
  }

  const out = {};
  for (const p of people) {
    const acc = F.EMPTY();
    if (demand > 0) F.addInto(acc, shared, weights[p] / demand);
    const myOccasions = occ.filter(o => o.eaters.includes(p)).length;
    if (myOccasions > 0) F.addInto(acc, tagged[p], 1 / myOccasions);
    out[p] = acc;
  }
  return out;
}

/** The single food that contributes the most protein, and its category. */
const PROTEIN_CATEGORIES = ['fatty_fish', 'white_fish', 'seafood', 'poultry', 'red_meat', 'eggs', 'legume', 'soy', 'dairy'];

function headlineProtein(rows) {
  let best = null;
  for (const r of rows) {
    const cat = PROTEIN_CATEGORIES.find(c => F.hasTag(r.food, c));
    if (!cat) continue;
    const p = r.nut.protein_g;
    if (!best || p > best.protein_g) best = { food: r.food, category: cat, protein_g: p };
  }
  return best;
}

function headlineBy(rows, tag, metric) {
  let best = null;
  for (const r of rows) {
    if (!F.hasTag(r.food, tag)) continue;
    const v = metric === 'grams' ? r.grams : r.nut.carbs_g;
    if (!best || v > best.value) best = { food: r.food, value: v };
  }
  return best;
}

function tagsWithPrefix(rows, prefix) {
  const out = new Set();
  for (const r of rows) {
    for (const t of (r.food.tags || [])) if (t.startsWith(prefix)) out.add(t);
  }
  return out;
}

/**
 * Build a full derived picture of the week.
 * @returns {{targets, recipeFacts: Map, daily: array, problems: string[]}}
 */
function analyze(weekData) {
  const targets  = loadTargets();
  const people   = targets.people;
  const rmap     = recipeMap(weekData);
  const problems = [];

  // --- per-recipe derived facts -------------------------------------------------
  const recipeFacts = new Map();
  for (const recipe of (weekData.recipes || [])) {
    const { rows, problems: probs } = resolveRecipe(recipe);
    probs.forEach(p => problems.push(`${recipe.id}: ${p}`));

    const occasions = occasionsFor(recipe.id, weekData, targets);

    const protein = headlineProtein(rows);
    const grain   = headlineBy(rows, 'grain', 'carbs') || headlineBy(rows, 'vegetable_starchy', 'grams');
    const veg     = rows.filter(r => F.hasTag(r.food, 'vegetable'));
    const vegHead = veg.reduce((b, r) => (!b || r.grams > b.grams ? r : b), null);

    recipeFacts.set(recipe.id, {
      recipe,
      rows,
      occasions,
      expectedServes: expectedServes(occasions),
      perPerson:      perPerson(recipe, rows, targets, occasions),
      proteinItem:    protein ? protein.food.key : null,
      proteinCat:     protein ? protein.category : null,
      fishSpecies:    protein && protein.food.species ? protein.food.species : null,
      grainBase:      grain ? ([...(grain.food.tags || [])].find(t => t.startsWith('grain_')) || grain.food.key) : null,
      vegetables:     new Set(veg.map(r => r.food.key)),
      vegHeadline:    vegHead ? vegHead.food.key : null,
      legumeSpecies:  tagsWithPrefix(rows, 'legume_'),
      soyForms:       tagsWithPrefix(rows, 'soy_form_'),
      hasLegume:      rows.some(r => F.hasTag(r.food, 'legume')),
      hasSoy:         rows.some(r => F.hasTag(r.food, 'soy')),
      hasOatsBarley:  rows.some(r => F.hasTag(r.food, 'oats_or_barley')),
      hasLdlNut:      rows.some(r => F.hasTag(r.food, 'ldl_nut')),
      hasFattyFish:   rows.some(r => F.hasTag(r.food, 'fatty_fish')),
      hasWhiteFishOrSeafood: rows.some(r => F.hasTag(r.food, 'white_fish') || F.hasTag(r.food, 'seafood')),
      hasRedMeat:     rows.some(r => F.hasTag(r.food, 'red_meat')),
      hasCalcium:     rows.some(r => F.hasTag(r.food, 'calcium')),
      hasHighMercury: rows.some(r => F.hasTag(r.food, 'high_mercury')),
      hasSterol:      rows.some(r => F.hasTag(r.food, 'sterol')),
      viscousFiber:   rows.some(r => F.hasTag(r.food, 'viscous_fiber'))
    });
  }

  // --- per-day totals ----------------------------------------------------------
  // The external school meal is described in targets.json, with the week file allowed
  // to override it. Legacy 2.0 files carry a fixed_school_snack block instead.
  const external = {
    ...(targets.fixed_school_lunch || {}),
    ...(weekData.fixed_school_lunch || weekData.fixed_school_snack || {})
  };

  const daily = (weekData.menu || []).map((day, i) => {
    const totals = Object.fromEntries(people.map(p => [p, F.EMPTY()]));
    const bySlot = {};

    for (const slot of ALL_SLOTS) {
      const id = day[slot]?.recipe_id;
      if (!id) continue;
      const facts = recipeFacts.get(id);
      if (!facts) { problems.push(`menu[${i}].${slot}: recipe_id "${id}" not found in recipes[]`); continue; }
      const eaters = eatersFor(slot, day, targets);
      bySlot[slot] = { ...facts.perPerson, _eaters: eaters };
      // Only credit the people who actually eat this slot: on a school day the child
      // is not home for lunch, so a weekday lunch adds nothing to the child's day.
      for (const p of eaters) F.addInto(totals[p], facts.perPerson[p]);
    }

    if (isSchoolLunchDay(day)) {
      totals.child.kcal      += external.kcal_estimate      || 0;
      totals.child.protein_g += external.protein_g_estimate || 0;
      totals.child.carbs_g   += external.carbs_g_estimate   || 0;
      totals.child.fat_g     += external.fat_g_estimate     || 0;
      totals.child.sat_fat_g += external.sat_fat_g_estimate || 0;
      totals.child.fiber_g   += external.fiber_g_estimate   || 0;
      totals.child.sodium_mg += external.sodium_mg_estimate || 0;
      // Treat it as one of the child's main meals for the anchor rule.
      bySlot.school_lunch = {
        child: {
          kcal:      external.kcal_estimate      || 0,
          protein_g: external.protein_g_estimate || 0,
          carbs_g:   external.carbs_g_estimate   || 0,
          fat_g:     external.fat_g_estimate     || 0,
          sat_fat_g: external.sat_fat_g_estimate || 0,
          fiber_g:   external.fiber_g_estimate   || 0,
          sodium_mg: external.sodium_mg_estimate || 0
        },
        _eaters: ['child']
      };
    }

    return { index: i, day_name: day.day_name, date: day.date, day, totals, bySlot, schoolLunch: isSchoolLunchDay(day) };
  });

  return { targets, people, recipeFacts, daily, problems, external };
}

module.exports = {
  analyze, resolveRecipe, perPerson, loadTargets, recipeMap,
  eatersFor, occasionsFor, weightDemand, expectedServes, isSchoolLunchDay,
  MAIN_SLOTS, ALL_SLOTS, PROTEIN_CATEGORIES
};
