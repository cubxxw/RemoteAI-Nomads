import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEIGHTS, KEYS, parseState, rankCities, SEASONAL_VIEW } from '../public/modules/ranking.js';
import { UI_PRESETS } from '../public/modules/rank-controls.js';
import { END, GROUP_KEYS, START, generateSeasonalReadme, renderSeasonalBlock, replaceSeasonalBlock, seasonalGroups } from '../scripts/update-seasonal-readme.mjs';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('../public/published-pages/rankings.json', import.meta.url), 'utf8'));
const editorial = JSON.parse(await readFile(new URL('../data/seasonal-2026-10.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const expected = {
  default: ['ubud', 'fethiye', 'hangzhou', 'shenzhen', 'antalya'],
  budget: ['pokhara', 'la-paz', 'chengdu', 'samarkand', 'hanoi'],
  internet: ['malaga', 'lisbon', 'shenzhen', 'hangzhou', 'las-palmas'],
  visa: ['fethiye', 'antalya', 'izmir', 'tashkent', 'samarkand'],
  safe: ['hangzhou', 'fethiye', 'shenzhen', 'munich', 'chengdu'],
};

test('the current five Top 5 groups come from the public catalog and shared website presets', () => {
  const before = clone(catalog);
  const groups = seasonalGroups(catalog, editorial);
  assert.deepEqual(groups.map(group => group.key), GROUP_KEYS);
  for (const group of groups) {
    assert.equal(group.label, UI_PRESETS[group.key].label);
    assert.deepEqual(group.cities.map(city => city.slug), expected[group.key]);
    assert.equal(group.total, group.key === 'visa' ? 20 : 83);
  }
  assert.deepEqual(catalog, before);
});

test('all share URLs reproduce the exact website order, weights and dated seasonal filter', () => {
  for (const group of seasonalGroups(catalog, editorial)) {
    const url = new URL(group.url);
    assert.equal(url.origin, 'https://nomads.cubxxw.com');
    assert.equal(url.searchParams.get('month'), '10');
    assert.equal(url.searchParams.get('season'), SEASONAL_VIEW.id);
    const restored = parseState(url);
    assert.deepEqual(restored, group.state);
    assert.deepEqual(rankCities(catalog, restored).slice(0, 5).map(city => city.slug), expected[group.key]);
    assert.deepEqual(restored.weights, UI_PRESETS[group.key].weights);
    assert.equal(restored.visa, group.key === 'visa' ? 'visa_free' : '');
    assert.ok(!url.searchParams.has('limit'));
  }
});

test('80 percent presets are normalized while visa is a hard filter with the original score', () => {
  const groups = seasonalGroups(catalog, editorial);
  for (const [groupKey, metric] of [['budget', 'cost'], ['internet', 'internet'], ['safe', 'safety']]) {
    const { state } = groups.find(group => group.key === groupKey);
    assert.equal(state.weights[metric], 80);
    assert.equal(KEYS.reduce((sum, key) => sum + state.weights[key], 0), 100);
  }
  for (const key of ['default', 'visa']) {
    const group = groups.find(item => item.key === key);
    assert.deepEqual(group.state.weights, DEFAULT_WEIGHTS);
    for (const city of group.cities) {
      assert.equal(city.score, city.baseScore);
      if (key === 'visa') assert.equal(city.visa.code, 'visa_free');
    }
  }
});

test('membership responds to public data rather than editorial order or hardcoded city lists', () => {
  const data = clone(catalog);
  data.find(city => city.slug === 'pokhara').baseScore = 10;
  const groups = seasonalGroups(data.reverse(), { ...editorial, cities: [...editorial.cities].reverse() });
  assert.equal(groups[0].cities[0].slug, 'pokhara');
  assert.notDeepEqual(groups[0].cities.map(city => city.slug), expected.default);
  assert.deepEqual(groups.find(group => group.key === 'internet').cities.map(city => city.slug), expected.internet);
});

test('sixteen unique researched cities cover all 25 rows and record all four platform checks', () => {
  const slugs = new Set(seasonalGroups(catalog, editorial).flatMap(group => group.cities.map(city => city.slug)));
  assert.equal(slugs.size, 16);
  assert.deepEqual([...slugs].sort(), editorial.cities.map(city => city.slug).sort());
  assert.equal(editorial.checked_at, '2026-10-18');
  for (const city of editorial.cities) {
    assert.ok(city.summary.length <= 60, `${city.slug} needs a concise summary`);
    assert.equal(city.checked_at, editorial.checked_at);
    assert.equal(city.read_at, editorial.checked_at);
    assert.deepEqual(city.platform_checks.map(check => check.platform).sort(), ['reddit', 'web', 'x', 'xiaohongshu']);
    assert.ok(city.platform_checks.every(check => ['body_read', 'search_only'].includes(check.status) && check.read_scope));
    assert.ok(city.sources.some(source => source.platform === 'web'));
    for (const source of city.sources) {
      assert.ok(source.url.startsWith('https://'));
      assert.ok(source.read_scope && source.limits);
      assert.equal(source.read_at, editorial.checked_at);
    }
  }
});

test('new social captions retain the precise body/search boundary', () => {
  for (const slug of ['ubud', 'hangzhou', 'chengdu']) {
    const city = editorial.cities.find(item => item.slug === slug);
    assert.ok(city.sources.some(source => source.platform === 'xiaohongshu' && source.read_scope === 'opened_post_caption'));
  }
  const shenzhen = editorial.cities.find(city => city.slug === 'shenzhen');
  assert.equal(shenzhen.platform_checks.find(check => check.platform === 'xiaohongshu').status, 'search_only');
  assert.ok(!shenzhen.sources.some(source => source.platform === 'xiaohongshu'));
  assert.match(shenzhen.sources.find(source => source.platform === 'x').limits, /已过/);
  const fethiye = editorial.cities.find(city => city.slug === 'fethiye');
  assert.match(fethiye.sources.find(source => source.platform === 'x').limits, /不是十月经历/);
});

test('European time-zone advice retains the fixed Beijing start-time condition', () => {
  for (const slug of ['malaga', 'lisbon']) {
    const city = editorial.cities.find(item => item.slug === slug);
    assert.match(city.summary, /若按北京时间9点开工/);
    assert.ok(!city.summary.includes('中国团队需接受凌晨'));
    assert.ok(!city.summary.includes('中国作息需凌晨'));
  }
});

test('every row has a city page and a stable guide anchor; all five more links are present', () => {
  const block = renderSeasonalBlock(catalog, editorial);
  assert.equal((block.match(/^### /gm) || []).length, 5);
  assert.equal((block.match(/https:\/\/nomads\.cubxxw\.com\/cities\/[a-z-]+\//g) || []).length, 25);
  assert.equal((block.match(/guides\/seasonal-2026-10\.md#[a-z-]+/g) || []).length, 25);
  for (const group of seasonalGroups(catalog, editorial)) {
    assert.ok(block.includes(`](${group.url})`));
    for (const city of group.cities) assert.ok(block.includes(`](guides/seasonal-2026-10.md#${city.slug})`));
  }
  assert.match(block, /USD 450–740/);
  for (const amount of [450, 480, 730, 720, 740]) assert.ok(block.includes(`$${amount}`));
  assert.match(block, /不能视为现价或最低生活门槛/);
  assert.match(block, /不是 Mbps/);
  assert.match(block, /并非四个平台的正文都已读到/);
  assert.ok(!block.includes('20,55,10,10,5,5'));
});

test('missing editorial coverage and invalid public source metadata fail explicitly', () => {
  const missing = clone(editorial);
  missing.cities = missing.cities.filter(city => city.slug !== 'ubud');
  assert.throws(() => seasonalGroups(catalog, missing), /缺少 ubud 的本期短评/);
  const duplicate = clone(editorial);
  duplicate.cities.push(duplicate.cities[0]);
  assert.throws(() => seasonalGroups(catalog, duplicate), /标识/);
  const unsafe = clone(editorial);
  unsafe.cities[0].sources[0].url = 'https://user:password@example.com/';
  assert.throws(() => seasonalGroups(catalog, unsafe), /来源读取范围或链接/);
  assert.throws(() => seasonalGroups(catalog, { ...editorial, month: '2026-11' }), /月份/);
  assert.throws(() => seasonalGroups([], editorial), /公开城市快照为空/);
});

test('README migration removes the obsolete 55 percent view while preserving all following content', () => {
  const prefix = '# Test\n\n';
  const tail = '网站打开就是排行。\n\n## 小狐旅伴\n本地历史。\n\n## 运行与许可\nnpm run demo\nMIT\n';
  const legacy = `${prefix}## 先缩小到几个选择\n旧建议\n\n## 按自己的条件看排行\nhttps://nomads.cubxxw.com/?w=20,55,10,10,5,5\n\n${tail}`;
  const block = renderSeasonalBlock(catalog, editorial);
  const migrated = replaceSeasonalBlock(legacy, block);
  assert.ok(migrated.startsWith(prefix));
  assert.ok(migrated.endsWith(tail));
  assert.ok(!migrated.includes('20,55,10,10,5,5'));
  assert.equal(replaceSeasonalBlock(migrated, block), migrated);
  const changed = replaceSeasonalBlock(migrated, `${START}\nnew content\n${END}`);
  assert.ok(changed.startsWith(prefix));
  assert.ok(changed.endsWith(tail));
});

test('ambiguous or broken README markers never overwrite unrelated content', () => {
  for (const source of [`${START} no end`, `${END} before ${START}`, `${START}${END}${START}${END}`, '# An unrelated README']) {
    assert.throws(() => replaceSeasonalBlock(source, `${START}\nnew\n${END}`), /标记/);
  }
});

test('the checked-in README has no generated drift and check mode performs no writes', async () => {
  const result = await generateSeasonalReadme();
  assert.equal(result.original, result.updated);
  assert.equal(replaceSeasonalBlock(result.updated, renderSeasonalBlock(catalog, editorial)), result.updated);
  execFileSync(process.execPath, ['scripts/update-seasonal-readme.mjs', '--check'], { cwd: webRoot, stdio: 'pipe' });
  assert.equal(await readFile(result.readmePath, 'utf8'), result.original);
});

test('all sixteen README source destinations exist as explicit guide anchors', async () => {
  const text = await readFile(new URL('../../guides/seasonal-2026-10.md', import.meta.url), 'utf8');
  for (const city of editorial.cities) assert.ok(text.includes(`id="${city.slug}"`), `missing guide anchor: ${city.slug}`);
});
