import {initSharing} from './modules/share-content.js';
import {icon} from './modules/icons.js';
import './modules/wechat-ui.js';
import {installPhotoFallback} from './modules/photo-fallback.js';
import {TRIP_MONTH_KEY,withPlanMonth} from './modules/trip-state.js';
import {sitePath,appPath} from './modules/site-path.js';

function currentPlanMonth(){
  const city=document.querySelector('#city-month'),comparison=document.querySelector('#comparison-month'),ranking=document.querySelector('#ranking-root');
  if(city||comparison)return Number((city||comparison).value);
  if(ranking?.hasAttribute('data-plan-month'))return Number(ranking.dataset.planMonth)||null;
  const requested=Number(new URL(location.href).searchParams.get('month'));if(requested>=1&&requested<=12)return requested;
  try{return Number(localStorage.getItem(TRIP_MONTH_KEY))||null;}catch{return null;}
}
function syncJourneyLinks(){
  const month=currentPlanMonth();
  for(const link of document.querySelectorAll('a[href]')){
    const href=link.getAttribute('href'),path=appPath(href);
    // Ranking returns restore the entire saved view, including its weights.
    // A month-only query would incorrectly turn that return into a new view.
    if(/^\/cities\/(?:[?#]|$)/.test(path))continue;
    if(/^\/(?:cities|countries|compare)\//.test(path)){
      if(!month&&link.dataset.planLinked){const url=new URL(href,location.origin);url.searchParams.delete('month');link.setAttribute('href',url.pathname+url.search+url.hash);}
      else link.setAttribute('href',withPlanMonth(href,month));
      if(month)link.dataset.planLinked='true';
    }
  }
}
document.addEventListener('nomads:journey-month',event=>{
  try{event.detail?localStorage.setItem(TRIP_MONTH_KEY,String(event.detail)):localStorage.removeItem(TRIP_MONTH_KEY);}catch{}
  syncJourneyLinks();
});
document.addEventListener('nomads:links-updated',syncJourneyLinks);

const safeRead = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
};
let selected = safeRead("nomads-compare", [])
  .filter((x) => x && typeof x.slug === "string" && typeof x.name === "string")
  .slice(0, 2);
let saved = safeRead("nomads-saved", []).filter((x) => typeof x === "string");
let timer;
function notify(message) {
  const box = document.querySelector("#toast");
  if (!box) return;
  box.textContent = message;
  box.classList.add("visible");
  clearTimeout(timer);
  timer = setTimeout(() => box.classList.remove("visible"), 3000);
}
function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    notify("浏览器未允许存储，本次选择仍可使用。");
  }
}
function update() {
  document.querySelectorAll("[data-compare]").forEach((b) => {
    const yes = selected.some((x) => x.slug === b.dataset.compare),
      compact = b.classList.contains("rank-compare");
    b.setAttribute("aria-pressed", String(yes));
    b.innerHTML = icon(yes ? 'check' : 'plus');
    if (!compact) {
      const label = document.createElement('span');
      label.textContent = yes ? '已选' : '对比';
      b.append(label);
    }
    b.setAttribute('aria-label', `${yes ? '从对比中移除' : '将'}${b.dataset.name || '这座城市'}${yes ? '' : '加入对比'}`);
  });
  document.querySelectorAll("[data-save]").forEach((b) => {
    const yes = saved.includes(b.dataset.save);
    b.setAttribute("aria-pressed", String(yes));
    const name = b.dataset.name || b.dataset.cityName || (b.getAttribute('aria-label') || '').replace(/^(取消收藏|收藏)/, '') || '这座城市';
    b.dataset.cityName = name;
    b.innerHTML = icon('heart', {filled: yes});
    b.setAttribute('aria-label', `${yes ? '取消收藏' : '收藏'}${name}`);
  });
  const tray = document.querySelector("#compare-tray");
  tray.hidden = !selected.length || Boolean(document.querySelector(".comparison-page"));
  document.querySelector('#compare-count').textContent = `${selected.length} / 2`;
  const list = document.querySelector("#compare-selected");
  list.replaceChildren();
  selected.forEach((city, index) => {
    const b = document.createElement("button");
    b.className = "selected-city";
    const label = document.createElement('span');
    label.textContent = city.name;
    b.append(label);
    b.insertAdjacentHTML('beforeend', icon('close'));
    b.setAttribute("aria-label", "移除" + city.name);
    b.addEventListener("click", () => {
      selected = selected.filter((x) => x.slug !== city.slug);
      persist("nomads-compare", selected);
      update();
      const next = document.querySelectorAll('#compare-selected button')[Math.max(0, index - 1)];
      if (next) next.focus();
      else document.querySelector('[data-compare]')?.focus();
    });
    list.append(b);
  });
  const go = document.querySelector("#compare-go");
  go.href = sitePath(
    selected.length === 2
      ? "/compare/" +
        selected
          .map((x) => x.slug)
          .sort()
          .join("-vs-") +
        "/"
      : "/compare/");
  go.textContent = selected.length === 2 ? "查看对比" : "再选一座城市";
  syncJourneyLinks();
  const clearCompanion = () => document.documentElement.style.setProperty('--companion-clearance', !tray.hidden && matchMedia('(max-width:700px)').matches ? (tray.getBoundingClientRect().height + 20) + 'px' : '0px');
  clearCompanion();
  if (!tray.dataset.companionObserved) { tray.dataset.companionObserved = 'true'; new ResizeObserver(clearCompanion).observe(tray); window.addEventListener('resize', clearCompanion); }
}
document.addEventListener("click", (e) => {
  const compare = e.target.closest("[data-compare]");
  if (compare) {
    const city = { slug: compare.dataset.compare, name: compare.dataset.name };
    if (selected.some((x) => x.slug === city.slug))
      selected = selected.filter((x) => x.slug !== city.slug);
    else if (selected.length < 2) selected.push(city);
    else {
      notify("已选择两座城市，请先移除一座。");
      return;
    }
    persist("nomads-compare", selected);
    update();
  }
  const save = e.target.closest("[data-save]");
  if (save) {
    const key = save.dataset.save,
      exists = saved.includes(key);
    saved = exists ? saved.filter((x) => x !== key) : [...saved, key];
    persist("nomads-saved", saved);
    notify(exists ? "已取消收藏" : "已收藏在这个浏览器中");
    update();
  }
});
document.querySelector("#compare-clear")?.addEventListener("click", () => {
  selected = [];
  persist("nomads-compare", selected);
  update();
  document.querySelector('[data-compare]')?.focus();
});

