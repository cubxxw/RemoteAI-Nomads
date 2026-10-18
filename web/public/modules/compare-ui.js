const input=document.querySelector('#comparison-month');
if(input){
  const cities=JSON.parse(document.querySelector('#comparison-data').textContent);
  const initial=new URL(location.href).searchParams.get('month');
  if(Number(initial)>=1&&Number(initial)<=12&&Number.isInteger(Number(initial)))input.value=initial;
  const render=()=>{
    const month=Number(input.value);
    document.querySelector('#comparison-month-label').textContent=month+' 月气候';
    cities.forEach((city,index)=>{
      const record=city.months[month-1];
      const cell=document.querySelector(`[data-comparison-weather="${index}"]`);
      cell.querySelector('strong').textContent=record?.meanC===null||record?.meanC===undefined?'—':Math.round(record.meanC)+'°C';
      cell.querySelector('small').textContent=record?.rainMm===null||record?.rainMm===undefined?'降雨待补':'月雨量 '+Math.round(record.rainMm)+' mm';
    });
    document.querySelectorAll('.comparison-change').forEach(link=>{const url=new URL(link.href);url.searchParams.set('month',String(month));link.href=url.href;});
    document.querySelector('#comparison-month-status').textContent=`已显示${month}月的两地历史气候。`;
  };
  input.addEventListener('change',()=>{render();const url=new URL(location.href);url.searchParams.set('month',input.value);history.pushState(null,'',url);});
  addEventListener('popstate',()=>{const month=Number(new URL(location.href).searchParams.get('month'));input.value=String(Number.isInteger(month)&&month>=1&&month<=12?month:new Date().getUTCMonth()+1);render();});
  render();
}
const printButton=document.querySelector('#comparison-print');
printButton?.addEventListener('click',()=>window.print());
