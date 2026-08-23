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
const { checkBudgets } = require('../scripts/lib/budgets.js');
const { diagnose, sharedShare, occasionsAttended } = require('../scripts/diagnose-plan.js');
const { patchPlan, recipeKcal, tidy, parseArgs } = require('../scripts/patch-plan.js');
const { scaffold, bandFor } = require('../scripts/scaffold-plan.js');
const { solvePlan, isFixedRow } = require('../scripts/solve-plan.js');
const F  = require('../scripts/lib/foods.js');
const fs = require('node:fs');
const path = require('node:path');

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

/* ── diagnose-plan ──
 *
 * The gate reports a per-person share of a recipe total; the edit that closes it is a change to
 * the recipe. Translating between the two by hand cost the W36 plan a whole validation round,
 * so the translation is derived — and the arithmetic behind it is what these tests pin.
 */

/** A plan with a Wednesday dinner carrying into Thursday's school lunch — 3 + 2 portions. */
function carryPlan() {
  const p = barePlan();
  p.menu[2].dinner = { title: 'carry', recipe_id: 'carry', cook_once_eat_twice: true };
  p.menu[3].lunch  = { title: 'carry', recipe_id: 'carry', leftover_from: 'Wednesday dinner' };
  p.recipes.push({
    id: 'carry', title: 'carry', meal_types: ['dinner', 'lunch'], format: 'one_pot',
    active_time_min: 25, total_time_min: 40,
    ingredients: [
      { name: 'грудка куриная', quantity: 600, unit: 'g' },
      { name: 'брокколи',       quantity: 400, unit: 'g' },
      { name: 'орехи грецкие',  quantity: 25,  unit: 'g', for: 'wife' }
    ]
  });
  return normalisePlan(p).plan;
}

test('a share is the eater-weight share per occasion, not 1/serves', () => {
  const plan  = carryPlan();
  const facts = analyze(plan).recipeFacts.get('carry');
  const W     = loadTargets().portion_weights;

  assert.equal(facts.expectedServes, 5, 'Wed dinner (3) + Thu school lunch (2)');

  // Weight demand is 3.0 + 1.9 = 4.9, so the husband's share is 1.15/4.9 ≈ 0.235 per occasion.
  // 1/serves would say 0.200 — a 17% error, and the direction that leaves a week under-fed.
  const share = sharedShare(facts, 'husband', W);
  assert.ok(Math.abs(share - W.husband / 4.9) < 1e-9, `got ${share}`);
  assert.ok(Math.abs(share - 1 / 5) > 0.03, 'must not collapse to 1/serves');

  assert.equal(occasionsAttended(facts, 'husband'), 2, 'he eats the dinner and the leftovers');
  assert.equal(occasionsAttended(facts, 'child'), 1, 'the child is at school for the lunch');
});

test('the suggested recipe delta closes the gap it was computed for', () => {
  // The whole point of the tool: apply what it says, land on the target. The fixture is
  // deliberately under-fed (300 g chicken + 200 g broccoli per meal), so energy is short.
  const plan = normalisePlan(barePlan()).plan;
  const gap  = diagnose(plan).daily.find(
    e => e.person === 'husband' && e.key === 'kcal' && e.day === 'Monday' && e.bound === 'min');
  assert.ok(gap, 'the bare plan should be well short on the husband\'s energy');

  const slot = gap.slots.find(s => s.slot === 'breakfast');
  assert.ok(slot.sharedDelta > 0);

  const patched = JSON.parse(JSON.stringify(plan));
  const recipe  = patched.recipes.find(r => r.id === slot.recipeId);
  const factor  = (slot.recipeShared + slot.sharedDelta) / slot.recipeShared;
  for (const ing of recipe.ingredients) if (!ing.for) ing.quantity *= factor;

  const after = analyze(patched).daily[0].totals.husband.kcal;
  const min   = loadTargets().daily.husband.kcal.min;
  assert.ok(Math.abs(after - min) < 1, `expected ~${min} kcal, got ${after}`);
});