const navigationToggle = document.querySelector('#nav-toggle');
const navigation = document.querySelector('#site-navigation');
const navigationHeader = document.querySelector('.site-header');
const mobileNavigation = matchMedia('(max-width: 760px)');
function closeNavigation({returnFocus = false} = {}) {
  if (!navigationToggle || navigationToggle.getAttribute('aria-expanded') !== 'true') return;
  navigationToggle.setAttribute('aria-expanded', 'false');
  navigationToggle.innerHTML = `${icon('menu')}<span>菜单</span>`;
  navigationHeader.classList.remove('is-menu-open');
  if (returnFocus) navigationToggle.focus();
}
function openNavigation({focusLast = false, focusLink = false} = {}) {
  navigationToggle.setAttribute('aria-expanded', 'true');
  navigationToggle.innerHTML = `${icon('close')}<span>收起</span>`;
  navigationHeader.classList.add('is-menu-open');
  if (focusLink) {
    const links = navigation.querySelectorAll('a');
    links[focusLast ? links.length - 1 : 0]?.focus();
  } else navigationToggle.focus({preventScroll: true});
}
navigationToggle?.addEventListener('click', event => {
  const open = navigationToggle.getAttribute('aria-expanded') === 'true';
  if (open) return closeNavigation();
  openNavigation({focusLink: event.detail === 0});
});
navigationToggle?.addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  openNavigation({focusLink: true, focusLast: event.key === 'ArrowUp'});
});
navigation?.addEventListener('keydown', event => {
  if (!mobileNavigation.matches) return;
  const links = [...navigation.querySelectorAll('a')];
  const index = links.indexOf(document.activeElement);
  if (index === -1) return;
  if (event.key === 'Tab') {
    if (event.shiftKey && index === 0) {
      event.preventDefault();
      closeNavigation({returnFocus: true});
    } else if (!event.shiftKey && index === links.length - 1) {
      event.preventDefault();
      closeNavigation();
      const next = document.querySelector('main a[href], main button:not([disabled]), main input:not([disabled]), main select:not([disabled]), main textarea:not([disabled]), .site-footer a');
      next?.focus();
    }
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
  links[next]?.focus();
});
document.addEventListener('pointerdown', event => {
  if (!navigationHeader?.contains(event.target)) closeNavigation();
});
document.addEventListener('focusin', event => {
  if (!navigationHeader?.contains(event.target)) closeNavigation();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigationToggle?.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    closeNavigation({returnFocus: true});
  }
});
navigation?.addEventListener('click', event => {
  if (event.target.closest('a')) closeNavigation();
});
mobileNavigation.addEventListener('change', () => closeNavigation());
installPhotoFallback(document);
initSharing();
document.addEventListener("nomads:rows-updated", update);
document.addEventListener("nomads:notice", (e) => notify(e.detail));
update();
if (document.querySelector("#ranking-root"))
  import("./modules/rank-ui.js").catch(error => {
    console.error('Ranking initialization failed',error);
    document.documentElement.removeAttribute('data-ranking-restoring');
    document.querySelectorAll('[data-ranking-controls]').forEach(controls=>{
      controls.querySelectorAll('button,input,select').forEach(control=>{control.disabled=true;});
      controls.inert=false;controls.removeAttribute('aria-busy');
    });
    document.querySelectorAll('[data-ranking-wait-control]').forEach(control=>{control.disabled=true;});
    const readiness=document.querySelector('[data-ranking-readiness]');
    if(readiness){readiness.hidden=false;readiness.textContent='筛选与实时排序暂不可用，请刷新重试。下方城市资料仍可浏览。';}
    const shareButton=document.querySelector('#share-ranking');
    if(shareButton){shareButton.disabled=true;shareButton.removeAttribute('aria-busy');shareButton.setAttribute('aria-label','分享暂不可用，请刷新重试');shareButton.title='分享暂不可用，请刷新重试';}
    notify("实时排序暂时未载入，刷新页面可重试。当前排行与城市详情仍可浏览。");
  });

