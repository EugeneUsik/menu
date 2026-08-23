'use strict';

/**
 * Deterministic banned-term scanner, shared by validate-week.js, validate-plan.js and
 * validate-foods.js.
 *
 * ── Why there are two matching modes ──────────────────────────────────────────────────
 *
 * `containsTerm` uses manual Unicode-aware word boundaries rather than \b, which does not
 * work for Cyrillic or Lithuanian diacritics. Preserve that when adding terms.
 *
 * But a both-sided boundary alone leaked badly. Russian and Lithuanian are inflected, and
 * an ingredient line almost always uses an inflected form: "100 г груш" is the genitive
 * plural, and that is simply how you write a quantity. Storing whole word-forms meant
 * `груша` never matched `груш`, `яблоко` never matched `яблок`, `персик` never matched
 * `персиков`. Every one of those slipped through. (`яблочный` was once hardcoded as its own
 * entry — a patch for one instance of this.)
 *
 * So the Cyrillic and Lithuanian entries are STEMS, matched with `containsStem`, which
 * requires a boundary only on the left and allows any suffix. English keeps whole-word
 * `containsTerm`: it is not inflected the same way, and prefix-matching it would break real
 * data — `pear` is a prefix of `pearl-barley`, a live catalog key that appears in published
 * shopping item IDs.
 *
 * Deliberately absent: `черри`. "помидоры черри" is a cherry tomato, which is a tomato.
 */

/** Whole-word terms. English is not inflected enough to need stems, and `pear`/`pearl` collide. */
const BANNED_FRUITS_EN = [
  'cherry', 'cherries',
  'apple', 'apples',
  'pear', 'pears',
  'apricot', 'apricots',
  'peach', 'peaches'
];

/** Stems, matched left-anchored so any case ending is caught. */
const BANNED_FRUIT_STEMS = [
  // Russian
  'яблок', 'яблоч',        // яблоко, яблок, яблоки, яблоками, яблочный
  'груш',                  // груша, груш, грушу, грушевый
  'персик',                // персик, персиков, персиковый
  'абрикос',               // абрикос, абрикосов, абрикосовый
  'вишн', 'вишен',         // вишня, вишни, вишен, вишнёвый
  'черешн', 'черешен',     // черешня, черешни, черешен — sweet cherry, a distinct word
  // Lithuanian
  'obuol',                 // obuolys, obuoliai, obuolių
  'kriauš',                // kriaušė, kriaušės, kriaušių
  'vyšn',                  // vyšnia, vyšnios, vyšnių
  'trešn',                 // trešnė, trešnės — sweet cherry
  'abrikos',               // abrikosas, abrikosai, abrikosų
  'persik'                 // persikas, persikai, persikų
];

const PROCESSED_MEATS = [
  'ham', 'bacon', 'sausage', 'sausages', 'salami', 'hot dog', 'hotdog',
  'deli meat', 'processed meat', 'smoked sausage', 'smoked ham',
  'kumpis', 'dešra', 'dešros', 'dešrelė', 'dešrelės', 'šoninė', 'saliamis',
  'ветчина', 'бекон', 'колбаса', 'колбаски', 'сосиска', 'сосиски', 'салями'
];

/** Administrative/summary fields — never food content, so skip them entirely. */
const META_SKIP = [
  'schema_version', 'weekly_validation', 'safety', 'assumptions',
  'household_context_version', 'language', 'nutrition_source', 'stage'
];

/**
 * The external school meal is not chosen here and its contents are not described in the
 * menu, so the processed-meat rule cannot apply to it. Processed meat is rejected in every
 * other field.
 */
const PROCESSED_MEAT_SKIP = [...META_SKIP, 'fixed_school_lunch'];

function isWordChar(cp) {
  return cp != null && (
    (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0x30 && cp <= 0x39) ||
    cp === 0x5f ||
    cp >= 0x80
  );
}

/**
 * Every start index of `needle` in `haystack`.
 *
 * Checking only the first hit was a bug: a glued first occurrence masked a clean later one,
 * so "грушевидный груша" reported no match.
 */
function* occurrences(haystack, needle) {
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    yield i;
    i = haystack.indexOf(needle, i + 1);
  }
}

/** Whole-word match: a letter or digit on either side disqualifies the hit. */
function containsTerm(text, term) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  const t     = String(term).toLowerCase();
  if (!t) return false;

  for (const idx of occurrences(lower, t)) {
    const before = idx > 0 ? lower.codePointAt(idx - 1) : null;
    const after  = idx + t.length < lower.length ? lower.codePointAt(idx + t.length) : null;
    if (!isWordChar(before) && !isWordChar(after)) return true;
  }
  return false;
}

/** Stem match: boundary required on the left only, so any inflected ending matches. */
function containsStem(text, stem) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  const s     = String(stem).toLowerCase();
  if (!s) return false;

  for (const idx of occurrences(lower, s)) {
    const before = idx > 0 ? lower.codePointAt(idx - 1) : null;
    if (!isWordChar(before)) return true;
  }
  return false;
}

/** The first banned fruit token found in `text`, or null. Whole-word EN, stem-wise RU/LT. */
function findBannedFruit(text) {
  for (const term of BANNED_FRUITS_EN)   if (containsTerm(text, term)) return term;
  for (const stem of BANNED_FRUIT_STEMS) if (containsStem(text, stem)) return stem;
  return null;
}

/** The first processed-meat term found in `text`, or null. */
function findProcessedMeat(text) {
  for (const term of PROCESSED_MEATS) if (containsTerm(text, term)) return term;
  return null;
}

/**
 * Recursively collect hits. `find` returns the matched token for a string, or null.
 * `skipKeys` are pruned from the walk.
 */
function scanValues(obj, find, skipKeys, path = '') {
  const hits = [];
  const skip = new Set(Array.isArray(skipKeys) ? skipKeys : (skipKeys ? [skipKeys] : []));

  const walk = (node, at) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      const term = find(node);
      if (term) hits.push({ term, path: at, value: node.slice(0, 80) });
      return;
    }
    if (typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (skip.has(key)) continue;
      walk(node[key], at ? `${at}.${key}` : key);
    }
  };

  walk(obj, path);
  return hits;
}

/** Run both scans with the project's exclusion rules. */
function scanSafety(data) {
  return [
    ...scanValues(data, findBannedFruit, META_SKIP)
      .map(h => `Banned fruit term "${h.term}" at path: ${h.path}`),
    ...scanValues(data, findProcessedMeat, PROCESSED_MEAT_SKIP)
      .map(h => `Processed meat term "${h.term}" at path: ${h.path}`)
  ];
}

module.exports = {
  BANNED_FRUITS_EN, BANNED_FRUIT_STEMS, PROCESSED_MEATS,
  META_SKIP, PROCESSED_MEAT_SKIP,
  containsTerm, containsStem, findBannedFruit, findProcessedMeat,
  scanValues, scanSafety
};
