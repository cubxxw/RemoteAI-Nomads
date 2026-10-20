import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCityPage, cityCostModel, climateChart } from '../src/city-page.js';
import { planBudget, meetingTime, monthValues, formatAmount, timeDifference } from '../public/modules/city-ui.js';
import { shell } from '../src/render.js';

const city = {
  id:'city:test', slug:'test-place', name_zh:'测试城市', name_en:'Test Place', country_id:'JP', country_name:'日本', region:'亚洲',
  summary:'城市的简短介绍。', caveat:'先验证真实工作日。', publication_status:'draft', checked_at:'2026-10-18',
  budget_amount:850, budget_currency:'USD', budget_basis:'历史口径未统一', budgetSource:{url:'https://example.com/legacy'},
  photo_url:'/images/city-tokyo.webp', photo_credit:'作者', photo_source:'https://example.com/photo',
  months:[{month:10,suitability:'unknown',evidence_note:''}], climate:[{month:10,mean_c:null,high_c:null,rain_mm:0,source_url:'https://example.com/climate',checked_at:'2026-10-18'}],
  quotes:[], visas:[], ai:[], ranking:{internet:null,safety:0}, location:{timezone:'Asia/Tokyo'}, entry:{label:'需签证',detail:'按个人资格确认。'},
  costs:{observations:[{scope:'national',label:'消费支出',field:'total_consumption',category:'total',amount:173042,currency:'JPY',period:'month',unit:'month',household_size:1,conversion:{amount:7700,currency:'CNY'},observed_at:'2025-12-31'}],sources:[],fx:{USD:{rate:6.68,date:'2026-10-16'},JPY:{rate:0.0445,date:'2026-10-16'}},limitations:[]},
};

test('requested month is rendered before JavaScript and official resource checks appear in the city flow',()=>{
  const thai=renderCityPage({...city,country_id:'TH'},{},{date:'2026-10-19',month:12}).body;
  assert.match(thai,/option value="12" selected/);
  assert.match(thai,/thaiembbeij.org\/th\/news\/updateofvisaexemption/);
  assert.match(renderCityPage({...city,slug:'lisbon'},{},{date:'2026-10-19'}).body,/Second Home Mercado/);
});

test('domestic city entry copy asks about check-in documents without implying foreign work permits',()=>{
  const page=renderCityPage({...city,country_id:'CN',entry:{label:'境内',evidence_level:'legacy',detail:'原记录标签，尚未逐项复核；停留条件与合法远程工作需分别确认。',source_url:'https://example.com/check-in',checked_at:'2026-10-18'}},{},{date:'2026-10-20'});
  const entry=page.body.match(/<section class="city-section" id="entry"[\s\S]*?<\/section>/)?.[0];
  assert.ok(entry);
  assert.match(entry,/证件|入住登记/);
  assert.match(entry,/中国大陆居民/);
  assert.doesNotMatch(entry,/远程工作许可|远程工作签证|能住多久/);
  assert.match(entry,/https:\/\/example.com\/check-in/);
  assert.match(entry,/2026-10-18/);
});

test('user budget uses explicit inputs and reports omitted expenses', () => {
  assert.deepEqual(planBudget({rent:'',food:'',other:'',days:30}), {amount:null,error:false,missing:['房租','餐费','其他开销']});
  assert.deepEqual(planBudget({rent:'3000',food:'100',other:'600',days:15}), {amount:3300,error:false,missing:[]});
  assert.deepEqual(planBudget({rent:'0',food:'100',other:'',days:10}), {amount:1000,error:false,missing:['其他开销']});
  assert.equal(planBudget({rent:'-1',days:30}).error,true);
  assert.equal(planBudget({rent:3000,days:366}).error,true);
});

test('meeting converter handles destination summer time and date rollover', () => {
  assert.deepEqual(meetingTime('2027-01-15',9,'Europe/Lisbon'),{date:'2027-01-15',time:'01:00'});
  assert.deepEqual(meetingTime('2027-07-15',9,'Europe/Lisbon'),{date:'2027-07-15',time:'02:00'});
  assert.deepEqual(meetingTime('2027-01-15',1,'America/New_York'),{date:'2027-01-14',time:'12:00'});
  assert.equal(meetingTime('2027-02-30',9,'Asia/Tokyo'),null);
  assert.equal(meetingTime('2027-01-15',9,'unknown-zone'),null);
});

