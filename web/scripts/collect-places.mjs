// Explicit maintenance command, never a page-view request. Public OSM data only.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizePlaces,summarizePlaces} from '../public/modules/places.js';
import {selectPlaceCities} from './place-selection.mjs';
import {fetchPlaceBatch} from './place-fetch.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(await readFile(root+'public/published-pages/rankings.json','utf8'));
const selected=process.argv.find(a=>a.startsWith('--slugs='))?.slice(8).split(',');
const batchSize=Number(process.argv.find(a=>a.startsWith('--batch='))?.slice(8)||6);
const concurrency=Number(process.argv.find(a=>a.startsWith('--concurrency='))?.slice(14)||1);
if(!Number.isInteger(batchSize)||batchSize<1||batchSize>12||![1,2].includes(concurrency))throw new Error('Use --batch=1..12 and --concurrency=1..2');
const endpoints=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
let summaries={};try{summaries=JSON.parse(await readFile(root+'data/osm-community.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(root+'public/places',{recursive:true});
const cities=selectPlaceCities(catalog,summaries,{selected,refresh:process.argv.includes('--refresh')});
const radiusM=5000,checkedAt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let next=0,saving=Promise.resolve();
const failed=[];
async function collect(){while(next<cities.length){
 const index=next;next+=batchSize;
 const batch=cities.slice(index,index+batchSize);
 const selectors=batch.flatMap(c=>['[office=coworking]','[amenity=coworking_space]','[amenity=cafe]'].map(tag=>`nwr${tag}(around:${radiusM},${c.lat},${c.lon});`));
 const query=`[out:json][timeout:60];(${selectors.join('')});out center tags;`;
 let payload,endpoint;
 try { ({payload,endpoint}=await fetchPlaceBatch(endpoints,query,{onError:message=>console.error(message)})); }
 catch { /* The batch is marked failed below; no writer sees rejected data. */ }
 if(!payload?.elements||payload.remark){failed.push(...batch.map(c=>c.slug));console.error('Preserved previous snapshots; batch failed: '+batch.map(c=>c.slug));continue;}
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
if(failed.length){console.error('Failed cities: '+failed.join(','));process.exitCode=1;}
