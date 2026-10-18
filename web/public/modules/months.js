export function monthRanges(months) {
  const sorted = [...new Set(months)].filter(month=>Number.isInteger(month)&&month>=1&&month<=12).sort((a,b)=>a-b);
  const groups=[];
  for(let index=0;index<sorted.length;index++){
    const first=sorted[index];let last=first;
    while(sorted[index+1]===last+1)last=sorted[++index];
    groups.push(first===last?String(first):`${first}–${last}`);
  }
  return groups;
}
export function compactMonths(months) {
  const groups = monthRanges(months);
  return groups.length ? groups.join('、') + ' 月' : '—';
}
