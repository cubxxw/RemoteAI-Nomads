// Runs before the ranking markup, without waiting for the module dependency tree.
// These are presentation hints only; rank-controls remains the owner of filters.
(() => {
  const presentation = document.documentElement.dataset;
  let compact = document.currentScript.dataset.compact === 'true';
  let savedFilters = false, journeyMonth = false;
  presentation.rankingLayout = 'cards';
  try {
    compact ||= localStorage.getItem('nomads-ranking-visited-v1') === 'true';
    if (localStorage.getItem('nomads-ranking-layout-v1') === 'list') presentation.rankingLayout = 'list';
    try {
      const saved = JSON.parse(localStorage.getItem('nomads-ranking-view-v1'));
      savedFilters = saved?.version === 1 && typeof saved.query === 'string' && saved.query.length > 0 && saved.query.length <= 2000;
    } catch {}
    const month = Number(localStorage.getItem('nomads-trip-month-v1'));
    journeyMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  } catch {}
  if (!location.search && (savedFilters || journeyMonth)) {
    compact = true;
    presentation.rankingRestoring = 'true';
  }
  presentation.rankingIntro = compact ? 'compact' : 'expanded';
  if (presentation.rankingRestoring) {
    // Recovery must not depend on app.js or any of its module imports loading.
    const revealFallback = () => {
      if (!presentation.rankingRestoring) return;
      delete presentation.rankingRestoring;
      const status = document.querySelector('[data-ranking-readiness]');
      if (status) {
        status.hidden = false;
        status.textContent = '选城偏好暂未恢复，当前显示默认排行；刷新可重试。';
      }
    };
    addEventListener('error', event => {
      if (event.target?.tagName === 'SCRIPT' && /\/app\.js(?:[?#]|$)/.test(event.target.getAttribute('src') || '')) revealFallback();
    }, true);
    setTimeout(revealFallback, 8000);
  }
})();
