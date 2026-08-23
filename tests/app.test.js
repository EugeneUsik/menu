'use strict';

/**
 * Frontend rendering and week selection.
 *
 * app.js is a plain browser script with no module system, so it is loaded into a vm context
 * with the handful of browser globals it touches. Its top-level `function` declarations then
 * become properties of that context, which is enough to exercise the pure ones directly.
 *
 * Worth testing because the app is the only consumer of daily_nutrition, and because week
 * selection has real branching that used to depend on a manifest field that no longer exists.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Top-level `function` declarations become properties of the vm context, but `const` ones do
// not — they are lexical bindings that shadow the global object. So `state` and the constant
// tables are handed out by an epilogue evaluated in the same scope, rather than by exporting
// anything from app.js itself.
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
  + '\n;globalThis.__lexical = { state, LS, DAY_SHORT, SLOTS, STRIP_KEYS };';

/** A fresh app context. `search` seeds location.search; `store` seeds localStorage. */
function loadApp({ search = '', store = {} } = {}) {
  const ctx = {
    console,
    document: { addEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
    location: { search, hash: '', href: `https://example.test/${search}` },
    localStorage: {
      _s: { ...store },
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
      setItem(k, v) { this._s[k] = String(v); },
      removeItem(k) { delete this._s[k]; },
      key(i) { return Object.keys(this._s)[i] ?? null; },
      get length() { return Object.keys(this._s).length; }
    },
    history: { replaceState() {} },
    URL, URLSearchParams,
    setTimeout, clearTimeout,
    requestAnimationFrame(fn) { fn(); }
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx, { filename: 'app.js' });
  return Object.assign(ctx, ctx.__lexical);
}

const targets = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'targets.json'), 'utf8')
);

/* ── escaping ── */