test('a for:-tagged suggestion accounts for a recipe spanning two days', () => {
  // A tagged row is divided across the occasions its owner attends, so moving a day by D needs
  // D × attended. Missing this under-corrects by half on a cook-once dinner.
  const spans = diagnose(carryPlan()).daily
    .flatMap(e => e.slots.map(s => ({ delta: e.delta, ...s })))
    .filter(s => s.recipeId === 'carry' && s.attended === 2);

  assert.ok(spans.length, 'the carry recipe should appear with two attended occasions');
  for (const s of spans) {
    assert.ok(Math.abs(s.taggedDelta - s.delta * 2) < 1e-9, `${s.taggedDelta} vs ${s.delta * 2}`);
  }
});

test('diagnose flags exactly what the gate blocks on', () => {
  // A diagnostic that disagreed with lib/budgets.js would either send the operator chasing
  // warn-level noise or hide something that actually blocks. Same specs, same near-miss rule.
  for (const plan of [normalisePlan(barePlan()).plan, carryPlan()]) {
    const res  = diagnose(plan);
    const fails = [...res.daily, ...res.ratios, ...res.weekly].filter(e => e.severity === 'fail');
    assert.equal(fails.length, checkBudgets(analyze(plan)).errors.length);
  }
});

/* ── patch-plan ──
 *
 * Exists because a normalised plan is one field per line, so `"quantity": 750` is not a unique
 * string and a text edit cannot target it — which is what pushed two whole-plan rewrites into
 * the W36 run, against the flow's own "never regenerate the plan" rule.
 */

const ops = o => ({ set: [], add: [], remove: [], scale: null, kcal: null, ...o });

test('--kcal hits the target while holding for:-tagged rows fixed', () => {
  // Tagged rows are the conventions a passing week established, not free variables. The wife's
  // sterol drink is one 100 ml bottle delivering 2 g; scaling it to 125 ml asks for a product
  // that does not exist and reprices the highest-yield item in her LDL protocol.
  const plan = normalisePlan(barePlan()).plan;
  const r    = plan.recipes.find(x => x.id === 'breakfast-0');
  r.ingredients.push({ name: 'напиток кисломолочный с фитостеролами', quantity: 100, unit: 'ml', for: 'wife' });

  patchPlan(plan, 'breakfast-0', ops({ kcal: 1800 }));

  assert.equal(r.ingredients.find(i => i.for === 'wife').quantity, 100, 'the bottle stays a bottle');
  const k = recipeKcal(r);
  assert.ok(Math.abs(k.total - 1800) < 40, `expected ~1800 kcal total, got ${Math.round(k.total)}`);
  assert.ok(k.tagged > 0, 'tagged kcal counts toward the calibration total');
});

test('--kcal below the tagged floor is refused rather than silently missed', () => {
  const plan = normalisePlan(barePlan()).plan;
  const r    = plan.recipes.find(x => x.id === 'breakfast-0');
  r.ingredients.push({ name: 'орехи грецкие', quantity: 100, unit: 'g', for: 'wife' });
  assert.throws(() => patchPlan(plan, 'breakfast-0', ops({ kcal: 200 })), /for:-tagged rows/);
});

test('an ambiguous ingredient selector is refused rather than guessed', () => {
  // The same food appears twice on purpose: a shared portion plus a tagged top-up. Patching
  // the wrong one moves the nutrient to the wrong person, which is invisible in the recipe
  // total and surfaces as a per-person budget miss rounds later.
  const plan = normalisePlan(barePlan()).plan;
  const r    = plan.recipes.find(x => x.id === 'breakfast-0');
  r.ingredients.push({ name: 'брокколи', quantity: 100, unit: 'g', for: 'husband' });

  assert.throws(() => patchPlan(plan, 'breakfast-0', ops({ set: [['брокколи', 150]] })), /matches 2 rows/);

  patchPlan(plan, 'breakfast-0', ops({ set: [['брокколи#husband', 150]] }));
  assert.equal(r.ingredients.find(i => i.for === 'husband').quantity, 150);
  assert.equal(r.ingredients.find(i => i.name === 'брокколи' && !i.for).quantity, 200,
    'the shared row must be untouched');
});