if(document.querySelector('[data-guide]'))
  import('./modules/content-ui.js').catch(error=>{
    console.error('Checklist initialization failed',error);
    document.querySelector('[data-guide-progress]').textContent='清单暂不可用，请刷新重试。';
    document.querySelector('[data-guide-storage]').textContent='本页尚未读取或保存清单。';
  });
if(document.querySelector('#personal-comparison'))
  import('./modules/compare-ui.js').catch(error=>{
    console.error('Comparison initialization failed',error);
    const panel=document.querySelector('#personal-comparison');panel.inert=true;panel.removeAttribute('aria-busy');
    const readiness=document.querySelector('[data-personal-readiness]');
    if(readiness){readiness.hidden=false;readiness.textContent='本机方案暂不可用，请刷新重试。下方公共城市资料仍可对照。';}
  });

let agentModule;
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-open-agent],[data-agent-open]');
 if(!button)return;
 try{agentModule??=import('./modules/agent-ui.js');(await agentModule).open(button);}
 catch{notify('小狐暂时没有载入，请刷新后重试。');}
});

// Share only the cities explicitly in the visible comparison tray.
document.querySelector('#compare-share')?.addEventListener('click',async event=>{
 if(!selected.length)return;
 const [{createShare},{openShare}]=await Promise.all([import('./modules/share-model.js'),import('./modules/share-ui.js')]);
 const month=currentPlanMonth(),url=new URL(location.origin+sitePath(selected.length===2?'/compare/'+selected.map(city=>city.slug).sort().join('-vs-')+'/':'/cities/'+selected[0].slug+'/'));
 if(month)url.searchParams.set('month',month);
 openShare(createShare({kind:'comparison',title:selected.map(city=>city.name).join(' 与 '),subtitle:'我的待选城市',items:selected.map(city=>({title:city.name,detail:'打开城市资料，再核对预算与出发条件。'})),url:url.href,caveats:['只包含这次明确选中的城市，不包含其他收藏、个人报价或对话。']}),event.currentTarget);
});
