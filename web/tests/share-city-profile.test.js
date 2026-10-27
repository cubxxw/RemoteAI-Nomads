import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../public/modules/share-model.js';
import {layoutShare,prepareShareLayout} from '../public/modules/share-render.js';
import * as ui from '../public/modules/share-ui.js';
const city={slug:'pokhara',name:'博卡拉',nameEn:'Pokhara',country:'尼泊尔',countryCode:'NP',budget:450,budgetCurrency:'USD',budgetCheckedAt:'2026-10-17',why:'湖畔与雪山相遇',visa:{label:'落地签'},scores:{internet:8},months:[{month:10,meanC:21}]};
const url='https://roamorrow.com/nomads/cities/pokhara/?month=10';
const profile={schemaVersion:1,slug:'pokhara',name:'博卡拉',nameEn:'Pokhara',tagline:'安纳普尔纳山脚下的湖畔城市',tags:['湖畔城市','喜马拉雅','徒步门户','慢生活'],geography:[{label:'地理位置',value:'尼泊尔中部 · 甘达基省',note:'安纳普尔纳山脉南麓'}],statistics:[{label:'海拔',value:'约 822 米',note:'湖滨区域'}],landmarks:[{title:'费瓦湖',detail:'湖面倒映群山，沿湖步道连起码头与街区。'},{title:'世界和平塔',detail:'位于湖畔山丘，可俯瞰湖面与山城。'}],culture:[{label:'当地风味',value:'达尔巴特与莫莫'},{label:'城市日常',value:'湖畔茶馆、徒步与山地生活'}],sources:[{title:'尼泊尔旅游局',url:'https://ntb.gov.np/pokhara',date:'2026-10-27'}]};
const ctx={font:'',measureText(value){return {width:[...value].reduce((sum,char)=>sum+(char.charCodeAt(0)>255?1:.6),0)*Number(this.font.match(/(\d+)px/)?.[1]||36)};}};
function card(input=profile){return model.createShare({...model.cityShare(city,10,url),cityProfile:input});}
function bounded(layout){for(const page of layout.pages)for(const block of page.blocks){assert.ok(block.x>=0&&block.y>=0,JSON.stringify(block));assert.ok(block.x+block.width<=layout.width+1,JSON.stringify(block));assert.ok(block.y+block.height<=layout.height,JSON.stringify(block));}}
test('public city profiles are normalized, bounded, deeply frozen and tied to their city slug',()=>{
 assert.equal(typeof model.normalizeCityProfile,'function');
 const normalized=model.normalizeCityProfile({...profile,tagline:'山\u0000城',tags:[...profile.tags,'额外'],statistics:[{label:'缺失',value:'待补充'},...profile.statistics],sources:[{title:'坏地址',url:'javascript:alert(1)'},...profile.sources]},'pokhara');
 assert.equal(normalized.tagline,'山城');assert.equal(normalized.tags.length,4);assert.deepEqual(normalized.statistics,profile.statistics);assert.equal(normalized.sources.length,1);assert.ok(Object.isFrozen(normalized.landmarks[0]));
 assert.equal(model.normalizeCityProfile(profile,'kabul'),null);assert.equal(model.normalizeCityProfile({...profile,schemaVersion:3},'pokhara'),null);
 assert.equal(model.cityShare(city,10,url).citySlug,'pokhara');assert.equal(model.cityShare({...city,slug:'../private'},10,url).citySlug,'');
});
test('a city profile exports a real hero and every compact information section in one portrait',()=>{
 const input=card(),layout=layoutShare(ctx,input,model.SHARE_FORMATS[0],{photo:true});bounded(layout);assert.equal(layout.pages.length,1);
 const blocks=layout.pages[0].blocks,all=blocks.map(b=>b.text||'').join('');
 assert.ok(blocks.find(b=>b.type==='photo').height>=340);for(const value of ['Pokhara','安纳普尔纳山脚下的湖畔城市','地理位置','约 822 米','费瓦湖','世界和平塔','达尔巴特与莫莫'])assert.ok(all.includes(value),value);
 assert.equal(blocks.filter(b=>b.type==='chip').length,4);assert.ok(blocks.some(b=>b.type==='qr'));assert.doesNotMatch(all,/待补|资料日期待核对|网络旧评分/);
 const caption=model.shareText(input);for(const value of ['安纳普尔纳山脚下的湖畔城市','尼泊尔中部','约 822 米','世界和平塔','达尔巴特与莫莫','https://ntb.gov.np/pokhara','2026-10-27','工作许可另查'])assert.ok(caption.includes(value),value);
});
test('empty or partial city profiles omit unavailable optional numbers and keep existing verified context',()=>{
 for(const input of [card({...profile,statistics:[],landmarks:[],culture:[],geography:[]}),model.cityShare({...city,budget:null,visa:null,scores:null,months:[]},10,url)]){
  assert.doesNotMatch(model.shareText(input),/待补/);
  for(const textOnly of [true,false]){const {layout}=prepareShareLayout(ctx,input,model.SHARE_FORMATS[0],{photo:!textOnly,textOnly});bounded(layout);const all=layout.pages.flatMap(p=>p.blocks).map(b=>b.text||'').join('');assert.doesNotMatch(all,/待补|GDP|人口|网络旧评分/);assert.ok(all.includes('Pokhara'));}
 }
});
test('compact country metadata keeps full scope notes in the caption and does not crowd out numeric facts',()=>{
 const input=card({...profile,geography:[{label:'国家 / 地区',value:'尼泊尔'},{label:'地理坐标',value:'28.27°N / 83.97°E',note:'城市参考点；不代表行政边界'},{label:'地理位置',value:'甘达基省 · 安纳普尔纳山脉南麓'}],statistics:[{label:'官方语言',value:'尼泊尔语',note:'国家或地区口径；不表示全体居民的日常用语'},{label:'货币',value:'尼泊尔卢比 NPR',note:'国家或地区流通货币'},{label:'时区',value:'Asia/Kathmandu',note:'夏令时以当地当日为准'},...profile.statistics]});
 const layout=layoutShare(ctx,input,model.SHARE_FORMATS[0],{photo:true,qrSize:168});bounded(layout);assert.equal(layout.pages.length,1);
 const blocks=layout.pages.flatMap(p=>p.blocks);assert.ok(blocks.some(b=>b.role==='profile-metadata'&&b.text.includes('尼泊尔语')));assert.ok(blocks.some(b=>b.role==='fact-value'&&b.text==='约 822 米'));assert.match(model.shareText(input),/国家或地区口径；不表示全体居民的日常用语/);assert.match(model.shareText(input),/城市参考点；不代表行政边界/);
});
test('a scoped population note and two culture rows stay together instead of creating a nearly empty continuation',()=>{
 const input=card({...profile,tagline:'费瓦湖畔，抬头是安纳普尔纳群峰',geography:[{label:'国家 / 地区',value:'尼泊尔'},{label:'地理坐标',value:'28.27°N / 83.97°E'},{label:'地理位置',value:'尼泊尔中部，安纳普尔纳山麓的博卡拉谷地'}],statistics:[{label:'官方语言',value:'尼泊尔语'},{label:'货币',value:'尼泊尔卢比 NPR'},{label:'时区',value:'Asia/Kathmandu'},{label:'人口',value:'约 51.35 万',note:'2021 年人口普查；博卡拉大都市行政区，含城郊 33 个 ward；不等同于湖滨城区'}],landmarks:[{title:'费瓦湖 Phewa Lake',detail:'湖面映着鱼尾峰，湖滨是博卡拉的日常风景'},{title:'世界和平塔',detail:'费瓦湖南侧山丘上的佛塔，可眺望安纳普尔纳群峰'}],culture:[{label:'地方生活',value:'古老印藏商路上的山地城市，周边保留古隆族和马嘉族文化'},{label:'山间茶屋',value:'塔卡利人经营的茶屋，串起安纳普尔纳徒步路线'}]});
 const layout=layoutShare(ctx,input,model.SHARE_FORMATS[0],{photo:true,qrSize:168});bounded(layout);assert.equal(layout.pages.length,1);assert.ok(layout.pages[0].blocks.find(b=>b.type==='photo').height>=260);
 const all=layout.pages[0].blocks.map(b=>b.text||'').join('');for(const value of ['2021 年人口普查','不等同于湖滨城区','古隆族和马嘉族文化','塔卡利人经营的茶屋'])assert.ok(all.includes(value),value);
 const scope=layout.pages[0].blocks.filter(b=>b.role==='fact-scope');assert.ok(scope.length);assert.ok(scope.every(b=>b.width===976&&b.size>=20));assert.ok(scope.map(b=>b.text).join('').includes('2021 年人口普查；博卡拉大都市行政区，含城郊 33 个 ward；不等同于湖滨城区'));
});
test('core values measure with their final weight, fit their columns and retain a clear gutter',()=>{
 const measured={font:'',measureText(value){const size=Number(this.font.match(/(\d+)px/)?.[1]||36),weight=Number(this.font.split(' ')[0])||400;return {width:[...value].length*size*(weight>=500?1.1:.8)};}};
 const input=card({...profile,statistics:[{label:'人口',value:'约 123.45 万'}],landmarks:[],culture:[]}),layout=layoutShare(measured,input,model.SHARE_FORMATS[0],{photo:true,qrSize:168});bounded(layout);
 const values=layout.pages.flatMap(p=>p.blocks).filter(b=>b.role==='fact-value');for(const b of values){measured.font=`${b.weight} ${b.size}px Inter`;assert.ok(measured.measureText(b.text).width<=b.width);assert.ok(b.size>=30);}
 assert.ok(values[0].size<36);const columns=[...new Set(values.map(b=>b.x))].sort((a,b)=>a-b);assert.ok(columns[1]-(columns[0]+values[0].width)>=48-1e-6);
});
test('language metadata retains its explicit country or region scope in the exported image',()=>{
 const note='国家或地区口径；Unicode CLDR，不表示全体居民的日常用语',input=card({...profile,statistics:[{label:'官方语言',value:'印地语、英语',note}]});
 const layout=layoutShare(ctx,input,model.SHARE_FORMATS[0],{photo:true,qrSize:168}),all=layout.pages.flatMap(p=>p.blocks).map(b=>b.text||'').join('');
 assert.match(all,/国家\/地区语言 \/ 印地语、英语/);assert.doesNotMatch(all,/官方语言 \/ 印地语、英语/);assert.match(model.shareText(input),new RegExp(note));bounded(layout);
 const local=card({...profile,statistics:[{label:'官方语言',value:'本地已核实语言',note:'城市政府公布的本市行政用语'}]}),localText=layoutShare(ctx,local,model.SHARE_FORMATS[0]).pages.flatMap(p=>p.blocks).map(b=>b.text||'').join('');assert.match(localText,/官方语言 \/ 本地已核实语言/);
});
test('long public city profiles continue without clipping or losing content across every format',()=>{
 const long=card({...profile,tagline:'与雪山相伴的湖畔城市。'.repeat(8),geography:[{label:'地理位置',value:'地理说明'.repeat(50),note:'附注'.repeat(60)}],statistics:[{label:'海拔',value:'已核实说明'.repeat(40)}],landmarks:[{title:'费瓦湖',detail:'完整地标描述。'.repeat(45)},{title:'世界和平塔',detail:'第二处地标。'.repeat(45)}],culture:[{label:'当地风味',value:'完整饮食说明。'.repeat(30)}]});
 for(const format of model.SHARE_FORMATS){const layout=layoutShare(ctx,long,format,{photo:true});bounded(layout);assert.ok(layout.pages.length>1);const all=layout.pages.flatMap(p=>p.blocks).filter(b=>b.role==='profile-detail').map(b=>b.text).join('');assert.ok(all.includes('完整地标描述。'.repeat(45)));assert.ok(all.includes('完整饮食说明。'.repeat(30)));assert.ok(layout.pages.every(p=>p.blocks.some(b=>b.type==='qr')));}
});
test('official advisories repeat on every city continuation and private cards retain their own facts',()=>{
 const input=model.createShare({...model.cityShare({...city,countryCode:'AF',slug:'kabul',name:'喀布尔'},10,url),cityProfile:{...profile,slug:'kabul',name:'喀布尔',landmarks:[{title:'公开地标',detail:'完整描述。'.repeat(90)}]}});
 const layout=layoutShare(ctx,input,model.SHARE_FORMATS[0],{photo:true});bounded(layout);assert.ok(layout.pages.length>1);for(const page of layout.pages)assert.match(page.blocks.map(b=>b.text||'').join(''),/官方暂勿前往提醒/);
 const personal=model.personalShare(card(),{facts:[{label:'个人预算',value:'¥4321',note:'本人填写'}],body:'我填写的住处'});assert.equal(personal.private,true);const personalLayout=layoutShare(ctx,personal,model.SHARE_FORMATS[0]);assert.match(personalLayout.pages.flatMap(p=>p.blocks).map(b=>b.text||'').join(''),/¥4321/);assert.doesNotMatch(personal.url,/4321/);
});
test('the lazy profile loader fetches only the requested mounted public JSON and falls back safely',async()=>{
 assert.equal(typeof ui.loadCityShareProfile,'function');const original=globalThis.document;globalThis.document={documentElement:{dataset:{nomadsBase:'/nomads'}}};
 try{let path;const input=model.cityShare(city,10,url),loaded=await ui.loadCityShareProfile(input,{fetcher:async value=>{path=value;return {ok:true,text:async()=>JSON.stringify(profile)};}});assert.equal(path,'/nomads/city-profiles/pokhara.json');assert.equal(loaded.cityProfile.landmarks[0].title,'费瓦湖');assert.equal(await ui.loadCityShareProfile(input,{fetcher:async()=>({ok:false})}),input);assert.equal(await ui.loadCityShareProfile(input,{fetcher:async()=>({ok:true,text:async()=>JSON.stringify({...profile,slug:'kabul'})})}),input);const controller=new AbortController();controller.abort();await assert.rejects(ui.loadCityShareProfile(input,{signal:controller.signal}),{name:'AbortError'});}
 finally{globalThis.document=original;}
});
test('a profile fetch aborted after it starts cannot enrich a stale share and private shares never fetch',async()=>{
 const input=model.cityShare(city,10,url),controller=new AbortController();let finish;
 const pending=ui.loadCityShareProfile(input,{signal:controller.signal,fetcher:async()=>{await new Promise(resolve=>finish=resolve);return {ok:true,text:async()=>JSON.stringify(profile)};}});
 controller.abort();finish();await assert.rejects(pending,{name:'AbortError'});assert.equal(input.cityProfile.landmarks.length,0);
 const personal=model.personalShare(input,{body:'个人填写'});let called=false;assert.equal(await ui.loadCityShareProfile(personal,{fetcher:async()=>{called=true;throw Error('should not fetch');}}),personal);assert.equal(called,false);
});
