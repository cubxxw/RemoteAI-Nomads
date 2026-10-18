import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseState, rankCities, SEASONAL_VIEW, stateParams, flag, PRESETS, esc } from '../public/modules/ranking.js';
import { UI_PRESETS, quickFilters } from '../public/modules/rank-controls.js';
import { recommendationEligible } from '../public/modules/recommendation-policy.js';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const GROUP_KEYS = ['default', 'budget', 'internet', 'visa', 'safe'];
export const START = '<!-- seasonal:table:start -->';
export const END = '<!-- seasonal:table:end -->';
export const CHANGES_START = '<!-- seasonal:changes:start -->';
export const CHANGES_END = '<!-- seasonal:changes:end -->';
export const BANNED_TERMS = ['先确认','别预设','不能视为','仅供参考','核读','旧资料','旧评分','不是 Mbps','并非四个平台'];
export const MAX_REASON_LENGTH = 25;
export const TOP_COUNT = 10;
const siteOrigin = 'https://nomads.cubxxw.com';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const normalized = value => String(value).normalize('NFKC').replace(/\s/g,'').toLowerCase();
const temperature = city => Math.round(city.months[SEASONAL_VIEW.month - 1].meanC) + '°C';
const cost = city => '$' + Math.round(city.budget).toLocaleString('en-US');
const visaLabels = {domestic:'境内',visa_free:'免签',evisa:'电子签',arrival:'落地签',visa_required:'需签证',permit:'需许可'};
export const needLinks = ['budget','visa','winter'].map(key=>({key,label:{budget:'省钱优先',visa:'签证免签',winter:'冬天避寒'}[key],url:siteOrigin+'/?preset='+key}));

export function assertReaderCopy(text) {
  const banned = BANNED_TERMS.find(term=>normalized(text).includes(normalized(term)));
  if (banned) throw new Error('README文案含禁用词：'+banned+'，请改写短评。');
}

// Editorial text supplies context and citations, never the membership or order.
function reviewedProfiles(catalog, editorial) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('公开城市快照为空。');
  if (editorial?.version !== 1 || editorial.month !== SEASONAL_VIEW.id || !datePattern.test(editorial.checked_at)) {
    throw new Error('本期短评的版本、月份或核读日期与网站不一致。');
  }
  const profiles = new Map();
  for (const profile of editorial.cities || []) {
    if (!slugPattern.test(profile.slug) || profiles.has(profile.slug) || typeof profile.summary !== 'string' || profile.summary.length < 10 || profile.summary.length > 120 || !datePattern.test(profile.read_at) || !datePattern.test(profile.checked_at)) {
      throw new Error('本期城市短评的标识、长度或核读日期不合法。');
    }
    if (!Array.isArray(profile.sources) || !profile.sources.length) throw new Error(`缺少 ${profile.slug} 的公开来源。`);
    for (const source of profile.sources) {
      let url;
      try { url = new URL(source.url); } catch { throw new Error(`来源链接无效：${profile.slug}`); }
      if (url.protocol !== 'https:' || url.username || url.password || !source.title || !source.read_scope || !datePattern.test(source.read_at)) {
        throw new Error(`来源读取范围或链接不完整：${profile.slug}`);
      }
    }
    profiles.set(profile.slug, profile);
  }
  return profiles;
}
export function seasonalGroups(catalog, editorial) {
  const profiles=reviewedProfiles(catalog,editorial);
  return GROUP_KEYS.map(key => {
    const preset = UI_PRESETS[key];
    if (!preset) throw new Error(`网站缺少预设：${key}`);
    const state = {
      ...parseState(new URL(`/?month=${SEASONAL_VIEW.month}&season=${SEASONAL_VIEW.id}`, siteOrigin)),
      weights: { ...preset.weights },
      warm: !!preset.warm,
      visa: preset.visa || '',
    };
    // These five views retain the dated month; a winter preset is not one of them.
    if (preset.month && preset.month !== SEASONAL_VIEW.month) throw new Error(`预设 ${key} 改变了本期月份。`);
    const ranked = rankCities(catalog, state);
    if (ranked.length < 5) throw new Error(`预设 ${key} 不足五个结果，需人工复核后再生成。`);
    const cities = ranked.slice(0, 5).map(city => {
      const profile = profiles.get(city.slug);
      if (!profile) throw new Error(`缺少 ${city.slug} 的本期短评，请先核读来源。`);
      return { ...city, editorial: profile };
    });
    return { key, label: preset.label, state, url: `${siteOrigin}/?${stateParams(state)}`, total: ranked.length, cities };
  });
}

function editionState() {
  return parseState(new URL(`/?month=${SEASONAL_VIEW.month}&season=${SEASONAL_VIEW.id}`,siteOrigin));
}

