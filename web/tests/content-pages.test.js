import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCountryIndex, renderCountryPage, renderGuides, renderCompareIndex, renderAbout } from '../src/content-pages.js';
import { countryMatches } from '../public/modules/content-ui.js';

const country = { id:'VN', name_zh:'越南', name_en:'Viet Nam', region:'亚洲', city_count:1 };
const city = { slug:'da-nang', name_zh:'岘港', name_en:'Da Nang', country_name:'越南', region:'亚洲', summary:'工作日靠海边。', photo_url:'/images/city-da-nang.webp', budget_amount:790 };

test('reviewed first-week copy overrides old database text without changing publication status or checklist anchors', () => {
  const stale = {slug:'first-month', title:'旧标题', summary:'旧摘要', body_json:'["旧正文"]', status:'published', updated_at:'2026-10-17'};
  const page = renderGuides([stale], 'first-month', {SITE_ORIGIN:'https://nomads.test'});
  assert.match(page.title, /先住一周/);
  assert.doesNotMatch(page.body, /旧标题|旧摘要|旧正文/);
  assert.match(page.body, /备用电力/);
  for (const step of [1,2,3]) assert.ok(page.body.includes(`id="guide-step-${step}"`));
  assert.equal(page.indexable, true);
  assert.equal(renderGuides([{...stale, status:'draft'}], 'first-month', {SITE_ORIGIN:'https://nomads.test'}).indexable, false);
});

test('country pages keep country context and every city in a separate navigation sidebar', () => {
  const html=renderCountryPage(country,[city,{...city,slug:'hanoi',name_zh:'河内'}],[],[],[],()=>'',()=> '待核验').body;
  const nav=html.match(/<nav class="country-city-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  assert.match(nav,/aria-current="page"/);
  assert.match(nav,/href="\/countries\/vn\/"/);
  assert.match(nav,/href="\/cities\/da-nang\/"/);
  assert.match(nav,/href="\/cities\/hanoi\/"/);
  assert.match(html,/国家与城市/);
});

test('single-city and empty-country pages render without requiring a card grid or city placeholder', () => {
  const page = renderCountryPage(country, [city], [], [], [], () => '', () => '待核验');
  assert.match(page.body,/href="\/cities\/da-nang\/"/);
  assert.match(page.body,/city-da-nang.webp/);
  assert.ok(!page.body.includes('country-destinations'));
  const empty = renderCountryPage({...country,id:'AQ'}, [], [], [], [], () => '', () => '待核验');
  assert.match(empty.body,/具体城市生活资料还在补充/);
  assert.ok(!empty.body.includes('<img'));
});

test('country filtering supports names and codes without turning missing coverage into a result', () => {
  assert.equal(countryMatches({code:'VN',search:'越南 Viet Nam VN',cities:'1'},'vn',true),true);
  assert.equal(countryMatches({code:'VN',search:'越南 Viet Nam VN',cities:'0'},'vn',true),false);
  assert.equal(countryMatches({code:'VN',search:'越南 Viet Nam VN',cities:'0'},'Viet Nam',false),true);
  const html = renderCountryIndex([{...country,name_zh:'<script>危险</script>'}]).body;
  assert.ok(!html.includes('<script>危险'));
  assert.match(html,/&lt;script&gt;/);
});

test('comparison embedded data escapes untrusted text and method coverage uses actual counts', () => {
  const html = renderCompareIndex([], [{...city,name_zh:'</script><img onerror=x>'},{...city,slug:'penang'}]).body;
  assert.ok(!html.includes('</script><img onerror=x>'));
  assert.match(html,/\\u003c\/script>/);
  const about=renderAbout({cities:348,photos:348,climate:158,locations:339,costs:153});
  assert.match(about.body,/348 城的真实照片/);
  assert.match(about.body,/CostCompass/);
  assert.match(about.body,/ECB/);
  assert.ok(!about.body.includes('13城有'));
});
