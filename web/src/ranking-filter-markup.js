import {RANKING_FX} from '../public/modules/budget-currency.js';
import {esc} from './render.js';
import {VISA_LABELS} from '../public/modules/rank-controls.js';
import {SEASONAL_VIEW} from '../public/modules/ranking.js';

export function rankingFilterMarkup(state,option,icon){
 return `<div id="rank-filter-popover" class="rank-filter-popover" role="dialog" aria-label="筛选城市" hidden>
 <div class="rank-popover-heading"><strong>筛选城市</strong><button type="button" data-close-filters class="rank-icon-button" aria-label="关闭筛选">${icon('close')}</button></div>
 <div class="rank-filter-fields">
 <label>地区<select data-filter-input="region" id="filter-region">${option('','所有地区',state.region)}${['亚洲','欧洲','美洲','非洲','大洋洲'].map(r=>option(r,r,state.region)).join('')}</select></label>
 <label>大陆护照入境<select data-filter-input="visa" id="filter-visa">${option('','不限方式',state.visa)}${Object.entries(VISA_LABELS).map(([v,l])=>option(v,l,state.visa)).join('')}</select></label>
 <div class="rank-budget-field"><label for="filter-budget">每月参考上限</label><div class="rank-budget-entry"><input type="number" id="filter-budget" data-filter-input="budget" min="0.01" max="10000000" step="0.01" inputmode="decimal" value="${esc(state.budget??'')}" placeholder="不限，或填你的金额" aria-describedby="ranking-budget-note ranking-budget-error"><select data-filter-input="budgetCurrency" id="filter-budget-currency" aria-label="预算币种">${option('USD','美元 USD',state.budgetCurrency)}${option('CNY','人民币 CNY',state.budgetCurrency)}</select></div></div>
 <label class="rank-month-field">出发月份<select data-filter-input="month" id="filter-month">${option(null,'未指定（按本月）',state.month)}${Array.from({length:12},(_,i)=>option(i+1,i+1+'月',state.month)).join('')}</select></label></div>
 <p id="ranking-budget-error" class="rank-filter-note" role="status" hidden>金额需大于0，最多1000万，保留两位小数；留空为不限。</p>
 <label class="rank-incomplete-toggle"><input id="recommended-only" type="checkbox"${state.recommendedOnly||state.season===SEASONAL_VIEW.id?' checked':''}${state.month?'':' disabled'}><span>只看该月的原推荐记录</span></label>
 <p class="rank-filter-note">选月份会切换舒适度；勾选后才按原推荐标签缩小范围。</p>
 <label class="rank-incomplete-toggle"><input id="include-incomplete" type="checkbox"${state.incomplete||state.country==='CN'?' checked':''}${state.country==='CN'?' disabled':''}><span id="incomplete-label">${state.country==='CN'?'国内视角保留未评分目的地':'包含指标待补的城市'}</span></label>
 <p class="rank-filter-note" id="ranking-budget-note">按历史月花费筛选，人民币用 <a href="${RANKING_FX.source}" target="_blank" rel="noopener noreferrer">${RANKING_FX.date} ECB 参考汇率</a>换算。缺价城市不纳入预算筛选；入境标签待核验。</p>
 <div class="rank-popover-footer"><button type="button" id="clear-filters" class="rank-text-button">清除筛选</button><button type="button" data-close-filters class="rank-pill rank-solid">查看结果</button></div></div>`;
}
