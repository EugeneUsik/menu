'use strict';

/* ── Constants ── */
const LS = {
  WEEK_ID:   'weekly-menu:selectedWeekId',
  FAVORITES: 'weekly-menu:favorites',
  shoppingKey: (weekId, itemId) => `weekly-menu:shopping:${weekId}:${itemId}`
};

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
    case 'menu':     renderMenuView(); break;
    case 'recipes':  renderRecipesView(); break;
    case 'shopping': renderShoppingView(); break;
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
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function renderMenuView() {
  const el = document.getElementById('view-menu');
  if (!state.weekData) { showError('menu', 'No week data loaded.'); return; }
  const { menu } = state.weekData;
  if (!Array.isArray(menu) || !menu.length) { el.innerHTML = '<div class="loading-state">No menu data.</div>'; return; }

  const headers = `
    <div class="menu-col-header"></div>
    <div class="menu-col-header">Breakfast</div>
    <div class="menu-col-header">Lunch</div>
    <div class="menu-col-header">Dinner</div>`;

  const cells = menu.map((day, i) => {
    return `
      <div class="menu-day-cell">
        <span class="menu-day-name">${escapeHtml(DAY_SHORT[i] || `D${i+1}`)}</span>
      </div>
      ${renderCompactMeal(day.breakfast)}
      ${renderCompactMeal(day.lunch)}
      ${renderCompactMeal(day.dinner)}`;
  }).join('');

  el.innerHTML = `<div class="menu-grid">${headers}${cells}</div>`;

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

function renderCompactMeal(meal) {
  if (!meal || !meal.title) return '<div class="menu-cell menu-cell-empty">—</div>';
  const title = escapeHtml(meal.title);
  const inner = meal.recipe_id
    ? `<a class="menu-cell-title" href="#" data-recipe="${escapeHtml(meal.recipe_id)}">${title}</a>`
    : `<span class="menu-cell-title">${title}</span>`;
  return `<div class="menu-cell">${inner}</div>`;
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
   INIT
══════════════════════════════════════════ */
async function init() {
  const hashView = location.hash.replace('#', '');
  if (['menu','recipes','shopping'].includes(hashView)) {
    state.activeView = hashView;
  }

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveView(btn.dataset.view));
  });

  window.addEventListener('hashchange', () => {
    const v = location.hash.replace('#', '');
    if (['menu','recipes','shopping'].includes(v) && v !== state.activeView) {
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
