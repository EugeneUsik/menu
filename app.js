'use strict';

/* ── Constants ── */
const LS = {
  WEEK_ID:   'weekly-menu:selectedWeekId',
  FAVORITES: 'weekly-menu:favorites',
  shoppingKey: (weekId, itemId) => `weekly-menu:shopping:${weekId}:${itemId}`
};

const BANNED_FRUITS = [
  'cherry','cherries','vyšnia','vyšnios','vyšnių','вишня','вишни',
  'apple','apples','obuolys','obuoliai','obuolių','яблоко','яблоки','яблочный',
  'pear','pears','kriaušė','kriaušės','kriaušių','груша','груши',
  'apricot','apricots','abrikosas','abrikosai','abrikosų','абрикос','абрикосы',
  'peach','peaches','persikas','persikai','persikų','персик','персики'
];

const PROCESSED_MEATS = [
  'ham','bacon','sausage','sausages','salami','hot dog','hotdog',
  'deli meat','processed meat','smoked sausage','smoked ham',
  'kumpis','dešra','dešros','dešrelė','dešrelės','šoninė','saliamis',
  'ветчина','бекон','колбаса','колбаски','сосиска','сосиски','салями'
];

/* ── State ── */
const state = {
  manifest: null,
  selectedWeekId: null,
  weekData: null,
  activeView: 'menu',
  recipeFilters: { text: '', mealType: '', tag: '', favoritesOnly: false },
  _recipeDebounce: null
};

/* ── localStorage helpers ── */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* quota or private mode */ }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
function lsKeys() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return keys;
  } catch { return []; }
}

