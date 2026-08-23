#!/usr/bin/env node
'use strict';

/**
 * Split a promoted week's recipes into per-worker group files for parallel expansion.
 *
 * Expansion runs across several workers, and each needs the same brief plus its own slice of the
 * recipes. Writing that by hand meant authoring four ~600-word prompts per week that were ~90%
 * identical — the JSON shape, the 36-name allowed-ingredient list, both safety rules, the
 * equipment list — with only the recipe list differing. On a measured run that authoring was most
 * of the 85 seconds that separated the expansion phase's 2m35s from its slowest worker's 70s.
 *
 * So the shared half lives in prompts/expansion-brief.md and the per-worker half is generated
 * here. A worker prompt becomes two lines: read the brief, expand the recipes in this file.
 *
 * Groups are round-robin rather than contiguous, so each worker gets a mix of breakfasts, dinners
 * and snacks. Wall clock is bound by the slowest worker, and a worker holding all seven breakfasts
 * would be slower than one holding a spread.
 *
 * Usage
 *   node scripts/expansion-groups.js data/weeks/2026-W37.json            # 4 groups
 *   node scripts/expansion-groups.js data/weeks/2026-W37.json --groups 6
 */

const fs   = require('fs');
const path = require('path');

const BRIEF = 'prompts/expansion-brief.md';

function describe(recipe) {
  const rows = (recipe.ingredients || []).map(ing => {
    const forWhom = ing.for ? ` [for:${ing.for}]` : '';
    return `${ing.name} ${ing.quantity}${ing.unit}${forWhom}`;
  }).join('; ');
  return `- **${recipe.id}** — ${recipe.title} — serves ${recipe.serves} — ` +
         `${(recipe.meal_types || []).join(', ')}\n  ${rows}`;
}

function groupFiles(week, weekPath, groups) {
  const dir  = path.dirname(weekPath);
  const id   = week.week?.id || path.basename(weekPath, '.json');
  const out  = [];

  const buckets = Array.from({ length: groups }, () => []);
  (week.recipes || []).forEach((r, i) => buckets[i % groups].push(r));

  buckets.forEach((bucket, n) => {
    if (!bucket.length) return;
    const file = path.join(dir, `${id}-group-${n + 1}.md`);
    const body = [
      `# Expansion group ${n + 1} of ${groups} — ${id}`,
      '',
      `Read \`${BRIEF}\` first: it holds the output format, the allowed ingredient names, the`,
      'salt limits, both safety rules and the equipment list. It applies in full.',
      '',
      `**Write your output to:** \`${path.relative(process.cwd(), path.join(dir, `${id}-exp-${n + 1}.json`))}\``,
      '',
      `## Your ${bucket.length} recipe(s)`,
      '',
      'Quantities below are already solved against every nutrition budget. Do not change them, and',
      'do not change `serves`, titles or the menu.',
      '',
      ...bucket.map(describe),
      ''
    ].join('\n');

    fs.writeFileSync(file, body);
    out.push({ file: path.relative(process.cwd(), file), count: bucket.length });
  });

  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const gIdx = args.indexOf('--groups');
  const groups = gIdx !== -1 ? Number(args[gIdx + 1]) : 4;

  if (!file || !Number.isInteger(groups) || groups < 1) {
    console.error('Usage: node expansion-groups.js <week.json> [--groups N]');
    process.exit(1);
  }
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) { console.error(`File not found: ${resolved}`); process.exit(1); }
  if (!fs.existsSync(path.join(__dirname, '..', BRIEF))) {
    console.error(`[FAIL] ${BRIEF} is missing — the group files are useless without it`);
    process.exit(1);
  }

  let week;
  try { week = JSON.parse(fs.readFileSync(resolved, 'utf8')); }
  catch (err) { console.error(`[FAIL] JSON parse error: ${err.message}`); process.exit(1); }

  const written = groupFiles(week, resolved, groups);
  written.forEach(w => console.log(`  ${w.file}  (${w.count} recipe(s))`));
  console.log(`\nGive each worker: "Read ${BRIEF} and do <group file>." Nothing else needs saying.`);
}

module.exports = { groupFiles, describe };
