// Reviewed public advisories. Exclusion is an editorial recommendation decision,
// not a legal travel ban or a claim that the rest of the catalog is safe.
export const ADVISORY_REVIEW_DATE = '2026-10-18';
export const RECOMMENDATION_POLICY_URL = 'https://github.com/cubxxw/RemoteAI-Nomads/blob/main/web/docs/recommendation-policy.md';
export const REVIEWED_ADVISORIES = [
  {id:'travel:AF',countryCode:'AF',scope:'country',label:'阿富汗',publishedAt:'2026-01-26',title:'提醒中国公民暂勿前往阿富汗',url:'https://www.mfa.gov.cn/wjbzwfwpt/kzx/aqtx/zwqw/202601/t20260126_11845066.html',reason:'官方暂勿前往提醒；不参与出发推荐'},
  {id:'travel:IR',countryCode:'IR',scope:'country',label:'伊朗',publishedAt:'2026-04-28',title:'再次提醒：中国公民暂勿前往伊朗',url:'https://www.mfa.gov.cn/wjbzwfwpt/kzx/aqtx/zwqw/202604/t20260429_11902175.html',reason:'官方暂勿前往提醒；不参与出发推荐'},
  {id:'travel:SY',countryCode:'SY',scope:'country',label:'叙利亚',publishedAt:'2026-04-07',title:'再次提醒中国公民近期暂勿前往叙利亚',url:'https://sy.china-embassy.gov.cn/lsyw/zytz/202604/t20260407_11887903.htm',reason:'官方暂勿前往提醒；不参与出发推荐'},
  {id:'travel:ML',countryCode:'ML',scope:'country',label:'马里',publishedAt:'2026-01-04',title:'提醒中国公民近期暂勿前往马里',url:'https://www.mfa.gov.cn/wjbzwfwpt/kzx/aqtx/zwqw/202601/t20260104_11801778.html',reason:'官方暂勿前往提醒；巴马科等相对安全撤离点不等于旅行推荐'},
  {id:'travel:SO',countryCode:'SO',scope:'country',label:'索马里',publishedAt:'2023-08-28',title:'驻索马里使馆再次提醒中国公民暂勿前往索马里',url:'https://so.china-embassy.gov.cn/chn/lsfw/fsxz/202308/t20230828_11134140.htm',reason:'使馆已发布极高风险及暂勿前往提醒；不参与出发推荐'},
  {id:'travel:SD:khartoum',countryCode:'SD',scope:'cities',citySlugs:['khartoum'],label:'苏丹喀土穆',publishedAt:null,title:'苏丹旅行风险等级和安全提醒',url:'https://cs.mfa.gov.cn/ljmdd/fz_648564/sd_651667/',reason:'喀土穆州被列为红色极高风险地区；不外推为苏丹全国同一级别'},
  {id:'travel:LY:tripoli',countryCode:'LY',scope:'cities',citySlugs:['tripoli'],label:'利比亚的黎波里',publishedAt:null,title:'利比亚旅行风险等级和安全提醒',url:'https://cs.mfa.gov.cn/ljmdd/fz_648564/lby_650365/',reason:'的黎波里属于暂勿前往范围；不将米苏拉塔、班加西及其周边一并归为红色'},
].map(advisory=>Object.freeze({...advisory,checkedAt:ADVISORY_REVIEW_DATE,audience:'中国大陆普通护照一般出发者',readScope:'opened_official_body'}));

export function travelAdvisory(city) {
  const code=city.countryCode||city.country_id;
  return REVIEWED_ADVISORIES.find(advisory=>advisory.countryCode===code&&(advisory.scope==='country'||advisory.citySlugs.includes(city.slug)))||null;
}
export const recommendationEligible = city => !travelAdvisory(city);
