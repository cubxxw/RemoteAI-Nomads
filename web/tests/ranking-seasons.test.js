import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRow, parseState} from '../public/modules/ranking.js';

const fixture = () => ({
  slug:'chiang-mai',name:'清迈',nameEn:'Chiang Mai',country:'泰国',countryCode:'TH',
  budget:850,budgetBasis:'历史估算',photo:null,why:'山城',rank:1,score:8.4,
  scores:{safety:9,life:9,internet:10,community:8},visa:{label:'免签',detail:'原资料待复核'},
  months:Array.from({length:12},(_,i)=>({month:i+1,status:[1,11,12].includes(i+1)?'recommended':'unknown',meanC:i===9?27.61:22.3})),
});
const state = parseState(new URL('https://nomads.test/?month=10'));

test('city cards explain recommended months and selected-month temperature without decoding a chart',()=>{
  const html=renderRow(fixture(),state);
  assert.match(html,/1月、11—12月/);
  assert.match(html,/10月历史均温/);
  assert.match(html,/27\.6\s*(?:<[^>]+>)*°C/);
  assert.doesNotMatch(html,/class="month-band"|class="month-mark/);
  assert.match(html,/href="\/cities\/chiang-mai\/\?month=10#season"/);
});

test('the temperature follows the selected month independently of legacy recommended-month labels',()=>{
  const html=renderRow(fixture(),{...state,month:1});
  assert.match(html,/1月历史均温/);
  assert.match(html,/22\.3\s*(?:<[^>]+>)*°C/);
  assert.doesNotMatch(html,/27\.6/);
  assert.match(html,/1月、11—12月/);
});

test('missing climate is explicit while a real zero-degree mean remains a number',()=>{
  const city=fixture();city.months[9].meanC=null;
  const missing=renderRow(city,state);
  assert.match(missing,/data-season-temperature>资料待补/);
  city.months[9].meanC=0;
  const zero=renderRow(city,state);
  assert.match(zero,/data-season-temperature>0\.0\s*(?:<[^>]+>)*°C/);
});

test('the annual table preserves missing records and never infers suitability from temperature',async()=>{
  const seasons=await import('../public/modules/ranking-seasons.js').catch(()=>({}));
  assert.equal(typeof seasons.renderAnnualSeasons,'function');
  const city=fixture();city.name='<img onerror="unsafe">';city.months[9].meanC=null;city.months[1].status='caution';
  const html=seasons.renderAnnualSeasons(city,10);
  assert.equal((html.match(/<tr\b/g)||[]).length,13);
  assert.match(html,/10月[\s\S]*?资料待补/);
  assert.match(html,/2月<\/th><td>22\.3°C<\/td><td[^>]*>需留意/);
  assert.match(html,/3月<\/th><td>22\.3°C<\/td><td[^>]*>未标注/);
  assert.doesNotMatch(html,/<img onerror/);
});

test('month ranges sort and merge only adjacent recommendation records, with an honest empty state',async()=>{
  const seasons=await import('../public/modules/ranking-seasons.js').catch(()=>({}));
  assert.equal(typeof seasons.recommendedMonthRanges,'function');
  assert.equal(seasons.recommendedMonthRanges([{month:12,status:'recommended'},{month:1,status:'recommended'},{month:11,status:'recommended'}]),'1月、11—12月');
  assert.equal(seasons.recommendedMonthRanges([{month:1,status:'unknown',meanC:24}]),'资料待补');
  assert.equal(seasons.recommendedMonthRanges(Array.from({length:12},(_,i)=>({month:i+1,status:'recommended'}))),'1—12月');
});

test('an unsupported dialog leaves the city link usable on every click',async()=>{
  const {installRankingSeasons}=await import('../public/modules/ranking-seasons.js');
  let handle,prevented=0;
  const root={ownerDocument:{createElement:()=>({})},addEventListener(type,fn){handle=fn;}};
  installRankingSeasons(root,()=>fixture(),()=>10);
  const link={dataset:{openSeason:'chiang-mai'}};
  const event={target:{closest:()=>link},button:0,preventDefault(){prevented++;}};
  assert.doesNotThrow(()=>{handle(event);handle(event);});
  assert.equal(prevented,0,'ordinary navigation must survive repeated clicks without native dialog support');
});
