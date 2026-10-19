// A visible planning scenario, never a claim that these samples form a market quote.
export const TRAVELER_FIELDS={
 rent:{label:'住宿',missing:'住宿',unit:'月'},
 food:{label:'餐费',missing:'餐费',unit:'天'},
 transport:{label:'当地交通',missing:'当地交通',unit:'月'},
 mobile:{label:'手机套餐',missing:'手机套餐',unit:'月'},
 other:{label:'其他日常开销',missing:'其他日常开销',unit:'月'},
};
const number=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
export function budgetBalance(ceiling,subtotal){
 const cap=number(ceiling),known=number(subtotal),error=cap!==null&&cap<0;
 return {remaining:error||cap===null||known===null?null:Math.round((cap-known)*100)/100,error};
}
export function travelerDefaults(items=[]) {
 const amount=row=>Number.isFinite(row.displayAmount)?row.displayAmount:row.currency==='CNY'&&Number.isFinite(row.amount)?row.amount:null;
 const valid=items.filter(row=>row.scope==='city'&&row.provider==='costcompass'&&row.quality!=='review'&&!row.quality_flags?.includes('rent_outlier_requires_review')&&amount(row)>0);
 const pick=(field,period)=>valid.find(row=>row.field===field&&row.period===period);
 const rent=['housing_1br_outside','housing_1br_center'].map(field=>pick(field,'month')).find(row=>row?.quality_flags?.includes('asking_rent'));
 const meal=pick('restaurant_inexpensive','meal'),pass=pick('transport_monthly_pass','month'),ticket=pick('transport_oneway_ticket','trip'),mobile=pick('utilities_mobile_10gb','month');
 const entry=(row,basis,multiplier=1)=>({amount:row?Math.round(amount(row)*multiplier*100)/100:null,basis,source:row?{url:row.source_url||null,date:row.observed_at||row.sample_end||null,field:row.field,originalAmount:row.amount,originalCurrency:row.currency,provider:'CostCompass'}:null});
 return {
  rent:entry(rent,rent?.field.endsWith('outside')?'一人整租一居室，中心区外月租样本':'一人整租一居室，月租挂牌样本'),
  food:entry(meal,'单人平价餐 × 每天 3 顿',3),
  transport:pass?entry(pass,'公共交通月票'):entry(ticket,'单程票 × 每天 2 次 × 30 天',60),
  mobile:entry(mobile,'10 GB 以上手机月套餐'),
  other:entry(null,'水电、工位等按自己的安排填写'),
 };
}
export function estimateTravelerBudget(values={},days=30,invalidFields=[]) {
 const length=number(days),items=Object.keys(TRAVELER_FIELDS).map(key=>({key,amount:number(values[key])}));
 const invalid=invalidFields.length>0||length===null||!Number.isInteger(length)||length<1||length>365||items.some(row=>row.amount!==null&&row.amount<0);
 const missing=items.filter(row=>row.amount===null).map(row=>TRAVELER_FIELDS[row.key].missing);
 if(invalid)return{amount:null,error:true,missing,items:[]};
 const rows=items.map(row=>({...row,total:row.amount===null?null:row.amount*(TRAVELER_FIELDS[row.key].unit==='天'?length:length/30)}));
 const known=rows.filter(row=>row.amount!==null);
 return{amount:known.length?Math.round(known.reduce((sum,row)=>sum+row.total,0)*100)/100:null,error:false,missing,items:rows};
}