export function chooseReason(city, note, profile) {
  const errors=[];
  for (const candidate of note?.reasons || []) {
    try {
      if (typeof candidate.text !== 'string' || /[\r\n|<>\[\]`*#]/.test(candidate.text)) throw new Error('需要单行纯文本');
      const text=candidate.text.replaceAll('{temperature}',temperature(city)).replaceAll('{cost}',cost(city));
      assertReaderCopy(text);
      if (!text.trim() || [...text].length>MAX_REASON_LENGTH || /[{}]/.test(text)) throw new Error('短评须为1–25字');
      if (text.split(/[。！？!?]/).filter(part=>part.trim()).length>1) throw new Error('短评只保留一句话');
      if (!Array.isArray(candidate.facts) || !candidate.facts.length) throw new Error('缺少城市事实');
      for (const fact of candidate.facts) {
        const token=fact.kind==='climate' ? temperature(city) : fact.kind==='cost' ? cost(city) : fact.token;
        if (fact.kind==='source') {
          const source=profile.sources.find(source=>source.url===fact.url);
          if (!source || /search/i.test(source.read_scope) || !/(?:opened|已打开|已读)/.test(source.read_scope) || !token || [...token].length<2 || [city.name,city.nameEn,city.slug,profile.name_zh].includes(token)) throw new Error('地点事实需要已读取的城市来源');
        } else if (!['climate','cost'].includes(fact.kind)) throw new Error('未知事实类型');
        if (!token || !text.includes(token)) throw new Error('短评未包含对应城市事实');
      }
      return text;
    } catch(error) { errors.push(error.message); }
  }
  throw new Error(`${city.slug}没有合格短评，请重写：${errors.join('；') || '未提供候选文案'}`);
}

export function seasonalTopTen(catalog, editorial, edition) {
  const profiles=reviewedProfiles(catalog,editorial);
  if (edition?.version!==1 || edition.month!==editorial.month || !datePattern.test(edition.updated_at)) throw new Error('README期号或更新时间与网站不一致。');
  if (new Set(catalog.map(city=>city.slug)).size!==catalog.length) throw new Error('公开目录存在重复城市。');
  const notes=new Map();
  for (const note of edition.city_notes || []) {
    if (!slugPattern.test(note.slug) || notes.has(note.slug)) throw new Error('README城市短评标识重复或不合法。');
    for (const source of note.sources || []) {
      const url=new URL(source.url);
      if (url.protocol!=='https:' || url.username || url.password || !source.title || !datePattern.test(source.read_at) || source.read_scope!=='opened_official_tourism_body') throw new Error('README补充来源须为已读取的官方正文。');
    }
    notes.set(note.slug,note);
  }
  const cities=rankCities(catalog,editionState()).slice(0,TOP_COUNT);
  if (cities.length!==TOP_COUNT) throw new Error('本期不足十城，需补充资料后生成。');
  const reasons=new Set();
  return cities.map(city=>{
    const mean=city.months[SEASONAL_VIEW.month-1]?.meanC;
    if (!Number.isFinite(city.budget) || city.budget<=0 || !Number.isFinite(mean) || !visaLabels[city.visa?.code] || !/^[A-Z]{2}$/.test(city.countryCode)) throw new Error(city.slug+'缺少表格所需的消费、气候或入境字段。');
    const profile=profiles.get(city.slug);
    if (!profile) throw new Error(city.slug+'缺少城市来源。');
    const note=notes.get(city.slug);
    const reason=chooseReason(city,note,{...profile,sources:[...profile.sources,...(note?.sources||[])]});
    if (reasons.has(reason)) throw new Error('不同城市不得重复使用同一句短评。');
    reasons.add(reason);
    return {...city,reason};
  });
}

export function renderSeasonalBlock(catalog,editorial,edition) {
  const cities=seasonalTopTen(catalog,editorial,edition);
  const [year,month]=edition.month.split('-').map(Number);
  // GitHub strips CSS, but supports nowrap cells. Keep the table itself
  // scrollable on phones instead of breaking Chinese labels into columns.
  const lines=[START,`## ${year}年${month}月，去哪住一阵`,'',`<table tabindex="0" aria-label="${year}年${month}月十城推荐，可横向滚动">`,`<thead><tr><th scope="col" nowrap>城市</th><th scope="col" nowrap>月花费 / USD</th><th scope="col" nowrap>${month}月均温</th><th scope="col" nowrap>大陆护照</th><th scope="col" nowrap>为什么这个月去</th></tr></thead>`,'<tbody>'];
  for (const [index,city] of cities.entries()) lines.push(`<tr><td nowrap>${index+1}. <a href="${siteOrigin}/cities/${city.slug}/">${esc(city.name)}</a> ${flag(city.countryCode)}</td><td nowrap align="right">≈${cost(city)}</td><td nowrap align="right">${temperature(city)}</td><td nowrap>${visaLabels[city.visa.code]}</td><td nowrap>${esc(city.reason)}</td></tr>`);
  lines.push('</tbody>','</table>',END);
  const block=lines.join('\n');assertReaderCopy(block);return block;
}

export function renderChangesBlock(catalog,editorial,edition) {
  if (!Array.isArray(edition.changes) || edition.changes.length<3 || edition.changes.length>5 || new Set(edition.changes.map(change=>change.kind)).size!==edition.changes.length) throw new Error('本期变化须有3–5条且不重复。');
  const lines=[CHANGES_START,'## 本期变化',''];
  for (const change of edition.changes) {
    let text;
    if (change.kind==='layout') text=`本月推荐合并为${TOP_COUNT}城单表，每座城市只出现一次。`;
    else if (change.kind==='preset_weights') {
      const values=[PRESETS.budget.weights.cost,PRESETS.internet.weights.internet,PRESETS.safe.weights.safety];
      if (new Set(values).size!==1 || !Number.isFinite(change.previous_primary_weight) || change.previous_primary_weight<=values[0]) throw new Error('权重变化与当前预设不符。');
      text=`省钱、网速、安全的主权重从${change.previous_primary_weight}%降到${values[0]}%。`;
    } else if (change.kind==='travel_advisories') {
      const excluded=catalog.filter(city=>!recommendationEligible(city)).length;
      if (!excluded) throw new Error('没有可证实的出行排除更新。');
      text=`${excluded}座有明确暂勿前往提醒的城市退出推荐，城市资料保留。`;
    } else if (change.kind==='quick_filters') {
      const keys=quickFilters(editionState(),new Date(edition.updated_at+'T12:00:00+08:00')).map(filter=>filter.key);
      if (!['asia','domestic','abroad','month'].every(key=>keys.includes(key))) throw new Error('快捷筛选更新与网页实现不符。');
      text='新增亚洲、国内、国外标签，可叠加本月推荐。';
    } else throw new Error('未知本期变化类型：'+change.kind);
    if (!datePattern.test(change.recorded_at) || !change.recorded_at.startsWith(edition.month+'-') || change.recorded_at>edition.updated_at) throw new Error('本期变化必须记录本月实际发生的更新。');
    assertReaderCopy(text);lines.push('- '+text);
  }
  lines.push(CHANGES_END);return lines.join('\n');
}

function bounds(text,start,end) {
  const a=text.indexOf(start),b=text.indexOf(end);
  if (text.split(start).length!==2 || text.split(end).length!==2 || a<0 || b<a) throw new Error('README区块标记缺失、重复或顺序错误。');
  return {a,b:b+end.length};
}
export function replaceSeasonalBlock(readme,block,start=START,end=END) {
  const old=bounds(readme,start,end),next=bounds(block,start,end);
  if (next.a!==0 || next.b!==block.length) throw new Error('生成内容越过区块标记。');
  return readme.slice(0,old.a)+block+readme.slice(old.b);
}
export function replaceSeasonalBlocks(readme,table,changes) {
  const a=bounds(readme,START,END),b=bounds(readme,CHANGES_START,CHANGES_END);
  if (!(a.b<=b.a || b.b<=a.a)) throw new Error('README区块标记不可嵌套或交叉。');
  return replaceSeasonalBlock(replaceSeasonalBlock(readme,table),changes,CHANGES_START,CHANGES_END);
}

export async function generateSeasonalReadme({
  readmePath=resolve(webRoot,'../README.md'),
  rankingsPath=resolve(webRoot,'public/published-pages/rankings.json'),
  editorialPath=resolve(webRoot,`data/seasonal-${SEASONAL_VIEW.id}.json`),
  editionPath=resolve(webRoot,`data/readme-${SEASONAL_VIEW.id}.json`),
}={}) {
  const [original,rawCatalog,rawEditorial,rawEdition]=await Promise.all([readFile(readmePath,'utf8'),readFile(rankingsPath,'utf8'),readFile(editorialPath,'utf8'),readFile(editionPath,'utf8')]);
  const catalog=JSON.parse(rawCatalog),editorial=JSON.parse(rawEditorial),edition=JSON.parse(rawEdition);
  const table=renderSeasonalBlock(catalog,editorial,edition),changes=renderChangesBlock(catalog,editorial,edition);
  const updated=replaceSeasonalBlocks(original,table,changes);
  assertReaderCopy(updated);
  return {readmePath,original,updated};
}
async function main(args) {
  if (args.some(arg=>arg!=='--check') || args.length>1) throw new Error('用法：node scripts/update-seasonal-readme.mjs [--check]');
  const result=await generateSeasonalReadme();
  if (args.includes('--check')) {
    if (result.original!==result.updated) throw new Error('README本月十城或本期变化与资料不一致，请运行 npm run seasonal:readme。');
    console.log('README十城、短评与本期变化检查通过。');
  } else {
    if (result.original!==result.updated) await writeFile(result.readmePath,result.updated);
    console.log(`README已同步${SEASONAL_VIEW.id}十城主表与本期变化。`);
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