test('ingredient names resolve through the catalog, so spelling drift still lands', () => {
  const plan = normalisePlan(barePlan()).plan;
  patchPlan(plan, 'breakfast-0', ops({ set: [['куриная грудка', 420]] }));   // reversed word order
  assert.equal(plan.recipes.find(r => r.id === 'breakfast-0').ingredients[0].quantity, 420);
});

test('a name outside the catalog cannot be added', () => {
  const plan = normalisePlan(barePlan()).plan;
  assert.throws(() => patchPlan(plan, 'breakfast-0', ops({ add: ['мясо дракона=100'] })),
    /unknown ingredient/);
});

test('tidy keeps scaled quantities buyable', () => {
  assert.equal(tidy(47.3, 'g'), 45, 'grams snap to 5s once they are worth weighing');
  assert.equal(tidy(18.2, 'g'), 18, 'small amounts stay exact');
  assert.equal(tidy(4.6, 'pcs'), 5, 'half an egg is not a thing');
  assert.equal(tidy(0.2, 'pcs'), 1, 'never round an ingredient out of existence');
});

test('parseArgs separates the file, the recipe and the assignments', () => {
  const p = parseArgs(['plan.json', 'beef-x', 'говядина постная=800', '--scale', '1.1', '--dry-run']);
  assert.equal(p.file, 'plan.json');
  assert.equal(p.recipeId, 'beef-x');
  assert.deepEqual(p.ops.set, [['говядина постная', 800]]);
  assert.equal(p.ops.scale, 1.1);
  assert.equal(p.dryRun, true);
});

/* ── scaffold-plan ──
 *
 * A plan is ~400 lines of JSON of which only a fraction is a decision; the rest is arithmetic and
 * convention. These pin the two things the scaffold exists to get right, because both were
 * round-costing failures when done by hand: the scale, and the for:-tagged rows.
 */

/** The terse spec form: which dish, which slot, which foods — no quantities. */
function spec(overrides = {}) {
  const day = i => ({
    breakfast: { title: `завтрак ${i}`, id: `b${i}`, base: 'oats',
                 foods: ['хлопья овсяные', 'скир 0–2%', 'черника', 'семена тыквы'] },
    lunch:     { title: `обед ${i}`, id: `l${i}`,
                 foods: ['грудка куриная', 'булгур', 'шпинат свежий', 'масло оливковое'] },
    dinner:    { title: `ужин ${i}`, id: `d${i}`, format: 'plated',
                 foods: ['филе трески', 'картофель', 'брокколи', 'масло оливковое'] },
    snack:     { title: `перекус ${i}`, id: `s${i}`, snack_format: 'yogurt_based',
                 foods: ['кефир 1–2,5%', 'малина', 'семена льна молотые'] }
  });
  return { week: '2026-W37', days: [0, 1, 2, 3, 4, 5, 6].map(day), ...overrides };
}

