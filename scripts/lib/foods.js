'use strict';

/**
 * Canonical food catalog loader and name resolver.
 *
 * Ingredient names arrive from LLM output and drift in spelling ("оливковое масло"
 * vs "масло оливковое", "гречка" vs "гречневая крупа", "греческий йогурт 0–2%" vs
 * "йогурт греческий 2%"). This module maps any of them onto one canonical food
 * with known per-100 g nutrition, so nutrition can be COMPUTED rather than guessed.
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', '..', 'data', 'foods.json');

/** Normalise a name for matching: lowercase, unify dash/quote variants, collapse space. */
function normalise(str) {
  return String(str)
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')   // en/em dash, minus → hyphen
    .replace(/[’‘`´]/g, "'")
    .replace(/ё/g, 'е')                        // ё/е are interchangeable in practice
    .replace(/[«»"()]/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Order-insensitive key so "оливковое масло" and "масло оливковое" collide. */
function wordSetKey(str) {
  return normalise(str)
    .replace(/[.,;:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

let cache = null;

function loadCatalog() {
  if (cache) return cache;

  const raw   = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const foods = raw.foods || [];

  const byKey     = new Map();
  const exact     = new Map();   // normalised name → food
  const wordSet   = new Map();   // order-insensitive key → food (fallback)
  const conflicts = [];

  for (const food of foods) {
    if (byKey.has(food.key)) conflicts.push(`duplicate food key: ${food.key}`);
    byKey.set(food.key, food);

    const names = [food.name_ru, ...(food.aliases || [])];
    for (const name of names) {
      const n = normalise(name);
      const prev = exact.get(n);
      if (prev && prev.key !== food.key) {
        conflicts.push(`alias "${name}" claimed by both ${prev.key} and ${food.key}`);
      }
      exact.set(n, food);

      // Word-set index is a fallback only; first writer wins, no conflict reported
      // (e.g. "перец сладкий" vs "сладкий перец" legitimately share a word set).
      const ws = wordSetKey(name);
      if (!wordSet.has(ws)) wordSet.set(ws, food);
    }
  }

  cache = { foods, byKey, exact, wordSet, conflicts };
  return cache;
}

/**
 * Resolve an ingredient name to a catalog food.
 * @returns {{food: object, match: 'exact'|'wordset'}|null}
 */
function resolve(name) {
  const cat = loadCatalog();
  const n   = normalise(name);

  const hit = cat.exact.get(n);
  if (hit) return { food: hit, match: 'exact' };

  const ws = cat.wordSet.get(wordSetKey(name));
  if (ws) return { food: ws, match: 'wordset' };

  return null;
}

/**
 * Convert an ingredient quantity to grams using the food's unit table.
 * @returns {{grams: number}|{error: string}}
 */
function toGrams(food, quantity, unit) {
  // Number(null) and Number('') are both 0, and 0 is finite — so a missing quantity used to
  // convert to 0 g and silently drop the ingredient from both nutrition and the shopping
  // list. Reject the empty cases before coercing.
  if (quantity === null || quantity === undefined ||
      (typeof quantity === 'string' && quantity.trim() === '')) {
    return { error: `missing quantity` };
  }
  const qty = Number(quantity);
  if (!Number.isFinite(qty)) return { error: `non-numeric quantity "${quantity}"` };
  if (qty < 0) return { error: `negative quantity "${quantity}"` };

  const u = String(unit || '').toLowerCase().trim();

  if (u === 'g' || u === 'г' || u === 'gram' || u === 'grams') return { grams: qty };

  if (u === 'ml' || u === 'мл') {
    const density = food.density != null ? food.density : 1.0;
    return { grams: qty * density };
  }

  if (u === 'kg') return { grams: qty * 1000 };
  if (u === 'l')  return { grams: qty * 1000 * (food.density != null ? food.density : 1.0) };

  const table = food.g_per || {};

  // Size words behave as a piece with a scaling factor (legacy files use "2 medium onions").
  const SIZE = { small: 0.7, medium: 1.0, large: 1.35, whole: 1.0, pc: 1.0, piece: 1.0, pieces: 1.0 };
  const sizeFactor = SIZE[u];
  if (sizeFactor != null && table.pcs != null) {
    return { grams: qty * table.pcs * sizeFactor };
  }

  if (table[u] != null) return { grams: qty * table[u] };

  // Singular/plural tolerance: pcs/pc/piece, slice/slices, clove/cloves, stalk/stalks
  const variants = [u, u.replace(/s$/, ''), u + 's'];
  for (const v of variants) {
    if (table[v] != null) return { grams: qty * table[v] };
  }

  return {
    error: `food "${food.key}" has no gram conversion for unit "${unit}" ` +
           `(known: ${Object.keys(table).join(', ') || 'none'})`
  };
}

/**
 * Does this food count toward the "vegetables + fruit per day" target?
 *
 * Potato and sweet potato do not: they are starchy staples, and every mainstream
 * 5-a-day scheme excludes them. They carry `vegetable_starchy` WITHOUT `vegetable`.
 * Parsnip carries both and does count. Herbs and aromatics-only entries (dill,
 * parsley, ginger) carry `herb`/`aromatic` without `vegetable` and do not count.
 */
function isVegFruit(food) {
  const t = food.tags || [];
  if (t.includes('vegetable') || t.includes('fruit')) return true;
  return false;
}

/**
 * Scale a per-100 g nutrition block to an arbitrary gram amount.
 *
 * `veg_fruit_g` is a pseudo-nutrient: the food's own gram weight when it counts
 * toward the fruit-and-vegetable target, 0 otherwise. Carrying it here means it
 * flows through the same per-person portion-weight split as everything else,
 * so a person's share of the week's vegetables needs no separate machinery.
 */
function nutritionFor(food, grams) {
  const p = food.per100g || {};
  const f = grams / 100;
  return {
    kcal:         (p.kcal || 0) * f,
    protein_g:    (p.p    || 0) * f,
    carbs_g:      (p.c    || 0) * f,
    fat_g:        (p.f    || 0) * f,
    sat_fat_g:    (p.sf   || 0) * f,
    fiber_g:      (p.fib  || 0) * f,
    sodium_mg:    (p.na   || 0) * f,
    calcium_mg:   (p.ca   || 0) * f,
    iron_mg:      (p.fe   || 0) * f,
    zinc_mg:      (p.zn   || 0) * f,
    free_sugar_g: (p.fs   || 0) * f,
    sterol_g:     (p.st   || 0) * f,
    viscous_fiber_g: (p.vf || 0) * f,
    veg_fruit_g:  isVegFruit(food) ? grams : 0
  };
}

const EMPTY = () => ({
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, sat_fat_g: 0, fiber_g: 0, sodium_mg: 0,
  calcium_mg: 0, iron_mg: 0, zinc_mg: 0,
  free_sugar_g: 0, sterol_g: 0, viscous_fiber_g: 0, veg_fruit_g: 0
});

function addInto(target, source, factor = 1) {
  for (const k of Object.keys(target)) target[k] += (source[k] || 0) * factor;
  return target;
}

function hasTag(food, tag) {
  return Array.isArray(food.tags) && food.tags.includes(tag);
}

module.exports = {
  loadCatalog, resolve, toGrams, nutritionFor,
  normalise, wordSetKey, EMPTY, addInto, hasTag
};
