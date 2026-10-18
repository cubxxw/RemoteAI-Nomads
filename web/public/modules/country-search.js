// Search vocabulary complements official country names without changing identity or data.
const aliases = {
  KR: '韩国 南韩 大韩民国 South Korea Republic of Korea',
  KP: '朝鲜 北朝鲜 North Korea',
  GB: '英国 联合王国 英格兰 苏格兰 威尔士 北爱尔兰 UK United Kingdom Great Britain',
  US: '美国 美利坚合众国 USA U.S. United States America',
  AE: '阿联酋 阿拉伯联合酋长国 UAE United Arab Emirates',
  SA: '沙特 沙特阿拉伯 Saudi Arabia',
  VN: '越南 Vietnam Viet Nam',
  LA: '老挝 寮国 Laos Lao PDR',
  RU: '俄罗斯 俄国 Russia Russian Federation',
  IR: '伊朗 Iran',
  SY: '叙利亚 Syria',
  TZ: '坦桑尼亚 Tanzania',
  BO: '玻利维亚 Bolivia',
  VE: '委内瑞拉 Venezuela',
  BN: '文莱 汶莱 Brunei',
  MD: '摩尔多瓦 Moldova',
  CZ: '捷克 Czechia Czech Republic',
  NL: '荷兰 尼德兰 Netherlands Holland',
  NZ: '新西兰 纽西兰 New Zealand',
  SG: '新加坡 狮城 Singapore',
  HK: '香港 中国香港 Hong Kong',
  MO: '澳门 中国澳门 Macau Macao',
  TW: '台湾 中国台湾 Taiwan',
  CN: '中国 中国大陆 大陆 China mainland',
  CD: '刚果金 刚果民主共和国 DR Congo DRC',
  CG: '刚果布 刚果共和国 Republic of Congo',
  CI: '科特迪瓦 象牙海岸 Ivory Coast Cote d’Ivoire',
  CV: '佛得角 Cabo Verde Cape Verde',
  SZ: '斯威士兰 埃斯瓦蒂尼 Eswatini Swaziland',
  TL: '东帝汶 Timor-Leste East Timor',
  MM: '缅甸 Myanmar Burma',
  PS: '巴勒斯坦 Palestine',
  VA: '梵蒂冈 Vatican Holy See',
  TR: '土耳其 Türkiye Turkey',
};
export const countryAliases = code => aliases[String(code || '').toUpperCase()] || '';
export const normalizeSearch = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
export const citySearchText = city => normalizeSearch(`${city.name} ${city.nameEn} ${city.country} ${countryAliases(city.countryCode)}`);
export const countryQueryCode = query => ({uk:'GB',gb:'GB',us:'US',usa:'US','u.s.':'US',uae:'AE',kr:'KR',kp:'KP',cn:'CN',hk:'HK',mo:'MO',tw:'TW',vn:'VN',cz:'CZ',jp:'JP',ae:'AE'})[normalizeSearch(query)] || null;
export const cityMatchesQuery = (city, query) => {
  const code=countryQueryCode(query);
  return code ? city.countryCode === code : citySearchText(city).includes(normalizeSearch(query));
};
