import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseState, rankCities, SEASONAL_VIEW, stateParams } from '../public/modules/ranking.js';
import { UI_PRESETS } from '../public/modules/rank-controls.js';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const GROUP_KEYS = ['default', 'budget', 'internet', 'visa', 'safe'];
export const START = '<!-- seasonal:2026-10:start -->';
export const END = '<!-- seasonal:2026-10:end -->';
const siteOrigin = 'https://nomads.cubxxw.com';
const guide = 'guides/seasonal-2026-10.md';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const md = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');

// Editorial text supplies context and citations, never the membership or order.
export function seasonalGroups(catalog, editorial) {
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

export function renderSeasonalBlock(catalog, editorial) {
  const groups = seasonalGroups(catalog, editorial);
  const count = new Set(groups.flatMap(group => group.cities.map(city => city.slug))).size;
  const [year, month] = editorial.month.split('-').map(Number);
  const lines = [
    START,
    `## ${year} 年 ${month} 月，先看这五组`,
    '',
    `每组取网站本期视角的前五名，共 ${count} 座城市。核读于 ${editorial.checked_at}，适合先试住一周，再决定是否住整月。`,
    '',
    '综合推荐保留原 Metric Score；省钱、网速和安全视角把主指标权重设为 **50%**，其余指标合计50%，与网页一致。已核读暂勿前往提醒先于权重生效。个性化花费分由旧月参考连续换算。签证友好先筛大陆普通护照免签标签，再按综合分排序；免签入境与工作许可分别核实。网络仍是旧评分，**不是 Mbps**。',
    '',
    `${SEASONAL_VIEW.note} [筛选理由与来源](${guide})。`,
    '',
  ];
  for (const group of groups) {
    lines.push(`### ${group.label}`, '');
    if (group.key === 'budget') {
      const values = group.cities.map(city => city.budget);
      if (values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('省钱前五的旧月参考金额不完整。');
      lines.push(`本组旧月参考为 **USD ${Math.min(...values).toLocaleString('en-US')}–${Math.max(...values).toLocaleString('en-US')}**；住宿条件和包含项未统一，不能视为现价或最低生活门槛。`, '');
    }
    if (group.key === 'safe') lines.push('采用旧安全评分排序；出发前仍要核对最新旅行提醒与具体街区。', '');
    lines.push(group.key === 'budget' ? '| 城市 | 旧月参考 / USD | 十月的工作与生活 |' : '| 城市 | 十月的工作与生活 |');
    lines.push(group.key === 'budget' ? '| --- | ---: | --- |' : '| --- | --- |');
    for (const [index, city] of group.cities.entries()) {
      const cells = [`${index + 1}. [${md(city.name)}](${siteOrigin}/cities/${city.slug}/)`];
      if (group.key === 'budget') cells.push(`$${city.budget.toLocaleString('en-US')}`);
      cells.push(`${md(city.editorial.summary)} [来源](${guide}#${city.slug})`);
      lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('', `[更多${group.label} · ${group.total} 座城市 →](${group.url})`, '');
  }
  lines.push(
    `这 ${count} 城都做过 web、Reddit、X 和小红书定向检索；原帖、部分评论与搜索摘要分别记录，**并非四个平台的正文都已读到**。季节依据包括常年气候与历史体验，未冒充本月天气、房价或全城网速。[逐城来源与读取范围](${guide})。`,
    END,
  );
  return lines.join('\n');
}

export function replaceSeasonalBlock(readme, block) {
  const starts = readme.split(START).length - 1;
  const ends = readme.split(END).length - 1;
  if (starts || ends) {
    if (starts !== 1 || ends !== 1 || readme.indexOf(END) < readme.indexOf(START)) throw new Error('README 本期区块标记缺失、重复或顺序错误。');
    return readme.slice(0, readme.indexOf(START)) + block + readme.slice(readme.indexOf(END) + END.length);
  }
  // One-time migration of the existing README; all later runs use the markers.
  const start = readme.indexOf('## 先缩小到几个选择\n');
  const end = readme.indexOf('网站打开就是排行。', start);
  if (start < 0 || end < 0) throw new Error('README 没有本期标记；请明确放置区块，避免改写其他内容。');
  return readme.slice(0, start) + block + '\n\n## 按自己的条件看排行\n\n' + readme.slice(end);
}

export async function generateSeasonalReadme({
  readmePath = resolve(webRoot, '../README.md'),
  rankingsPath = resolve(webRoot, 'public/published-pages/rankings.json'),
  editorialPath = resolve(webRoot, 'data/seasonal-2026-10.json'),
} = {}) {
  const [readme, rankings, editorial] = await Promise.all([readFile(readmePath, 'utf8'), readFile(rankingsPath, 'utf8'), readFile(editorialPath, 'utf8')]);
  const content = renderSeasonalBlock(JSON.parse(rankings), JSON.parse(editorial));
  return { readmePath, original: readme, updated: replaceSeasonalBlock(readme, content) };
}

async function main(args) {
  if (args.some(arg => arg !== '--check') || args.length > 1) throw new Error('用法：node scripts/update-seasonal-readme.mjs [--check]');
  const result = await generateSeasonalReadme();
  if (args.includes('--check')) {
    if (result.original !== result.updated) throw new Error('README 本期内容与网站排序或短评不一致；请运行 npm run seasonal:readme。');
    console.log('README 本期五组与公开快照、网站排序及短评一致。');
  } else {
    if (result.original !== result.updated) await writeFile(result.readmePath, result.updated);
    console.log(`README 已同步 ${SEASONAL_VIEW.id} 的五组 Top 5。`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
