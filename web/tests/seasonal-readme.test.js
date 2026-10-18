import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEIGHTS, KEYS, parseState, rankCities, SEASONAL_VIEW, stateParams } from '../public/modules/ranking.js';
import { UI_PRESETS } from '../public/modules/rank-controls.js';
import { BANNED_TERMS, CHANGES_START, CHANGES_END, END, GROUP_KEYS, START, assertReaderCopy, chooseReason, generateSeasonalReadme, needLinks, renderSeasonalBlock, renderChangesBlock, replaceSeasonalBlock, replaceSeasonalBlocks, seasonalGroups, seasonalTopTen } from '../scripts/update-seasonal-readme.mjs';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('../public/published-pages/rankings.json', import.meta.url), 'utf8'));
const editorial = JSON.parse(await readFile(new URL('../data/seasonal-2026-10.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const edition = JSON.parse(await readFile(new URL('../data/readme-2026-10.json', import.meta.url), 'utf8'));
const expectedTen=['ubud','fethiye','hangzhou','shenzhen','antalya','lisbon','malaga','pokhara','chengdu','las-palmas'];
const expected = {
  default: ['ubud', 'fethiye', 'hangzhou', 'shenzhen', 'antalya'],
  budget: ['pokhara', 'chengdu', 'ubud', 'hangzhou', 'samarkand'],
  internet: ['hangzhou', 'shenzhen', 'chengdu', 'malaga', 'lisbon'],
  visa: ['fethiye', 'antalya', 'izmir', 'tashkent', 'samarkand'],
  safe: ['hangzhou', 'fethiye', 'shenzhen', 'munich', 'malaga'],
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

test('50 percent presets are normalized while visa is a hard filter with the original score', () => {
  const groups = seasonalGroups(catalog, editorial);
  for (const [groupKey, metric] of [['budget', 'cost'], ['internet', 'internet'], ['safe', 'safety']]) {
    const { state } = groups.find(group => group.key === groupKey);
    assert.equal(state.weights[metric], 50);
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

test('every current Top 5 city is covered by the sixteen researched profiles with four platform checks', () => {
  const slugs = new Set(seasonalGroups(catalog, editorial).flatMap(group => group.cities.map(city => city.slug)));
  assert.equal(slugs.size, 13);
  assert.ok([...slugs].every(slug=>editorial.cities.some(city=>city.slug===slug)));
  assert.equal(editorial.cities.length,16);
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


test('README has the shared comprehensive top ten exactly once, independently of note ordering',()=>{
 const before=clone(catalog),notes=clone(edition);notes.city_notes.reverse();
 const cities=seasonalTopTen(catalog,editorial,notes);
 assert.deepEqual(cities.map(c=>c.slug),expectedTen);
 assert.deepEqual(cities.map(c=>c.slug),rankCities(catalog,parseState(new URL('https://nomads.test/?month=10&season=2026-10'))).slice(0,10).map(c=>c.slug));
 assert.equal(new Set(cities.map(c=>c.slug)).size,10);assert.deepEqual(catalog,before);
});

test('the main table has five columns, ten linked cities, rounded data and one concise reason per city',()=>{
 const block=renderSeasonalBlock(catalog,editorial,edition);
 const rows=block.split('\n').filter(line=>/^<tr><td nowrap>/.test(line));
 assert.equal(rows.length,10);assert.equal((block.match(/<table\b/g)||[]).length,1);
 assert.equal((block.match(/nomads\.cubxxw\.com\/cities\//g)||[]).length,10);
 for(const row of rows){assert.equal((row.match(/<td\b/g)||[]).length,5);const reason=row.match(/<td nowrap>([^<]+)<\/td><\/tr>$/)[1];assert.ok([...reason].length<=25);assert.ok(reason.length>0)}
 assert.match(block,/≈\$1,240<\/td><td nowrap align="right">22°C<\/td><td nowrap>免签/);assert.match(block,/≈\$950<\/td><td nowrap align="right">21°C<\/td><td nowrap>境内/);
 assert.equal((block.match(/<th scope="col" nowrap>/g)||[]).length,5);assert.equal((block.match(/<td nowrap/g)||[]).length,50);
 assert.match(block,/🇮🇩/);assert.match(block,/🇳🇵/);assertReaderCopy(block);
 const reasons=seasonalTopTen(catalog,editorial,edition).map(c=>c.reason);assert.equal(new Set(reasons).size,10);
 assert.ok(!block.includes('[来源]'));assert.ok(!block.includes('###'));
});

test('invalid draft copy is rewritten with the city-specific backup rather than trimmed or published',()=>{
 const dirty=clone(edition);dirty.city_notes.find(n=>n.slug==='ubud').reasons[0].text='先确认这里是否有通话间';
 const clean=seasonalTopTen(catalog,editorial,dirty).find(c=>c.slug==='ubud');
 assert.equal(clean.reason,'26°C的巴厘岛，乌布有Outpost工位');assertReaderCopy(clean.reason);
 const invalid=clone(edition);invalid.city_notes.find(n=>n.slug==='ubud').reasons.forEach(reason=>reason.text='先确认'.repeat(15));
 assert.throws(()=>renderSeasonalBlock(catalog,editorial,invalid),/ubud没有合格短评/);
 for(const term of BANNED_TERMS)assert.throws(()=>assertReaderCopy('城市'+term),/禁用词/);
 assert.throws(()=>assertReaderCopy('不是 ＭＢＰＳ'),/禁用词/);
});

test('generic copy, fabricated source anchors and stale numeric facts cannot stand in for city facts',()=>{
 const city=catalog.find(c=>c.slug==='ubud'),profile=editorial.cities.find(c=>c.slug==='ubud');
 for(const reasons of [
  [{text:'适合每个人的完美城市',facts:[]}],
  [{text:'乌布999°C适合出发',facts:[{kind:'climate'}]}],
  [{text:'26°C的乌布。再来一段。',facts:[{kind:'climate'}]}],
  [{text:'Outpost很合适',facts:[{kind:'source',token:'Outpost',url:'https://example.com/unread'}]}],
  [{text:'乌布值得来',facts:[{kind:'source',token:'乌布',url:profile.sources[0].url}]}],
  [{text:'好'.repeat(26),facts:[{kind:'cost'}]}],
 ])assert.throws(()=>chooseReason(city,{reasons},profile),/没有合格短评/);
 const changed=clone(catalog);changed.find(c=>c.slug==='lisbon').months[9].meanC=18.4;
 const note=seasonalTopTen(changed,editorial,edition).find(c=>c.slug==='lisbon');assert.ok(note.reason.includes('18°C'));assert.ok(!note.reason.includes('19°C'));
});

test('missing coverage, duplicate records and incomplete main-table data stop generation',()=>{
 const missing=clone(edition);missing.city_notes=missing.city_notes.filter(c=>c.slug!=='las-palmas');
 assert.throws(()=>renderSeasonalBlock(catalog,editorial,missing),/las-palmas没有合格短评/);
 const duplicate=clone(edition);duplicate.city_notes.push(duplicate.city_notes[0]);assert.throws(()=>renderSeasonalBlock(catalog,editorial,duplicate),/重复/);
 assert.throws(()=>renderSeasonalBlock([...catalog,catalog[0]],editorial,edition),/重复城市/);
 assert.throws(()=>renderSeasonalBlock(catalog,editorial,{...edition,month:'2026-11'}),/期号/);
 const bad=clone(catalog);bad.find(c=>c.slug==='ubud').months[9].meanC=null;assert.throws(()=>renderSeasonalBlock(bad,editorial,edition),/缺少表格/);
 const unsafe=clone(editorial);unsafe.cities[0].sources[0].url='https://user:password@example.com/';assert.throws(()=>renderSeasonalBlock(catalog,unsafe,edition),/来源读取范围/);
 assert.throws(()=>renderSeasonalBlock([],editorial,edition),/快照为空/);
});

test('the three stable need links select the same website presets and survive a state URL roundtrip',()=>{
 assert.deepEqual(needLinks.map(link=>link.key),['budget','visa','winter']);
 for(const link of needLinks){
  const state=parseState(new URL(link.url)),preset=UI_PRESETS[link.key];
  assert.deepEqual(state.weights,preset.weights);assert.equal(state.visa,preset.visa||'');assert.equal(state.month,preset.month||null);assert.equal(state.warm,!!preset.warm);
  assert.deepEqual(parseState(new URL('https://nomads.test/?'+stateParams(state))),state);
 }
});

test('three to five monthly changes describe actual weights, reviewed exclusions and available shortcuts',()=>{
 const block=renderChangesBlock(catalog,editorial,edition);assert.equal((block.match(/^- /gm)||[]).length,4);
 assert.match(block,/80%降到50%/);assert.match(block,/7座/);assertReaderCopy(block);
 const old=clone(edition);old.changes[0].recorded_at='2026-09-30';assert.throws(()=>renderChangesBlock(catalog,editorial,old),/本月实际/);
 assert.throws(()=>renderChangesBlock(catalog,editorial,{...edition,changes:[{kind:'invented_city_growth'},{kind:'layout'},{kind:'quick_filters'}]}),/未知/);
 assert.throws(()=>renderChangesBlock(catalog,editorial,{...edition,changes:[{kind:'layout'}]}),/3–5/);
});

test('monthly generation changes only the two marked blocks and preserves every surrounding byte',()=>{
 const table=renderSeasonalBlock(catalog,editorial,edition),changes=renderChangesBlock(catalog,editorial,edition);
 const prefix='# Human intro\n\n一行入口。\n\n',middle='\n\n稳定的三个需求链接\n\n',tail='\n\n数据脚注\n\n## 运行与许可\n```sh\nnpm run demo\n```\nMIT\n';
 const old=prefix+START+'\nold table\n'+END+middle+CHANGES_START+'\nold updates\n'+CHANGES_END+tail;
 const next=replaceSeasonalBlocks(old,table,changes);
 assert.equal(next,prefix+table+middle+changes+tail);
 assert.equal(replaceSeasonalBlocks(next,table,changes),next);
 const future=replaceSeasonalBlocks(next,table.replace('2026年10月','2026年11月'),changes.replace('7座','8座'));
 assert.ok(future.startsWith(prefix));assert.ok(future.endsWith(tail));assert.ok(future.includes(middle));
});

test('malformed, duplicate and overlapping markers cannot overwrite unrelated README content',()=>{
 const table=START+'\nnew\n'+END,changes=CHANGES_START+'\nnew\n'+CHANGES_END;
 for(const text of [START+' no end',END+START,START+END+START+END,'# An unrelated README'])assert.throws(()=>replaceSeasonalBlock(text,table),/标记/);
 assert.throws(()=>replaceSeasonalBlocks(START+CHANGES_START+END+CHANGES_END,table,changes),/嵌套/);
 assert.throws(()=>replaceSeasonalBlock(START+END,'unbounded output'),/标记/);
});

test('the checked-in README is one table, three need links, one footnote and has no generation drift',async()=>{
 const result=await generateSeasonalReadme();assert.equal(result.original,result.updated);
 assert.ok(result.updated.startsWith('# RemoteAI Nomads\n\n帮中文远程工作者选城市。[打开排行 →]'));
 assert.equal((result.updated.match(/<table\b/g)||[]).length,1);assert.equal((result.updated.match(/数据为参考值，出发前请核实/g)||[]).length,1);
 assert.equal((result.updated.match(/nomads\.cubxxw\.com\/cities\//g)||[]).length,10);
 for(const link of needLinks)assert.ok(result.updated.includes(`](${link.url})`));
 assertReaderCopy(result.updated);
 execFileSync(process.execPath,['scripts/update-seasonal-readme.mjs','--check'],{cwd:webRoot,stdio:'pipe'});
 assert.equal(await readFile(result.readmePath,'utf8'),result.original);
});

test('invalid copy leaves the current README untouched',async()=>{
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'nomads-readme-'));
 try{
  const fixture=join(directory,'edition.json'),bad=clone(edition);bad.city_notes[0].reasons=[{text:'仅供参考',facts:[]}];await writeFile(fixture,JSON.stringify(bad));
  const before=await readFile(new URL('../../README.md',import.meta.url),'utf8');
  await assert.rejects(generateSeasonalReadme({editionPath:fixture}),/没有合格短评/);
  assert.equal(await readFile(new URL('../../README.md',import.meta.url),'utf8'),before);
 }finally{await rm(directory,{recursive:true,force:true})}
});

test('city and data-method links retain source and publication boundaries behind the compact README',async()=>{
 const guide=await readFile(new URL('../../guides/seasonal-2026-10.md',import.meta.url),'utf8');
 const method=await readFile(new URL('../docs/data-and-methods.md',import.meta.url),'utf8');
 for(const city of editorial.cities)assert.ok(guide.includes(`id="${city.slug}"`));
 for(const phrase of ['2023–2025','不能视为','不是实测Mbps','并非四个平台的正文都已读到'])assert.ok(method.includes(phrase));
});

test('HTML table escapes city names and preserves the compact, keyboard-scrollable structure',()=>{
 const changed=clone(catalog);changed.find(city=>city.slug==='ubud').name='<img src=x onerror=alert(1)>';
 const block=renderSeasonalBlock(changed,editorial,edition);
 assert.ok(!block.includes('<img'));assert.ok(block.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.match(block,/<table tabindex="0" aria-label="[^"]+可横向滚动"/);
});
