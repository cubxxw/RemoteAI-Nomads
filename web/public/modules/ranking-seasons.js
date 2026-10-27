import {withPlanMonth} from './trip-state.js';
import {sitePath} from './site-path.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthRecord = (city, month) => city.months?.find(row => row.month === month);
const meanText = value => Number.isFinite(value) ? value.toFixed(1) + '°C' : '资料待补';

export function recommendedMonthRanges(months = []) {
  const values = [...new Set(months.filter(row => row.status === 'recommended' && Number.isInteger(row.month) && row.month >= 1 && row.month <= 12).map(row => row.month))].sort((a,b) => a-b);
  const ranges = [];
  for (let i=0; i<values.length; i++) {
    const start=values[i];
    while (i+1<values.length && values[i+1]===values[i]+1) i++;
    ranges.push((start===values[i] ? start : start+'—'+values[i])+'月');
  }
  return ranges.join('、') || '资料待补';
}

export function renderSeasonSummary(city, month) {
  const url=sitePath(withPlanMonth('/cities/'+encodeURIComponent(city.slug)+'/',month)+'#season');
  return `<div class="rank-season"><div class="rank-season-heading"><span>原资料推荐月份</span><a href="${escapeHTML(url)}" data-open-season="${escapeHTML(city.slug)}" aria-haspopup="dialog" aria-label="查看${escapeHTML(city.name)}全年气候">全年气候 <span aria-hidden="true">›</span></a></div><strong class="rank-season-range">${recommendedMonthRanges(city.months)}</strong><div class="rank-season-current"><span>${month}月历史均温</span><strong data-season-temperature>${meanText(monthRecord(city,month)?.meanC)}</strong></div></div>`;
}

export function renderAnnualSeasons(city, selectedMonth) {
  const labels={recommended:'推荐',caution:'需留意',unknown:'未标注'};
  return `<div class="rank-season-recommendation"><span>原资料推荐月份</span><strong>${recommendedMonthRanges(city.months)}</strong></div><table class="rank-season-table"><thead><tr><th scope="col">月份</th><th scope="col">历史均温</th><th scope="col">原资料标签</th></tr></thead><tbody>${Array.from({length:12},(_,i)=>{
    const month=i+1, row=monthRecord(city,month);
    return `<tr${month===selectedMonth?' class="is-selected"':''}><th scope="row">${month}月${month===selectedMonth?'<small>已选</small>':''}</th><td>${meanText(row?.meanC)}</td><td${row?.status==='recommended'?' class="is-recommended"':''}>${labels[row?.status] || '未标注'}</td></tr>`;
  }).join('')}</tbody></table><p class="rank-season-source">气温取 2023—2025 年历史月均值，不是天气预报。推荐、需留意和未标注沿用原资料记录。</p>`;
}

export function installRankingSeasons(root, getCity, getMonth) {
  const doc=root.ownerDocument;
  let dialog, opener;
  root.addEventListener('click',event=>{
    const link=event.target.closest('[data-open-season]');
    if (!link || event.defaultPrevented || event.button>0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const city=getCity(link.dataset.openSeason);
    if (!city) return;
    if (!dialog) {
      const candidate=doc.createElement('dialog');
      if (typeof candidate.showModal!=='function') return;
      dialog=candidate;
      dialog.id='ranking-season-dialog';dialog.className='rank-season-dialog';
      dialog.setAttribute('aria-labelledby','ranking-season-title');
      dialog.innerHTML='<button type="button" class="rank-season-close" aria-label="关闭全年气候">×</button><h2 id="ranking-season-title"></h2><div class="rank-season-content"></div><a class="rank-season-city-link">查看城市季节与入境详情 <span aria-hidden="true">›</span></a>';
      doc.body.append(dialog);
      dialog.addEventListener('click',ev=>{
        if (ev.target.closest('.rank-season-close')) dialog.close();
        if (ev.target===dialog) {
          const r=dialog.getBoundingClientRect();
          if(ev.clientX<r.left || ev.clientX>r.right || ev.clientY<r.top || ev.clientY>r.bottom) dialog.close();
        }
      });
      dialog.addEventListener('keydown',ev=>ev.stopPropagation());
      dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});
    }
    event.preventDefault();opener=link;
    const month=getMonth();
    dialog.querySelector('h2').textContent=city.name+' · 全年气候';
    dialog.querySelector('.rank-season-content').innerHTML=renderAnnualSeasons(city,month);
    dialog.querySelector('.rank-season-city-link').href=sitePath(withPlanMonth('/cities/'+encodeURIComponent(city.slug)+'/',month)+'#season');
    dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});
  });
}
