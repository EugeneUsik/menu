#!/usr/bin/env node
'use strict';

/**
 * Run the three tail steps of a week in order, and stop at the first that fails.
 *
 * `compute-nutrition.js`, `generate-shopping-list.js` and `validate-week.js` are always run
 * together and always in that order, because nutrition has to be recomputed before it is
 * validated — otherwise `validate-week.js` reports `daily_nutrition` as stale, which reads like a
 * data error and is really just a missed step. Any fix to a quantity means all three again.
 *
 * That is three commands per attempt, and a real run makes several attempts. Chaining them is
 * worth more than it looks: the scripts themselves take milliseconds, so the cost being removed
 * is the round-trip, not the compute.
 *
 * `--solve` re-runs the quantity solver first. Minor ingredients added during expansion — a
 * clove of garlic here, two grams of salt there — shift a day by a few percent, which is the one
 * class of failure that legitimately appears after the plan has passed. Repairing it with the
 * solver rather than by hand is the same reasoning as `solve-plan.js` itself: it is arithmetic.
 *
 * Usage
 *   node scripts/finalise-week.js data/weeks/2026-W37.json
 *   node scripts/finalise-week.js data/weeks/2026-W37.json --solve
 */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const STEPS = [
  ['compute-nutrition.js',      'nutrition'],
  ['generate-shopping-list.js', 'shopping list'],
  ['validate-week.js',          'final gate']
];

function run(script, args) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, script), ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node finalise-week.js <week.json> [--solve]');
    process.exit(1);
  }
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const chain = args.includes('--solve')
    ? [['solve-plan.js', 'quantity solve'], ...STEPS]
    : STEPS;

  for (const [script, label] of chain) {
    const res = run(script, [resolved]);
    const tail = res.out.trim().split('\n').filter(Boolean).slice(-1)[0] || '';
    if (!res.ok) {
      console.error(`✗ ${label}`);
      console.error(res.out.trimEnd());
      process.exit(1);
    }
    console.log(`✓ ${label.padEnd(15)} ${tail}`);
  }

  console.log('\nWeek is publishable. Next: sync-weeks-index.js, derive-history.js, commit.');
}
