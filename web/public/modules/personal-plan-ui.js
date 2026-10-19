import {readCityPlan,personalPlanSummary,personalPlanDifference} from './trip-state.js';
import {TRAVELER_FIELDS} from './traveler-budget.js';

const money=value=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2,minimumFractionDigits:0}).format(value);
export function initPersonalComparison(cities,readMonth){
 const panel=document.querySelector('#personal-comparison');if(!panel)return ()=>{};
 const storage={getItem:key=>localStorage.getItem(key)};let first=true;
 const render=()=>{
  const month=readMonth(),summaries=cities.map(city=>personalPlanSummary(readCityPlan(storage,city.slug)));
  summaries.forEach((summary,index)=>{
   const card=panel.querySelector(`[data-personal-plan="${index}"]`);
   card.querySelector('[data-personal-period]').textContent=summary?`${summary.month}月 · ${summary.days}天`:'还没有可读取的本机方案';
   card.querySelector('[data-personal-total]').textContent=summary?.amount!==null&&summary?.amount!==undefined?money(summary.amount):'—';
   card.querySelector('[data-personal-origin]').textContent=summary?`${summary.edited}项由你调整 · ${summary.references}项为本城参考`:'到城市页填写或调整，再回来对照';
   card.querySelector('[data-personal-missing]').textContent=summary?(summary.missing.length?'未计入：'+summary.missing.join('、')+'。':'已计入五项日常开销。')+'往返交通、押金、保险和签证仍需另计。':'本城缺价不会自动补成0。';
   const cap=card.querySelector('[data-personal-ceiling]');cap.hidden=summary?.ceiling===null||!summary;
   cap.textContent=summary?.ceiling!==null&&summary?`上限 ${money(summary.ceiling)}${summary.remaining===null?'':summary.remaining<0?' · 已知开销超出 '+money(-summary.remaining):' · 已知小计后还余 '+money(summary.remaining)}`:'';
   const list=card.querySelector('[data-personal-items]');list.replaceChildren();
   if(summary)for(const item of summary.items){
    const row=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');term.textContent=TRAVELER_FIELDS[item.key].label;
    value.textContent=item.amount===null?'未计入':money(item.total)+' · '+(summary.origins[item.key]==='edited'?'你填':'参考');
    row.append(term,value);list.append(row);
   }
   const details=card.querySelector('details');details.hidden=!summary;
   const link=card.querySelector('[data-personal-edit]');link.href=sitePath(`/cities/${encodeURIComponent(cities[index].slug)}/?month=${month}#budget`);
   link.textContent=summary&&summary.month!==month?`按当前${month}月调整`:'调整这座城市的开销';
  });
  const comparison=personalPlanDifference(...summaries,month),status=panel.querySelector('[data-personal-difference]');
  status.textContent=comparison.difference===null?({unavailable:'保存两城的个人方案后，可以在这里继续对照。',missing:'仍有日常开销未填，先比较已知项目；暂不计算两城差额。',duration:'两份方案停留天数不同，暂不计算差额；可到城市页调整为同样天数。',month:'个人方案与当前对比月份不同，调整后再比较差额。'})[comparison.reason]:`同为${summaries[0].days}天，已知日常开销相差 ${money(Math.abs(comparison.difference))}。差额未含上方列出的其他旅行费用。`;
  if(first){panel.open=summaries.some(summary=>summary&&(summary.edited>0||summary.ceiling!==null));first=false;}
 };
 addEventListener('pageshow',render);
 addEventListener('storage',event=>{if(event.key===null||event.key?.startsWith('nomads-city-plan-v1:'))render();});
 return render;
}
import {sitePath} from './site-path.js';
