'use strict';

/**
 * The three things that exist to make generation cheaper without making it looser:
 * normalise-plan.js (derive what is mechanical), catalog-digest.js (the vocabulary at a fifth
 * of the size), and the portion calibration in recent-history.json (start at the right scale).
 *
 * The ISO-week arithmetic gets the most attention here because it is the one piece with a
 * genuinely tricky definition — week 1 is the week containing January 4th, not the week
 * containing January 1st — and it is silently wrong across year boundaries if you get it wrong.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { normalisePlan, isoWeekMonday, weekLabel } = require('../scripts/normalise-plan.js');
const { calibration } = require('../scripts/derive-history.js');
const { analyze, loadTargets } = require('../scripts/lib/analyze.js');

const iso = d => d.toISOString().slice(0, 10);

/* ── ISO week arithmetic ── */

test('isoWeekMonday matches every week this project has published', () => {
  // Ground truth: the start_date committed in each week file.
  const known = {
    '2026-W20': '2026-05-11', '2026-W21': '2026-05-18', '2026-W22': '2026-05-25',
    '2026-W23': '2026-06-01', '2026-W24': '2026-06-08', '2026-W25': '2026-06-15',
    '2026-W26': '2026-06-22', '2026-W35': '2026-08-24'
  };
  for (const [id, expected] of Object.entries(known)) {
    const [y, w] = id.split('-W');
    assert.equal(iso(isoWeekMonday(Number(y), Number(w))), expected, id);
  }
});

test('isoWeekMonday is right across year boundaries', () => {
  // The definition that makes these work is "week 1 contains January 4th". Counting from
  // January 1st gets both of these wrong.
  assert.equal(iso(isoWeekMonday(2026, 1)), '2025-12-29', '2026-W01 starts in December 2025');
  assert.equal(iso(isoWeekMonday(2027, 1)), '2027-01-04');
  assert.equal(iso(isoWeekMonday(2026, 53)), '2026-12-28', '2026 has a week 53');
});

test('isoWeekMonday always returns a Monday', () => {
  for (let w = 1; w <= 52; w++) {
    assert.equal(isoWeekMonday(2026, w).getUTCDay(), 1, `2026-W${w}`);
  }
});

/* ── the Russian label ── */

test('weekLabel reproduces the committed label format', () => {
  const label = id => {
    const [y, w] = id.split('-W');
    const mon = isoWeekMonday(Number(y), Number(w));
    return weekLabel(id, mon, new Date(mon.getTime() + 6 * 86400000));
  };
  assert.equal(label('2026-W35'), '2026 W35 · 24–30 августа');
  assert.equal(label('2026-W23'), '2026 W23 · 1–7 июня');
  assert.equal(label('2026-W26'), '2026 W26 · 22–28 июня');
});

test('weekLabel spells out both months when a week spans two', () => {
  // The generation prompt documents exactly this example.
  const mon = isoWeekMonday(2026, 27);
  assert.equal(weekLabel('2026-W27', mon, new Date(mon.getTime() + 6 * 86400000)),
    '2026 W27 · 29 июня – 5 июля');
});

test('weekLabel uses the middle dot and en dash the app expects', () => {
  const mon = isoWeekMonday(2026, 35);
  const l = weekLabel('2026-W35', mon, new Date(mon.getTime() + 6 * 86400000));
  assert.ok(l.includes('·'), 'middle dot U+00B7');
  assert.ok(l.includes('–'), 'en dash U+2013');
});

/* ── normalisePlan ── */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A plan carrying only the decisions a human makes: the dishes and their placement. */
function barePlan() {
  const recipes = [];
  const menu = DAYS.map((_, i) => {
    const slots = {};
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      const id = `${slot}-${i}`;
      recipes.push({
        id, title: `${slot} ${i}`, meal_types: [slot],
        active_time_min: 20, total_time_min: 25,
        ingredients: [
          { name: 'грудка куриная', quantity: 300, unit: 'g' },
          { name: 'брокколи', quantity: 200, unit: 'g' }
        ],
        ...(slot === 'breakfast' ? { base: 'eggs' } : {}),
        ...(slot === 'dinner' ? { format: 'plated' } : {})
      });
      slots[slot] = { title: `${slot} ${i}`, recipe_id: id };
    }
    return slots;                                   // no day_name, no date, no school flag
  });
  return { week: { id: '2026-W36' }, menu, recipes };   // no dates, no label, no serves
}

