import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_WEIGHTS,PRESETS,customScore,parseState,rankCities,renderRow} from '../public/modules/ranking.js';
import {climateComfort,communityScore,normalizePlaces,summarizePlaces} from '../public/modules/places.js';
import {readFile} from 'node:fs/promises';
import {cityPlacesSection} from '../src/city-places.js';

const city = () => ({slug:'test',name:'测试',nameEn:'Test',countryCode:'TH',country:'泰国',region:'亚洲',budget:900,baseScore:99,scores:{safety:8,cost:1,climate:1,life:8,internet:8,community:8},visa:{code:'visa_free',label:'免签'},months:Array.from({length:12},(_,i)=>({month:i+1,status:'recommended',meanC:22,highC:26,rainMm:30}))});
test('the six defaults total 100 and leading presets dedicate exactly 60 percent',()=>{
 assert.deepEqual(DEFAULT_WEIGHTS,{safety:30,cost:25,climate:15,community:15,internet:10,life:5});
 for(const [preset,key] of [['budget','cost'],['internet','internet'],['safe','safety']]){
  assert.equal(PRESETS[preset].weights[key],60);assert.equal(Object.values(PRESETS[preset].weights).reduce((a,b)=>a+b,0),100);
 }
});
test('default scores recompute from budget and the selected month, never the legacy total',()=>{
 const a=city();a.months[0].meanC=-8;a.months[0].highC=-2;
 assert.ok(customScore(a,DEFAULT_WEIGHTS,7)>customScore(a,DEFAULT_WEIGHTS,1));
 const s=parseState(new URL('https://test/?month=7'));
 assert.ok(rankCities([a],s)[0].score<=10);
 assert.ok(customScore({...a,budget:600},DEFAULT_WEIGHTS,7)>customScore({...a,budget:2400},DEFAULT_WEIGHTS,7));
 assert.match(renderRow({...a,rank:1,score:8},s),/7月舒适度/);
});
test('comfort responds to heat, rain and cold without inventing missing weather',()=>{
 assert.equal(climateComfort({meanC:null}),null);
 assert.ok(climateComfort({meanC:23,highC:27,rainMm:30})>climateComfort({meanC:23,highC:36,rainMm:400}));
 assert.ok(climateComfort({meanC:23})>climateComfort({meanC:-8}));
 assert.equal(climateComfort({meanC:0}),2.8);
});
test('missing optional life data is omitted and disclosed, missing core safety is not zero',()=>{
 assert.ok(customScore({...city(),scores:{...city().scores,life:null}},DEFAULT_WEIGHTS,7)>0);
 assert.equal(customScore({...city(),scores:{...city().scores,safety:null}},DEFAULT_WEIGHTS,7),null);
});
test('OSM normalizes nodes, ways and relations, removes duplicate listings and out-of-radius features',()=>{
 const center={lat:18.79,lon:98.98};
 const raw=[{type:'node',id:1,...center,tags:{name:'Work',office:'coworking'}},{type:'way',id:2,center,tags:{name:'Work',office:'coworking',amenity:'coworking_space'}},{type:'node',id:3,lat:18.791,lon:98.98,tags:{name:'Cafe',amenity:'cafe'}},{type:'node',id:4,lat:0,lon:0,tags:{amenity:'cafe'}}];
 const places=normalizePlaces(raw,center,5000);
 assert.equal(places.length,2);assert.deepEqual(places.map(p=>p.kind).sort(),['cafe','coworking']);
 const stats=summarizePlaces(places,{checkedAt:'2026-10-19',radiusM:5000,...center});
 assert.equal(stats.coworking,1);assert.equal(stats.cafes,1);
 assert.ok(communityScore(stats)>0);assert.equal(communityScore(null),null);
 assert.equal(communityScore({...stats,coworking:0,cafes:0}),0);
 assert.ok(communityScore({...stats,coworking:10})>communityScore(stats));
 assert.ok(communityScore({...stats,coworking:1000,cafes:10000})<=10);
});
test('OSM counts replace the coarse historical community category in ranking',()=>{
 const weights={safety:0,cost:0,climate:0,life:0,internet:0,community:100};
 const a={...city(),communityPlaces:{coworking:10,cafes:80}},b={...city(),communityPlaces:{coworking:1,cafes:5}};
 assert.ok(customScore(a,weights,7)>customScore(b,weights,7));
});
test('published OSM counters match their complete place files, radius, dates and attribution',async()=>{
 const snapshots=JSON.parse(await readFile(new URL('../data/osm-community.json',import.meta.url),'utf8'));
 assert.ok(Object.keys(snapshots).length>0);
 for(const [slug,stats] of Object.entries(snapshots)){
  const file=JSON.parse(await readFile(new URL('../public/places/'+slug+'.json',import.meta.url),'utf8'));
  assert.equal(file.slug,slug);assert.equal(file.radiusM,5000);assert.match(file.checkedAt,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(file.license,'ODbL-1.0');assert.equal(new Set(file.places.map(p=>p.id)).size,file.places.length);
  assert.ok(file.places.every(p=>p.distanceM<=5000&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)));
  assert.equal(stats.coworking,file.places.filter(p=>p.kind==='coworking').length);
  assert.equal(stats.cafes,file.places.filter(p=>p.kind==='cafe').length);
 }
});
test('city maps expose category controls, provenance and missing coordinates explicitly',()=>{
 const html=cityPlacesSection({slug:'chiang-mai',name_zh:'清迈'});
 for(const token of ['data-place-filter="coworking"','data-place-filter="cafe"','OpenStreetMap contributors','采集于','地图','place'])assert.ok(html.includes(token));
 assert.match(cityPlacesSection({slug:'unknown',name_zh:'未知'}),/坐标待补充/);
});
