import {esc} from './ranking.js';
import {countryGroups, countryHref, renderCountryPreview} from './country-map.js';

const NS = 'http://www.w3.org/2000/svg';
const element = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
export const project = (lat, lon) => [((lon + 180) / 360) * 1000, ((85 - Math.max(-60, Math.min(85, lat))) / 145) * 480];
const countryCode = city => city.countryId || city.countryCode;
const located = city => Number.isFinite(city.lat) && Number.isFinite(city.lon);

export class RankMap {
  constructor({stage, selection, catalog, initialCountry}) {
    Object.assign(this, {stage, selection, catalog, initialCountry});
    this.cities = [];
    this.nodes = new Map();
    this.lands = new Map();
    this.view = [0, 0, 1000, 480];
    this.active = null;
    this.country = null;
    this.ready = false;
    this.picker = document.createElement('div');
    this.picker.className = 'map-country-picker';
    this.picker.innerHTML = '<label for="map-country-select">探索国家</label><select id="map-country-select"><option value="">选择国家或地区</option></select>';
    this.selection.before(this.picker);
    this.picker.querySelector('select').addEventListener('change', event => {
      if (!event.target.value) {this.clear();this.reset();return;}
      this.previewCountry(event.target.value);
      this.frameCountry(event.target.value);
    });
    this.load();
  }
  async load() {
    this.stage.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/map/world.json');
      if (!response.ok) throw new Error('Map request failed');
      const world = await response.json();
      if (!Array.isArray(world.countries)) throw new Error('Invalid country map');
      this.countries = world.countries;
      this.svg = element('svg', {viewBox:'0 0 1000 480',class:'rank-map-svg',role:'group','aria-label':'国家地图，方向键切换国家，回车进入国家栏目'});
      const land = element('g', {class:'map-land'});
      this.lands.clear();
      for (const d of world.land) land.append(element('path', {d,'aria-hidden':'true'}));
      for (const country of world.countries) {
        if (!country.paths.length) continue;
        const link = element('a', {href:countryHref(country.code),'data-map-country':country.code,class:'map-country',tabindex:'-1','aria-label':country.name+'，进入国家栏目'});
        for (const d of country.paths) link.append(element('path', {d}));
        this.lands.set(country.code,link);
        land.append(link);
      }
      this.dots = element('g', {class:'map-dots','aria-hidden':'true'});
      this.svg.append(land,this.dots);
      this.caption = document.createElement('div');
      this.caption.className = 'map-country-caption';
      this.caption.setAttribute('aria-hidden','true');
      this.stage.replaceChildren(this.svg,this.caption);
      this.ready = true;
      this.update(this.cities);
      this.bind();
    } catch {
      this.ready = false;
      this.stage.innerHTML = '<div class="map-error" role="status"><strong>地图暂时没有加载成功</strong><p>可继续从国家目录浏览。</p><a href="/countries/">浏览国家目录</a><button type="button" class="quiet-button" id="retry-map">重新加载地图</button></div>';
      this.stage.querySelector('#retry-map').addEventListener('click', () => this.load());
    }
    this.stage.setAttribute('aria-busy', 'false');
  }
  bind() {
    const preview = event => {
      const target = event.target.closest('[data-map-country]');
      if (target) this.previewCountry(target.dataset.mapCountry,target.dataset.mapCity);
    };
    this.svg.addEventListener('pointerover', event => {
      if (event.pointerType !== 'touch' && !this.dragStart) preview(event);
    });
    this.svg.addEventListener('focusin', preview);
    this.svg.addEventListener('click', event => {
      const target = event.target.closest('[data-map-country]');
      if (this.dragged && event.detail) {event.preventDefault();return;}
      if (!target) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // Touch previews first; the persistent sidebar link is the navigation action.
      if (event.pointerType === 'touch' || (event.detail && (this.touch || matchMedia('(max-width:700px)').matches))) event.preventDefault();
      this.previewCountry(target.dataset.mapCountry,target.dataset.mapCity);
    });
    this.svg.addEventListener('keydown', event => {
      if (!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp',' '].includes(event.key)) return;
      event.preventDefault();
      if (event.key === ' ') return;
      const codes = [...this.lands.keys()];
      const index = codes.indexOf(this.country), step = ['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1;
      const code = codes[(index+step+codes.length)%codes.length];
      this.previewCountry(code);
      this.frameCountry(code);
      this.lands.get(code)?.focus({preventScroll:true});
    });
    this.svg.addEventListener('pointerdown', event => {
      this.dragged = false;
      this.touch = event.pointerType === 'touch';
      if (this.touch || event.button !== 0) return;
      this.dragStart = {x:event.clientX,y:event.clientY,view:[...this.view]};
    });
    this.svg.addEventListener('pointermove', event => {
      if (!this.dragStart) return;
      if (!event.buttons) {this.dragStart=null;return;}
      const dx = event.clientX-this.dragStart.x, dy = event.clientY-this.dragStart.y;
      if (!this.dragged && Math.abs(dx)+Math.abs(dy)<=5) return;
      this.dragged = true;
      this.svg.setPointerCapture(event.pointerId);
      const scale = this.dragStart.view[2]/this.svg.getBoundingClientRect().width;
      this.view = [this.dragStart.view[0]-dx*scale,this.dragStart.view[1]-dy*scale,...this.dragStart.view.slice(2)];
      this.applyView();
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) this.svg.addEventListener(type,()=>{this.dragStart=null;});
    window.addEventListener('pointerup',()=>{this.dragStart=null;});
  }
  update(cities) {
    this.cities = cities;
    if (!this.ready) return;
    this.groups = countryGroups(this.countries,this.catalog,cities);
    const mapped = cities.filter(located), covered = new Set(cities.map(countryCode));
    document.querySelector('#map-count').textContent = `${covered.size} 个国家与地区 · ${mapped.length} 个位置${cities.length>mapped.length?` · ${cities.length-mapped.length} 个待补`:''}`;
    const picker = this.picker.querySelector('select');
    const ordered = [...this.groups.values()].sort((a,b)=>(!!b.cities.length-!!a.cities.length)||a.name.localeCompare(b.name,'zh-CN'));
    picker.innerHTML = '<option value="">选择国家或地区</option>' + [true,false].map(hasCities=>`<optgroup label="${hasCities?'已有城市资料':'城市资料待补'}">${ordered.filter(c=>!!c.cities.length===hasCities).map(c=>`<option value="${esc(c.code)}">${esc(c.name)}${c.cities.length?` · ${c.cities.length} 城`:''}</option>`).join('')}</optgroup>`).join('');
    const fragment = document.createDocumentFragment();
    for (const city of mapped) {
      let point = this.nodes.get(city.slug);
      if (!point) {
        const [x,y] = project(city.lat,city.lon);
        point = element('a', {href:countryHref(countryCode(city)),'data-map-city':city.slug,'data-map-country':countryCode(city),class:'map-city',transform:`translate(${x.toFixed(2)},${y.toFixed(2)})`,tabindex:'-1'});
        point.append(element('circle',{r:7,class:'map-hit'}),element('circle',{r:3,class:'map-dot'}));
        this.nodes.set(city.slug,point);
      }
      fragment.append(point);
    }
    this.dots.replaceChildren(fragment);
    for (const [code,node] of this.lands) node.classList.toggle('has-cities',!!this.groups.get(code).visible.length);
    const code = this.country || (this.groups.has(this.initialCountry) ? this.initialCountry : countryCode(cities[0] || this.catalog[0] || {}));
    this.country = null;
    if (this.groups.has(code)) this.previewCountry(code,this.active);
    else this.clear();
  }
  previewCountry(code, slug = null) {
    const group = this.groups?.get(code);
    if (!group || (this.country === code && this.active === slug)) return;
    const changed = this.country !== code;
    this.country = code;
    this.active = slug;
    for (const [key,node] of this.lands) {
      node.classList.toggle('is-active',key===code);
      node.setAttribute('tabindex',key===code?'0':'-1');
    }
    if (!this.lands.has(code)) this.lands.values().next().value?.setAttribute('tabindex','0');
    for (const [key,node] of this.nodes) {
      node.classList.toggle('in-country',node.dataset.mapCountry===code);
      node.classList.toggle('is-active',key===slug);
    }
    this.sizePoints();
    this.svg.classList.add('has-country');
    this.picker.querySelector('select').value = code;
    const names = group.visible.slice(0,5).map(city=>city.name).join('、');
    this.caption.innerHTML = `<strong>${esc(group.name)}</strong><span>${names?esc(names)+(group.visible.length>5?` 等 ${group.visible.length} 城`:''):'当前筛选没有匹配城市'}</span>`;
    // Keep links and scroll stable when moving between city dots in one country.
    if (changed) {
      this.selection.innerHTML = renderCountryPreview(group,slug);
      this.selection.scrollTop = 0;
      this.announce(group);
    } else {
      for (const item of this.selection.querySelectorAll('li')) item.classList.toggle('is-active',item.querySelector('[data-map-locate]')?.dataset.mapLocate===slug);
    }
  }
  announce(group) {
    clearTimeout(this.announcement);
    this.announcement = setTimeout(()=>{
      const status = document.querySelector('#map-country-status');
      if (status) status.textContent = `${group.name}，已收录 ${group.cities.length} 座城市，本次筛选 ${group.visible.length} 座。`;
    },200);
  }
  highlight(slug) {
    const city = this.catalog.find(city=>city.slug===slug);
    if (city) this.previewCountry(countryCode(city),slug);
  }
  clear() {
    this.country = null;
    this.active = null;
    if (!this.ready) return;
    this.svg.classList.remove('has-country');
    for (const [index,node] of [...this.lands.values()].entries()) {node.classList.remove('is-active');node.setAttribute('tabindex',index===0?'0':'-1');}
    for (const node of this.nodes.values()) node.classList.remove('is-active','in-country');
    this.sizePoints();
    this.picker.querySelector('select').value = '';
    this.caption.innerHTML = '<strong>从国家，找到城市</strong><span>悬停预览，点击进入国家栏目</span>';
    this.selection.innerHTML = '<strong>想去哪个国家？</strong><p>在地图上悬停，或从下方选择国家，查看已收录的城市。</p><a class="map-country-open" href="/countries/">浏览全部国家与地区 ↗</a>';
  }
  frameCountry(code) {
    const cities = this.groups.get(code).cities.filter(located);
    let bounds;
    if (cities.length) {
      const points = cities.map(city=>project(city.lat,city.lon)), xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      bounds = {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    } else bounds = this.lands.get(code)?.getBBox();
    if (!bounds) return;
    const width = Math.min(1000,Math.max(180,bounds.width*1.5,bounds.height/0.48*1.5)), height=width*0.48;
    this.view = [Math.max(0,Math.min(1000-width,bounds.x+bounds.width/2-width/2)),Math.max(0,Math.min(480-height,bounds.y+bounds.height/2-height/2)),width,height];
    this.applyView();
  }
  zoom(factor) {
    const [x,y,w,h] = this.view, width=Math.max(125,Math.min(1000,w*factor)),height=width*0.48;
    this.view = [x+(w-width)/2,y+(h-height)/2,width,height];
    this.applyView();
  }
  reset() {this.view=[0,0,1000,480];this.applyView();}
  sizePoints() {
    const scale=this.view[2]/1000;
    for (const node of this.nodes.values()) {
      node.querySelector('.map-dot').setAttribute('r',(node.classList.contains('in-country')?4:3)*scale);
      node.querySelector('.map-hit').setAttribute('r',7*scale);
    }
  }
  applyView() {this.svg?.setAttribute('viewBox',this.view.map(n=>n.toFixed(1)).join(' '));this.sizePoints();}
}
