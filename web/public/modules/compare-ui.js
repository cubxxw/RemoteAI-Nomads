import {initPersonalComparison} from './personal-plan-ui.js';
import {KEYS,scoringValues,comparisonFitText} from './ranking.js';
import {comparableMetric} from './places.js';
const input=document.querySelector('#comparison-month');
if(input){
  const cities=JSON.parse(document.querySelector('#comparison-data').textContent);
  const renderPersonal=initPersonalComparison(cities,()=>Number(input.value));
  const initial=new URL(location.href).searchParams.get('month');
  if(Number(initial)>=1&&Number(initial)<=12&&Number.isInteger(Number(initial)))input.value=initial;
  const render=()=>{
    const month=Number(input.value);
    renderPersonal();
    document.querySelector('#comparison-month-label').textContent=month+' 月气候';
    cities.forEach((city,index)=>{
      const fit=document.querySelector(`.comparison-city-${index} .comparison-city-fit`);
      const sourceLink=fit.querySelector('a')?.cloneNode(true);
      fit.replaceChildren(document.createTextNode(comparisonFitText(city,cities[1-index],month)));
      if(sourceLink)fit.append(' ',sourceLink);
      const record=city.months[month-1];
      const cell=document.querySelector(`[data-comparison-weather="${index}"]`);
      cell.querySelector('strong').textContent=record?.meanC===null||record?.meanC===undefined?'—':Math.round(record.meanC)+'°C';
      cell.querySelector('small').textContent=record?.rainMm===null||record?.rainMm===undefined?'降雨待补':'月雨量 '+Math.round(record.rainMm)+' mm';
    });
    for(const key of KEYS){
      const row=document.querySelector(`[data-comparison-metric="${key}"]`);if(!row)continue;
      const values=cities.map(city=>scoringValues(city,month)[key]);
      const known=values.every(Number.isFinite)&&comparableMetric(key,...cities),diff=known?Math.abs(values[0]-values[1]):0;
      if(known&&diff===0)row.setAttribute('data-equal','true');else row.removeAttribute('data-equal');
      row.querySelectorAll('td').forEach((cell,index)=>{
        const winner=known&&diff>0&&values[index]>values[1-index];cell.classList.toggle('comparison-winner',winner);
        cell.querySelector('strong').textContent=Number.isFinite(values[index])?values[index].toFixed(1):'—';
        cell.querySelector('.winner-label')?.remove();if(winner){const badge=document.createElement('span');badge.className='winner-label';badge.textContent='高 '+diff.toFixed(1);cell.querySelector('.comparison-value').append(badge);}
      });
    }
    document.querySelectorAll('.comparison-change').forEach(link=>{const url=new URL(link.href);url.searchParams.set('month',String(month));link.href=url.href;});
    document.querySelector('#comparison-month-status').textContent=`已显示${month}月的两地历史气候。`;
    document.dispatchEvent(new CustomEvent('nomads:journey-month',{detail:month}));
  };
  input.addEventListener('change',()=>{render();const url=new URL(location.href);url.searchParams.set('month',input.value);history.pushState(null,'',url);});
  addEventListener('popstate',()=>{const month=Number(new URL(location.href).searchParams.get('month'));input.value=String(Number.isInteger(month)&&month>=1&&month<=12?month:new Date().getUTCMonth()+1);render();});
  render();
}
const printButton=document.querySelector('#comparison-print');
printButton?.addEventListener('click',()=>window.print());
