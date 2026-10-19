import {withPlanMonth} from './trip-state.js';
import {scoreLabel} from './ranking.js';
import {climateComfort} from './places.js';
import {
  unpackRankingData,
  displayMonth,
  KEYS,
  DEFAULT_WEIGHTS,
  PRESETS,
  SEASONAL_VIEW,
  isDefault,
  validWeights,
  parseState,
  stateParams,
  rankCities,
  renderRow,
  unratedHeading,
} from "./ranking.js";
import { RankMap } from "./rank-map.js";
import { UI_PRESETS, additionalFilters, viewLabel, restorePreference, savePreference, commandItems, applyRankingFilter, quickFilters, toggleQuickFilter } from "./rank-controls.js";
const root = document.querySelector("#ranking-root");
const data = unpackRankingData(
  JSON.parse(document.querySelector("#ranking-data").textContent),
);
const preferenceStorage = { getItem: key => localStorage.getItem(key), setItem: (key,value) => localStorage.setItem(key,value), removeItem: key => localStorage.removeItem(key) };
let state = restorePreference(new URL(location.href), preferenceStorage),
  ranked = [],
  frame = 0,
  active = null,
  composing = false;
const pool = new Map(
  [...document.querySelectorAll(".ranking-row")].map((el) => [
    el.dataset.city,
    el,
  ]),
);
const list = document.querySelector("#ranking-list"),
  motion = matchMedia("(prefers-reduced-motion: reduce)"),
  weightInputs = [...document.querySelectorAll("[data-weight]")];
const metrics = { updates: 0, sort: [], dom: [], total: [], animations: 0 };
window.__nomadsMetrics = metrics;
const notify = (message) =>
  document.dispatchEvent(new CustomEvent("nomads:notice", { detail: message }));