test('escapeHtml neutralises every injection vector used in templates', () => {
  // Recipe and menu text is external LLM output injected via innerHTML, so this is the
  // only thing standing between the catalog and script execution.
  const app = loadApp();
  assert.equal(app.escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(app.escapeHtml(`" onload='x'`), '&quot; onload=&#39;x&#39;');
  assert.equal(app.escapeHtml('a & b'), 'a &amp; b');
  assert.equal(app.escapeHtml(null), '');
  assert.equal(app.escapeHtml(undefined), '');
});

/* ── week selection ── */

const MANIFEST = {
  defaultWeekId: '2026-W36',
  weeks: [
    { id: '2026-W36', start_date: '2026-08-31', end_date: '2026-09-06', file: '2026-W36.json' },
    { id: '2026-W35', start_date: '2026-08-24', end_date: '2026-08-30', file: '2026-W35.json' },
    { id: '2026-W34', start_date: '2026-08-17', end_date: '2026-08-23', file: '2026-W34.json' }
  ]
};

test('isCurrentWeek brackets on start and end inclusively', () => {
  const app = loadApp();
  const w = MANIFEST.weeks[1];                       // 2026-08-24 .. 2026-08-30
  assert.equal(app.isCurrentWeek(w, '2026-08-24'), true,  'first day counts');
  assert.equal(app.isCurrentWeek(w, '2026-08-30'), true,  'last day counts');
  assert.equal(app.isCurrentWeek(w, '2026-08-23'), false);
  assert.equal(app.isCurrentWeek(w, '2026-08-31'), false);
});

test('the week covering today wins over the manifest default', () => {
  // The regression this guards: defaultWeekId is now simply "newest", so if it kept its old
  // priority the app would always open on a future week instead of the current one.
  const app = loadApp();
  app.state.manifest = MANIFEST;
  app.todayISO = () => '2026-08-26';                 // inside W35, while default is W36
  assert.equal(app.selectDefaultWeek(), '2026-W35');
});

test('?week= outranks everything', () => {
  const app = loadApp({ search: '?week=2026-W34' });
  app.state.manifest = MANIFEST;
  app.todayISO = () => '2026-08-26';
  assert.equal(app.selectDefaultWeek(), '2026-W34');
});

test('an unknown ?week= is ignored rather than loaded', () => {
  const app = loadApp({ search: '?week=1999-W01' });
  app.state.manifest = MANIFEST;
  app.todayISO = () => '2026-08-26';
  assert.equal(app.selectDefaultWeek(), '2026-W35');
});

test('a saved week outranks the date, but only if it still exists', () => {
  const live = loadApp({ store: { 'weekly-menu:selectedWeekId': '2026-W34' } });
  live.state.manifest = MANIFEST;
  live.todayISO = () => '2026-08-26';
  assert.equal(live.selectDefaultWeek(), '2026-W34');

  const stale = loadApp({ store: { 'weekly-menu:selectedWeekId': '2020-W01' } });
  stale.state.manifest = MANIFEST;
  stale.todayISO = () => '2026-08-26';
  assert.equal(stale.selectDefaultWeek(), '2026-W35', 'a deleted week must not strand the app');
});

test('with no current week, the nearest upcoming one is chosen', () => {
  const app = loadApp();
  app.state.manifest = MANIFEST;
  app.todayISO = () => '2026-08-10';                 // before all three
  assert.equal(app.selectDefaultWeek(), '2026-W34', 'nearest, not newest');
});

test('with everything in the past, the newest is chosen', () => {
  const app = loadApp();
  app.state.manifest = MANIFEST;
  app.todayISO = () => '2027-01-01';
  assert.equal(app.selectDefaultWeek(), '2026-W36');
});

test('an empty manifest yields null rather than throwing', () => {
  const app = loadApp();
  app.state.manifest = { weeks: [] };
  assert.equal(app.selectDefaultWeek(), null);
});

/* ── budget status ── */

test('budgetStatus reports which side of the band a value falls', () => {
  const app = loadApp();
  assert.equal(app.budgetStatus(2450, { min: 2400, max: 2500 }), '');
  assert.equal(app.budgetStatus(2300, { min: 2400, max: 2500 }), 'low');
  assert.equal(app.budgetStatus(2600, { min: 2400, max: 2500 }), 'high');
  assert.equal(app.budgetStatus(50, { min: 35 }), '', 'a min-only spec has no upper bound');
  assert.equal(app.budgetStatus(50, { max: 28 }), 'high');
  assert.equal(app.budgetStatus(10, undefined), '', 'no spec means no verdict');
  assert.equal(app.budgetStatus(null, { min: 1 }), '', 'no value means no verdict');
});

/* ── totals strip ── */

const DAY = (over = {}) => ({
  kcal: 2450, protein_g: 140, fiber_g: 40, veg_fruit_g: 500, sat_fat_g: 20, ...over
});

function stripFor(dailyNutrition, person = 'husband') {
  const app = loadApp();
  app.state.targets = targets;
  app.state.totalsPerson = person;
  app.state.weekData = { daily_nutrition: dailyNutrition };
  return app.renderTotalsStrip();
}

test('the strip renders a row per day', () => {
  const daily = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-08-${24 + i}`, day_name: 'D', husband: DAY(), wife: DAY(), child: DAY()
  }));
  const html = stripFor(daily);
  assert.match(html, /Daily totals/);
  assert.equal((html.match(/<tr><th scope="row">/g) || []).length, 7);
  for (const d of ['Mon', 'Sun']) assert.ok(html.includes(d), `missing ${d}`);
});

test('a day inside every band carries no out-of-range marker', () => {
  const html = stripFor([{ date: 'd', day_name: 'D', husband: DAY(), wife: DAY(), child: DAY() }]);
  assert.ok(!html.includes('totals-low'), 'unexpected low marker');
  assert.ok(!html.includes('totals-high'), 'unexpected high marker');
});

test('a breach is marked on the correct side', () => {
  const low  = stripFor([{ date: 'd', day_name: 'D', husband: DAY({ kcal: 1800 }) }]);
  const high = stripFor([{ date: 'd', day_name: 'D', husband: DAY({ kcal: 3200 }) }]);
  assert.match(low,  /totals-low/);
  assert.match(high, /totals-high/);
  // The mark, not just the colour, so the table reads without colour vision.
  assert.match(low,  /▾/);
  assert.match(high, /▴/);
});

test('the strip degrades to nothing when the week has no day totals', () => {
  // Archived 2.0 weeks legitimately carry []. Rendering must be a no-op, not a throw.
  assert.equal(stripFor([]), '');
  const app = loadApp();
  app.state.weekData = {};
  assert.equal(app.renderTotalsStrip(), '');
  app.state.weekData = null;
  assert.equal(app.renderTotalsStrip(), '');
});

test('the strip still renders when targets are unavailable', () => {
  // targets.json is fetched for display only, so a failure there must not blank the strip.
  const app = loadApp();
  app.state.targets = null;
  app.state.weekData = { daily_nutrition: [{ date: 'd', day_name: 'D', husband: DAY() }] };
  const html = app.renderTotalsStrip();
  assert.match(html, /2450/);
  assert.ok(!html.includes('totals-low'), 'no spec means no verdict');
});

test('the school-lunch footnote appears only for the child', () => {
  const daily = [{ date: 'd', day_name: 'D', husband: DAY(), wife: DAY(),
                   child: { ...DAY(), includes_fixed_school_lunch: true } }];
  assert.match(stripFor(daily, 'child'), /includes the <em>estimated<\/em> school lunch/);
  assert.ok(!/includes the <em>estimated<\/em> school lunch/.test(stripFor(daily, 'husband')));
});

test('sodium is always described as a lower bound', () => {
  // It counts ingredient sodium only; added salt is unstated. Presenting it as total intake
  // would overstate how well the salt ceiling is being met.
  const html = stripFor([{ date: 'd', day_name: 'D', husband: DAY() }]);
  assert.match(html, /lower bound/);
});

/* ── menu view markup ── */

test('the menu renders one wrapper per day, with a label on every cell', () => {
  // The wrappers are display:contents on wide screens and cards below 640px, so the same DOM
  // serves both. If they go missing the mobile layout silently reverts to a 5-column grid.
  const captured = {};
  const app = loadApp();
  app.document.getElementById = id => ({
    set innerHTML(v) { captured[id] = v; },
    get innerHTML() { return captured[id] || ''; },
    querySelectorAll: () => [], querySelector: () => null
  });
  app.state.targets = targets;
  app.state.weekData = {
    menu: Array.from({ length: 7 }, (_, i) => ({
      day_name: 'D', date: `2026-08-${24 + i}`,
      breakfast: { title: 'b', recipe_id: 'rb' },
      lunch:     { title: 'l', recipe_id: 'rl' },
      dinner:    { title: 'd', recipe_id: 'rd' }
      // shared_snack deliberately absent on every day
    })),
    daily_nutrition: Array.from({ length: 7 }, () => ({ date: 'd', day_name: 'D', husband: DAY() }))
  };
  app.renderMenuView();
  const html = captured['view-menu'];

  assert.equal((html.match(/class="menu-day"/g) || []).length, 7);
  assert.equal((html.match(/data-slot="/g) || []).length, 28, '4 slots x 7 days');
  assert.equal((html.match(/menu-cell-empty/g) || []).length, 7, 'the missing snack renders as empty');
  assert.match(html, /totals-strip/, 'the strip is appended after the grid');
});

test('day totals are escaped like everything else', () => {
  const app = loadApp();
  app.state.targets = targets;
  app.state.weekData = { daily_nutrition: [
    { date: 'd', day_name: '<img src=x onerror=alert(1)>', husband: DAY() }
  ] };
  const html = app.renderTotalsStrip();
  assert.ok(!html.includes('<img'), 'day_name reached the DOM unescaped');
});
