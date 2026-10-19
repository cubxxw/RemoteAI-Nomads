import {TRAVELER_FIELDS,estimateTravelerBudget,budgetBalance} from './traveler-budget.js';
import {sitePath} from './site-path.js';

export const TRIP_MONTH_KEY='nomads-trip-month-v1';
const month=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12?Number(value):null;
export const readJourneyMonth=storage=>{try{return month(storage.getItem(TRIP_MONTH_KEY));}catch{return null;}};
export const planMonth=(url,saved,fallback)=>month(url.searchParams.get('month'))??month(saved)??month(fallback)??new Date().getUTCMonth()+1;
export function withPlanMonth(href,value){
  href=sitePath(href);
  if(!href.startsWith('/')||href.startsWith('//')||!month(value))return href;
  const url=new URL(href,'https://nomads.invalid');url.searchParams.set('month',String(month(value)));
  return url.pathname+url.search+url.hash;
}
const key=slug=>/^[-a-z0-9]{1,100}$/.test(slug)?'nomads-city-plan-v1:'+slug:null;
const validAmount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e9;
const validQuote=quote=>quote&&['CNY','USD','JPY'].includes(quote.currency)&&validAmount(quote.amount);
export function restoreQuote(row,rates={}){
 const restored={...row},quote=row.quote,rate=quote?.currency==='CNY'?1:rates[quote?.currency]?.rate;
 if(quote){if(Number.isFinite(rate)&&rate>0)restored.amount=quote.amount/rate;else restored.fxStale=true;}
 return restored;
}
function normalized(plan){
  if(plan?.version!==1||!month(plan.month)||!Number.isInteger(plan.days)||plan.days<1||plan.days>365||!['CNY','USD','JPY'].includes(plan.currency))return null;
  const values={};
  for(const field of Object.keys(TRAVELER_FIELDS)){
    const row=plan.values?.[field];
    if(!row||!['edited','reference','missing'].includes(row.origin)||!(row.amount===null||typeof row.amount==='number'&&Number.isFinite(row.amount)&&row.amount>=0&&row.amount<=1e9))return null;
    if((row.origin==='missing')!==(row.amount===null))return null;
    const quote=row.quote;
    if(quote!==undefined&&(row.origin!=='edited'||!['CNY','USD','JPY'].includes(quote?.currency)||!Number.isFinite(quote.amount)||quote.amount<0||quote.amount>1e9))return null;
    values[field]={amount:row.amount,origin:row.origin,...(row.cleared===true?{cleared:true}:{}),...(quote?{quote:{amount:quote.amount,currency:quote.currency}}:{})};
  }
  let meeting;
  if(plan.meeting!==undefined){
    const {date,hour}=plan.meeting||{},parsed=new Date(date+'T00:00:00Z');
    if(!/^20\d\d-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||!Number.isInteger(hour)||hour<0||hour>23)return null;
    meeting={date,hour};
  }
  let ceiling;
  if(plan.ceiling!==undefined){
    if(!validAmount(plan.ceiling?.amount)||plan.ceiling.quote!==undefined&&!validQuote(plan.ceiling.quote))return null;
    ceiling={amount:plan.ceiling.amount,...(plan.ceiling.quote?{quote:{amount:plan.ceiling.quote.amount,currency:plan.ceiling.quote.currency}}:{})};
  }
  return {version:1,month:month(plan.month),days:plan.days,currency:plan.currency,values,...(meeting?{meeting}:{}),...(ceiling?{ceiling}:{})};
}
export function readCityPlan(storage,slug){
  try{const name=key(slug),raw=name&&storage.getItem(name);return raw&&raw.length<=12000?normalized(JSON.parse(raw)):null;}catch{return null;}
}
export function writeCityPlan(storage,slug,plan){
  try{const name=key(slug),value=normalized(plan);if(!name||!value)return false;storage.setItem(name,JSON.stringify(value));return true;}catch{return false;}
}
export function restoredValues(defaults,plan,rates={}){
  return Object.fromEntries(Object.keys(TRAVELER_FIELDS).map(field=>{
    const previous=plan?.values[field],amount=defaults[field]?.amount??null;
    if(previous?.origin==='edited'){
      return [field,restoreQuote(previous,rates)];
    }
    return [field,previous?.origin==='missing'&&previous.cleared?{...previous}:{amount,origin:amount===null?'missing':'reference'}];
  }));
}
export function personalPlanSummary(plan){
 const record=normalized(plan);if(!record)return null;
 const values=Object.fromEntries(Object.entries(record.values).map(([key,row])=>[key,row.amount]));
 const estimate=estimateTravelerBudget(values,record.days),ceiling=record.ceiling?.amount??null;
 return {month:record.month,days:record.days,amount:estimate.amount,missing:estimate.missing,items:estimate.items,ceiling,remaining:budgetBalance(ceiling,estimate.amount).remaining,
  origins:Object.fromEntries(Object.entries(record.values).map(([key,row])=>[key,row.origin])),
  edited:Object.values(record.values).filter(row=>row.origin==='edited'&&row.amount!==null).length,
  references:Object.values(record.values).filter(row=>row.origin==='reference'&&row.amount!==null).length};
}
export function personalPlanDifference(a,b,selectedMonth){
 if(!a||!b)return {difference:null,reason:'unavailable'};
 if(a.month!==b.month||a.month!==selectedMonth)return {difference:null,reason:'month'};
 if(a.days!==b.days)return {difference:null,reason:'duration'};
 if(a.missing.length||b.missing.length)return {difference:null,reason:'missing'};
 if(a.amount===null||b.amount===null)return {difference:null,reason:'unavailable'};
 return {difference:Math.round((a.amount-b.amount)*100)/100,reason:null};
}