test('missing climate remains unknown while observed zero rain stays zero', () => {
  assert.equal(monthValues(city,10).mean,null);
  assert.equal(monthValues(city,10).rain,0);
  assert.equal(monthValues(city,11).rain,null);
  const chart=climateChart(city.climate,10);
  assert.ok(!chart.includes('NaN'));
  assert.ok(!chart.includes('Infinity'));
  assert.match(chart,/chart-missing/);
});

test('cost rates convert from display CNY without turning national data into city costs', () => {
  const model=cityCostModel(city.costs);
  assert.equal(model.rates.USD.rate,1/6.68);
  assert.equal(model.items.filter(row=>row.scope==='city').length,0);
  assert.equal(model.items[0].scope,'national');
  assert.ok(!('monthly' in model));
  assert.equal(formatAmount(null),'待补充');
  assert.equal(formatAmount(0,'CNY'),'¥0');
});

test('national housing and actual rent spending never become a city rent adoption action', () => {
  const observations = [
    {scope:'national',provider:'estat',category:'housing',field:'housing',label:'住房支出',amount:21667,currency:'JPY',period:'month',unit:'JPY/单身家庭/月',quality:'official_reference',quality_flags:['includes_owner_occupiers'],conversion:{amount:964.18,currency:'CNY'}},
    {scope:'national',provider:'estat',category:'housing',field:'actual_rent_spend',label:'实际房租支出',amount:17606,currency:'JPY',period:'month',unit:'JPY/单身家庭/月',quality:'official_reference',quality_flags:['includes_owner_occupiers'],conversion:{amount:783.47,currency:'CNY'}},
  ];
  const page=renderCityPage({...city,costs:{...city.costs,observations}},{},{date:'2026-10-18'});
  assert.match(page.body,/住房支出/);
  assert.match(page.body,/实际房租支出/);
  assert.ok(!page.body.includes('data-budget-fill='));
  assert.ok(!page.body.includes('JPY/单身家庭/月'));
  assert.match(page.body,/\/ 单身家庭 \/ 月/);
});

test('only an eligible city monthly asking rent can be adopted, while reviewed prices remain readable', () => {
  const rent={scope:'city',provider:'costcompass',category:'housing',field:'housing_1br_center',label:'1BR Apartment (city-wide)',amount:446.81,currency:'USD',period:'month',unit:'month',quality:'sample',quality_flags:['asking_rent'],conversion:{amount:2987.47,currency:'CNY'}};
  const observations=[
    rent,
    {...rent,field:'housing_1br_outside',amount:38.19,quality:'review',conversion:{amount:255.35,currency:'CNY'}},
    {...rent,field:'housing_3br_center',quality_flags:['asking_rent','rent_outlier_requires_review'],conversion:{amount:266,currency:'CNY'}},
    {...rent,provider:'estat',conversion:{amount:300,currency:'CNY'}},
    {...rent,period:'day',conversion:{amount:100,currency:'CNY'}},
    {...rent,field:'housing',conversion:{amount:400,currency:'CNY'}},
    {...rent,quality_flags:[],conversion:{amount:500,currency:'CNY'}},
    {...rent,conversion:null},
  ];
  const page=renderCityPage({...city,costs:{...city.costs,observations}},{},{date:'2026-10-18'});
  const fillAmounts=[...page.body.matchAll(/data-budget-fill="([^"]+)"/g)].map(match=>Number(match[1]));
  assert.deepEqual(fillAmounts,[2987.47]);
  assert.match(page.body,/样本待复核/);
  assert.match(page.body,/估算.*实际短租报价要重新问/);
  assert.match(page.body,/id="budget-rent"[^>]*data-budget-input/);
});

