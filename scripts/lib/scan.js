'use strict';

/**
 * Deterministic banned-term scanner, shared by validate-week.js and validate-plan.js.
 *
 * containsTerm() uses manual Unicode-aware word boundaries rather than \b, which
 * does not work for Cyrillic or Lithuanian diacritics. Preserve that when adding terms.
 */

const BANNED_FRUITS = [
  'cherry', 'cherries', 'vyšnia', 'vyšnios', 'vyšnių', 'вишня', 'вишни',
  'apple', 'apples', 'obuolys', 'obuoliai', 'obuolių', 'яблоко', 'яблоки', 'яблочный',
  'pear', 'pears', 'kriaušė', 'kriaušės', 'kriaušių', 'груша', 'груши',
  'apricot', 'apricots', 'abrikosas', 'abrikosai', 'abrikosų', 'абрикос', 'абрикосы',
  'peach', 'peaches', 'persikas', 'persikai', 'persikų', 'персик', 'персики'
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

function containsTerm(text, term) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const t     = term.toLowerCase();
  const idx   = lower.indexOf(t);
  if (idx === -1) return false;
  // Reject the match if it is glued to another letter/digit — a manual word boundary
  // that works for Cyrillic and Lithuanian, where \b does not.
  const before = idx > 0 ? lower.codePointAt(idx - 1) : null;
  const after  = idx + t.length < lower.length ? lower.codePointAt(idx + t.length) : null;
  const isWordChar = cp => cp != null && (
    (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0x30 && cp <= 0x39) ||
    cp === 0x5f ||
    cp >= 0x80
  );
  return !isWordChar(before) && !isWordChar(after);
}

/** Recursively collect banned-term hits. skipKeys are pruned from the walk. */
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

/**
 * Run both scans with the project's exclusion rules.
 * The processed-meat scan additionally skips fixed_school_snack: the child's external
 * school snack legitimately contains ham, but processed meat is rejected everywhere else.
 */
function scanSafety(data) {
  return [
    ...scanTerms(data, BANNED_FRUITS, META_SKIP)
      .map(h => `Banned fruit term "${h.term}" at path: ${h.path}`),
    ...scanTerms(data, PROCESSED_MEATS, [...META_SKIP, 'fixed_school_snack'])
      .map(h => `Processed meat term "${h.term}" at path: ${h.path}`)
  ];
}

module.exports = { BANNED_FRUITS, PROCESSED_MEATS, META_SKIP, containsTerm, scanTerms, scanSafety };
