import { loadRankings } from "./rank-pages.js";
import { readCityCosts, readFxRate } from "./cost-data.js";
import { calculateBudget } from "./agent-budget.js";
import { snapshotBudget } from "./agent-plan-state.js";
import { exploreBudgetOptions } from "./agent-budget-options.js";
import {
  DEFAULT_WEIGHTS,
  PRESETS,
  KEYS,
  LABELS,
  parseState,
  rankCities,
  validWeights,
  customScore,
  advantages,
} from "../public/modules/ranking.js";
const str = (description, maxLength = 160) => ({
  type: "string",
  description,
  minLength: 1,
  maxLength,
});
const num = (min, max) => ({ type: "number", minimum: min, maximum: max });
const arr = (items, maxItems = 12) => ({
  type: "array",
  items,
  maxItems,
  minItems: 1,
});
const obj = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const specs = [
  [
    "search_cities",
    "寻找候选城市，按指标分或参考消费排序。country可精确限定国家；例如中国用CN，不是亚洲。max_budget仅用于明确按旧USD月参考价硬筛，不代表真实最低花费；做低预算规划先不设此值，再get_costs和plan_budget探索可行取舍。月份默认只读季节数据，不排除旧标签未推荐的城市。",
    {
      query: str("只匹配名称：单个城市/国家名，或逗号分隔多个城市名。不是语义搜索，勿填便宜/小城/适合等需求；这些由结构化条件和后续判断处理"),
      country: str("精确国家ISO2或中英文名，例如CN；与大洲region分开"),
      sort: { type: "string", enum: ["score", "reference_cost"], description: "默认指标分；reference_cost仅用于用户明确要比较旧参考总价，不用于推断低预算是否能生活" },
      include_legacy:{type:'boolean',description:'仅明确要旧月参考价时设true；默认不把旧总价作为规划依据'},
      weights: obj(Object.fromEntries(KEYS.map((k) => [k, num(0, 100)])), KEYS),
      incomplete: {
        type: "boolean",
        description: "探索城市时默认包含缺指标城市（true）；要复现正式排名时设false。缺失分数不补0。",
      },
      recommended_only: {
        type: "boolean",
        description:
          "是否必须命中原推荐月份；仅用户要按旧推荐标签筛选时设true，默认false",
      },
      region: {
        type: "string",
        enum: ["亚洲", "欧洲", "美洲", "非洲", "大洋洲"],
      },
      max_budget: num(1, 100000),
      min_safety: num(0, 10),
      min_internet: num(0, 10),
      month: { type: "integer", minimum: 1, maximum: 12 },
      min_temp: num(-60, 60),
      max_temp: num(-60, 60),
      visa: {
        type: "string",
        enum: [
          "visa_free",
          "evisa",
          "arrival",
          "visa_required",
          "domestic",
          "permit",
        ],
      },
      preset: { type: "string", enum: Object.keys(PRESETS) },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
    [],
  ],
  [
    "get_city",
    "按slug、中文或英文名读取真实城市资料、预算口径、原指标、签证标签和资料限制。",
    { city: str("城市slug或准确名称"),include_legacy:{type:'boolean',description:'明确查询旧月参考价时设true，通常使用get_costs的实际分项'} },
    ["city"],
  ],
  [
    "compare_cities",
    "比较2至3座城市的数据库数值、原月份和局限；未知、持平与签证不判赢家。",
    { cities: arr(str("城市slug或准确名称"), 3) },
    ["cities"],
  ],
  [
    "get_months",
    "读取指定城市的2023–2025 ERA5历史逐月均温和原推荐标签。mean_c是整个月的平均温度，不是夜温或最低温；没有AQI、空气质量或明天天气数据。",
    {
      city: str("城市slug或准确名称"),
      months: arr({ type: "integer", minimum: 1, maximum: 12 }),
    },
    ["city"],
  ],
  [
    "get_costs",
    "深入查城市的CostCompass实际单项价格/挂牌租金与来源、单位、日期。日本另提供e-Stat全国单身家庭支出，不能冒充城市房租或单人游民最低预算。currency为展示货币，保留原额；租金/月、餐费/次、商品单位不可直接相加。返回覆盖缺口和质量标记，供方案推算。",
    { city: str("城市slug或准确名称；不填city时可用country查看价格覆盖与可查城市"), country:str("ISO2或准确国家名，查看真正有消费报价的城市，不能用城市名称搜索结果推断全国价格覆盖"), currency: str("ISO3展示币种，默认CNY",3), scope:{type:"string",enum:["city","national","all"],description:"城市报价或全国统计，日本e-Stat选national；默认all平衡返回两者"}, category: str("可选消费类别，如housing/food/transportation/total_consumption"), limit: {type:"integer",minimum:1,maximum:30} },
    [],
  ],
  [
    "convert_currency",
    "用最近导入的ECB同日交叉汇率换算，返回日期、来源与过期状态；金额不是实时交易价。先核对用户币种，不能把人民币当美元。",
    {amount:num(0,1000000000),from:str("原币种ISO3，如CNY",3),to:str("目标币种ISO3，如USD",3)},
    ["amount","from","to"],
  ],
  [
    "explore_budget_options",
    "低预算先比较多种吃住取舍，而非挑一个消费假设就否定目的地。输入2至6组明确的非住宿开支假设，同一预算下分别算住宿上限；一种假设的上限不是所有方案的必要门槛。工具还列出未查证的住宿类型，供按城市/日期继续查价。所有输入都是规划假设，不是市场报价；选定一组后用plan_budget保存单价。",
    {budget:num(0,100000000),currency:str('所有方案统一ISO3币种',3),days:{type:'integer',minimum:1,maximum:365},reserve:num(0,100000000),scenarios:{...arr(obj({label:str('情景名称，说明自设假设',80),days:{type:'integer',minimum:1,maximum:365,description:'本情景停留天数；未知行程可比较7天和30天，出发月份不是停留时长'},expenses:{...arr(obj({category:{type:'string',enum:['food','transport','utilities','workspace','insurance','communications','activities','incidentals'],description:'非住宿费用类别。住房/房租/住宿押金不在这里重复列支；押金可放现金预留reserve'},label:str('非住宿开支名称',80),amount:num(0,100000000),period:{type:'string',enum:['day','month','once']}},['category','label','amount','period']),12),minItems:0}},['label','expenses']),6),minItems:2}},
    ['budget','currency','scenarios'],
  ],
  [
    "plan_budget",
    "从用户总额倒推能付多少，而不是用均价否决预算。expenses可留空先算日上限；填非住宿的假设开支并设solve_for='住宿'可得到每晚最多可付金额，再找报价验证。假设不足或超支只能否定这一情景，不能证明全国不可能。所有假设必须在回答中标明，不是行情。",
    {budget:num(0,100000000),currency:str("统一ISO3币种，如CNY",3),days:{type:"integer",minimum:1,maximum:365},reserve:num(0,100000000),solve_for:str("用剩余钱支付的项目，例如住宿；不要在expenses重复列此项",40),expenses:{...arr(obj({label:str("开支或假设名称",80),amount:num(0,100000000),period:{type:"string",enum:["day","month","once"]}},["label","amount","period"]),12),minItems:0}},
    ["budget","currency","days"],
  ],
  [
    "recalculate_budget",
    "沿用上次已保存的预算假设重算，原日/月单价、预留与一次性费用不变。只改天数时优先用它，不要从聊天里重新猜单价。默认preserve_allocations保留原住宿分配上限；仅用户明确要重分配余款时用reallocate_remaining。原上限与新可付上限会分别返回。",
    {days:{type:'integer',minimum:1,maximum:365},budget:num(0,100000000),mode:{type:'string',enum:['preserve_allocations','reallocate_remaining']}},
    ['days'],
  ],
  [
    "estimate_budget",
    "仅当要按旧参考总价折算时使用：历史USD月基准×天数/30。它不是最低可行预算；可用get_costs查看现有分项，plan_budget设计不同住宿/饮食情景。",
    {
      city: str("城市slug或准确名称"),
      days: { type: "integer", minimum: 1, maximum: 365 },
    },
    ["city", "days"],
  ],
  [
    "get_entry_rules",
    "读取大陆普通护照原标签及已核读政策，停留、有效期和工作权分开。其他护照无对应资格数据，不能套用CN。",
    {
      country: str("ISO2或国家中文英文名"),
      city: str("可选城市slug"),
      passport: str("护照ISO2，默认CN", 2),
    },
    [],
  ],
  [
    "get_ai_access",
    "按国家读取各AI产品官方地域名单、核读日期和tested。列入名单不保证账户、支付、模型权限或当地网络。",
    { country: str("ISO2或国家中文英文名") },
    ["country"],
  ],
  [
    "get_workspaces",
    "读取该城市运营方工位报价、币种、单位、限制和来源；没有报价不代表没有工位，不提供未经实测的房间网速。",
    { city: str("城市slug或准确名称") },
    ["city"],
  ],
  [
    "meeting_hours",
    "使用城市真实IANA时区按给定日期将出发地会议时间换算成当地时间，自动处理夏令时。",
    {
      city: str("城市slug或准确名称"),
      date: { type: "string", pattern: "^20[2-3][0-9]-[0-1][0-9]-[0-3][0-9]$" },
      home_timezone: str("IANA时区，例如Asia/Shanghai"),
      hour: { type: "integer", minimum: 0, maximum: 23 },
      minute: { type: "integer", minimum: 0, maximum: 59 },
    },
    ["city", "date", "home_timezone", "hour"],
  ],
  [
    "get_coverage",
    "精确读取目录、城市、完整指标、气候、坐标与图片覆盖数，不假称每个国家每个城市都已研究。",
    {},
    [],
  ],
  [
    "get_method",
    "读取原Metric Score与六项自定义公式、社区0、缺失与签证规则。",
    {},
    [],
  ],
  [
    "get_sources",
    "读取已经取得的来源ID的标题、URL、种类和日期。只能传本次工具结果中已出现的source_ids。",
    { source_ids: arr(str("已读取的来源ID"), 20) },
    ["source_ids"],
  ],
];
export const toolDefinitions = specs.map(
  ([name, description, properties, required]) => ({
    name,
    description,
    parameters: obj(properties, required),
  }),
);
export const toolLabels = {
  search_cities: "筛选并计算城市排名",
  get_city: "读取城市资料",
  compare_cities: "逐项核对城市差异",
  get_months: "核对历史气候与月份",
  get_costs: "查消费分项与价格来源",
  convert_currency: "按有日期的汇率换算",
  plan_budget: "拆解预算并验算取舍",
  explore_budget_options: "比较吃住取舍与住宿上限",
  recalculate_budget: "沿用原单价重算预算",
  estimate_budget: "按历史基准计算预算",
  get_entry_rules: "核对护照与停留条件",
  get_ai_access: "核对AI地域名单",
  get_workspaces: "读取运营方报价",
  meeting_hours: "计算会议时差",
  get_coverage: "检查资料覆盖",
  get_method: "读取评分口径",
  get_sources: "核对来源与日期",
};
export function validateArgs(value, schema) {
  if (schema.type === "object")
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).every(
        (k) =>
          Object.hasOwn(schema.properties, k) &&
          validateArgs(value[k], schema.properties[k]),
      ) &&
      schema.required.every((k) => Object.hasOwn(value, k))
    );
  if (schema.type === "string")
    return (
      typeof value === "string" &&
      value.length >= (schema.minLength || 0) &&
      value.length <= (schema.maxLength || Infinity) &&
      (!schema.enum || schema.enum.includes(value)) &&
      (!schema.pattern || new RegExp(schema.pattern).test(value))
    );
  if (schema.type === "number" || schema.type === "integer")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (schema.type !== "integer" || Number.isInteger(value)) &&
      value >= schema.minimum &&
      value <= schema.maximum
    );
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.length >= schema.minItems &&
      value.length <= schema.maxItems &&
      value.every((v) => validateArgs(v, schema.items))
    );
  return false;
}
// Explain the schema path, never echo rejected values or arbitrary property names.
export function argumentProblems(value,schema,path='arguments'){
 if(validateArgs(value,schema))return [];
 if(schema.type==='object'&&value&&typeof value==='object'&&!Array.isArray(value)){
  const issues=[];
  if(Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))issues.push(path+': unexpected property; use only defined fields');
  for(const k of schema.required)if(!Object.hasOwn(value,k))issues.push(path+'.'+k+': required');
  for(const [k,child] of Object.entries(schema.properties))if(Object.hasOwn(value,k))issues.push(...argumentProblems(value[k],child,path+'.'+k));
  return issues.slice(0,12);
 }
 if(schema.type==='array'&&Array.isArray(value)){
  const issues=[];if(value.length<schema.minItems||value.length>schema.maxItems)issues.push(path+': array length outside schema');
  value.forEach((item,i)=>issues.push(...argumentProblems(item,schema.items,path+'['+i+']')));return issues.slice(0,12);
 }
 return [path+': expected '+schema.type+' within the defined schema'];
}
const norm = (x) =>
  String(x)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s_\-（）(),]/g, "");