test('SSR city guide keeps sources, scopes, unknowns, calendar and draft SEO readable', () => {
  const page=renderCityPage(city,{SITE_ORIGIN:'https://nomads.example/'},{date:'2026-10-18'});
  assert.match(page.body,/这座城市的分项价格还没收录/);
  assert.match(page.body,/没有适合自动填入的报价，可自行填写/);
  assert.match(page.body,/日本全国单身家庭月均支出/);
  assert.match(page.body,/不能当作测试城市的租房总预算/);
  assert.match(page.body,/未填项未计入/);
  assert.match(page.body,/旧资料月成本/);
  assert.match(page.body,/data-month-temperature>待补充/);
  assert.match(page.body,/data-month-rain>0 mm/);
  assert.match(page.body,/data-meeting-time[^>]*>10:00/);
  const document=shell({...page,env:{PREVIEW:'false',SITE_ORIGIN:'https://nomads.example'}});
  assert.match(document,/noindex,follow/);
  assert.match(document,/<link rel="canonical" href="https:\/\/nomads.example\/cities\/test-place\/">/);
  assert.match(document,/"@type":"Place"/);
});

test('untrusted source text cannot break out of markup or embedded city data', () => {
  const page=renderCityPage({...city,name_zh:'</script><img src=x onerror=evil()>',months:[{month:10,suitability:'unknown',evidence_note:'</script><script>evil()</script>'}]},{},{date:'2026-10-18'});
  assert.ok(!page.body.includes('</script><script>evil()'));
  assert.match(page.body,/\\u003c\/script>/);
  assert.match(page.body,/&lt;img/);
});


test('consumer references and prefilled monthly overview precede the closed quote adjustment', () => {
  const rent={scope:'city',provider:'costcompass',category:'housing',field:'housing_1br_center',label:'1BR city-wide',amount:500,currency:'USD',period:'month',unit:'month',quality:'sample',quality_flags:['asking_rent'],conversion:{amount:3300,currency:'CNY'}};
  const observations=[rent,{...rent,category:'food',field:'food_rice_1kg',label:'Rice',period:'item',quality_flags:[]}];
  const html=renderCityPage({...city,costs:{...city.costs,observations}},{},{date:'2026-10-18'}).body;
  assert.ok(html.indexOf('data-traveler-overview') < html.indexOf('id="budget-rent"'));
  assert.ok(html.indexOf('data-budget-fill=') < html.indexOf('id="budget-rent"'));
  assert.match(html,/<details id="budget-adjustment"[^>]*><summary/);
  assert.ok(!/<details id="budget-adjustment"[^>]*\bopen/.test(html));
  assert.match(html,/按我的报价调整/);assert.match(html,/id="budget-rent"[^>]*value="3300"/);
  assert.match(html, /<details class="city-disclosure city-price-category"><summary>日常食品/);
  assert.ok(!html.includes('class="city-disclosure city-price-category" open'));
  assert.match(html,/已知开销小计/);assert.match(html,/待补/);
});

test('readable Beijing time differences account for DST, fractional offsets and date boundaries', () => {
  assert.equal(timeDifference('2026-10-18', 'Asia/Bangkok'), '比北京慢 1 小时');
  assert.equal(timeDifference('2026-01-18', 'Europe/Lisbon'), '比北京慢 8 小时');
  assert.equal(timeDifference('2026-07-18', 'Europe/Lisbon'), '比北京慢 7 小时');
  assert.equal(timeDifference('2026-10-18', 'Asia/Kathmandu'), '比北京慢 2 小时 15 分钟');
  assert.equal(timeDifference('2026-10-18', 'Pacific/Auckland'), '比北京快 5 小时');
  assert.equal(timeDifference('2026-10-18', 'Asia/Shanghai'), '与北京同一时间');
  assert.equal(timeDifference('2026-10-18', 'America/Los_Angeles', 1), '比北京慢 15 小时');
  assert.equal(timeDifference('2026-02-30', 'Asia/Tokyo'), '时差待补充');
  assert.equal(timeDifference('2026-10-18', 'invalid'), '时差待补充');
});