function getFavorites() {
  try {
    const raw = lsGet(LS.FAVORITES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function setFavorites(arr) {
  lsSet(LS.FAVORITES, JSON.stringify(arr));
}

/* ── Utilities ── */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ── Fetch helpers ── */
async function loadManifest() {
  const res = await fetch('data/weeks/index.json');
  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
  state.manifest = await res.json();
}

async function loadWeek(weekId) {
  const entry = state.manifest.weeks.find(w => w.id === weekId);
  if (!entry) throw new Error(`Week ${weekId} not found in manifest`);
  const res = await fetch(`data/weeks/${entry.file}`);
  if (!res.ok) throw new Error(`Week file fetch failed: ${res.status}`);
  state.weekData = await res.json();
  state.selectedWeekId = weekId;
  lsSet(LS.WEEK_ID, weekId);
  const url = new URL(location.href);
  url.searchParams.set('week', weekId);
  history.replaceState(null, '', url);
}

function selectDefaultWeek() {
  const weeks = state.manifest.weeks;
  if (!weeks.length) return null;
  const urlWeekId = new URLSearchParams(location.search).get('week');
  if (urlWeekId && weeks.find(w => w.id === urlWeekId)) return urlWeekId;
  const saved = lsGet(LS.WEEK_ID);
  if (saved && weeks.find(w => w.id === saved)) return saved;
  if (state.manifest.defaultWeekId && weeks.find(w => w.id === state.manifest.defaultWeekId))
    return state.manifest.defaultWeekId;
  const current = weeks.find(w => w.isCurrent);
  if (current) return current.id;
  const today = todayISO();
  const upcoming = weeks.filter(w => w.start_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (upcoming.length) return upcoming[0].id;
  return weeks[0].id;
}

/* ── Week selector ── */
function populateWeekSelector() {
  const sel = document.getElementById('week-selector');
  sel.innerHTML = '';
  for (const w of state.manifest.weeks) {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.label || w.id;
    if (w.id === state.selectedWeekId) opt.selected = true;
    sel.appendChild(opt);
  }
}

/* ── Tab routing ── */
function setActiveView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll('.tab').forEach(btn => {
    const active = btn.dataset.view === viewId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });
  document.querySelectorAll('.view').forEach(el => {
    const active = el.id === `view-${viewId}`;
    el.classList.toggle('active', active);
    el.classList.toggle('hidden', !active);
  });
  history.replaceState(null, '', `#${viewId}`);
  renderActiveView();
}

function renderActiveView() {
  switch (state.activeView) {
    case 'menu':       renderMenuView(); break;
    case 'recipes':    renderRecipesView(); break;
    case 'shopping':   renderShoppingView(); break;
    case 'validation': renderValidationView(); break;
  }
}

/* ── Loading / error helpers ── */
function showLoading(viewId) {
  const el = document.getElementById(`view-${viewId}`);
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div><div>Loading…</div></div>`;
}
function showError(viewId, message, retryFn) {
  const el = document.getElementById(`view-${viewId}`);
  el.innerHTML = `<div class="error-state"><div>${escapeHtml(message)}</div>${retryFn ? '<button id="btn-retry">Try again</button>' : ''}</div>`;
  if (retryFn) el.querySelector('#btn-retry').addEventListener('click', retryFn);
}

/* ══════════════════════════════════════════
   MENU VIEW
══════════════════════════════════════════ */
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function renderMenuView() {
  const el = document.getElementById('view-menu');
  if (!state.weekData) { showError('menu', 'No week data loaded.'); return; }
  const { menu, week } = state.weekData;
  if (!Array.isArray(menu) || !menu.length) { el.innerHTML = '<div class="loading-state">No menu data.</div>'; return; }

  const html = menu.map((day, i) => {
    const dayName = day.day_name || DAY_NAMES[i] || `Day ${i + 1}`;
    const dateStr = day.date ? ` · ${day.date}` : '';
    return `
      <div class="card day-card">
        <div class="day-header">${escapeHtml(dayName)}${escapeHtml(dateStr)}</div>
        ${renderMealRow('Breakfast', day.breakfast)}
        ${renderMealRow('Lunch',     day.lunch)}
        ${renderMealRow('Dinner',    day.dinner)}
        ${renderMealRow('Snack',     day.shared_snack, true)}
        ${renderSchoolSnackRow(day.child_fixed_school_snack)}
        ${day.day_notes ? `<div class="day-notes">${escapeHtml(day.day_notes)}</div>` : ''}
      </div>`;
  }).join('');

  el.innerHTML = html;

  el.querySelectorAll('a[data-recipe]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const rid = a.dataset.recipe;
      setActiveView('recipes');
      requestAnimationFrame(() => {
        const card = document.getElementById(`recipe-${rid}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  });
}

function renderMealRow(label, meal, optional = false) {
  if (!meal || !meal.title) {
    if (optional) return `
      <div class="meal-row">
        <span class="meal-label">${escapeHtml(label)}</span>
        <span class="meal-content"><span class="meal-title" style="color:var(--color-muted)">—</span></span>
      </div>`;
    return '';
  }
  const titleHtml = meal.recipe_id
    ? `<a href="#" data-recipe="${escapeHtml(meal.recipe_id)}">${escapeHtml(meal.title)}</a>`
    : escapeHtml(meal.title);

  const badges = [];
  if (meal.cook_once_eat_twice) badges.push('<span class="badge badge-green">Cook once</span>');
  if (meal.leftover_from)       badges.push(`<span class="badge badge-blue">Leftover</span>`);

  const portions = meal.portions
    ? Object.entries(meal.portions).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join(' · ')
    : '';

  return `
    <div class="meal-row">
      <span class="meal-label">${escapeHtml(label)}</span>
      <div class="meal-content">
        <div class="meal-title">${titleHtml}${badges.join('')}</div>
        ${portions ? `<div class="portions">${escapeHtml(portions)}</div>` : ''}
        ${meal.notes ? `<div class="meal-meta">${escapeHtml(meal.notes)}</div>` : ''}
      </div>
    </div>`;
}

function renderSchoolSnackRow(snack) {
  if (!snack) return '';
  const title = typeof snack === 'string' ? snack : (snack.title || 'Fixed school snack');
  return `
    <div class="meal-row">
      <span class="meal-label">School</span>
      <div class="meal-content">
        <div class="meal-title">${escapeHtml(title)}<span class="badge badge-gray">Fixed</span></div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════
   RECIPES VIEW
══════════════════════════════════════════ */
function renderRecipesView() {
  const el = document.getElementById('view-recipes');
  if (!state.weekData) { showError('recipes', 'No week data loaded.'); return; }
  const recipes = state.weekData.recipes || [];

  const mealTypes = [...new Set(recipes.flatMap(r => r.meal_types || []))].sort();
  const tags      = [...new Set(recipes.flatMap(r => r.tags      || []))].sort();

  const mealTypeOptions = ['<option value="">All meal types</option>',
    ...mealTypes.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)].join('');
  const tagOptions = ['<option value="">All tags</option>',
    ...tags.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)].join('');

  el.innerHTML = `
    <div class="recipe-filters">
      <input type="search" id="recipe-search" placeholder="Search recipes…" value="${escapeHtml(state.recipeFilters.text)}">
      <select id="recipe-meal-type">${mealTypeOptions}</select>
      <select id="recipe-tag">${tagOptions}</select>
      <button class="btn-toggle${state.recipeFilters.favoritesOnly ? ' active' : ''}" id="recipe-fav-toggle">★ Favorites</button>
    </div>
    <div id="recipe-list"></div>`;

  document.getElementById('recipe-meal-type').value = state.recipeFilters.mealType;
  document.getElementById('recipe-tag').value = state.recipeFilters.tag;

  document.getElementById('recipe-search').addEventListener('input', e => {
    clearTimeout(state._recipeDebounce);
    state._recipeDebounce = setTimeout(() => {
      state.recipeFilters.text = e.target.value;
      renderRecipeList();
    }, 250);
  });
  document.getElementById('recipe-meal-type').addEventListener('change', e => {
    state.recipeFilters.mealType = e.target.value; renderRecipeList();
  });
  document.getElementById('recipe-tag').addEventListener('change', e => {
    state.recipeFilters.tag = e.target.value; renderRecipeList();
  });
  document.getElementById('recipe-fav-toggle').addEventListener('click', e => {
    state.recipeFilters.favoritesOnly = !state.recipeFilters.favoritesOnly;
    e.target.classList.toggle('active', state.recipeFilters.favoritesOnly);
    renderRecipeList();
  });

  renderRecipeList();
}

function renderRecipeList() {
  const el = document.getElementById('recipe-list');
  if (!el) return;
  const recipes = state.weekData.recipes || [];
  const { text, mealType, tag, favoritesOnly } = state.recipeFilters;
  const favorites = getFavorites();
  const textLower = text.toLowerCase();

  const filtered = recipes.filter(r => {
    if (favoritesOnly && !favorites.includes(r.id)) return false;
    if (mealType && !(r.meal_types || []).includes(mealType)) return false;
    if (tag && !(r.tags || []).includes(tag)) return false;
    if (textLower) {
      const haystack = [r.title, ...(r.tags || []), ...(r.meal_types || [])].join(' ').toLowerCase();
      if (!haystack.includes(textLower)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    el.innerHTML = '<div class="no-results">No recipes match your filters.</div>';
    return;
  }

  el.innerHTML = filtered.map(r => renderRecipeCard(r, favorites)).join('');

  el.querySelectorAll('.btn-favorite').forEach(btn => {
    btn.addEventListener('click', () => {
      const rid = btn.dataset.id;
      const favs = getFavorites();
      const idx = favs.indexOf(rid);
      if (idx === -1) favs.push(rid); else favs.splice(idx, 1);
      setFavorites(favs);
      btn.classList.toggle('active', idx === -1);
      btn.setAttribute('aria-label', idx === -1 ? 'Remove from favorites' : 'Add to favorites');
    });
  });
}

function renderRecipeCard(r, favorites) {
  const isFav = favorites.includes(r.id);
  const tags = [...(r.meal_types || []), ...(r.tags || [])];
  const metaParts = [];
  if (r.active_time_min) metaParts.push(`Active: ${r.active_time_min} min`);
  if (r.total_time_min)  metaParts.push(`Total: ${r.total_time_min} min`);
  if (r.equipment)       metaParts.push(`Equipment: ${(r.equipment || []).join(', ')}`);

  const ingredientsHtml = (r.ingredients || []).map(ing => {
    const qty  = ing.quantity != null ? escapeHtml(String(ing.quantity)) : '';
    const unit = ing.unit ? ` ${escapeHtml(ing.unit)}` : '';
    const name = escapeHtml(ing.name || '');
    const prep = ing.prep ? `, ${escapeHtml(ing.prep)}` : '';
    return `<li>${qty}${unit} ${name}${prep}</li>`;
  }).join('');

  const instructionsHtml = (r.instructions || []).map((step, i) =>
    `<li>${escapeHtml(step)}</li>`).join('');

  const nutritionHtml = renderNutritionTable(r.nutrition_estimate_per_person);

  return `
    <div class="card recipe-card" id="recipe-${escapeHtml(r.id)}">
      <div class="recipe-card-header">
        <div>
          <div class="recipe-card-title">${escapeHtml(r.title)}</div>
          ${tags.length ? `<div class="recipe-card-tags">${tags.map(escapeHtml).join(' · ')}</div>` : ''}
        </div>
        <button class="btn-favorite${isFav ? ' active' : ''}" data-id="${escapeHtml(r.id)}"
          aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}">★</button>
      </div>
      ${metaParts.length ? `<div class="recipe-meta">${metaParts.map(escapeHtml).join(' &nbsp;·&nbsp; ')}</div>` : ''}
      <div class="recipe-sections">
        ${ingredientsHtml ? `<div class="recipe-section-title">Ingredients</div><ul class="ingredient-list">${ingredientsHtml}</ul>` : ''}
        ${instructionsHtml ? `<div class="recipe-section-title">Instructions</div><ol class="instruction-list">${instructionsHtml}</ol>` : ''}
        ${nutritionHtml}
      </div>
    </div>`;
}

function renderNutritionTable(perPerson) {
  if (!perPerson) return '';
  const rows = Object.entries(perPerson).map(([person, vals]) => {
    if (!vals || typeof vals !== 'object') return '';
    const kcal   = vals.kcal   != null ? Math.round(vals.kcal)   : '—';
    const prot   = vals.protein_g != null ? Math.round(vals.protein_g) : '—';
    const carbs  = vals.carbs_g != null ? Math.round(vals.carbs_g) : '—';
    const fat    = vals.fat_g   != null ? Math.round(vals.fat_g)   : '—';
    const fiber  = vals.fiber_g != null ? Math.round(vals.fiber_g) : '—';
    return `<tr><td>${escapeHtml(person)}</td><td>${kcal}</td><td>${prot}g</td><td>${carbs}g</td><td>${fat}g</td><td>${fiber}g</td></tr>`;
  }).join('');
  if (!rows) return '';
  return `
    <div class="recipe-section-title">Nutrition per person</div>
    <table class="nutrition-table">
      <thead><tr><th>Person</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ══════════════════════════════════════════
   SHOPPING VIEW
══════════════════════════════════════════ */
function renderShoppingView() {
  const el = document.getElementById('view-shopping');
  if (!state.weekData) { showError('shopping', 'No week data loaded.'); return; }
  const { shopping_list } = state.weekData;
  if (!Array.isArray(shopping_list) || !shopping_list.length) {
    el.innerHTML = '<div class="loading-state">No shopping list.</div>';
    return;
  }

  const categoriesHtml = shopping_list.map(cat => `
    <div class="card shopping-category">
      <div class="shopping-category-title">${escapeHtml(cat.category)}</div>
      ${(cat.items || []).map(item => renderShoppingItem(item)).join('')}
    </div>`).join('');

  el.innerHTML = `
    <div class="shopping-actions">
      <button class="btn-action" id="btn-reset-shopping">Reset all</button>
      <button class="btn-action" id="btn-check-all">Check all</button>
      <button class="btn-action btn-primary" id="btn-print">Print</button>
    </div>
    ${categoriesHtml}`;

  el.querySelectorAll('input[type="checkbox"][data-item-id]').forEach(cb => {
    cb.addEventListener('change', () => {
      const itemId = cb.dataset.itemId;
      lsSet(LS.shoppingKey(state.selectedWeekId, itemId), cb.checked ? '1' : '0');
      const label = cb.closest('.shopping-item')?.querySelector('.shopping-item-name');
      if (label) label.classList.toggle('checked', cb.checked);
    });
  });

  document.getElementById('btn-reset-shopping').addEventListener('click', () => {
    const prefix = `weekly-menu:shopping:${state.selectedWeekId}:`;
    lsKeys().filter(k => k.startsWith(prefix)).forEach(k => lsRemove(k));
    renderShoppingView();
  });

  document.getElementById('btn-check-all').addEventListener('click', () => {
    el.querySelectorAll('input[type="checkbox"][data-item-id]').forEach(cb => {
      cb.checked = true;
      lsSet(LS.shoppingKey(state.selectedWeekId, cb.dataset.itemId), '1');
      const label = cb.closest('.shopping-item')?.querySelector('.shopping-item-name');
      if (label) label.classList.add('checked');
    });
  });

  document.getElementById('btn-print').addEventListener('click', () => window.print());
}

function shoppingItemId(item) {
  return item.id || `${(item.name || '').toLowerCase().replace(/\s+/g, '-')}|${item.unit || ''}`;
}

function renderShoppingItem(item) {
  const itemId  = shoppingItemId(item);
  const checked = lsGet(LS.shoppingKey(state.selectedWeekId, itemId)) === '1';
  const qty     = [item.quantity, item.unit].filter(Boolean).join(' ');
  const usedIn  = item.used_in ? `Used in: ${(item.used_in || []).join(', ')}` : '';
  return `
    <div class="shopping-item">
      <input type="checkbox" data-item-id="${escapeHtml(itemId)}" ${checked ? 'checked' : ''}>
      <div class="shopping-item-info">
        <div class="shopping-item-name${checked ? ' checked' : ''}">${escapeHtml(item.name)}</div>
        ${qty   ? `<div class="shopping-item-qty">${escapeHtml(qty)}</div>` : ''}
        ${item.note  ? `<div class="shopping-item-note">${escapeHtml(item.note)}</div>` : ''}
        ${usedIn ? `<div class="shopping-item-note">${escapeHtml(usedIn)}</div>` : ''}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════
   VALIDATION VIEW
══════════════════════════════════════════ */
function renderValidationView() {
  const el = document.getElementById('view-validation');
  if (!state.weekData) { showError('validation', 'No week data loaded.'); return; }

  const llmHtml = renderLlmValidation();
  const clientResults = runClientValidation(state.weekData);
  const clientPass = clientResults.every(r => r.pass);

  const clientRows = clientResults.map(r => `
    <div class="check-row">
      <span class="check-icon ${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'}</span>
      <div>
        <div class="check-label">${escapeHtml(r.label)}</div>
        ${r.detail ? `<div class="check-detail">${escapeHtml(r.detail)}</div>` : ''}
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="validation-section-title">LLM Self-Check</div>
    ${llmHtml}
    <div class="validation-section-title" style="margin-top:16px">Client-Side Validation</div>
    <div class="card">
      <div class="validation-banner ${clientPass ? 'banner-pass' : 'banner-fail'}">
        ${clientPass ? '✓ All checks pass' : '✗ Some checks failed'}
      </div>
      ${clientRows}
    </div>`;
}

function renderLlmValidation() {
  const data = state.weekData;
  const wv = data.weekly_validation || {};
  const safety = data.safety || {};
  const pass = wv.pass === true;

  const llmChecks = (wv.checks || []).map(c => `
    <div class="check-row">
      <span class="check-icon ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✗'}</span>
      <div>
        <div class="check-label">${escapeHtml(c.label || c.description || '')}</div>
        ${c.detail ? `<div class="check-detail">${escapeHtml(c.detail)}</div>` : ''}
      </div>
    </div>`).join('');

  const safetyItems = [
    { label: 'Allergy check', val: safety.allergy_check },
    { label: 'Processed meat check', val: safety.processed_meat_check },
    { label: 'Child fixed snack accounted for', val: safety.fixed_child_snack_accounted_for },
    { label: 'Fixed snack not modified', val: safety.fixed_child_snack_not_modified }
  ];
  const safetyRows = safetyItems.map(item => {
    const passBool = item.val === true || (typeof item.val === 'object' && item.val?.pass === true);
    const notes = typeof item.val === 'object' && item.val?.notes ? item.val.notes.join('; ') : '';
    return `
      <div class="check-row">
        <span class="check-icon ${passBool ? 'pass' : 'fail'}">${passBool ? '✓' : '✗'}</span>
        <div>
          <div class="check-label">${escapeHtml(item.label)}</div>
          ${notes ? `<div class="check-detail">${escapeHtml(notes)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const assumptions = data.assumptions || [];
  const assumptionsHtml = assumptions.length
    ? `<div class="card" style="margin-top:10px">
         <div class="card-header">Assumptions</div>
         <ul class="assumptions-list">${assumptions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
       </div>`
    : '';

  return `
    <div class="card">
      <div class="validation-banner ${pass ? 'banner-pass' : 'banner-fail'}">
        ${pass ? '✓ LLM reports week is valid' : '✗ LLM reports validation issues'}
      </div>
      ${llmChecks}
      ${safetyRows}
    </div>
    ${assumptionsHtml}`;
}

/* ── Client-side validation ── */
function containsTerm(text, term) {
  if (!text) return false;
  const t = text.toLowerCase();
  if (term.includes(' ')) return t.includes(term.toLowerCase());
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

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
    hits.push(...scanTerms(obj[key], terms, skipKeys, path ? `${path}.${key}` : key));
  }
  return hits;
}

function runClientValidation(data) {
  const results = [];
  const add = (label, pass, detail = '') => results.push({ label, pass, detail });

  add('JSON loaded successfully', true);

  const required = ['schema_version','week','menu','recipes','shopping_list','daily_nutrition','weekly_validation','safety'];
  const missingFields = required.filter(f => data[f] == null);
  add('Required top-level fields present', missingFields.length === 0,
    missingFields.length ? `Missing: ${missingFields.join(', ')}` : '');

  add('Menu has exactly 7 days', Array.isArray(data.menu) && data.menu.length === 7,
    Array.isArray(data.menu) ? `Found: ${data.menu.length}` : 'menu is not an array');

  add('Recipes array is non-empty', Array.isArray(data.recipes) && data.recipes.length > 0);
  add('Shopping list present', Array.isArray(data.shopping_list));

  if (Array.isArray(data.recipes) && Array.isArray(data.menu)) {
    const recipeIds = new Set(data.recipes.map(r => r.id).filter(Boolean));
    const refIds = [];
    for (const day of data.menu) {
      for (const slot of ['breakfast','lunch','dinner','shared_snack']) {
        const meal = day[slot];
        if (meal?.recipe_id) refIds.push(meal.recipe_id);
      }
    }
    const broken = refIds.filter(id => !recipeIds.has(id));
    add('All recipe references resolve', broken.length === 0,
      broken.length ? `Broken IDs: ${[...new Set(broken)].join(', ')}` : '');
  }

  if (Array.isArray(data.menu)) {
    const snackCount = data.menu.filter(d => d.shared_snack && d.shared_snack.title).length;
    add('≥4 shared snack entries', snackCount >= 4, `Found: ${snackCount}`);
  }

  add('Child fixed snack accounted for', data.safety?.fixed_child_snack_accounted_for === true);

  const META_SKIP = ['safety','weekly_validation','assumptions','household_context_version','schema_version','language'];

  const fruitHits = scanTerms(data, BANNED_FRUITS, META_SKIP);
  add('No banned fruit terms', fruitHits.length === 0,
    fruitHits.length ? fruitHits.map(h => `"${h.term}" at ${h.path}`).join('; ') : '');

  const meatHits = scanTerms(data, PROCESSED_MEATS, [...META_SKIP, 'child_fixed_school_snack']);
  add('No processed meat in generated meals', meatHits.length === 0,
    meatHits.length ? meatHits.map(h => `"${h.term}" at ${h.path}`).join('; ') : '');

  return results;
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
async function init() {
  const hashView = location.hash.replace('#', '');
  if (['menu','recipes','shopping','validation'].includes(hashView)) {
    state.activeView = hashView;
  }

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveView(btn.dataset.view));
  });

  window.addEventListener('hashchange', () => {
    const v = location.hash.replace('#', '');
    if (['menu','recipes','shopping','validation'].includes(v) && v !== state.activeView) {
      setActiveView(v);
    }
  });

  showLoading(state.activeView);

  try {
    await loadManifest();
  } catch (err) {
    showError(state.activeView, `Could not load week list. ${err.message}`, init);
    return;
  }

  const weekId = selectDefaultWeek();
  if (!weekId) {
    showError(state.activeView, 'No weeks available in the manifest.');
    return;
  }

  try {
    await loadWeek(weekId);
  } catch (err) {
    showError(state.activeView, `Could not load week ${weekId}. ${err.message}`);
    return;
  }

  populateWeekSelector();

  document.getElementById('week-selector').addEventListener('change', async e => {
    const newId = e.target.value;
    showLoading(state.activeView);
    try {
      await loadWeek(newId);
      renderActiveView();
    } catch (err) {
      showError(state.activeView, `Could not load week ${newId}. ${err.message}`);
      const sel = document.getElementById('week-selector');
      if (sel) sel.value = state.selectedWeekId;
    }
  });

  document.querySelectorAll('.tab').forEach(btn => {
    const active = btn.dataset.view === state.activeView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });
  document.querySelectorAll('.view').forEach(el => {
    const active = el.id === `view-${state.activeView}`;
    el.classList.toggle('active', active);
    el.classList.toggle('hidden', !active);
  });

  renderActiveView();
}

document.addEventListener('DOMContentLoaded', init);
