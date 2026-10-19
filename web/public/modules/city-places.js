// Leaflet is vendored locally; only visible map tiles use OSM's tile service.
import {esc} from './ranking.js';
const root=document.querySelector('[data-city-places]');
const safeWebsite=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
if(root){
 const stage=root.querySelector('.places-map'),list=root.querySelector('.places-list'),status=root.querySelector('[data-places-status]'),more=root.querySelector('[data-more-places]');
 let map,L,group,places=[],filter='all',limit=10,loaded=false,loading=false;
 const label=p=>p.name||(p.kind==='coworking'?'未命名共享办公':'未命名咖啡馆');
 const markers=new Map();
 function details(p){
  const website=safeWebsite(p.website);
  return `<strong>${esc(label(p))}</strong><p>${p.kind==='coworking'?'共享办公':'咖啡馆'} · 距城市坐标 ${(p.distanceM/1000).toFixed(1)} km</p>${p.openingHours?`<p>营业时间标注：${esc(p.openingHours)}</p>`:''}<p>${p.laptop==='no'?'标注不允许使用电脑':p.laptop==='yes'?'标注可使用电脑':'能否办公待确认'}</p><a href="https://www.openstreetmap.org/${esc(p.id)}" target="_blank" rel="noopener noreferrer">查看地点 ↗</a>${website?` · <a href="${esc(website)}" target="_blank" rel="noopener noreferrer">官网 ↗</a>`:''}`;
 }
 function render(){
  const shown=places.filter(p=>filter==='all'||p.kind===filter);
  if(map){group.clearLayers();markers.clear();
   for(const p of shown){
    const icon=L.divIcon({className:'place-marker '+p.kind,html:`<span aria-hidden="true">${p.kind==='coworking'?'W':'C'}</span>`,iconSize:[22,22],iconAnchor:[11,11]});
    // The paginated list provides keyboard access without thousands of tab stops.
    const marker=L.marker([p.lat,p.lon],{icon,title:label(p),alt:label(p),keyboard:false}).bindPopup(details(p)).addTo(group);markers.set(p.id,marker);
   }
  }
  list.innerHTML=shown.slice(0,limit).map(p=>`<article class="place-list-item"><span class="place-dot ${p.kind}" aria-hidden="true"></span><div><strong>${esc(label(p))}</strong><small>${p.kind==='coworking'?'共享办公':'咖啡馆'} · ${(p.distanceM/1000).toFixed(1)} km</small></div><button type="button" data-show-place="${esc(p.id)}" aria-label="在地图定位${esc(label(p))}">定位</button><a href="https://www.openstreetmap.org/${esc(p.id)}" target="_blank" rel="noopener noreferrer" aria-label="查看${esc(label(p))}的地点资料">资料 ↗</a></article>`).join('');
  more.hidden=shown.length<=limit;
  status.textContent=shown.length?`已标亮 ${shown.length} 处，列表显示 ${Math.min(limit,shown.length)} 处。`:'此分类暂无已采集地点；不代表当地没有。';
 }
 async function load(){
  if(loading||loaded)return;loading=true;stage.setAttribute('aria-busy','true');status.textContent='正在载入地图与地点…';
  try{
   await import(sitePath('/vendor/leaflet/leaflet.js'));L=window.L;
   const response=await fetch(sitePath('/places/'+encodeURIComponent(root.dataset.cityPlaces)+'.json'));
   if(response.ok){const data=await response.json();places=Array.isArray(data.places)?data.places:[];}else if(response.status!==404)throw new Error('地点读取失败');
   stage.replaceChildren();map=L.map(stage,{scrollWheelZoom:false}).setView([Number(root.dataset.lat),Number(root.dataset.lon)],13);
   L.tileLayer(sitePath('/map-tiles/{z}/{x}/{y}.png'),{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror',()=>{status.textContent='部分底图未载入，地点标记与列表仍可使用。';});
   map.zoomControl.setPosition('topright');group=L.layerGroup().addTo(map);loaded=true;render();stage.focus({preventScroll:true});
  }catch{
   if(map){map.remove();map=null;}stage.innerHTML='<button type="button" data-load-places>重新加载地图</button>';status.textContent='地图暂时未能载入，可重试或在 OpenStreetMap 打开。';
  }finally{loading=false;stage.setAttribute('aria-busy','false');}
 }
 root.addEventListener('click',async event=>{
  if(event.target.closest('[data-load-places]'))await load();
  const button=event.target.closest('[data-place-filter]');
  if(button){filter=button.dataset.placeFilter;limit=10;root.querySelectorAll('[data-place-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(!loaded)await load();else render();}
  const locate=event.target.closest('[data-show-place]');
  if(locate){const marker=markers.get(locate.dataset.showPlace);if(marker){map.setView(marker.getLatLng(),16);marker.openPopup();stage.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}}
  if(event.target.closest('[data-more-places]')){limit+=10;render();}
 });
}
import {sitePath} from './site-path.js';