const map = new RankMap({
  stage: document.querySelector("#map-stage"),
  selection: document.querySelector("#map-selection"),
  catalog: data,
  initialCountry: state.country,
});
const spring = "cubic-bezier(0.16, 1, 0.3, 1)";
function animate(el, frames, options = {}) {
  if (motion.matches) return;
  metrics.animations++;
  return el.animate(frames, { duration: 200, easing: spring, ...options });
}
function rankNumber(el, next) {
  const box = el.querySelector(".rank-number"),
    digit = box.querySelector(".rank-digit"),
    value = String(next ?? "—"),
    old = digit.textContent;
  if (old === value) return;
  box.setAttribute("aria-label", next ? "第" + next + "名" : "资料待补");
  digit.textContent = value;
  if (motion.matches) return;
  const direction = Number(value) < Number(old) ? -1 : 1;
  const ghost = digit.cloneNode(true);
  ghost.textContent = old;
  ghost.classList.add("old-digit");
  box.append(ghost);
  animate(
    ghost,
    [
      { transform: "translateY(0)", opacity: 1 },
      { transform: `translateY(${direction * 100}%)`, opacity: 0 },
    ],
    { duration: 220 },
  )
    ?.finished.then(() => ghost.remove())
    .catch(() => ghost.remove());
  animate(
    digit,
    [
      { transform: `translateY(${-direction * 100}%)`, opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    { duration: 220 },
  );
}
function render(initial = false,editingBudget=false) {
  const start = performance.now();
  ranked = rankCities(data, state);
  const sorted = performance.now();
  const current = [...list.querySelectorAll('.ranking-row')];
  const focused = document.activeElement;
  const restoreFocus = list.contains(focused);
  const before = new Map();
  if (!initial && !motion.matches)
    for (const el of current) {
      const r = el.getBoundingClientRect();
      before.set(el.dataset.city, r);
    }
  for (const el of current)
    for (const animation of el.getAnimations({ subtree: true }))
      animation.cancel();
  const visible = ranked.slice(0, state.limit),
    nextSet = new Set(visible.map((c) => c.slug));
  const frag = document.createDocumentFragment();
  let unratedInserted=false;
  for (const c of visible) {
    if(c.score===null&&!unratedInserted){
      const heading=document.createElement('template');heading.innerHTML=unratedHeading(visible);
      frag.append(heading.content);unratedInserted=true;
    }
    let el = pool.get(c.slug);
    if (!el) {
      const t = document.createElement("template");
      t.innerHTML = renderRow(c, state);
      el = t.content.firstElementChild;
      pool.set(c.slug, el);
    } else {
      rankNumber(el, c.rank);
      el.dataset.score = c.score ?? "";
      el.setAttribute(
        "aria-label",
        (c.rank ? "第" + c.rank + "名，" : "") + c.name,
      );
      el.querySelector(".rank-score strong").textContent =
        c.score === null ? "—" : c.score.toFixed(1);
      const month = displayMonth(state),
        temp = climateComfort(c.months[month - 1]);
      el.querySelector(".climate-cell strong").textContent =
        temp === null || temp === undefined ? "—" : temp.toFixed(1);
      el.querySelector(".climate-cell strong").title = month + "月舒适度 /10；按历史气温、高温与雨量估算";
      el.querySelector(".climate-cell small").textContent = month + "月舒适度";
      el.querySelector(".climate-cell .metric-mobile-label").textContent =
        month + "月舒适度";
      el.querySelectorAll(".month-mark").forEach((m, i) =>
        m.classList.toggle("chosen", state.month === i + 1),
      );
    }
    el.querySelector(".rank-score small").textContent =
      scoreLabel(c,state);
    el.classList.toggle("is-active", c.slug === active);
    frag.append(el);
  }
  if (!initial && !motion.matches)
    for (const el of current) {
      const r = before.get(el.dataset.city);
      if (
        nextSet.has(el.dataset.city) ||
        !r ||
        r.bottom < 0 ||
        r.top > innerHeight
      )
        continue;
      const ghost = el.cloneNode(true);
      ghost.classList.add("row-ghost");
      ghost.setAttribute("aria-hidden", "true");
      ghost.querySelectorAll("a,button").forEach((e) => (e.tabIndex = -1));
      Object.assign(ghost.style, {
        top: r.top + "px",
        left: r.left + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
      document.body.append(ghost);
      animate(ghost, [{ opacity: 0.7 }, { opacity: 0 }], { duration: 150 })
        ?.finished.then(() => ghost.remove())
        .catch(() => ghost.remove());
    }
  list.replaceChildren(frag);
  if (restoreFocus && focused.isConnected)
    focused.focus({ preventScroll: true });
  if (!initial && !motion.matches)
    for (const el of list.querySelectorAll('.ranking-row')) {
      const old = before.get(el.dataset.city),
        now = el.getBoundingClientRect();
      if (now.bottom < 0 || now.top > innerHeight + 100) continue;
      if (old) {
        const delta = old.top - now.top;
        if (Math.abs(delta) > 1)
          animate(el, [
            { transform: `translateY(${delta}px)` },
            { transform: "translateY(0)" },
          ]);
      } else animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    }
  const missing = ranked.filter((c) => c.rank === null).length;
  document.querySelector("#ranking-result-count").textContent =
    ranked.length +
    " 座城市符合条件" +
    (missing ? " · " + missing + " 座待补指标" : "");
  document.querySelector("#ranking-empty").hidden = !!ranked.length;
  document.querySelector('.ranking-list-panel').dataset.empty = String(!ranked.length);
  const more = document.querySelector("#show-more-cities");
  more.hidden = ranked.length <= state.limit;
  more.href =
    location.pathname +
    "?" +
    stateParams({
      ...state,
      limit: Math.min(360, state.limit + 40),
    }).toString();
  more.textContent =
    "再显示 " +
    Math.min(40, Math.max(0, ranked.length - state.limit)) +
    " 座城市";
  document.querySelector(".ranking-columns span:nth-child(6)").textContent =
    displayMonth(state) + "月舒适度";
  map.update(ranked);
  root.dataset.planMonth=state.month||'';
  document.dispatchEvent(new CustomEvent('nomads:journey-month',{detail:state.month}));
  if (active && ranked.some((c) => c.slug === active)) map.highlight(active);
  else if (active) {
    active = null;
  }
  syncControls(editingBudget);
  document.dispatchEvent(new Event("nomads:rows-updated"));
  const end = performance.now();
  metrics.updates++;
  metrics.sort.push(sorted - start);
  metrics.dom.push(end - sorted);
  metrics.total.push(end - start);
  if (metrics.total.length > 200) {
    metrics.total.shift();
    metrics.sort.shift();
    metrics.dom.shift();
  }
}
function schedule() {
  if (!frame)
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
}
const search = document.querySelector('#rank-search');
const filterPopover = document.querySelector('#rank-filter-popover');
const filterToggle = document.querySelector('#toggle-filters');
const weightsDialog = document.querySelector('#weights-dialog');
const mapPanel = document.querySelector('#ranking-map-panel');
const mapToggle = document.querySelector('#toggle-map');
let mapIsModal = false, restoreMapFocus = true;
const commandDialog = document.querySelector('#rank-command');
const commandSearch = document.querySelector('#command-search');
const commandsList = document.querySelector('#command-results');
let weightBaseline = new Map();
let undoStack = [], searchTimer, searchHistory = false, searchCheckpoint = false, weightGesture = false, weightDirty = false, weightKeyboard = false;
let commands = [], commandIndex = 0, commandComposing = false, weightsOpener = null, commandOpener = null;
const clone = value => ({ ...value, weights: { ...value.weights } });
function checkpoint() {
  undoStack.push(clone(state));
  if (undoStack.length > 30) undoStack.shift();
}
function commit(replace = false) {
  const query = stateParams(state).toString(), url = location.pathname + (query ? '?' + query : '');
  if (location.pathname + location.search !== url) history[replace ? 'replaceState' : 'pushState']({nomads:true},'',url);
  savePreference(state, preferenceStorage);
}
function finishSearch() {
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; commit(searchHistory); searchHistory = true; }
}
function change(mutator) {
  finishSearch();
  checkpoint();
  mutator(state);
  state.limit = 40;
  render();
  commit();
}
function resetAll() {
  finishSearch();checkpoint();
  state = parseState(new URL(location.origin + location.pathname));
  search.value = '';
  render();commit();
  notify('已恢复综合推荐，清除本地偏好。');
}
function renderWeightPreview() {
  const container = document.querySelector('#weights-preview ol');
  if (!container || !weightsDialog.open) return;
  container.replaceChildren();
  const leading = ranked.filter(city => city.rank !== null).slice(0,3);
  for (const city of leading) {
    const item = document.createElement('li'), name = document.createElement('strong'), delta = document.createElement('span');
    name.textContent = city.rank + ' ' + city.name;name.title = city.name;
    const previous = weightBaseline.get(city.slug), change = previous ? previous - city.rank : null;
    delta.textContent = change === null ? '新进入' : change > 0 ? '↑ ' + change : change < 0 ? '↓ ' + Math.abs(change) : '排名未变';
    delta.className = change > 0 ? 'is-rising' : '';
    item.setAttribute('aria-label', `第${city.rank}名，${city.name}，${change === null ? '新进入' : change > 0 ? '上升'+change+'名' : change < 0 ? '下降'+Math.abs(change)+'名' : '排名未变'}`);
    item.append(name,delta);container.append(item);
  }
  if (!leading.length) { const item=document.createElement('li');item.textContent='当前条件下暂无可排序的城市';container.append(item); }
}
function syncControls(editingBudget=false) {
  const seasonNote = document.querySelector('#rank-season-note');if (seasonNote) seasonNote.hidden = state.season !== SEASONAL_VIEW.id;
  for (const filter of quickFilters(state)) { const button=root.querySelector(`[data-quick-filter="${filter.key}"]`);button.classList.toggle('selected',filter.selected);button.setAttribute('aria-pressed',String(filter.selected));if(filter.detail)button.querySelector('span').textContent=filter.detail; }
  renderWeightPreview();
  for (const input of weightInputs) {
    const key = input.dataset.weight;
    input.value = state.weights[key];
    input.setAttribute('aria-valuetext', state.weights[key] + ' 相对权重');
    document.querySelector('#output-' + key).value = state.weights[key];
  }
  if (!composing && document.activeElement !== search) search.value = state.q;
  document.querySelector('#recommended-only').checked=state.recommendedOnly||state.season===SEASONAL_VIEW.id;
  document.querySelector('#recommended-only').disabled=!state.month;
  document.querySelector('#include-incomplete').checked = state.incomplete || state.country==='CN';
  document.querySelector('#include-incomplete').disabled = state.country==='CN';
  document.querySelector('#incomplete-label').textContent = state.country==='CN' ? '国内视角保留未评分目的地' : '包含指标待补的城市';
  document.querySelectorAll('[data-filter-input]').forEach(input => {
    if(editingBudget&&input.dataset.filterInput==='budget')return;
    const value = String(state[input.dataset.filterInput] ?? '');
    input.value = value;
    if(input.dataset.filterInput==='budget'){input.setAttribute('aria-invalid','false');document.querySelector('#ranking-budget-error').hidden=true;}
  });
  document.querySelectorAll('[data-preset]').forEach(button => {
    const preset = UI_PRESETS[button.dataset.preset];
    const match = KEYS.every(key => state.weights[key] === preset.weights[key]) && (!preset.month || state.month === preset.month) && (preset.warm ? state.warm && !state.visa : !state.warm) && (preset.visa ? state.visa === preset.visa : !state.visa);
    button.classList.toggle('selected',match);button.setAttribute('aria-pressed',String(match));
  });
  document.querySelector('#view-sort').textContent = viewLabel(state);
  document.querySelector('.ranking-columns span:nth-last-child(2)').textContent = isDefault(state.weights) ? '综合分' : '自定义分';
  document.querySelector('#weights-result').value = ranked.length + ' 座城市';
  document.querySelector('#ranking-result-count').textContent = ranked.length + ' 座城市' + (ranked.some(c => c.rank === null) ? ' · 含待补指标' : '');
  document.querySelector('#reset-ranking').hidden = !stateParams({...state,limit:40}).toString();
  document.querySelector('#undo-ranking').hidden = !undoStack.length;
  const container = document.querySelector('#active-ranking-filters');
  const focusedKey = container.contains(document.activeElement) ? document.activeElement.dataset.removeFilter : null;
  const filters = additionalFilters(state);
  container.replaceChildren();container.hidden = !filters.length;
  for (const filter of filters) {
    const button = document.createElement('button');button.type = 'button';button.className = 'rank-pill';button.dataset.removeFilter = filter.key;
    button.setAttribute('aria-label','移除筛选：' + filter.label);button.append(document.createTextNode(filter.label));
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('aria-hidden','true');svg.innerHTML = '<path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';button.append(svg);container.append(button);
  }
  if (focusedKey) (container.querySelector(`[data-remove-filter="${focusedKey}"]`) || container.querySelector('button') || filterToggle).focus({preventScroll:true});
  updatePresetOverflow();
}
function updatePresetOverflow() {
  const row = document.querySelector('.preset-row');
  row.dataset.overflow = String(row.scrollWidth - row.clientWidth - row.scrollLeft > 4);
}
function highlight(slug) {
  if (active) pool.get(active)?.classList.remove('is-active');
  active = slug;pool.get(slug)?.classList.add('is-active');map.highlight(slug);
}
function locate(slug, focus = false) {
  const index = ranked.findIndex(city => city.slug === slug);
  if (index < 0) return;
  if (index >= state.limit) { state.limit = Math.min(360,Math.ceil((index+1)/40)*40);render(); }
  highlight(slug);
  const row = pool.get(slug);row?.scrollIntoView({block:'nearest',behavior:'instant'});
  if (focus) row?.querySelector('.rank-city-link').focus({preventScroll:true});
}
function positionFilters() {
  if (filterPopover.hidden) return;
  const bounds = filterToggle.getBoundingClientRect();
  const left = Math.max(16,Math.min(bounds.right - filterPopover.offsetWidth,innerWidth - filterPopover.offsetWidth - 16));
  const top = Math.min(bounds.bottom + 8,Math.max(16,innerHeight - filterPopover.offsetHeight - 16));
  filterPopover.style.left = left + 'px';filterPopover.style.top = top + 'px';
}
function closeFilters(restore = false) {
  filterPopover.hidden = true;filterToggle.setAttribute('aria-expanded','false');
  if (restore) filterToggle.focus({preventScroll:true});
}
function openFilters() {
  filterPopover.hidden = false;filterToggle.setAttribute('aria-expanded','true');positionFilters();
  filterPopover.querySelector('select').focus({preventScroll:true});
}
function openWeights(opener = document.activeElement) {
  closeFilters();finishSearch();weightsOpener = opener;
  document.querySelectorAll('[data-open-weights]').forEach(button => button.setAttribute('aria-expanded','true'));
  weightBaseline = new Map(ranked.filter(city=>city.rank!==null).map(city=>[city.slug,city.rank]));
  weightsDialog.showModal();renderWeightPreview();weightsDialog.querySelector('[data-close-weights]').focus({preventScroll:true});
}
weightsDialog.addEventListener('close', () => {
  endWeightGesture();document.querySelectorAll('[data-open-weights]').forEach(button => button.setAttribute('aria-expanded','false'));weightsOpener?.focus({preventScroll:true});
});
weightsDialog.addEventListener('click', event => {
  if (event.target === weightsDialog) {
    const r = weightsDialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) weightsDialog.close();
  }
});
function endWeightGesture() {
  if (weightDirty) commit();
  weightGesture = false;weightDirty = false;weightKeyboard = false;
}
for (const input of weightInputs) {
  input.addEventListener('pointerdown', () => { finishSearch();weightGesture = false;weightDirty = false; });
  input.addEventListener('keydown', event => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) weightKeyboard = true; });
  input.addEventListener('input', () => {
    if (!weightGesture) { checkpoint();weightGesture = true; }
    state.weights = {...state.weights,[input.dataset.weight]:Number(input.value)};
    if (!KEYS.some(key => state.weights[key] > 0)) { state.weights = {...DEFAULT_WEIGHTS};notify('至少保留一项权重，已恢复默认。'); }
    state.limit = 40;weightDirty = true;schedule();
  });
  input.addEventListener('change', () => { if (!weightKeyboard) endWeightGesture(); });
  input.addEventListener('keyup', event => { if (weightKeyboard && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) endWeightGesture(); });
  input.addEventListener('blur',endWeightGesture);
}
function updateSearch() {
  if (!searchCheckpoint) { checkpoint();searchCheckpoint = true; }
  state.q = search.value.normalize('NFKC').slice(0,100);state.limit = 40;schedule();
  clearTimeout(searchTimer);searchTimer = setTimeout(() => { searchTimer = null;commit(searchHistory);searchHistory = true; },180);
}
search.addEventListener('focus', () => { searchHistory = false;searchCheckpoint = false; });
search.addEventListener('compositionstart', () => { composing = true;clearTimeout(searchTimer);searchTimer = null; });
search.addEventListener('compositionend', () => { composing = false;updateSearch(); });
search.addEventListener('input', event => { if (!composing && !event.isComposing) updateSearch(); });
search.addEventListener('blur', finishSearch);
document.querySelector('#ranking-search-form').addEventListener('submit', event => { event.preventDefault();finishSearch();commit(searchHistory);render(); });
function applyPreset(key) {
  const preset = UI_PRESETS[key];if (!preset) return;
  change(() => { state.weights = {...preset.weights};state.warm = !!preset.warm;state.visa = preset.visa || '';applyRankingFilter(state,'month',preset.month || state.month); });
}
root.addEventListener('click', event => {
  const quick=event.target.closest('[data-quick-filter]');if(quick)change(()=>toggleQuickFilter(state,quick.dataset.quickFilter));
  const preset = event.target.closest('[data-preset]');if (preset) applyPreset(preset.dataset.preset);
  const remove = event.target.closest('[data-remove-filter]');
  if (remove) change(() => { const key = remove.dataset.removeFilter;applyRankingFilter(state,key,key === 'budget' || key === 'month' ? null : key === 'warm' || key === 'incomplete' || key === 'abroad' || key === 'recommendedOnly' ? false : ''); });
  if (event.target.closest('[data-reset-all],#reset-ranking')) resetAll();
  if (event.target.closest('#undo-ranking')) {
    clearTimeout(searchTimer);searchTimer = null;
    const previous = undoStack.pop();if (previous) { state = previous;search.value = state.q;render();commit();notify('已撤销上一次修改。'); }
  }
  if (event.target.closest('[data-open-weights]')) openWeights(event.target.closest('[data-open-weights]'));
  if (event.target.closest('[data-close-weights]')) weightsDialog.close();
  if (event.target.closest('[data-close-filters]')) closeFilters(true);
  const locateButton = event.target.closest('[data-map-locate]');if (locateButton) locateFromMap(locateButton.dataset.mapLocate,true);
});
filterToggle.addEventListener('click', () => filterPopover.hidden ? openFilters() : closeFilters(true));
let budgetGesture=false;
const budgetInput=document.querySelector('#filter-budget');
budgetInput.addEventListener('blur',()=>{budgetGesture=false;});
budgetInput.addEventListener('input',()=>{
  const invalid=!budgetInput.validity.valid;budgetInput.setAttribute('aria-invalid',String(invalid));document.querySelector('#ranking-budget-error').hidden=!invalid;
  if(invalid)return;
  finishSearch();if(!budgetGesture)checkpoint();
  state.budget=budgetInput.value?Number(budgetInput.value):null;state.limit=40;
  render(false,true);commit(budgetGesture);budgetGesture=true;
});
filterPopover.addEventListener('change', event => {
  const input = event.target.closest('[data-filter-input]');
  if (input) {
    if(input.dataset.filterInput==='budget')return;
    change(() => { const key = input.dataset.filterInput;applyRankingFilter(state,key,key === 'month' || key === 'budget' ? (input.value ? Number(input.value) : null) : input.value); });
  }
  positionFilters();
});
document.querySelector('#recommended-only').addEventListener('change',event=>change(()=>{applyRankingFilter(state,'recommendedOnly',event.target.checked);}));
document.querySelector('#include-incomplete').addEventListener('change', event => change(() => { state.incomplete = event.target.checked; }));
document.querySelector('#clear-filters').addEventListener('click', () => change(() => { Object.assign(state,{q:'',region:'',country:'',abroad:false,budget:null,budgetCurrency:'USD',month:null,recommendedOnly:false,visa:'',season:'',warm:false,incomplete:false});search.value = ''; }));
document.querySelector('#reset-weights').addEventListener('click', () => {endWeightGesture();change(() => {state.weights = {...DEFAULT_WEIGHTS};});});
document.addEventListener('pointerdown', event => { if (!filterPopover.hidden && !filterPopover.contains(event.target) && !filterToggle.contains(event.target)) closeFilters(); });
document.addEventListener('focusin', event => { if (!filterPopover.hidden && !filterPopover.contains(event.target) && !filterToggle.contains(event.target)) closeFilters(); });
filterPopover.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();closeFilters(true); } });
window.addEventListener('resize', () => { positionFilters();updatePresetOverflow(); });
window.addEventListener('scroll', () => { if (!filterPopover.hidden) positionFilters(); },{passive:true});
document.querySelector('.preset-row').addEventListener('scroll', updatePresetOverflow,{passive:true});
document.querySelector('#show-more-cities').addEventListener('click', event => { event.preventDefault();state.limit = Math.min(360,state.limit+40);render();commit(); });
// Preserve native controls, text selection, and modified clicks within a row.
function navigateRow(event) {
  const row=event.target.closest('.ranking-row');
  if(!row||event.defaultPrevented||event.target.closest('a,button,input,select,textarea,summary,[role="button"]')||window.getSelection()?.toString())return;
  const href=row.querySelector('.rank-city-link')?.href;if(!href)return;
  if(event.type==='auxclick'&&event.button!==1)return;
  if(event.type==='click'&&event.button!==0)return;
  event.preventDefault();
  if(event.button===1||event.metaKey||event.ctrlKey||event.shiftKey)window.open(href,'_blank','noopener');
  else location.assign(href);
}
list.addEventListener('click',navigateRow);
list.addEventListener('auxclick',navigateRow);
list.addEventListener('pointerover', event => { const row = event.target.closest('[data-city]');if (row && active !== row.dataset.city) highlight(row.dataset.city); });
list.addEventListener('focusin', event => { const row = event.target.closest('[data-city]');if (row) highlight(row.dataset.city); });
window.addEventListener('popstate', () => { clearTimeout(searchTimer);searchTimer = null;state = parseState(new URL(location.href));search.value = state.q;searchHistory = false;searchCheckpoint = false;render();savePreference(state,preferenceStorage); });
function renderCommands() {
  commands = commandItems(data,commandSearch.value);commandIndex = 0;
  commandsList.replaceChildren();
  for (const [index,item] of commands.entries()) {
    const button = document.createElement(item.kind === 'city' ? 'a' : 'button');
    button.id = 'rank-command-' + index;button.className = 'rank-command-item';button.dataset.command = index;button.setAttribute('role','option');button.setAttribute('aria-selected',String(index === 0));button.tabIndex = -1;
    if (item.kind === 'city') {button.href = '/cities/' + encodeURIComponent(item.value) + '/';if (item.photo) {const img = document.createElement('img');img.src = item.photo.replace('.webp','.thumb.webp');img.alt = '';img.width = 40;img.height = 40;button.append(img);}}
    else button.type = 'button';
    const text = document.createElement('span'), label = document.createElement('strong'), detail = document.createElement('small');label.textContent = item.label;detail.textContent = item.detail;text.append(label,detail);button.append(text);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.setAttribute('viewBox','0 0 20 20');arrow.setAttribute('aria-hidden','true');arrow.innerHTML = '<path d="M4 10h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';button.append(arrow);commandsList.append(button);
  }
  updateCommandSelection();document.querySelector('#command-result-status').textContent = commands.length + ' 个结果';
}
function updateCommandSelection() {
  commandsList.querySelectorAll('[data-command]').forEach((item,index) => item.setAttribute('aria-selected',String(index === commandIndex)));
  const chosen = commandsList.querySelector('[data-command="' + commandIndex + '"]');
  if (chosen) { commandSearch.setAttribute('aria-activedescendant',chosen.id);chosen.scrollIntoView({block:'nearest'}); }
  else commandSearch.removeAttribute('aria-activedescendant');
}
function openCommand(opener = document.activeElement) {
  closeFilters();finishSearch();if (mapPanel.open) setMapOpen(false,false);commandOpener = opener;commandSearch.value = '';renderCommands();commandDialog.showModal();commandSearch.focus();
}
function executeCommand(index) {
  const item = commands[index];if (!item) return;
  if (item.kind === 'city') { location.href = withPlanMonth('/cities/' + encodeURIComponent(item.value) + '/',state.month);return; }
  commandDialog.close();
  if (item.kind === 'preset') applyPreset(item.value);
  if (item.kind === 'quick') change(()=>toggleQuickFilter(state,item.value));
  if (item.kind === 'filter') change(() => {applyRankingFilter(state,item.key,item.value);});
  if (item.kind === 'search') change(() => {state.q = item.value;search.value = state.q;});
  if (item.kind === 'weights') openWeights(commandOpener);
  if (item.kind === 'reset') resetAll();
}
commandSearch.addEventListener('compositionstart', () => {commandComposing = true;});
commandSearch.addEventListener('compositionend', () => {commandComposing = false;renderCommands();});
commandSearch.addEventListener('input', event => {if (!commandComposing && !event.isComposing) renderCommands();});
commandSearch.addEventListener('keydown', event => {
  if (commandComposing || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();commandDialog.close();return;}
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault();commandIndex = (commandIndex + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length;updateCommandSelection();}
  if (event.key === 'Enter') {event.preventDefault();executeCommand(commandIndex);}
});
commandsList.addEventListener('click', event => {const item = event.target.closest('[data-command]');if (item) {event.preventDefault();executeCommand(Number(item.dataset.command));}});
commandsList.addEventListener('pointermove', event => {const item = event.target.closest('[data-command]');if (item && commandIndex !== Number(item.dataset.command)) {commandIndex = Number(item.dataset.command);updateCommandSelection();}});
document.querySelector('#open-command').addEventListener('click', event => openCommand(event.currentTarget));
document.querySelector('[data-close-command]').addEventListener('click', () => commandDialog.close());
commandDialog.addEventListener('close', () => commandOpener?.focus({preventScroll:true}));
commandDialog.addEventListener('click', event => {if (event.target === commandDialog) {const r = commandDialog.getBoundingClientRect();if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) commandDialog.close();}});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('#nomad-agent[open]')) {event.preventDefault();if (commandDialog.open) commandDialog.close();else {if (weightsDialog.open) weightsDialog.close();openCommand();}return;}
  const editing = event.target.closest('input,textarea,select,[contenteditable="true"]');
  if (editing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]:not(#ranking-map-panel)') || (mapPanel.open && mapIsModal)) return;
  if (event.key === '/') {event.preventDefault();search.focus();search.select();}
  if ((event.key.toLowerCase() === 'j' || event.key.toLowerCase() === 'k') && ranked.length) {
    event.preventDefault();const current = ranked.findIndex(city => city.slug === active), direction = event.key.toLowerCase() === 'j' ? 1 : -1, next = current < 0 ? (direction === 1 ? 0 : ranked.length-1) : Math.max(0,Math.min(ranked.length-1,current+direction));locate(ranked[next].slug,true);
  }
  if (event.key === 'Escape') {if (!filterPopover.hidden) {closeFilters(true);return;}if (mapPanel.open) {setMapOpen(false);return;}if (active) pool.get(active)?.classList.remove('is-active');active = null;map.clear();document.querySelectorAll('details[open]').forEach(details => details.open = false);}
});
function setMapOpen(open, restore = true) {
  restoreMapFocus = restore;
  if (open) {
    const focused = document.activeElement;
    mapIsModal = matchMedia('(max-width:700px)').matches;
    root.dataset.mapOpen = 'true';
    if (!mapPanel.open) { if (mapIsModal) mapPanel.showModal();else mapPanel.show(); }
    if (mapIsModal) mapPanel.querySelector('[data-close-map]').focus({preventScroll:true});
    else if (!restore && document.activeElement !== focused) {
      document.activeElement?.blur();
      focused?.focus({preventScroll:true});
    }
  } else {
    root.dataset.mapOpen = 'false';
    if (mapPanel.open) mapPanel.close();
  }
  mapToggle.setAttribute('aria-expanded',String(open));mapToggle.setAttribute('aria-label',open ? '收起地图' : '显示地图');mapToggle.title = open ? '收起地图' : '显示地图';
}
function locateFromMap(slug, focus) {
  if (mapPanel.open && mapIsModal) setMapOpen(false,false);
  locate(slug,focus);
}
mapToggle.addEventListener('click', () => setMapOpen(!mapPanel.open));
mapPanel.querySelector('[data-close-map]').addEventListener('click', () => setMapOpen(false));
mapPanel.addEventListener('close', () => {
  if (mapPanel.open) return;
  root.dataset.mapOpen = 'false';mapToggle.setAttribute('aria-expanded','false');mapToggle.setAttribute('aria-label','显示地图');mapToggle.title = '显示地图';
  if (restoreMapFocus && !document.querySelector('dialog[open]')) mapToggle.focus({preventScroll:true});
});
mapPanel.addEventListener('click', event => {
  if (event.target !== mapPanel || !mapIsModal) return;
  const r = mapPanel.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setMapOpen(false);
});
window.addEventListener('resize', () => {
  const mobile = matchMedia('(max-width:700px)').matches;
  if (mapPanel.open && mobile !== mapIsModal) {mapPanel.close();mapIsModal = mobile;setMapOpen(true);}
});
document.querySelector('#map-zoom-in').addEventListener('click', () => map.zoom(.7));
document.querySelector('#map-zoom-out').addEventListener('click', () => map.zoom(1/.7));
document.querySelector('#map-reset').addEventListener('click', () => map.reset());
const shareButton = document.querySelector('#share-ranking');
let shareSession = 0;
shareButton.addEventListener('click', () => {
  let dialog=document.querySelector('#share-dialog');
  if(dialog?.open)return;
  finishSearch();const params = stateParams(state).toString(), value = location.origin + location.pathname + (params ? '?' + params : '');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='share-dialog';dialog.setAttribute('aria-labelledby','share-title');
    dialog.innerHTML='<form method="dialog"><h2 id="share-title">分享当前视角</h2><label for="share-url">这个链接包含当前筛选和偏好</label><input id="share-url" readonly><p class="share-hint" role="status"></p><a id="share-open" target="_blank" rel="noopener noreferrer">打开这个视角 ↗</a><p class="share-hint">个人报价和会议安排留在本机，不会随链接发送。</p><button class="button" value="close">完成</button></form>';
    dialog.addEventListener('close',()=>{if(dialog.open)return;shareSession++;shareButton.focus({preventScroll:true});});document.body.append(dialog);
  }
  const session=++shareSession;
  dialog.querySelector('input').value=value;dialog.querySelector('#share-open').href=value;
  const status=dialog.querySelector('[role="status"]');
  status.textContent='可以选中上方链接手动复制，或直接打开查看。';
  dialog.showModal();dialog.querySelector('input').select();
  try{
    Promise.resolve(navigator.clipboard.writeText(value)).then(()=>{
      if(dialog.open&&session===shareSession&&dialog.querySelector('input').value===value)
        status.textContent='链接已复制，也可以选中上方链接手动复制。';
    },()=>{});
  }catch{}
});
shareButton.disabled=false;shareButton.removeAttribute('aria-busy');shareButton.setAttribute('aria-label','分享当前视角');shareButton.title='分享当前视角';
motion.addEventListener('change', () => {if (motion.matches) {document.querySelectorAll('.ranking-row,.rank-digit,.old-digit').forEach(el => el.getAnimations().forEach(animation => animation.cancel()));document.querySelectorAll('.old-digit,.row-ghost').forEach(el => el.remove());}});
commit(true);
render(true);
if (!matchMedia('(max-width:700px)').matches) setMapOpen(true, false);
document.querySelectorAll('[data-ranking-controls]').forEach(controls=>{controls.inert=false;controls.removeAttribute('aria-busy');});
document.querySelectorAll('[data-ranking-wait-control]').forEach(control=>{control.disabled=false;});
const readiness=document.querySelector('[data-ranking-readiness]');if(readiness)readiness.hidden=true;
