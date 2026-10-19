// Shared, deterministic scoring and OSM normalization; no network requests here.
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
export function climateComfort(month) {
 if (!Number.isFinite(month?.meanC)) return null;
 // 18–26°C is the comfortable band. Heat and rain add bounded penalties.
 const t=month.meanC,temperature=Math.max(18-t,0,t-26)*0.4;
 const heat=Number.isFinite(month.highC)?Math.max(0,month.highC-30)*0.15:0;
 const rain=Number.isFinite(month.rainMm)?Math.max(0,month.rainMm-100)/100:0;
 return Math.round(clamp(10-temperature-heat-Math.min(3,rain),0,10)*10)/10;
}
export function communityScore(stats) {
 if (!stats || !Number.isFinite(stats.coworking) || !Number.isFinite(stats.cafes) || stats.coworking<0 || stats.cafes<0) return null;
 // Same 5 km radius everywhere. Coworking has more signal than generic cafés.
 return Math.round((7*clamp(Math.log1p(stats.coworking)/Math.log(21),0,1)+3*clamp(Math.log1p(stats.cafes)/Math.log(201),0,1))*10)/10;
}
export const comparableMetric=(key,a,b)=>key!=='community'||communityScore(a?.communityPlaces)!==null&&communityScore(b?.communityPlaces)!==null;
export function communitySource(city){
 if(communityScore(city?.communityPlaces)!==null)return {kind:'osm',label:'OSM 场所密度',date:city.communityPlaces.checkedAt||''};
 return Number.isFinite(city?.scores?.community)?{kind:'legacy',label:'历史社区标签 · 地点待采集',date:''}:{kind:'missing',label:'氛围资料待补',date:''};
}
export function distanceM(a,b) {
 const rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
 const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function normalizePlaces(elements,center,radiusM=5000) {
 const places=[],ids=new Set();
 for (const element of elements) {
  const tags=element.tags||{},point=element.center||element;
  const kind=tags.office==='coworking'||tags.amenity==='coworking_space'?'coworking':tags.amenity==='cafe'?'cafe':null;
  if(!kind||!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||distanceM(center,point)>radiusM)continue;
  if(tags.access==='private'||tags.access==='no')continue;
  const id=element.type+'/'+element.id;
  if(ids.has(id))continue;ids.add(id);
  const name=tags['name:zh']||tags.name||tags['name:en']||'';
  // A shop may be represented by both a POI node and its building polygon.
  if(name&&places.some(p=>p.kind===kind&&p.name.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase()&&distanceM(p,point)<60))continue;
  places.push({id,kind,name:name.slice(0,180),lat:point.lat,lon:point.lon,distanceM:Math.round(distanceM(center,point)),website:tags.website||tags['contact:website']||null,openingHours:tags.opening_hours||null,internet:tags.internet_access||null,laptop:tags.laptop||null});
 }
 return places.sort((a,b)=>a.kind.localeCompare(b.kind)||a.distanceM-b.distanceM||a.id.localeCompare(b.id));
}
export function summarizePlaces(places,metadata) {
 return {...metadata,coworking:places.filter(p=>p.kind==='coworking').length,cafes:places.filter(p=>p.kind==='cafe').length,source:'OpenStreetMap / Overpass',license:'ODbL-1.0'};
}
