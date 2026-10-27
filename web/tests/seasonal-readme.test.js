import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEIGHTS, KEYS, parseState, rankCities, SEASONAL_VIEW, stateParams } from '../public/modules/ranking.js';
import { UI_PRESETS } from '../public/modules/rank-controls.js';
import { BANNED_TERMS, CHANGES_START, CHANGES_END, END, GROUP_KEYS, START, assertReaderCopy, chooseReason, generateSeasonalReadme, renderSeasonalBlock, renderChangesBlock, replaceSeasonalBlock, replaceSeasonalBlocks, seasonalGroups, seasonalTopTen } from '../scripts/update-seasonal-readme.mjs';
import { DOMESTIC_START, DOMESTIC_END, NEEDS_START, NEEDS_END, domesticRecommendations, needRecommendations, recommendationViews, recommendedMonths, renderDomesticBlock, renderNeedsBlock } from '../scripts/readme-discovery.mjs';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('../public/published-pages/rankings.json', import.meta.url), 'utf8'));
const editorial = JSON.parse(await readFile(new URL('../data/seasonal-2026-10.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const edition = JSON.parse(await readFile(new URL('../data/readme-2026-10.json', import.meta.url), 'utf8'));

test('all recommendation links reproduce the website state and order',()=>{
 for(const group of [...seasonalGroups(catalog,editorial),...needRecommendations(catalog)]){
  const state=parseState(new URL(group.url));
  assert.deepEqual(state,group.state);
  assert.deepEqual(parseState(new URL('https://nomads.test/?'+stateParams(state))),state);
  const ranked=rankCities(catalog,state);
  assert.equal(group.total,ranked.length);
  assert.deepEqual(group.cities.map(c=>c.slug),ranked.slice(0,group.cities.length).map(c=>c.slug));
 }
 assert.equal(recommendationViews().length,6);
});
test('the README top ten follow recomputed scores, never stored legacy totals or editorial order',()=>{
 const state=parseState(new URL('https://nomads.test/?month=10&season=2026-10'));
 const cities=seasonalTopTen(catalog,editorial,edition);
 assert.deepEqual(cities.map(c=>c.slug),rankCities(catalog,state).slice(0,10).map(c=>c.slug));
 assert.equal(new Set(cities.map(c=>c.slug)).size,10);
 const changed=clone(catalog);for(const c of changed)c.baseScore=99;
 assert.deepEqual(seasonalTopTen(changed,editorial,edition).map(c=>c.slug),cities.map(c=>c.slug));
});
test('main table keeps ten five-column rows, concise factual reasons and month comfort',()=>{
 const block=renderSeasonalBlock(catalog,editorial,edition);
 const rows=block.split('\n').filter(line=>/^<tr><td nowrap>/.test(line));
 assert.equal(rows.length,10);assert.equal((block.match(/<td nowrap/g)||[]).length,50);
 assert.match(block,/10月舒适度/);assert.ok(!block.includes('10月均温'));
 for(const row of rows){const reason=row.match(/<td nowrap>([^<]+)<\/td><\/tr>$/)[1];assert.ok([...reason].length<=25);assert.ok(reason.length);}
 assertReaderCopy(block);
 const changed=clone(catalog),first=seasonalTopTen(catalog,editorial,edition)[0].slug;
 changed.find(c=>c.slug===first).name='<img onerror=alert(1)>';
 const escaped=renderSeasonalBlock(changed,editorial,edition);assert.ok(!escaped.includes('<img'));assert.ok(escaped.includes('&lt;img'));
});
test('unresearched new results use only their existing numeric data',()=>{
 const stripped={...editorial,cities:[]},notes={...edition,city_notes:[]};
 const cities=seasonalTopTen(catalog,stripped,notes);
 for(const c of cities){assert.match(c.reason,/°C，月参考\$/);assert.ok(c.reason.includes(Math.round(c.budget).toLocaleString('en-US')));}
});
test('invalid supplied copy and fabricated source facts stop publication',()=>{
 const city=catalog.find(c=>c.slug==='ubud'),profile=editorial.cities.find(c=>c.slug==='ubud');
 for(const reasons of [
  [{text:'适合每个人的完美城市',facts:[]}],
  [{text:'乌布999°C适合出发',facts:[{kind:'climate'}]}],
  [{text:'Outpost很合适',facts:[{kind:'source',token:'Outpost',url:'https://example.com/unread'}]}],
  [{text:'好'.repeat(26),facts:[{kind:'cost'}]}],
 ])assert.throws(()=>chooseReason(city,{reasons},profile),/没有合格短评/);
 const duplicate=clone(edition);duplicate.city_notes.push(duplicate.city_notes[0]);assert.throws(()=>renderSeasonalBlock(catalog,editorial,duplicate),/重复/);
 assert.throws(()=>renderSeasonalBlock([...catalog,catalog[0]],editorial,edition),/重复城市/);
 for(const term of BANNED_TERMS)assert.throws(()=>assertReaderCopy('城市'+term),/禁用词/);
});
test('domestic discovery retains all fourteen cities and unknowns after the scored results',()=>{
 const group=domesticRecommendations(catalog);
 assert.equal(group.total,14);assert.equal(group.cities.length,5);
 assert.equal(group.other.length,9);assert.equal(group.other[0].slug,'dali');
 assert.ok(group.other.every(c=>c.score===null&&c.rank===null));
 assert.deepEqual(group.cities,rankCities(catalog,parseState(new URL(group.url))).filter(c=>c.score!==null).slice(0,5));
 const block=renderDomesticBlock(catalog);assert.match(block,/10月舒适度/);assert.ok(!block.includes('$0'));
});
test('need-based views enforce their budgets, passport and seasonal conditions',()=>{
 for(const group of needRecommendations(catalog)){
  assert.equal(group.cities.length,3);assert.equal(group.state.month,group.key==='winter'?1:10);
  if(['budget','visa'].includes(group.key))assert.ok(group.cities.every(c=>c.budget<=1000));
  if(group.key==='visa')assert.ok(group.cities.every(c=>c.visa.code==='visa_free'));
  if(['internet','safe','warm','winter'].includes(group.key))assert.ok(group.cities.every(c=>!['CN','HK','MO','TW'].includes(c.countryCode)));
  if(['warm','winter'].includes(group.key))assert.ok(group.cities.every(c=>c.months[group.state.month-1].meanC>=18&&c.months[group.state.month-1].meanC<=28));
 }
 assert.equal((renderNeedsBlock(catalog).match(/<th scope="row"/g)||[]).length,6);
});
test('removed maintenance notes cannot be regenerated into the README',()=>{
 const block=renderChangesBlock(catalog,editorial,edition);
 assert.equal(block,CHANGES_START+'\n'+CHANGES_END);
 for(const phrase of ['本月10城之外','国内目录已收录14座目的地','主权重从80%降到50%','7座有明确暂勿前往提醒'])assert.ok(!block.includes(phrase));
});
test('checked-in README has three tables, no removed notes and no generator drift',async()=>{
 const result=await generateSeasonalReadme();assert.equal(result.original,result.updated);
 assert.equal((result.updated.match(/<table\b/g)||[]).length,3);
 assert.ok(!result.updated.includes('## 本期变化'));assert.ok(!result.updated.includes('主权重从'));
 for(const view of recommendationViews())assert.ok(result.updated.includes(view.url.replaceAll('&','&amp;')));
 execFileSync(process.execPath,['scripts/update-seasonal-readme.mjs','--check'],{cwd:webRoot,stdio:'pipe'});
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


test('monthly generation preserves every byte outside all four marked blocks',()=>{
 const table=renderSeasonalBlock(catalog,editorial,edition),changes=renderChangesBlock(catalog,editorial,edition);
 const prefix='# Human intro\n\n一行入口。\n\n',middle='\n\n稳定的三个需求链接\n\n',tail='\n\n数据脚注\n\n## 运行与许可\n```sh\nnpm run demo\n```\nMIT\n';
 const old=prefix+START+'\nold table\n'+END+middle+CHANGES_START+'\nold updates\n'+CHANGES_END+tail;
 const next=replaceSeasonalBlocks(old,table,changes);
 assert.equal(next,prefix+table+middle+changes+tail);
 assert.equal(replaceSeasonalBlocks(next,table,changes),next);
 const future=replaceSeasonalBlocks(next,table.replace('2026年10月','2026年11月'),changes.replace('7座','8座'));
 assert.ok(future.startsWith(prefix));assert.ok(future.endsWith(tail));assert.ok(future.includes(middle));
 const domestic=renderDomesticBlock(catalog),needs=renderNeedsBlock(catalog);
 const discoveries=[{start:DOMESTIC_START,end:DOMESTIC_END,block:domestic},{start:NEEDS_START,end:NEEDS_END,block:needs}];
 const expanded=prefix+START+END+middle+DOMESTIC_START+DOMESTIC_END+middle+NEEDS_START+NEEDS_END+middle+CHANGES_START+CHANGES_END+tail;
 const rendered=replaceSeasonalBlocks(expanded,table,changes,discoveries);
 assert.equal(rendered,prefix+table+middle+domestic+middle+needs+middle+changes+tail);
 assert.equal(replaceSeasonalBlocks(rendered,table,changes,discoveries),rendered);
 assert.throws(()=>replaceSeasonalBlocks(prefix+START+DOMESTIC_START+END+DOMESTIC_END+NEEDS_START+NEEDS_END+CHANGES_START+CHANGES_END,table,changes,discoveries),/嵌套/);
 assert.throws(()=>replaceSeasonalBlocks(expanded.replace(NEEDS_END,''),table,changes,discoveries),/标记/);
});

test('malformed, duplicate and overlapping markers cannot overwrite unrelated README content',()=>{
 const table=START+'\nnew\n'+END,changes=CHANGES_START+'\nnew\n'+CHANGES_END;
 for(const text of [START+' no end',END+START,START+END+START+END,'# An unrelated README'])assert.throws(()=>replaceSeasonalBlock(text,table),/标记/);
 assert.throws(()=>replaceSeasonalBlocks(START+CHANGES_START+END+CHANGES_END,table,changes),/嵌套/);
 assert.throws(()=>replaceSeasonalBlock(START+END,'unbounded output'),/标记/);
});

test('invalid copy leaves the current README untouched',async()=>{
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'nomads-readme-'));
 try{
  const fixture=join(directory,'edition.json'),bad=clone(edition);for(const note of bad.city_notes)note.reasons=[{text:'仅供参考',facts:[]}];await writeFile(fixture,JSON.stringify(bad));
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