const rows = async (db, sql, args = []) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
const one = async (db, sql, args = []) =>
  db
    .prepare(sql)
    .bind(...args)
    .first();
const brief = (c) => ({
  slug: c.slug,
  name: c.name,
  name_en: c.nameEn,
  country: c.country,
  country_code: c.countryCode,
  url: "/cities/" + c.slug + "/",
  photo: c.photo,
  rank: c.rank ?? null,
  budget_usd: c.budget,
  budget_basis: c.budgetBasis,
  score: Object.hasOwn(c, "score") ? c.score : customScore(c, DEFAULT_WEIGHTS),
  legacy_raw_score: c.baseScore,
  scores: c.scores,
  visa: c.visa,
  best_months: c.months
    .filter((m) => m.status === "recommended")
    .map((m) => m.month),
});
function nationalReference(observations) {
  const total=observations.find(o=>o.provider==='estat'&&o.field==='total_consumption');
  const housing=observations.find(o=>o.provider==='estat'&&o.field==='housing');
  if(!total||!housing||total.sample_end!==housing.sample_end||total.currency!==housing.currency)return null;
  return {scope:'national',household_size:1,currency:total.currency,period:'month',total_consumption:total.amount,housing_spend_included:housing.amount,actual_rent_land_subset:observations.find(o=>o.provider==='estat'&&o.field==='actual_rent_spend')?.amount??null,housing_definition:'住房总支出包含房租地租及设备维修等；不是房租单项，实际房租地租见actual_rent_land_subset',nonhousing_consumption:Math.round((total.amount-housing.amount)*100)/100,source_ids:[...new Set([total.source_id,housing.source_id])],sample_end:total.sample_end,basis:'居民全国平均总消费已含住房。非住房=总消费－住房；不能将总额再加一遍房租，也不是城市短租报价。'};
}
export async function executeNomadTool(env, name, args) {
  const def = toolDefinitions.find((d) => d.name === name);
  if (!def || !validateArgs(args, def.parameters))
    return {
      error: {
        code: "INVALID_TOOL_ARGUMENTS",
        message: "工具或参数不在允许范围内",
      },
    };
  const db = env.DB;
  let cached;
  const data = async () => (cached ??= await loadRankings(env));
  const city = async (q) =>
    (await data()).find((c) =>
      [c.slug, c.name, c.nameEn].some((x) => norm(x) === norm(q)),
    );
  const dbCity = async (c) =>
    one(
      db,
      "SELECT id,country_id,budget_source_id,budget_checked_at,checked_at,caveat FROM cities WHERE slug=?" +
        (env.PREVIEW === "false" ? " AND publication_status='published'" : ""),
      [c.slug],
    );
  const country = async (q) => {
    q=({中国区:"CN",中国大陆:"CN",大陆:"CN",中国内地:"CN"})[q] || q;
    return one(
      db,
      "SELECT id,name_zh,name_en FROM countries WHERE iso2=? OR lower(name_en)=lower(?) OR name_zh=?",
      [q.toUpperCase(), q, q],
    );
  };
  let sourceIds = new Set(),
    cities = [],
    dataOut,
    warnings = [];
  const addSources = (values) =>
    values.forEach((v) => {
      if (v) sourceIds.add(v);
    });
  async function remember(c) {
    if (!cities.some((x) => x.slug === c.slug)) cities.push(brief(c));
    const r = await dbCity(c);
    if (r) {
      const provenance = await rows(
        db,
        "SELECT source_id FROM city_scores WHERE city_id=? UNION SELECT source_id FROM city_locations WHERE city_id=? UNION SELECT source_id FROM city_entry_conditions WHERE city_id=? UNION SELECT source_id FROM city_months WHERE city_id=? UNION SELECT source_id FROM city_climate_months WHERE city_id=?",
        [r.id, r.id, r.id, r.id, r.id],
      );
      addSources([r.budget_source_id, ...provenance.map((s) => s.source_id)]);
    }
    return r;
  }
  if (name === "search_cities") {
    const preset = PRESETS[args.preset || "default"];
    const state = {
      ...parseState(new URL("http://local/")),
      weights: args.weights
        ? validWeights(args.weights)
        : { ...preset.weights },
      incomplete: args.incomplete !== false,
      q: "",
      region: args.region || "",
      budget: args.max_budget || null,
      month: args.month ?? preset.month ?? null,
      visa: args.visa ?? preset.visa ?? "",
      warm: false,
    };
    const minTemp = args.min_temp ?? (preset.warm ? 18 : undefined),
      maxTemp = args.max_temp ?? (preset.warm ? 28 : undefined);
    const selectedMonth = state.month;
    const recommendedOnly = args.recommended_only ?? false;
    if (!recommendedOnly) state.month = null;
    const exactCountry = args.country ? await country(args.country) : null;
    if (args.country && !exactCountry) return { error: {code:"COUNTRY_NOT_FOUND",message:"国家名称未匹配；可使用ISO2，如中国CN、日本JP。不会自动改成大洲。"} };
    const all = await data();
    const countryScoped = exactCountry ? all.filter((c) => c.countryCode === exactCountry.id) : all;
    const names = (args.query || '').split(/[,，、;；\n]+/).map(v=>v.trim()).filter(Boolean);
    const scoped = names.length ? countryScoped.filter(c=>names.some(q=>[c.slug,c.name,c.nameEn,c.country,c.countryCode].some(v=>norm(v).includes(norm(q))))) : countryScoped;
    let result = rankCities(scoped, state);
    const filtered = result.filter(
      (c) =>
        (args.min_safety === undefined ||
          (c.scores.safety !== null && c.scores.safety >= args.min_safety)) &&
        (args.min_internet === undefined ||
          (c.scores.internet !== null &&
            c.scores.internet >= args.min_internet)) &&
        ([minTemp, maxTemp].every((v) => v === undefined) ||
          (selectedMonth !== null &&
            c.months[selectedMonth - 1].meanC !== null &&
            (minTemp === undefined ||
              c.months[selectedMonth - 1].meanC >= minTemp) &&
            (maxTemp === undefined ||
              c.months[selectedMonth - 1].meanC <= maxTemp))),
    );
    if (args.sort === "reference_cost") filtered.sort((a,b)=>(a.budget ?? Infinity)-(b.budget ?? Infinity) || (b.score ?? -1)-(a.score ?? -1) || a.slug.localeCompare(b.slug));
    for (const [i, c] of filtered.slice(0, args.limit || 5).entries())
      await remember({ ...c, rank: c.score === null ? null : i + 1 });
    dataOut = {
      filters: {
        ...args,
        ...(selectedMonth ? { month: selectedMonth } : {}),
        recommended_only: recommendedOnly,
        incomplete: state.incomplete,
        ...(minTemp !== undefined ? { min_temp: minTemp } : {}),
        ...(maxTemp !== undefined ? { max_temp: maxTemp } : {}),
      },
      weights: state.weights,
      country: exactCountry,
      name_matching: {mode:'literal_name_union',terms:names,matched_catalogue_names:scoped.length,meaning:'只表示目录名称匹配，不查询行情或语义；0不表示没有便宜城市或没有价格数据'},
      matched: filtered.length,
      returned_count:cities.length,
      result_scope:'matched是筛选命中数；returned_count是受limit截取的返回数，两者都不是全国实际城市总数',
      cities,
      climate_at_month: selectedMonth
        ? filtered.slice(0, args.limit || 5).map((c) => ({
            city: c.slug,
            mean_c: c.months[selectedMonth - 1].meanC,
            status: c.months[selectedMonth - 1].status,
          }))
        : [],
      ranked_complete: rankCities(all, parseState(new URL("http://local/")))
        .length,
      total_catalogue: all.length,
      order: args.sort === "reference_cost" ? "按旧参考月消费升序，不表示最低可行预算" : "按当前指标分降序；同分按原分与slug稳定排序",
      missing_scores_scope: "全目录缺分计数；不是当前条件下排除数量",
      excluded_missing_scores: all.filter((c) =>
        KEYS.some((k) => c.scores[k] === null),
      ).length,
      excluded_missing_temperature:
        (minTemp !== undefined || maxTemp !== undefined) && selectedMonth
          ? result.filter((c) => c.months[selectedMonth - 1].meanC === null)
              .length
          : 0,
    };
    if(exactCountry){
      // A country-scoped result should not place global counts beside a
      // country label. The separate get_coverage tool supplies global totals.
      dataOut.total_catalogue=countryScoped.length;
      dataOut.ranked_complete=rankCities(countryScoped,parseState(new URL('http://local/'))).length;
      dataOut.excluded_missing_scores=countryScoped.filter(c=>KEYS.some(k=>c.scores[k]===null)).length;
      dataOut.missing_scores_scope='当前国家目录的缺分计数；不是当前筛选排除数，也不是该国实际全部城市数';
      dataOut.catalogue_scope=exactCountry.id;
      const priced=await rows(db,"SELECT c.slug,c.name_zh name,COUNT(*) observations FROM cost_observations o JOIN cities c ON c.id=o.city_id WHERE o.country_id=? AND o.scope='city' GROUP BY c.id ORDER BY observations DESC,c.slug",[exactCountry.id]);
      dataOut.cost_coverage={country:exactCountry.id,priced_cities:priced,meaning:'仅表示当前已导入报价的城市；优先按这里的slug用get_costs核读，不必对其他候选逐一查空。没有样本不能推断贵或便宜。'};
    }
    if (
      (args.min_temp !== undefined || args.max_temp !== undefined) &&
      !selectedMonth
    )
      warnings.push("温度筛选需要指定月份，本次不会猜测。");
    warnings.push("参考月消费不是最低生活门槛。安全/网络为旧评分，原月份为旧标签；可进一步读取分项和历史气候。");
  }
  if (name === "plan_budget") {
    try {dataOut = {...calculateBudget(args),snapshot:snapshotBudget(args)};}
    catch {return {error:{code:'INVALID_BUDGET_PLAN',message:'预算项目或原单位不明确，求解的项目不能又在已列费用中重复。请修正输入再算。'}};}
  }
  if(name==='explore_budget_options'){
    try{dataOut=exploreBudgetOptions(args);}
    catch{return {error:{code:'INVALID_BUDGET_OPTIONS',message:'请给2至6组不同名称的非住宿开支假设，保留日/月/一次性单位，住宿作为余款求解，不要重复列入。'}};}
  }
  if (name === 'recalculate_budget') return {error:{code:'PREVIOUS_PLAN_REQUIRED',message:'这项工具需要当前对话的预算快照。没有快照时，请从已确认条件用plan_budget建立，勿声称沿用了未知单价。'}};
  if (name === 'get_costs' && !args.city) {
    const c = args.country ? await country(args.country) : null;
    if (!c) return {error:{code:'COST_SCOPE_REQUIRED',message:'请指定city或country；例如country=CN可读真实全国价格覆盖'}};
    const priced=await rows(db,"SELECT c.slug,c.name_zh,c.name_en,COUNT(*) observation_count FROM cost_observations o JOIN cities c ON c.id=o.city_id WHERE o.country_id=? AND o.scope='city' GROUP BY c.id ORDER BY observation_count DESC,c.slug",[c.id]);
    const national=await rows(db,"SELECT provider,COUNT(*) observation_count FROM cost_observations WHERE country_id=? AND scope='national' GROUP BY provider",[c.id]);
    let costs=null;
    if(national.length && args.scope!=='city') {
      const representative=await one(db,'SELECT id FROM cities WHERE country_id=? ORDER BY slug LIMIT 1',[c.id]);
      if(representative)costs=await readCityCosts(env,representative.id,{currency:args.currency||'CNY'});
    }
    const observations=(costs?.observations||[]).filter(o=>o.scope==='national'&&(!args.category||o.category===args.category)).slice(0,args.limit||20);
    return {data:{country:c,country_id:c.id,scope:'country',priced_city_count:priced.length,city_observations:priced.reduce((s,c)=>s+c.observation_count,0),priced_cities:priced,national,national_reference:nationalReference(costs?.observations||[]),observations,fx:costs?.fx,methodology:costs?.methodology,meaning:'这是当前导入的整个国家覆盖；国家统计直接见observations；城市报价需按priced_cities名称读取。未列城市暂无本来源样本，无需逐个查空，但不表示没有服务或价格高低。'},cities:[],sources:(costs?.sources||[]).filter(s=>s.id.startsWith('estat:')||s.id.startsWith('ecb:')),warnings:costs?.limitations||[],read_only:true};
  }
  if (name === "convert_currency") {
    const rate = await readFxRate(env,args.from,args.to);
    if (!rate) return {error:{code:"FX_NOT_AVAILABLE",message:"尚无这组同日汇率；可保持原币种拆预算，勿自行捏造换算价。"}};
    addSources([rate.source_id]);
    dataOut = {...rate,amount:args.amount,converted:Math.round(args.amount*rate.rate*100)/100};
    if (rate.stale) warnings.push("使用的汇率超过7天，按所列日期作参考换算。");
  }
  if (
    name === "get_city" ||
    name === "get_months" ||
    name === "estimate_budget" ||
    name === "get_costs" ||
    name === "get_workspaces" ||
    name === "meeting_hours"
  ) {
    const c = await city(args.city);
    if (!c)
      return {
        error: {
          code: "CITY_NOT_FOUND",
          message: "允许的城市资料中没有匹配记录；可先search_cities检索",
        },
      };
    const r = await remember(c);
    if (name === "get_city")
      dataOut = {
        ...brief(c),
        budget_checked_at: r.budget_checked_at,
        checked_at: r.checked_at,
        caveat: r.caveat,
        summary: c.summary,
        reference_price_is_floor: false,
        months: c.months,
        time_zone: c.timeZone,
      };
    if (name === "get_costs") {
      const costs = await readCityCosts(env,r.id,{currency:args.currency || "CNY"});
      const priority = {total_consumption:-1,housing:0,food:1,transportation:2,utilities:3};
      const selected = costs.observations.filter((o)=>(!args.category || o.category === args.category)&&(!args.scope || args.scope==='all' || o.scope===args.scope))
        .sort((a,b)=>(a.scope==='city'?0:1)-(b.scope==='city'?0:1) || (priority[a.category]??4)-(priority[b.category]??4));
      const limit=args.limit || 20;
      let limited=selected.slice(0,limit);
      if ((!args.scope || args.scope==='all') && !limited.some(o=>o.scope==='national')) {
        const national=selected.filter(o=>o.scope==='national').slice(0,Math.min(5,limit));
        if(national.length) limited=[...limited.slice(0,limit-national.length),...national];
      }
      const countryCoverage=await one(db,"SELECT COUNT(*) city_observations,COUNT(DISTINCT city_id) priced_cities FROM cost_observations WHERE country_id=? AND scope='city'",[costs.country_id]);
      dataOut={city:c.slug,reference_monthly_usd:c.budget,reference_price_is_floor:false,...costs,
        legacy_reference:{available:c.budget!==null&&c.budget!==undefined,loaded:false,read_with:'estimate_budget',meaning:'是否另存旧月参考总额；本次未读取不等于没有参考，也不能当消费下限'},
        housing_evidence:{scope:'city',samples:costs.observations.filter(o=>o.scope==='city'&&o.category==='housing').map(o=>({field:o.field,label:o.label,unit:o.unit,source_id:o.source_id,quality:o.quality})),
          market_coverage_complete:false,price_floor_proven:false,meaning:'仅列当前导入的城市住房样本，不包含全国统计；整租样本不能替代床位、合租、短租的实际供给与价格'},
        observations:limited.map(({source_url,source_title,...o})=>o),
        national_reference:nationalReference(costs.observations),
        country_cost_coverage:{scope:'country',country_code:costs.country_id,...countryCoverage},
        observation_count:selected.length};
      addSources(costs.sources.map((s)=>s.id));
      delete dataOut.sources;
      warnings.push(...costs.limitations);
    }
    if (name === "get_months") {
      const climate = await rows(
        db,
        "SELECT month,mean_c,high_c,rain_mm,sample_days,period_start,period_end,model,checked_at,source_id FROM city_climate_months WHERE city_id=? ORDER BY month",
        [r.id],
      );
      addSources(climate.map((m) => m.source_id));
      dataOut = {
        city: c.slug,
        months: c.months
          .filter((m) => !args.months || args.months.includes(m.month))
          .map((m) => ({ ...m, ...climate.find((x) => x.month === m.month) })),
        period: "2023–2025",
        forecast_available: false,
        metric_definitions:{mean_c:'历史月均温，摄氏度；不是夜间或最低温',high_c:'历史高温指标，摄氏度；不是天气预报',rain_mm:'历史月降水量，毫米'},
        air_quality_available:false,
      };
      warnings.push("这是ERA5历史网格重分析，不是明天天气或房间实测。");
    }
    if (name === "estimate_budget") {
      dataOut = {
        city: c.slug,
        days: args.days,
        monthly_usd: c.budget,
        estimated_usd:
          c.budget === null
            ? null
            : Math.round(((c.budget * args.days) / 30) * 100) / 100,
        basis: c.budgetBasis,
        checked_at: r.budget_checked_at,
        formula: "月历史基准 × 天数 / 30",
        not_included: ["新增机票", "押金", "保险", "未在基准中明确的税费"],
        live_quote: false,
      };
      warnings.push(
        "历史基准的住宿人数、房型和包含项可能不同，不能保证可成交。",
      );
    }
    if (name === "get_workspaces") {
      const quotes = await rows(
        db,
        "SELECT operator,plan,amount,currency,period,access_hours,network_claim,restriction,validity,source_id,checked_at FROM workspace_quotes WHERE city_id=?",
        [r.id],
      );
      addSources(quotes.map((q) => q.source_id));
      dataOut = { city: c.slug, quotes, room_speed_measured: false };
      warnings.push(
        "运营方宣称不等于房间会议网络实测；没有报价不表示没有工位。",
      );
    }
    if (name === "meeting_hours") {
      const zone = c.timeZone;
      if (!zone)
        return {
          error: {
            code: "TIMEZONE_MISSING",
            message: "此城市没有已确定的IANA时区，不能猜测时差",
          },
        };
      const time = Date.parse(args.date + "T00:00:00Z");
      if (
        !Number.isFinite(time) ||
        new Date(time).toISOString().slice(0, 10) !== args.date
      )
        return { error: { code: "INVALID_DATE", message: "日期不存在" } };
      try {
        const parts = (epoch, tz) =>
          Object.fromEntries(
            new Intl.DateTimeFormat("en-CA", {
              timeZone: tz,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })
              .formatToParts(epoch)
              .filter((p) => p.type !== "literal")
              .map((p) => [p.type, p.value]),
          );
        const target = time + args.hour * 3600000 + (args.minute || 0) * 60000;
        const wall = (p) =>
          Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
        const offsets = new Set();
        for (let hours = -36; hours <= 36; hours += 6) {
          const probe = target + hours * 3600000;
          offsets.add(wall(parts(probe, args.home_timezone)) - probe);
        }
        const candidates = [...offsets]
          .map((offset) => target - offset)
          .filter((epoch) => wall(parts(epoch, args.home_timezone)) === target);
        if (!candidates.length)
          return {
            error: {
              code: "NONEXISTENT_HOME_TIME",
              message: "该时区因夏令时切换不存在这个时间，请选择有效时间",
            },
          };
        if (candidates.length > 1)
          return {
            error: {
              code: "AMBIGUOUS_HOME_TIME",
              message: "该时区这个时间出现两次，请明确夏令时或标准时后再换算",
            },
          };
        const epoch = candidates[0];
        const local = parts(epoch, zone);
        dataOut = {
          city: c.slug,
          home_date: args.date,
          home_time:
            String(args.hour).padStart(2, "0") +
            ":" +
            String(args.minute || 0).padStart(2, "0"),
          home_timezone: args.home_timezone,
          city_timezone: zone,
          local_date: local.year + "-" + local.month + "-" + local.day,
          local_time: local.hour + ":" + local.minute,
          local_hour: Number(local.hour),
          utc: new Date(epoch).toISOString(),
          dst_handled: true,
        };
      } catch {
        return {
          error: { code: "INVALID_TIMEZONE", message: "时区不在IANA范围内" },
        };
      }
    }
  }
  if (name === "compare_cities") {
    const selected = [];
    for (const q of args.cities) {
      const c = await city(q);
      if (!c)
        return {
          error: {
            code: "CITY_NOT_FOUND",
            message: "比较城市未在现有资料中找到",
          },
        };
      if (selected.some((other) => other.slug === c.slug))
        return {
          error: {
            code: "DUPLICATE_CITY",
            message: "比较需要不同城市；这些名称解析到了同一座城市：" + c.name,
          },
        };
      selected.push(c);
      await remember(c);
    }
    if (selected.length < 2)
      return {
        error: { code: "TWO_CITIES_REQUIRED", message: "至少需要两座城市" },
      };
    dataOut = {
      cities,
      metrics: KEYS.map((k) => ({
        key: k,
        label: LABELS[k],
        values: selected.map((c) => ({ city: c.slug, value: c.scores[k] })),
      })),
      budget_values: selected.map((c) => ({
        city: c.slug,
        value: c.budget,
        basis: c.budgetBasis,
      })),
      distinct_recommended_months: selected.map((c) => ({
        city: c.slug,
        months: c.months
          .filter(
            (m) =>
              m.status === "recommended" &&
              selected
                .filter((o) => o !== c)
                .every((o) => o.months[m.month - 1].status !== "recommended"),
          )
          .map((m) => m.month),
      })),
      comparison_url:
        selected.length === 2
          ? "/compare/" +
            selected
              .map((c) => c.slug)
              .sort()
              .join("-vs-") +
            "/"
          : null,
    };
    warnings.push(
      "成本口径不同，只能比较历史基准；环境含污染；缺失、持平和签证不评赢家。",
    );
  }
  if (name === "get_entry_rules") {
    const passport = (args.passport || "CN").toUpperCase();
    let k = await country(args.country || "");
    const c = args.city ? await city(args.city) : null;
    if (c) {
      const r = await remember(c);
      k = await country(r.country_id);
    }
    if (!k && passport === "CN")
      return {
        error: { code: "COUNTRY_REQUIRED", message: "请先指定国家或城市" },
      };
    if (passport !== "CN") {
      dataOut = {
        passport,
        qualification_data_available: false,
        rules: [],
        labels: [],
      };
      warnings.push("只收录CN标签，不能把大陆护照条件套用到其他护照。");
    } else {
      const rules = await rows(
        db,
        "SELECT name,kind,stay_text,financial_rule,work_scope,passport_scope,restriction,verification,source_published_at,effective_at,checked_at,source_id FROM visa_programs WHERE country_id=?",
        [k.id],
      );
      const labels = await rows(
        db,
        "SELECT c.slug,e.label,e.detail,e.evidence_level,e.checked_at,e.source_id FROM city_entry_conditions e JOIN cities c ON c.id=e.city_id WHERE c.country_id=? AND e.passport='CN'" +
          (env.PREVIEW === "false"
            ? " AND c.publication_status='published'"
            : "") +
          " LIMIT 12",
        [k.id],
      );
      addSources([...rules, ...labels].map((r) => r.source_id));
      dataOut = {
        country: k,
        passport,
        rules,
        labels,
        work_permission_guaranteed: false,
      };
      warnings.push(
        "免签不等于合法远程工作；签证有效期、每次停留和工作权分别核对，标签为原资料，非当前资格保证。",
      );
    }
  }
  if (name === "get_ai_access") {
    const k = await country(args.country);
    if (!k)
      return {
        error: { code: "COUNTRY_NOT_FOUND", message: "国家未在目录中找到" },
      };
    const records = await rows(
      db,
      "SELECT product,status,detail,checked_at,tested,source_id FROM ai_availability WHERE country_id=?",
      [k.id],
    );
    addSources(records.map((r) => r.source_id));
    dataOut = { country: k, records };
    warnings.push(
      "官方名单列入不保证账户、支付、模型权限或当地网络可用；tested=0表示未做真实使用测试。",
    );
  }
  if (name === "get_coverage") {
    const all = await data();
    dataOut = {
      countries: (await one(db, "SELECT count(*) n FROM countries")).n,
      cities: all.length,
      complete_scores: rankCities(all, parseState(new URL("http://local/")))
        .length,
      locations: all.filter((c) => c.lat !== null).length,
      climate_cities: all.filter((c) => c.months.some((m) => m.meanC !== null))
        .length,
      photos: all.filter((c) => c.photo).length,
      scope:
        "250个标准目录地区+8个保留历史地区；不等于所有国家每个城市均有资料",
      snapshot_date: "2026-10-17",
    };
  }
  if (name === "get_method")
    dataOut = {
      default_weights: DEFAULT_WEIGHTS,
      original_formula:
        "安全×0.3125+成本×0.25+环境×0.1875+生活×0.1875+网络×0.0625+社区很强0.5/有社区0.2/小众安静0",
      custom_formula: "六项正权重加权均值×1.05，四舍五入一位小数",
      range: [0, 10.5],
      default_uses_stored_original: true,
      community_map: { 社区很强: 10, 有社区: 4, 小众安静: 0 },
      original_community_multiplier: 0.05,
      original_community_contribution: { 社区很强: 0.5, 有社区: 0.2, 小众安静: 0 },
      original_formula_numeric: "safety*0.3125+cost*0.25+climate*0.1875+life*0.1875+internet*0.0625+community*0.05",
      missing_rule:
        "任一正权重指标为空时不生成分数，零权重项可空；社区0是有效数值",
      visa_in_score: false,
      climate_scope: "原Environment含污染；温度独立ERA5历史气候",
      internet_scope: "旧网络评分，不是房间Mbps",
    };
  if (name === "get_sources") addSources(args.source_ids);
  // Old editorial totals are opt-in references; do not anchor unrelated plans.
  const legacyRequested=args.include_legacy===true || name==='estimate_budget' || name==='compare_cities' || args.max_budget!==undefined || args.sort==='reference_cost';
  if(!legacyRequested){
    const withoutLegacy=({budget_usd,budget_basis,...c})=>c;
    cities=cities.map(withoutLegacy);
    if(Array.isArray(dataOut?.cities)) dataOut.cities=cities;
    if(name==='get_city') {dataOut=withoutLegacy(dataOut);delete dataOut.budget_checked_at;}
    if(name==='get_costs') delete dataOut.reference_monthly_usd;
  }
  const sources = sourceIds.size
    ? await rows(
        db,
        "SELECT id,url,title,publisher,kind,license,accessed_at FROM sources WHERE id IN (" +
          [...sourceIds].map(() => "?").join(",") +
          ")",
        [...sourceIds],
      )
    : [];
  if (name === "get_sources") dataOut = { sources };
  return { data: dataOut, cities, sources, warnings, read_only: true };
}
