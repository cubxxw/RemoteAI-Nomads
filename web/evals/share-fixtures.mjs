import {createShare,cityShare,comparisonShare,rankingShare,personalShare} from '../public/modules/share-model.js';
import {parseState,rankCities} from '../public/modules/ranking.js';
import {readFileSync} from 'node:fs';
import {guideShare} from '../public/modules/share-guide-model.js';
export function shareFixtures(catalog){
 const origin='https://roamorrow.com/nomads',city=slug=>catalog.find(row=>row.slug===slug),cards=[];
 const add=(id,card)=>cards.push({id,card});
 for(const slug of ['chiang-mai','penang','lisbon','plovdiv','hanoi','dali','baku','ubud']){const c=city(slug);if(c)add('city-'+slug,cityShare(c,11,origin+'/cities/'+slug+'/'));}
 for(const [id,query] of [['default',''],['cny','budget=6000&budgetCurrency=CNY&month=11&w=20,10,5,3,70,2'],['empty','q=不存在的城市abc'],['all','region=亚洲&budget=1000&visa=visa_free&month=11&recommendedOnly=1'],['custom','month=1&w=90,1,2,3,4,0']]){const url=new URL(origin+'/?'+query),state=parseState(url);state.month||=11;add('ranking-'+id,rankingShare(rankCities(catalog,state),state,url.href,state.month));}
 for(const [index,pair] of [['chiang-mai','penang'],['lisbon','plovdiv'],['dali','chiang-mai']].entries())add('comparison-'+index,comparisonShare(pair.map(city),11,origin+'/compare/'+pair.slice().sort().join('-vs-')+'/'));
 const simple=[
  ['guide','guide','住一个月，先把账算清楚','住宿、吃饭和工作各算一笔；不能把参考价当成可订报价。'],
  ['topic','guide','11月去哪住一阵','按月份查历史气候，再确认自己的出发条件。'],
  ['no-photo','guide','一个完整的远程工作日','先在房间里接一次会议，再决定住多久。'],
  ['checklist','checklist','第一周落地清单','住处、网络、会议和周围生活条件，分开核对。'],
  ['directory','directory','全球国家与地区目录','目录收录不代表旅行条件已经全部核验。'],
  ['method','page','这些数据从哪里来','各项资料保留自己的口径与日期。'],
  ['answer','answer','选城笔记','这一条是你明确选择的回答，不含问题和完整对话。'],
  ['long-answer','answer','把预算核对到具体住法','住宿条件、月份与天数需要放在同一口径下。\n\n'.repeat(40)],
  ['mixed','page','Chiang Mai / 清迈，31晚','含中英文、CNY 6,000、日期2026-10-26和原币单位。'],
  ['long-title','page','在普罗夫迪夫住一个月：先把具体房型、工作时间和费用包含范围问清楚','长标题应自然换行，不能缩小成难以阅读的细字。'],
  ['missing','city','资料待补的城市','价格和气候缺失时保留缺口。'],
  ['private-plan','city','我的清迈计划','个人填写，仅用于这次安排。'],
  ['zero','city','计划不花这一笔','主动填写0，和没有资料是不同状态。'],
  ['caveat','guide','先查停留条件','入境与合法远程工作需要分别确认。'],
  ['source-dates','page','同一张图，不同资料日期','核对日期与图片生成日期分开。'],
  ['unicode','page','槟城（George Town）与大理','标点、长英文PlaceNameWithoutSpaces和换行都应完整。'],
 ];
 for(const [id,kind,title,body] of simple)add(id,createShare({kind,title,body,private:id==='private-plan',url:kind==='answer'?null:origin+'/guides/',facts:id==='missing'?[{label:'月参考',value:'待补充'}]:id==='zero'?[{label:'个人填写',value:'CNY 0'}]:[],caveats:['历史资料供参考，出发前核对具体条件。'],sources:[{title:'数据与方法',date:'2026-10-17',url:origin+'/about/'}]}));
 for(const slug of ['varna','brno']){const c=city(slug);if(c)add('holdout-'+slug,cityShare(c,11,origin+'/cities/'+slug+'/'));}
 const longState=parseState(new URL(origin+'/?q='+encodeURIComponent('清迈'.repeat(50))));longState.month=11;add('holdout-long-link',rankingShare([],longState,origin+'/',11));
 add('holdout-advisory',comparisonShare([city('kabul'),city('chiang-mai')],11,origin+'/compare/chiang-mai-vs-kabul/'));
 add('personal-city-advisory',personalShare(cityShare(city('kabul'),11,origin+'/cities/kabul/'),{summary:'我的方案',facts:[{label:'已知开销小计',value:'CNY 6,000'}],caveats:['机票与押金另计。']}));
 add('personal-comparison-advisory',personalShare(comparisonShare([city('kabul'),city('chiang-mai')],11,origin+'/compare/chiang-mai-vs-kabul/'),{summary:'我的方案',facts:[{label:'已知开销小计',value:'CNY 6,000'}],caveats:['机票与押金另计。']}));

 const guideHTML=readFileSync(new URL('../content/city-guides/chiang-mai-monthly-budget.html',import.meta.url),'utf8'),guide=JSON.parse(guideHTML.match(/<script type="application\/json" id="guide-config">([\s\S]*?)<\/script>/)[1]);
 add('holdout-budget-peak',guideShare(guide,{title:'清迈住31晚，旺季先问总价',summary:'按文章公开选项重算，未包含个人房租。'},origin+'/guides/chiang-mai-monthly-budget/?nights=31&season=peak&currency=CNY&housing=9876543'));
 return cards;
}
export function defaultShareCard(catalog){const city=catalog.find(row=>row.slug==='chiang-mai');return createShare({kind:'page',title:'换个地方，好好工作与生活。',subtitle:'Roamorrow Nomads',summary:'选城市，算预算，核对出发条件。',url:'https://roamorrow.com/nomads/',photos:city?[{url:city.photo,credit:city.photoCredit,source:city.photoSource,label:city.name}]:[],caveats:['价格、历史气候与停留条件各有口径，完整资料见原页。'],sources:[{title:'清迈城市实景；资料与来源见原页',url:'https://roamorrow.com/nomads/about/'}]});}
