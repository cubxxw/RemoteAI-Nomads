// Native fragment links remain useful when this enhancement is unavailable.
export function initGuideTopics(root, view = globalThis.window) {
  if (!root || !view || root.dataset.topicReady) return;
  const links = [...root.querySelectorAll('[data-guide-topic-filter]')];
  const groups = [...root.querySelectorAll('[data-guide-topic-group]')];
  const status = root.querySelector('[data-guide-topic-status]');
  if (!links.length || !groups.length || !status) return;
  root.dataset.topicReady = 'true';

  const fromHash = () => links.find(link => link.hash === view.location.hash)?.dataset.guideTopicFilter || 'all';
  const select = key => {
    const choice = links.find(link => link.dataset.guideTopicFilter === key);
    if (!choice) return;
    links.forEach(link => link === choice ? link.setAttribute('aria-current','true') : link.removeAttribute('aria-current'));
    let count = 0;
    groups.forEach(group => {
      group.hidden = key !== 'all' && group.dataset.guideTopicGroup !== key;
      if (!group.hidden) count += group.querySelectorAll('.city-article-card').length;
    });
    status.textContent = key === 'all' ? `显示全部${count}篇专题` : `显示${count}篇专题`;
  };
  root.querySelector('.guide-topic-nav').addEventListener('click', event => {
    const link = event.target.closest('a[data-guide-topic-filter]');
    if (!link || !root.contains(link) || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    select(link.dataset.guideTopicFilter);
    if (view.location.hash !== link.hash) {
      const next = new URL(view.location.href); next.hash = link.hash;
      try { view.history.pushState(view.history.state,'',next); } catch {}
    }
  });
  const restore = () => select(fromHash());
  view.addEventListener('popstate',restore);
  view.addEventListener('hashchange',restore);
  restore();
}
