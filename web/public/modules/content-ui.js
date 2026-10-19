import { normalizeSearch, countryQueryCode } from "./country-search.js";
export function countryMatches(row, query, covered) {
  const needle = normalizeSearch(query), code = countryQueryCode(needle);
  return (!covered || Number(row.cities) > 0) && (!needle || ((code || /^[a-z]{2}$/.test(needle)) ? normalizeSearch(row.code) === normalizeSearch(code || needle) : normalizeSearch(row.search).includes(needle)));
}

export function initContentPage() {
  const countryNavigation = document.querySelector('.country-navigation details');
  if (countryNavigation) {
    const narrow = matchMedia('(max-width:680px)');
    countryNavigation.open = !narrow.matches;
    narrow.addEventListener('change', () => {countryNavigation.open = !narrow.matches;});
  }
  const directory = document.querySelector('[data-country-directory]');
  if (directory) {
    const input = directory.querySelector('[data-country-search]'), covered = directory.querySelector('[data-country-covered]');
    const url = new URL(location.href); input.value = url.searchParams.get('q') || ''; covered.checked = url.searchParams.get('covered') === '1';
    const apply = () => {
      let count = 0;
      directory.querySelectorAll('[data-country-row]').forEach(row => { row.hidden = !countryMatches(row.dataset, input.value, covered.checked); if (!row.hidden) count++; });
      directory.querySelectorAll('[data-country-group]').forEach(group => {
        const visible = [...group.querySelectorAll('[data-country-row]')].filter(row => !row.hidden).length;
        group.hidden = !visible;
        group.querySelector('[data-group-count]').textContent = `${visible} 个地区`;
        const link = directory.querySelector(`.continent-nav a[href="#${group.id}"]`);
        if (link) { link.hidden = !visible; link.querySelector('span').textContent = String(visible); }
      });
      directory.querySelector('.continent-nav').hidden = [...directory.querySelectorAll('[data-country-group]')].filter(group => !group.hidden).length < 2;
      directory.querySelector('[data-directory-count]').textContent = `${count} 个地区`;
      directory.querySelector('[data-directory-empty]').hidden = count > 0;
      const state = new URL(location.href); input.value.trim() ? state.searchParams.set('q', input.value.trim()) : state.searchParams.delete('q'); covered.checked ? state.searchParams.set('covered', '1') : state.searchParams.delete('covered');
      history.replaceState(history.state, '', state);
    };
    input.addEventListener('input', apply); covered.addEventListener('change', apply);
    directory.querySelector('[data-directory-reset]').addEventListener('click', () => { input.value = ''; covered.checked = false; apply(); input.focus(); });
    apply();
  }
  const picker = document.querySelector('[data-compare-index]');
  if (picker) {
    const cities = JSON.parse(picker.querySelector('#compare-city-data').textContent), selects = [...picker.querySelectorAll('[data-pair-select]')];
    const params = new URL(location.href).searchParams;
    selects.forEach(select => { const requested = params.get(select.dataset.pairSelect); if (cities.some(c => c.slug === requested)) select.value = requested; });
    const update = () => {
      selects.forEach(select => { const c = cities.find(c => c.slug === select.value), side = select.dataset.pairSelect, link = picker.querySelector(`[data-pair-city="${side}"]`); if (!c) return; const img = link.querySelector('img'); if (img && c.photo) { img.src = c.photo; img.alt = `${c.name}城市风景`; } link.href = `/cities/${encodeURIComponent(c.slug)}/`; picker.querySelector(`[data-pair-name="${side}"]`).textContent = c.name; });
      const same = selects[0].value === selects[1].value;
      picker.querySelector('[data-pair-feedback]').textContent = same ? '两个位置选中了同一座城市，请换一个。' : '逐项比较，看看各自适合怎样的生活。';
      selects[1].setAttribute('aria-invalid', String(same));
    };
    selects.forEach(select => select.addEventListener('change', update));
    picker.querySelector('[data-compare-form]').addEventListener('submit', event => {
      event.preventDefault(); update();
      if (selects[0].value === selects[1].value) { selects[1].focus(); return; }
      const month=Number(params.get('month'));
      const monthQuery=Number.isInteger(month)&&month>=1&&month<=12?'?month='+month:'';
      location.assign('/compare/' + [selects[0].value, selects[1].value].sort().map(encodeURIComponent).join('-vs-') + '/' + monthQuery);
    });
    update();
  }
  const guide = document.querySelector('[data-guide]');
  if (guide) {
    const key = `nomads:guide:${guide.dataset.guide}`, checks = [...guide.querySelectorAll('[data-guide-check]')];
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(value)) checks.forEach(check => { check.checked = value.includes(Number(check.dataset.guideCheck)); }); } catch {}
    const update = () => {
      guide.querySelector('[data-guide-progress]').textContent = `${checks.filter(check => check.checked).length} / ${checks.length} 项完成`;
      let saved = false;
      try { localStorage.setItem(key, JSON.stringify(checks.filter(check => check.checked).map(check => Number(check.dataset.guideCheck)))); saved = true; } catch {}
      guide.querySelector('[data-guide-storage]').textContent = saved ? '清单已保存在当前浏览器' : '本页可继续勾选；当前浏览器无法保存，刷新后可能丢失。';
    };
    checks.forEach(check => check.addEventListener('change', update));
    guide.querySelector('[data-guide-clear]').addEventListener('click', () => { checks.forEach(check => { check.checked = false; }); update(); });
    update();
    checks.forEach(check => { check.disabled = false; });
    guide.querySelector('[data-guide-clear]').disabled = false;
  }
}

if (typeof document !== 'undefined') initContentPage();
