const LAYOUT_KEY = 'nomads-ranking-layout-v1';

export function initRankingPresentation(root, storage) {
  const presentation = document.documentElement.dataset;
  const buttons = [...root.querySelectorAll('[data-ranking-layout]')];
  function select(layout, remember = false) {
    presentation.rankingLayout = layout === 'list' ? 'list' : 'cards';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.rankingLayout === presentation.rankingLayout));
    if (remember) {
      try { storage.setItem(LAYOUT_KEY, presentation.rankingLayout); } catch {}
    }
  }
  select(presentation.rankingLayout);
  for (const button of buttons) button.addEventListener('click', () => select(button.dataset.rankingLayout, true));
}
