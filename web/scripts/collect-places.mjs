// Explicit maintenance command, never a page-view request. Public OSM data only.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizePlaces,summarizePlaces} from '../public/modules/places.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(await readFile(root+'public/published-pages/rankings.json','utf8'));
const selected=process.argv.find(a=>a.startsWith('--slugs='))?.slice(8).split(',');
const batchSize=Number(process.argv.find(a=>a.startsWith('--batch='))?.slice(8)||6);
const concurrency=Number(process.argv.find(a=>a.startsWith('--concurrency='))?.slice(14)||1);
if(!Number.isInteger(batchSize)||batchSize<1||batchSize>12||![1,2].includes(concurrency))throw new Error('Use --batch=1..12 and --concurrency=1..2');
const endpoints=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
let summaries={};try{summaries=JSON.parse(await readFile(root+'data/osm-community.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(root+'public/places',{recursive:true});
const cities=catalog.filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&(!selected||selected.includes(c.slug))&&!summaries[c.slug]);
const radiusM=5000,checkedAt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let next=0,saving=Promise.resolve();
async function collect(){while(next<cities.length){
 const index=next;next+=batchSize;
 const batch=cities.slice(index,index+batchSize);
 const selectors=batch.flatMap(c=>['[office=coworking]','[amenity=coworking_space]','[amenity=cafe]'].map(tag=>`nwr${tag}(around:${radiusM},${c.lat},${c.lon});`));
 const query=`[out:json][timeout:60];(${selectors.join('')});out center tags;`;
 let payload,endpoint;
 for(const candidate of endpoints){
  try{
   const response=await fetch(candidate,{method:'POST',body:new URLSearchParams({data:query}),headers:{'User-Agent':'RemoteAI-Nomads/1.0 (https://github.com/cubxxw/RemoteAI-Nomads)'},signal:AbortSignal.timeout(75000)});
   if([429,406].includes(response.status))await new Promise(resolve=>setTimeout(resolve,30000));
   if(!response.ok)throw new Error('HTTP '+response.status);
   payload=await response.json();if(payload.remark||!Array.isArray(payload.elements))throw new Error(payload.remark||'Invalid OSM response');endpoint=candidate;break;
  }catch(error){console.error(candidate+': '+error.message);}
 }
 if(!payload?.elements||payload.remark){console.error('Preserved previous snapshots; batch failed: '+batch.map(c=>c.slug));continue;}
 for(const city of batch){
  const center={lat:city.lat,lon:city.lon},places=normalizePlaces(payload.elements,center,radiusM);
  const stats=summarizePlaces(places,{checkedAt,radiusM,...center,endpoint,osmBase:payload.osm3s?.timestamp_osm_base||null});
  await writeFile(root+'public/places/'+city.slug+'.json',JSON.stringify({slug:city.slug,...stats,places})+'\n');
  summaries[city.slug]=stats;
  console.log(city.slug+': '+stats.coworking+' coworking, '+stats.cafes+' cafes');
 }
 saving=saving.then(async()=>{
  const target=root+'data/osm-community.json';
  await writeFile(target+'.tmp',JSON.stringify(Object.fromEntries(Object.entries(summaries).sort()),null,2)+'\n');
  await rename(target+'.tmp',target);
 });
 await saving;
}}
// At most two concurrent requests, within the public service's modest-use limit.
await Promise.all(Array.from({length:concurrency},()=>collect()));
console.log('OSM snapshots: '+Object.keys(summaries).length+'/'+catalog.length);
