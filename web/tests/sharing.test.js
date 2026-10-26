import test from 'node:test';
import assert from 'node:assert/strict';
const model=await import('../public/modules/share-model.js').catch(()=>({}));
const fixture={slug:'chiang-mai',name:'清迈',nameEn:'Chiang Mai',country:'泰国',budget:850,budgetCheckedAt:'2025-02-01',photo:'/images/city-chiang-mai.webp',photoCredit:'Example / CC BY-SA 4.0',photoSource:'https://commons.wikimedia.org/wiki/Example',months:Array.from({length:12},(_,i)=>({month:i+1,meanC:i===10?22:null})),scores:{internet:10},visa:{label:'免签',detail:'旧资料待复核'}};
test('sharing has a real public content model',()=>assert.equal(typeof model.createShare,'function'));
test('public city URL strips all private and tracking fields while pinning the actual month',()=>{
 assert.equal(model.shareURL('https://roamorrow.com/nomads/cities/chiang-mai/?month=3&housing=9999&meeting=secret&utm_source=mail#budget',{kind:'city',month:11,base:'/nomads'}),'https://roamorrow.com/nomads/cities/chiang-mai/?month=11#budget');
});
test('ranking URLs preserve normalized weights and budget currency, never unknown private values',()=>{
 const url=new URL(model.shareURL('https://roamorrow.com/nomads/?budget=6000&budgetCurrency=CNY&w=20,10,5,3,70,2&personalQuote=private',{kind:'ranking',month:11,base:'/nomads'}));
 assert.equal(url.searchParams.get('w'),'20,10,5,3,70,2');assert.equal(url.searchParams.get('budgetCurrency'),'CNY');assert.equal(url.searchParams.get('month'),'11');assert.equal(url.searchParams.has('personalQuote'),false);
});
test('budget guides retain public scenarios but housing is explicitly opt-in',()=>{
 const input='https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/?nights=31&currency=CNY&housing=4321&tier=comfort&token=secret';
 const plain=new URL(model.shareURL(input,{kind:'guide'}));assert.equal(plain.searchParams.get('nights'),'31');assert.equal(plain.searchParams.has('housing'),false);assert.equal(plain.searchParams.has('token'),false);
 assert.equal(new URL(model.shareURL(input,{kind:'guide',includeHousing:true})).searchParams.get('housing'),'4321');
});
test('dangerous and credential-bearing URLs are rejected before becoming QR/text',()=>{
 for(const value of ['javascript:alert(1)','data:text/plain,private','https://user:password@example.com/'])assert.throws(()=>model.shareURL(value));
});
test('city fact units and dates survive and unavailable values never become zero',()=>{
 const card=model.cityShare(fixture,11,'https://roamorrow.com/nomads/cities/chiang-mai/');
 assert.equal(card.title,'清迈');assert.match(model.shareText(card),/850/);assert.match(model.shareText(card),/历史月参考/);assert.match(model.shareText(card),/2025-02-01/);assert.match(model.shareText(card),/22°C/);assert.match(model.shareText(card),/待复核/);
 const missing=model.cityShare({...fixture,budget:null,months:[]},11,'https://roamorrow.com/nomads/cities/chiang-mai/');assert.match(model.shareText(missing),/待补充/);assert.doesNotMatch(model.shareText(missing),/\$0|0°C/);
});
test('photos without attribution are not silently exported',()=>{
 assert.equal(model.cityShare({...fixture,photoCredit:null},11,'https://roamorrow.com/cities/chiang-mai/').photos.length,0);
});
test('ranking share is the actual preference result and fixes an implicit month',()=>{
 const card=model.rankingShare([fixture],{month:null,weights:{safety:30,cost:25,climate:15,life:5,internet:10,community:15},limit:40},'https://roamorrow.com/',11);
 assert.equal(new URL(card.url).searchParams.get('month'),'11');assert.equal(card.items[0].title,'清迈');assert.match(model.shareText(card),/11月/);
});
test('snapshot only carries declared properties and is deeply immutable',()=>{
 const input={title:'清迈',url:'https://roamorrow.com/cities/chiang-mai/',facts:[{label:'历史月参考',value:'待补充'}],personalQuote:'private',sources:[{title:'原资料',url:'https://example.com/',date:'2025-01-01'}]};
 const card=model.createShare(input);input.facts[0].value='changed';assert.equal(card.facts[0].value,'待补充');assert.equal(card.personalQuote,undefined);assert.equal(Object.isFrozen(card.facts[0]),true);
});
test('all five export formats have usable original pixel dimensions',()=>{
 assert.deepEqual(model.SHARE_FORMATS.map(({width,height})=>[width,height]),[[1080,1440],[1080,1080],[1080,1350],[1200,630],[1080,1920]]);
});
test('private answers have no fabricated public conversation link',()=>{
 const card=model.createShare({kind:'answer',title:'选城笔记',body:'明确选择的这一条回答。',url:null,caveats:['只分享所选回答。']});assert.equal(card.url,null);assert.doesNotMatch(model.shareText(card),/undefined|null|https?:/);
});
test('comparison keeps both cities and missing values without turning history into a winner',()=>{
 const card=model.comparisonShare([fixture,{...fixture,name:'槟城',slug:'penang',budget:null}],11,'https://roamorrow.com/compare/chiang-mai-vs-penang/?meeting=private');
 assert.equal(card.items.length,2);assert.match(card.items[1].detail,/待补充/);assert.doesNotMatch(card.url,/meeting/);assert.match(model.shareText(card),/历史/);
});
test('a comparison cannot omit the official do-not-travel warning of either city',()=>{
 const card=model.comparisonShare([{...fixture,name:'喀布尔',slug:'kabul',countryCode:'AF'},fixture],11,'https://roamorrow.com/nomads/compare/chiang-mai-vs-kabul/');assert.match(model.shareText(card),/暂勿前往/);assert.match(card.essentialCaveat,/暂勿前往/);
});
test('real-world long photo credits cannot block link and text sharing',()=>{
 const card=model.cityShare({...fixture,photoCredit:'完整摄影署名'.repeat(100)},11,'https://roamorrow.com/nomads/cities/chiang-mai/');assert.equal(card.photos[0].credit,'完整摄影署名'.repeat(100));assert.match(model.shareText(card),/完整摄影署名/);
});
test('ranking alias uses the mount root for its method source',()=>{
 const state={month:11,weights:{safety:30,cost:25,climate:15,life:5,internet:10,community:15},limit:40};assert.equal(model.rankingShare([],state,'https://roamorrow.com/nomads/cities/',11).sources[0].url,'https://roamorrow.com/nomads/about/');
});
