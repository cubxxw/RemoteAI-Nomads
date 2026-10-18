// Imported samples never establish the full city's price floor. Reject a few
// observed universal negative claims; arithmetic about a named scenario stays
// valid. This is deliberately a narrow guard, not a semantic quality score.
const universal=/(?:整月|一个月|30天|长住)[^。；，,:：\n]{0,16}(?:不现实|不可能|不可行|住不起|撑不起)|(?:不够|不足以|不可能)[^。；，,:：\n]{0,12}(?:整月|一个月|30天)|(?:只有|只能|只适合)[^。；，,:：\n]{0,16}(?:借宿|换宿|免费食宿|免费住宿)|(?:整月租|住满一个月)[^。；，,:：\n]{0,14}不可行/;
const scoped=/这(?:组|套|个).{0,6}(?:假设|方案|情景|预算)|该(?:组|套|个).{0,6}(?:假设|方案|情景)|按.{0,20}(?:假设|开支|情景)|仅指.{0,12}(?:报价|房源|样本)|这(?:条|套|个).{0,8}(?:报价|房源|样本)/;
const denied=/不代表|不等于|不能据此|不能证明|不能断言|不能得出|无法断言|尚不能/;
export function auditAffordability(answer){
  for(const clause of answer.split(/[。；，,\n]/)){
    const match=clause.match(universal);
    if(!match)continue;
    const prefix=clause.slice(0,match.index);
    if(scoped.test(prefix)||denied.test(prefix))continue;
    throw Error('UNPROVEN_CITY_PRICE_FLOOR');
  }
}
