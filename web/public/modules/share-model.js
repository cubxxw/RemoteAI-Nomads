import {parseState,stateParams,displayMonth,LABELS} from './ranking.js';
import {additionalFilters,viewLabel} from './rank-controls.js';
import {travelAdvisory} from './recommendation-policy.js';

export const SHARE_FORMATS=Object.freeze([
 {id:'portrait',label:'编辑竖图',hint:'小红书 / 微信',width:1080,height:1440},
 {id:'square',label:'通用方图',hint:'朋友圈 / 群聊',width:1080,height:1080},
 {id:'feed',label:'信息流',hint:'Instagram / LinkedIn',width:1080,height:1350},
 {id:'landscape',label:'横向卡片',hint:'链接 / 横图',width:1200,height:630},
 {id:'story',label:'全屏竖图',hint:'Story / 状态',width:1080,height:1920},
].map(Object.freeze));
const text=(value,max=1000)=>{const result=String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();if(result.length>max)throw Error('内容较长，请缩短后再生成图片。');return result;};
function safeURL(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('分享地址不可用。');return url;}
const monthValue=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12?Number(value):null;
export function shareURL(input,{kind='page',month,base='',includeHousing=false}={}){
 const url=safeURL(input),raw=new URLSearchParams(url.search);url.search='';
 if(kind==='ranking'){
  const state=parseState(new URL(input));state.month=monthValue(month)||displayMonth(state);url.search=stateParams(state).toString();
 }else{
  const allowed=kind==='guide'?['tier','nights','season','work','currency',...(includeHousing?['housing']:[])]:kind==='directory'?['q','region','country','covered']:[];
  for(const key of allowed){const value=raw.get(key);if(value===null)continue;
   if(key==='nights'&&(!/^\d{1,3}$/.test(value)||Number(value)<1||Number(value)>365))continue;
   if(key==='housing'&&(!/^\d{1,9}(?:\.\d{1,2})?$/.test(value)||Number(value)>100000000))continue;
   if(key==='currency'&&!['CNY','USD','EUR','JPY','THB','MYR','VND','NPR','IDR','AZN','TRY','BGN'].includes(value))continue;
   if(value.length<=100&&!/[\u0000-\u001f<>]/.test(value))url.searchParams.set(key,value);
  }
  if(['city','comparison'].includes(kind)){const selected=monthValue(month)||monthValue(raw.get('month'));if(selected)url.searchParams.set('month',selected);}
 }
 if(!/^#[a-z][a-z0-9-]{0,60}$/i.test(url.hash))url.hash='';
 // An application's mount is carried by pathname, never reconstructed from a host guess.
 void base;return url.href;
}
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export function createShare(input){
 const fact=row=>({label:text(row.label,140),value:text(row.value??'待补充',400),note:text(row.note,400)});
 const source=row=>({title:text(row.title,200),url:row.url?safeURL(row.url).href:null,date:text(row.date,80)});
 const result={kind:text(input.kind||'page',30),title:text(input.title,200),subtitle:text(input.subtitle,300),summary:text(input.summary,1200),body:text(input.body,24000),url:input.url?safeURL(input.url).href:null,
  facts:(input.facts||[]).map(fact),items:(input.items||[]).map(row=>({title:text(row.title,200),detail:text(row.detail,600)})),
  caveats:(input.caveats||[]).map(value=>text(value,1000)),captionNotes:(input.captionNotes||[]).map(value=>text(value,1000)),sources:(input.sources||[]).map(source),
  photos:(input.photos||[]).filter(row=>row.credit&&row.source&&/^\/(?!\/)/.test(row.url||'')).map(row=>({url:text(row.url,1000),credit:text(row.credit,4000),source:safeURL(row.source).href,label:text(row.label,200)})),
  private:input.private===true,essentialCaveat:text(input.essentialCaveat,400),linkNote:text(input.linkNote,500)};
 if(!result.title)throw Error('分享内容还没有标题。');return freeze(result);
}
export const amountText=(value,currency='USD')=>value===null||value===undefined||value===''?'待补充':new Intl.NumberFormat('zh-CN',{style:'currency',currency,maximumFractionDigits:0}).format(value);
export function cityShare(city,month,inputURL){
 const weather=city.months?.find(row=>Number(row.month)===month),advisory=travelAdvisory(city);
 return createShare({kind:'city',title:city.name,subtitle:[city.nameEn,city.country].filter(Boolean).join(' / '),summary:advisory?.reason||city.why||'',url:shareURL(inputURL,{kind:'city',month}),
  facts:[{label:'历史月参考',value:amountText(city.budget,city.budgetCurrency||'USD'),note:city.budgetCheckedAt?'核对 '+city.budgetCheckedAt:'资料日期待核对'},{label:month+'月历史均温',value:weather?.meanC===null||weather?.meanC===undefined?'待补充':Math.round(weather.meanC)+'°C',note:'2023–2025 年气候参考'}],
  photos:[{url:city.photo,credit:city.photoCredit,source:city.photoSource,label:city.name}],
  caveats:[...(advisory?[advisory.reason]:[]),'花费为历史参考，实际短租另询价；气候不是天气预报。',...(city.visa?.label?['大陆护照：'+city.visa.label+'，旧资料待复核；工作许可另查。']:[])],
  sources:[{title:'城市资料与来源',url:shareURL(inputURL,{kind:'city',month}),date:city.checkedAt||''}]});
}
export function rankingShare(cities,state,inputURL,actualMonth=displayMonth(state)){
 const params=stateParams({...state,month:actualMonth}),url=new URL(inputURL);url.search=params.toString();url.hash='';
 const filters=additionalFilters({...state,month:actualMonth}).map(row=>row.label);
 const sortedWeights=Object.entries(state.weights).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
 return createShare({kind:'ranking',title:actualMonth+'月，下一站住哪里',subtitle:viewLabel(state),summary:filters.join('，')||'按你的偏好，看看适合住一阵的城市。',url:shareURL(url.href,{kind:'ranking',month:actualMonth}),
  items:cities.slice(0,3).map(city=>({title:city.name,detail:[city.country,amountText(city.budget,city.budgetCurrency||'USD')+' / 月历史参考'].filter(Boolean).join('  ')})),
  photos:cities.slice(0,1).map(city=>({url:city.photo,credit:city.photoCredit,source:city.photoSource,label:city.name})),
  facts:cities.length?[]:[{label:'当前条件',value:'暂时没有符合的城市',note:'打开链接可继续调整条件'}],
  caveats:['排行按当前偏好计算，图中最多三城；全部条件与权重随链接保留。','花费为历史参考，入境标签待复核；个人报价和会议未包含。'],captionNotes:['排名权重：'+sortedWeights.map(([key,value])=>LABELS[key]+value).join('、')],sources:[{title:'排行与资料口径',url:url.origin+url.pathname.replace(/\/cities\/?$/,'/').replace(/\/?$/,'/')+'about/',date:''},...cities.slice(0,3).map(city=>({title:city.name+'历史月参考',date:city.budgetCheckedAt||'日期待核对'}))]});
}
export function shareText(card){
 return [card.title,card.subtitle,card.summary,card.body,...card.facts.map(row=>[row.label+'：'+row.value,row.note].filter(Boolean).join('，')),...card.items.map(row=>[row.title,row.detail].filter(Boolean).join('：')),...card.caveats,...card.captionNotes,...card.sources.map(row=>[row.title,row.date,row.url].filter(Boolean).join(' ')),...card.photos.map(row=>'照片：'+row.credit+' '+row.source),card.linkNote,card.url].filter(Boolean).join('\n\n');
}
export function comparisonShare(cities,month,inputURL){
 const warnings=cities.map(city=>travelAdvisory(city)).filter(Boolean);
 return createShare({kind:'comparison',title:cities.map(city=>city.name).join(' 与 '),subtitle:month+'月 / 两城之间',url:shareURL(inputURL,{kind:'comparison',month}),
  summary:'把住一个月的参考，放在一起看。',items:cities.map(city=>{const weather=city.months?.find(row=>Number(row.month)===month);return {title:city.name,detail:'历史月参考 '+amountText(city.budget,city.budgetCurrency||'USD')+'；'+month+'月历史均温 '+(weather?.meanC==null?'待补充':Math.round(weather.meanC)+'°C')};}),
  caveats:[...warnings.map(warning=>warning.reason),'花费为历史参考，住宿条件未必相同；气候不是天气预报。','入境标签待复核，工作许可另查；不含个人报价。'],essentialCaveat:warnings.map(warning=>warning.reason).join(' '),sources:[...warnings.map(warning=>({title:'官方出行提醒',url:warning.url})),...cities.map(city=>({title:city.name+'资料',url:new URL('../..',inputURL).origin+new URL(inputURL).pathname.split('/compare/')[0]+'/cities/'+city.slug+'/',date:city.budgetCheckedAt||city.checkedAt||''}))]});
}