test('a plan needs only week.id and the menu placement', () => {
  const { plan, errors } = normalisePlan(barePlan());
  assert.deepEqual(errors, []);

  assert.equal(plan.week.start_date, '2026-08-31');
  assert.equal(plan.week.end_date, '2026-09-06');
  assert.equal(plan.week.timezone, 'Europe/Vilnius');
  assert.match(plan.week.label, /^2026 W36 · /);
  assert.equal(plan.language, 'ru');

  plan.menu.forEach((day, i) => {
    assert.equal(day.day_name, DAYS[i]);
    assert.equal(day.includes_fixed_school_lunch, i < 5, DAYS[i]);
  });
  assert.equal(plan.menu[0].date, '2026-08-31');
  assert.equal(plan.menu[6].date, '2026-09-06');
});

test('serves is derived, so the eater model cannot be got wrong by hand', () => {
  // This is the failure class the derivation removes: validate-plan, compute-nutrition and
  // validate-week all hard-fail on a serves mismatch, because the shopping list sums each
  // recipe's quantities exactly once.
  const { plan } = normalisePlan(barePlan());
  const serves = id => plan.recipes.find(r => r.id === id).serves;

  assert.equal(serves('breakfast-0'), 3, 'breakfast feeds all three');
  assert.equal(serves('lunch-0'), 2, 'Monday lunch: the child is at school');
  assert.equal(serves('lunch-5'), 3, 'Saturday lunch: everyone is home');
  assert.equal(serves('dinner-0'), 3);
});

test('a cook-once dinner is 5 portions on a school day and 6 at the weekend', () => {
  const mkCarry = dinnerIdx => {
    const p = barePlan();
    p.menu[dinnerIdx].dinner = { title: 'carry', recipe_id: 'carry' };
    p.menu[dinnerIdx + 1].lunch = { title: 'carry', recipe_id: 'carry' };
    p.recipes.push({ id: 'carry', title: 'carry', meal_types: ['dinner', 'lunch'], format: 'one_pot',
      active_time_min: 25, total_time_min: 40,
      ingredients: [{ name: 'грудка куриная', quantity: 600, unit: 'g' },
                    { name: 'брокколи', quantity: 400, unit: 'g' }] });
    return normalisePlan(p).plan.recipes.find(r => r.id === 'carry').serves;
  };
  assert.equal(mkCarry(2), 5, 'Wed dinner (3) + Thu school lunch (2)');
  assert.equal(mkCarry(4), 6, 'Fri dinner (3) + Sat lunch (3)');
});

test('normalisePlan is idempotent', () => {
  const once  = normalisePlan(barePlan()).plan;
  const twice = normalisePlan(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice.changes, [], 'second run must derive nothing');
});

test('it reports what it changed, so a surprise is visible', () => {
  const p = barePlan();
  p.week.start_date = '2020-01-01';                 // wrong on purpose
  const { changes } = normalisePlan(p);
  assert.ok(changes.some(c => c.includes('start_date') && c.includes('2026-08-31')));
});

test('a malformed week.id is an error rather than a silent guess', () => {
  for (const id of [undefined, '', 'next week', '2026-35', '26-W35']) {
    const p = barePlan(); p.week.id = id;
    assert.ok(normalisePlan(p).errors.length, JSON.stringify(id));
  }
});

test('a menu that is not 7 days is an error', () => {
  const p = barePlan(); p.menu.pop();
  assert.match(normalisePlan(p).errors[0], /exactly 7 days/);
});

