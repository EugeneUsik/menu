#!/usr/bin/env node
'use strict';

/**
 * Print data/foods.json as a compact table for menu generation.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────
 *
 * The generation flow needs two things from the catalog: the exact `name_ru` to write (an
 * unrecognised name is a hard failure) and enough per-100 g nutrition to size a portion. The
 * raw file is ~69 KB of JSON to carry both, most of it structural punctuation and fields
 * generation never reads.
 *
 * This emits the same vocabulary at roughly a fifth of the size, laid out so the numbers can
 * be scanned down a column rather than hunted through nested objects. Both matter: the size
 * is context that could be spent on the menu, and the layout is what makes portion sizing a
 * reading exercise instead of an arithmetic one.
 *
 * Generated on demand and never written to disk, so it cannot go stale against the catalog.
 *
 * Usage
 *   node scripts/catalog-digest.js
 *   node scripts/catalog-digest.js --tag fatty_fish     # only foods carrying a tag
 */

const F = require('./lib/foods.js');

/** Shop order, matching generate-shopping-list.js so the two read the same way. */
const CATEGORY_ORDER = [
  'Рыба и морепродукты',
  'Мясо и птица',
  'Яйца и молочные продукты',
  'Молочное растительное и соя',
  'Бобовые и консервы',
  'Крупы и бакалея',
  'Хлеб и хлебцы',
  'Орехи и семена',
  'Овощи и зелень',
  'Фрукты и ягоды',
  'Масла и соусы',
  'Специи и приправы',
  'Прочее'
];

const HEADER = `# Food catalog digest — the ingredient vocabulary

Names are the canonical \`name_ru\`. Write them exactly; an unrecognised name is a hard failure.

Columns are per 100 g: kcal, P protein, C carbs, F fat, S saturated fat, Fib fibre,
Na sodium mg, Ca calcium mg. Optional, shown only when non-zero:
Fe iron mg, Zn zinc mg, **FS** free sugars g, **ST** plant sterols g, **VF** viscous fibre g.

Markers: \`[DRY]\` nutrition is per 100 g DRY weight — state dry weight and expect ~150 g per
portion to be flagged. \`{...}\` non-gram units this food accepts. \`AVOID\` deprecated or
discouraged, do not use in new menus.
`;

function line(food) {
  const p = food.per100g || {};
  const n = v => (v == null ? '-' : String(v));
  let s = '  ' + food.name_ru.padEnd(38) +
    ('kcal ' + n(p.kcal)).padEnd(10) +
    ('P' + n(p.p)).padEnd(7) +
    ('C' + n(p.c)).padEnd(7) +
    ('F' + n(p.f)).padEnd(7) +
    ('S' + n(p.sf)).padEnd(7) +
    ('Fib' + n(p.fib)).padEnd(8) +
    ('Na' + n(p.na)).padEnd(8) +
    ('Ca' + n(p.ca)).padEnd(7);
  if (p.fe) s += ' Fe' + p.fe;
  if (p.zn) s += ' Zn' + p.zn;
  if (p.fs) s += ' FS' + p.fs;
  if (p.st) s += ' ST' + p.st;
  if (p.vf) s += ' VF' + p.vf;
  if (food.basis === 'dry') s += ' [DRY]';
  const units = Object.keys(food.g_per || {});
  if (units.length) s += ' {' + units.map(u => `${u}=${food.g_per[u]}g`).join(' ') + '}';
  if (food.density != null) s += ' {ml=' + food.density + 'g}';
  if (food._deprecated || food._discouraged) s += '  AVOID';
  return s;
}

function main(argv) {
  const tagIdx = argv.indexOf('--tag');
  const onlyTag = tagIdx !== -1 ? argv[tagIdx + 1] : null;

  const catalog = F.loadCatalog();
  let foods = catalog.foods;
  if (onlyTag) foods = foods.filter(f => (f.tags || []).includes(onlyTag));

  const out = [HEADER];
  const cats = [...new Set(foods.map(f => f.cat))]
    .sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  for (const cat of cats) {
    const list = foods.filter(f => f.cat === cat);
    if (!list.length) continue;
    out.push(`\n## ${cat}\n`);
    for (const food of list) {
      out.push(line(food));
      // Tags drive every variety and weekly-frequency rule, so they are not optional context.
      out.push('      ' + (food.tags || []).join(' '));
    }
  }

  out.push(`\n${foods.length} foods${onlyTag ? ` tagged "${onlyTag}"` : ''}.`);
  console.log(out.join('\n'));
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { line, CATEGORY_ORDER };
