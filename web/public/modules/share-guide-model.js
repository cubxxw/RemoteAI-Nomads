import {createShare,shareURL} from './share-model.js';
import {readScenario,normalizeScenario,calculateBudget,writeScenario,formatMoney} from '../guide-assets/budget-model.mjs';
export function guideShare(page,article,inputURL,{includePersonal=false}={}){
 const config=page.config,base={kind:'guide',title:article.title,summary:article.summary,url:shareURL(inputURL,{kind:'guide'}),photos:article.photos||[],sources:Object.values(config.sources||{}).map(row=>({title:row.title||'文章资料',url:row.url,date:row.checkedOn||config.checkedOn||''}))};
 if(config.kind==='topic'||!config.defaultScenario)return createShare({...base,caveats:['核对日期 '+config.checkedOn+'；适用范围与完整来源见原文。']});
 const raw=readScenario(new URL(inputURL).search,config);if(!includePersonal)delete raw.housingNative;
 const scenario=normalizeScenario(raw,config),result=calculateBudget(config,scenario);const url=new URL(inputURL);url.search=writeScenario({...scenario,housingNative:undefined}).toString();
 const warnings=result.warnings||[],imageWarnings=warnings.filter((warning,index)=>index===warnings.length-1||/旺季住房金额未核|住房金额未知|非30晚住房|此币种没有/.test(warning));
 return createShare({...base,url:shareURL(url.href,{kind:'guide'}),private:includePersonal,summary:'',captionNotes:[...(article.summary?['原文摘要：'+article.summary]:[]),...warnings,'押金：'+result.depositNote,'核对 '+config.checkedOn+'；'+result.roundingNote],
  subtitle:'单人 / '+scenario.nights+'晚 / '+(config.seasonLabels?.[scenario.season]||scenario.season),
  facts:[{label:result.totalDisplay===null?'已知部分，尚非总价':'情景预算参考',value:formatMoney(result.totalDisplay??result.knownSubtotalDisplay,result.currency),note:includePersonal?'包含个人填写的房租，未经本站核价':'按文章公开选项重算，不含手填房租'}],
  caveats:imageWarnings,essentialCaveat:includePersonal?'含个人填写的房租，未经核价；机票、签证、保险与押金另计。公开链接不含手填金额。':'预算为规划演算，机票、签证、保险与押金另计；总价待询价时只显示已知部分。',linkNote:includePersonal?'图片与配文包含个人填写；公开链接只恢复文章的公开选项，不含手填房租。':'公开链接不含手填房租；预算按文章公开选项重算。'});
}