test('an unreferenced recipe keeps whatever serves it had', () => {
  // validate-plan warns about these; inventing a serves would mask that.
  const p = barePlan();
  p.recipes.push({ id: 'orphan', title: 'orphan', serves: 99, ingredients: [] });
  const { plan } = normalisePlan(p);
  assert.equal(plan.recipes.find(r => r.id === 'orphan').serves, 99);
});

/* ── portion calibration ── */

test('calibration reports recipe scale grouped by slot and serves', () => {
  // Grouping by serves alone would be useless: a breakfast, a dinner and a snack all have
  // serves 3 and differ by a factor of two.
  const { plan } = normalisePlan(barePlan());
  const c = calibration({ ...plan, week: { id: '2026-W36' } }, analyze(plan));

  assert.equal(c.source_week, '2026-W36');
  assert.ok(c.recipe_total_kcal['breakfast (serves 3)'], 'breakfast group present');
  assert.ok(c.recipe_total_kcal['lunch (serves 2)'], 'school-day lunch group present');
  for (const stats of Object.values(c.recipe_total_kcal)) {
    assert.ok(stats.median > 0);
    assert.ok(stats.min <= stats.median && stats.median <= stats.max);
    assert.ok(stats.n >= 1);
  }
});

test('calibration counts for:-tagged rows in the recipe total', () => {
  // The whole point. Estimating a breakfast at 1240 kcal when the real figure was 2018 came
  // from treating the tagged rows as if they sat outside the recipe.
  const p = barePlan();
  const bfast = p.recipes.find(r => r.id === 'breakfast-0');
  const { plan: base } = normalisePlan(JSON.parse(JSON.stringify(p)));
  const before = calibration(base, analyze(base)).recipe_total_kcal['breakfast (serves 3)'];

  bfast.ingredients.push({ name: 'орехи грецкие', quantity: 100, unit: 'g', for: 'wife' });
  const { plan: after } = normalisePlan(p);
  const stats = calibration(after, analyze(after)).recipe_total_kcal['breakfast (serves 3)'];

  assert.ok(stats.max > before.max, 'a tagged row must raise the recorded total');
});

test('calibration records the tagged conventions actually used', () => {
  const p = barePlan();
  p.recipes.find(r => r.id === 'breakfast-0').ingredients.push(
    { name: 'молоко 2%', quantity: 400, unit: 'ml', for: 'child' });
  const { plan } = normalisePlan(p);
  const rows = calibration(plan, analyze(plan)).tagged_rows;
  assert.ok(rows.some(r => r.for === 'child' && r.quantity === 400 && r.unit === 'ml'));
});

/* ── catalog digest ── */

test('the digest carries every catalog name, or generation would fail on a missing one', () => {
  // An unrecognised ingredient name is a hard failure, so a digest that drops a food silently
  // narrows the usable vocabulary.
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const out = execFileSync(process.execPath,
    [path.join(__dirname, '..', 'scripts', 'catalog-digest.js')], { encoding: 'utf8' });

  const catalog = require('../scripts/lib/foods.js').loadCatalog();
  for (const food of catalog.foods) {
    assert.ok(out.includes(food.name_ru), `digest is missing "${food.name_ru}" (${food.key})`);
  }
  assert.ok(out.length < 40000, `digest should stay well under the raw catalog, got ${out.length}`);
});

test('the digest flags dry-basis foods and deprecated entries', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const out = execFileSync(process.execPath,
    [path.join(__dirname, '..', 'scripts', 'catalog-digest.js')], { encoding: 'utf8' });

  // A dry-basis food entered as a cooked weight overstates energy ~3x, so the marker matters.
  const oats = out.split('\n').find(l => l.includes('хлопья овсяные'));
  assert.match(oats, /\[DRY\]/);
  // Deprecated entries must be visibly discouraged or they get used.
  const sugar = out.split('\n').find(l => l.trim().startsWith('сахар'));
  assert.match(sugar, /AVOID/);
});