const calib = () => {
  const p = path.join(__dirname, '..', 'data', 'weeks', 'recent-history.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).portion_calibration : null;
};

test('calibration carries protein as well as energy', () => {
  // Energy alone does not pin a recipe's shape: 40% of a lunch's kcal is sane as red lentils and
  // absurd as chicken breast. Protein is the macro with a hard ceiling for both adults.
  const cal = calib();
  if (!cal) return;
  for (const key of Object.keys(cal.recipe_total_kcal)) {
    assert.ok(cal.recipe_total_protein_g?.[key]?.median > 0, `no protein median for ${key}`);
  }
});

test('a scaffolded recipe lands on both its energy and its protein median', () => {
  const cal = calib();
  if (!cal) return;

  const { plan } = scaffold(spec());
  const A = analyze(plan);

  let checked = 0;
  for (const [id, facts] of A.recipeFacts) {
    const key  = `${[...new Set(facts.occasions.map(o => o.slot))].sort().join('+')} (serves ${facts.expectedServes})`;
    const kcal = cal.recipe_total_kcal[key]?.median;
    const prot = cal.recipe_total_protein_g[key]?.median;
    if (!kcal || !prot) continue;

    const gotK = facts.rows.reduce((s, r) => s + r.nut.kcal, 0);
    const gotP = facts.rows.reduce((s, r) => s + r.nut.protein_g, 0);
    assert.ok(Math.abs(gotK - kcal) / kcal < 0.12, `${id}: ${Math.round(gotK)} kcal vs median ${kcal}`);
    // Protein is allowed more slack: a fruit-and-yogurt snack genuinely cannot reach 57 g, and
    // the solver reports that rather than distorting the recipe to fake it.
    assert.ok(Math.abs(gotP - prot) / prot < 0.45, `${id}: ${Math.round(gotP)} g protein vs median ${prot}`);
    checked++;
  }
  assert.ok(checked >= 4, `expected several recipes to be checked, got ${checked}`);
});

test('every breakfast gets all three tagged-row conventions', () => {
  // The husband's row is the one that gets forgotten, and it is the widest-failing omission in
  // the flow: without it he is ~400 kcal short on all seven days plus the weekly average.
  const { plan } = scaffold(spec());
  const breakfasts = plan.recipes.filter(r => r.meal_types.includes('breakfast'));
  assert.equal(breakfasts.length, 7);

  for (const r of breakfasts) {
    const tags = new Set(r.ingredients.filter(i => i.for).map(i => i.for));
    for (const who of ['husband', 'child', 'wife']) {
      assert.ok(tags.has(who), `${r.id} has no for:"${who}" row`);
    }
    const carb = r.ingredients.find(i => i.for === 'husband');
    assert.ok(F.resolve(carb.name).food.tags.includes('grain'), `${carb.name} is not a carbohydrate`);
  }

  // Rotating flakes rather than bread, because grain_base_meals_max is 3 across 21 main meals.
  const husbandFoods = new Set(breakfasts.map(r => r.ingredients.find(i => i.for === 'husband').name));
  assert.ok(husbandFoods.size > 1, 'the husband carbohydrate should rotate');
});

test('carry: true wires the next day lunch and derives the right portion count', () => {
  const s = spec();
  for (const d of s.days) delete d.lunch;             // let the carry supply the lunches
  s.days[2].dinner.carry = true;                       // Wed dinner → Thu school lunch
  s.days[4].dinner.carry = true;                       // Fri dinner → Sat lunch
  const { plan } = scaffold(s);

  assert.equal(plan.menu[3].lunch.recipe_id, 'd2');
  assert.equal(plan.menu[3].lunch.leftover_from, 'Wednesday dinner');
  assert.equal(plan.menu[2].dinner.cook_once_eat_twice, true);

  assert.equal(plan.recipes.find(r => r.id === 'd2').serves, 5, 'Wed dinner (3) + Thu school lunch (2)');
  assert.equal(plan.recipes.find(r => r.id === 'd4').serves, 6, 'Fri dinner (3) + Sat lunch (3)');
});

test('a Sunday dinner cannot carry, because there is no next day', () => {
  const s = spec();
  s.days[6].dinner.carry = true;
  assert.throws(() => scaffold(s), /no next day/);
});

test('a food outside the catalog stops the scaffold rather than reaching the validator', () => {
  const s = spec();
  s.days[0].dinner.foods = ['мясо дракона', 'картофель'];
  assert.throws(() => scaffold(s), /unknown ingredient/);
});

test('dry-weight grains stay under the per-portion cap', () => {
  // 16 catalog foods carry per-100 g figures on a DRY basis. A cooked weight against one of them
  // overstates energy ~3x and over-buys ~3x, so the scaffold must not generate one by scaling.
  const { plan } = scaffold(spec());
  const cap = loadTargets().cooking.dry_grain_g_per_portion_max;
  for (const r of plan.recipes) {
    for (const ing of r.ingredients) {
      const food = F.resolve(ing.name).food;
      if (food.basis !== 'dry') continue;
      const grams = F.toGrams(food, ing.quantity, ing.unit).grams;
      assert.ok(grams / r.serves <= cap, `${r.id} ${ing.name}: ${grams / r.serves} g/portion over ${cap}`);
    }
  }
});

test('a pinned quantity is left exactly as written', () => {
  const s = spec();
  s.days[0].dinner.foods = ['филе трески=850', 'картофель', 'брокколи', 'масло оливковое'];
  const { plan } = scaffold(s);
  const cod = plan.recipes.find(r => r.id === 'd0').ingredients.find(i => i.name === 'филе трески');
  assert.equal(cod.quantity, 850);
});

/* ── solve-plan ──
 *
 * Every budget is linear in ingredient grams, so satisfying all of them at once is arithmetic.
 * Doing it by hand was four rounds of whack-a-mole on the week this was written against: cutting
 * the husband's protein broke the wife's, fixing that broke his energy, fixing that broke a fat
 * share. These tests pin the properties that make the solve trustworthy rather than merely fast.
 */

/** A spec with enough variety for the budgets to be satisfiable at all. */
function solvableSpec() {
  const bases   = ['oats', 'eggs', 'cottage_cheese', 'barley', 'buckwheat', 'savory_pan', 'yogurt_bowl'];
  const bfFoods = [
    ['хлопья овсяные', 'скир 0–2%', 'черника', 'семена тыквы'],
    ['яйца', 'белки яичные', 'хлеб цельнозерновой', 'шпинат свежий'],
    ['творог 5%', 'ежевика', 'семена чиа', 'хлеб цельнозерновой'],
    ['хлопья ячменные', 'скир 0–2%', 'сливы', 'семена подсолнечника'],
    ['крупа гречневая', 'скир 0–2%', 'смесь ягод замороженная', 'семена льна молотые'],
    ['тофу твёрдый', 'хлеб ржаной', 'шампиньоны', 'помидоры'],
    ['йогурт греческий 2%', 'манго', 'хлопья овсяные', 'семена чиа']
  ];
  const dinners = [
    { t: 'форель', f: ['филе форели', 'булгур', 'брокколи', 'масло оливковое'], fmt: 'plated' },
    { t: 'индейка', f: ['филе индейки', 'киноа', 'кейл', 'масло оливковое'], fmt: 'one_pot' },
    { t: 'темпе', f: ['темпе', 'рис бурый', 'фасоль стручковая', 'масло кунжутное'], fmt: 'stir_fry' },
    { t: 'треска', f: ['филе трески', 'картофель', 'спаржа', 'масло оливковое'], fmt: 'tray_bake' },
    { t: 'говядина', f: ['фарш говяжий постный', 'паста цельнозерновая', 'кабачок', 'масло оливковое'], fmt: 'pasta_plus_side' },
    { t: 'креветки', f: ['креветки очищенные', 'крупа перловая', 'капуста цветная', 'масло оливковое'], fmt: 'grain_bowl' },
    { t: 'лосось', f: ['филе лосося', 'пшено', 'горошек стручковый', 'масло оливковое'], fmt: 'soup_plus_side' }
  ];
  const snacks = [
    ['йогурт соевый натуральный', 'черника', 'хлопья овсяные'],
    ['хумус', 'морковь', 'огурцы', 'молоко соевое обогащённое'],
    ['скир 0–2%', 'киви', 'миндаль'],
    ['кефир 1–2,5%', 'малина', 'семена льна молотые'],
    ['сардины консервированные', 'хлеб ржаной', 'редис'],
    ['творог 5%', 'помидоры', 'хлебцы ржаные'],
    ['миндаль', 'апельсины', 'молоко соевое обогащённое']
  ];
  return {
    week: '2026-W37',
    days: bases.map((base, i) => ({
      breakfast: { title: `завтрак ${i}`, id: `b${i}`, base, foods: bfFoods[i] },
      lunch:     { title: `обед ${i}`, id: `l${i}`,
                   foods: ['нут консервированный', 'рис бурый', 'помидоры', 'масло оливковое'] },
      dinner:    { title: dinners[i].t, id: `d${i}`, format: dinners[i].fmt, foods: dinners[i].f },
      snack:     { title: `перекус ${i}`, id: `s${i}`, snack_format: 'yogurt_based', foods: snacks[i] }
    }))
  };
}

test('solving fixes most hard budgets and never breaks one silently', () => {
  // The invariant that matters is not "always reaches zero" — some menus genuinely have no
  // feasible quantity vector, and salmon's saturated fat cannot go below its band. It is that
  // anything the solver leaves broken appears in its own report, so the operator is never told a
  // plan is solved when it is not.
  const { plan } = scaffold(solvableSpec());
  const before = checkBudgets(analyze(plan)).errors.length;
  assert.ok(before > 0, 'the fixture should start with budget failures to fix');

  const res   = solvePlan(plan);                      // mutates in place
  const after = checkBudgets(analyze(plan)).errors;
  assert.ok(after.length < before, `expected fewer than ${before} errors, got ${after.length}`);

  const reported = res.unmet.filter(u => !u.soft).map(u => u.label);
  for (const err of after) {
    assert.ok(reported.some(label => err.startsWith(label) || err.includes(label.split(' ').slice(0, 3).join(' '))),
      `gate fails "${err}" but the solver did not report it: [${reported.join(', ')}]`);
  }
});

test('the sterol drink is never rescaled', () => {
  // One 100 ml bottle delivering the 2 g the LDL protocol asks for. 118 ml is not purchasable, and
  // it is the highest-yield single item in that protocol.
  const { plan } = scaffold(solvableSpec());
  const sterols = () => plan.recipes.flatMap(r => r.ingredients)
    .filter(i => F.hasTag(F.resolve(i.name).food, 'sterol'));
  assert.ok(sterols().length >= 7, 'every breakfast should carry one');
  solvePlan(plan);
  for (const row of sterols()) assert.equal(row.quantity, 100, 'the bottle must stay a bottle');
});

test('no solved quantity leaves its plausible per-portion band', () => {
  const { plan } = scaffold(solvableSpec());
  solvePlan(plan);
  const targets = loadTargets();
  for (const r of plan.recipes) {
    for (const ing of r.ingredients) {
      const food = F.resolve(ing.name).food;
      const band = bandFor(food, targets);
      if (band.fixed || isFixedRow(food, ing)) continue;
      // A tagged row feeds one person per occasion, not every portion of the recipe.
      const portions = ing.for ? 1 : r.serves;
      const per = F.toGrams(food, ing.quantity, ing.unit).grams / portions;
      // tidy() rounds to 5 g steps, so allow that much slack at the edges.
      assert.ok(per >= band.min - 5 && per <= band.max + 5,
        `${r.id} ${ing.name}: ${Math.round(per)} g/portion outside ${band.min}-${band.max}`);
    }
  }
});

test('an unsatisfiable budget is reported, not silently distorted', () => {
  // Olive oil and potato alone cannot reach anybody's protein floor at any quantity.
  const s = solvableSpec();
  for (const d of s.days) d.dinner.foods = ['картофель', 'масло оливковое'];
  const { plan } = scaffold(s);
  const res = solvePlan(plan);
  assert.ok(res.unmet.some(u => !u.soft), 'a hard budget should be reported as unreachable');
});

test('a second solve does not drift the plan materially', () => {
  // Not bit-identical: quantities are rounded to buyable amounts, so a second solve restarts from
  // a slightly different point. What must hold is that it does not wander — otherwise re-running
  // the tail with --solve would keep rewriting the week.
  const { plan } = scaffold(solvableSpec());
  solvePlan(plan);
  const before = plan.recipes.flatMap(r => r.ingredients.map(i => i.quantity));
  solvePlan(plan);
  const after  = plan.recipes.flatMap(r => r.ingredients.map(i => i.quantity));

  // Projection onto a possibly-infeasible system stops at a pass budget, so exact idempotence is
  // not a property this has. What must hold is that it settles rather than wanders: the average
  // quantity barely moves, even if one or two rows still shuffle within their band.
  const drift = before.reduce((s, q, i) => s + Math.abs(after[i] - q) / Math.max(q, 1), 0) / before.length;
  assert.ok(drift < 0.02, `mean relative drift ${(drift * 100).toFixed(1)}% on a second solve`);
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
