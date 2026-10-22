(() => {
  const sections = Array.from(document.querySelectorAll('[data-reader-section]'));
  if (!sections.length) return;
  const links = Array.from(document.querySelectorAll('[data-chapter-link]'));
  const menu = document.querySelector('[data-mobile-chapters]');
  const button = menu?.querySelector('button');
  const summary = menu?.querySelector('summary');
  const nativeDetails = menu?.tagName === 'DETAILS';
  const panel = menu?.querySelector('[data-chapter-panel]');
  const currentLabel = menu?.querySelector('[data-current-chapter]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let queued = false;

  function setOpen(open, restoreFocus = false) {
    if (!menu || !panel) return;
    if (nativeDetails) {
      menu.open = open;
      if (restoreFocus) summary?.focus();
      return;
    }
    if (!button) return;
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    menu.classList.toggle('is-open', open);
    if (restoreFocus) button.focus();
  }
  function activate(id) {
    links.forEach(link => {
      const match = link.hash === '#' + id;
      if (match) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const section = sections.find(item => item.id === id);
    if (currentLabel && section) currentLabel.textContent = section.dataset.chapterTitle;
  }
  function update() {
    queued = false;
    let active = sections[0];
    const threshold = Math.min(190, Math.max(100, innerHeight * .22));
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= threshold) active = section;
      else break;
    }
    if (Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 3) {
      active = sections[sections.length - 1];
    }
    activate(active.id);
  }
  function schedule() {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }
  function jumpToHash(behavior = 'auto') {
    if (!location.hash) { schedule(); return; }
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior, block: 'start' });
    schedule();
  }
  button?.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  links.forEach(link => link.addEventListener('click', event => {
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    setOpen(false);
    target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    activate(target.id);
  }));
  menu?.addEventListener('focusout', event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    const open = nativeDetails ? menu.open : button?.getAttribute('aria-expanded') === 'true';
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener('click', event => {
    if (menu && !menu.contains(event.target)) setOpen(false);
  });
  let chapterObserver;
  function observeSections() {
    chapterObserver?.disconnect();
    const line = Math.min(190, Math.max(100, innerHeight * .22));
    chapterObserver = new IntersectionObserver(schedule, {
      rootMargin: `-${line}px 0px -${Math.max(0, innerHeight - line - 1)}px 0px`,
      threshold: 0
    });
    sections.forEach(section => chapterObserver.observe(section));
  }
  const pageEnd = document.querySelector('[data-page-end]');
  if (pageEnd) new IntersectionObserver(schedule, { threshold: 0 }).observe(pageEnd);
  observeSections();
  window.addEventListener('resize', () => {
    if (innerWidth > 800) setOpen(false);
    observeSections();
    schedule();
  }, { passive: true });
  window.addEventListener('hashchange', () => jumpToHash());
  window.addEventListener('popstate', () => jumpToHash());
  window.addEventListener('load', () => {
    requestAnimationFrame(() => requestAnimationFrame(() => jumpToHash()));
  }, { once: true });
  document.fonts?.ready.then(schedule);
  update();
})();
