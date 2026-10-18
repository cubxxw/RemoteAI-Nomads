// Deterministic checks supplement the language-model fact audit. No scores are
// inferred here: exact result counts and claimed ranking prefixes are contracts.
export function auditSearchClaims(answer, run) {
  const searches = [...run.evidence.values()].filter(
    (e) => e.tool === "search_cities",
  );
  if (!searches.length) return;
  const text = answer.answer,
    selected = answer.cities.map((c) => c.slug);
  const counts = new Set(
    searches.flatMap((e) => [
      e.result.data.matched,
      e.result.cities.length,
      selected.length,
    ]),
  );
  for (const match of text.matchAll(
    /本次(?:筛选|查询|搜索)?(?:共)?命中\s*(\d+)\s*(?:座|个城市|城)/g,
  ))
    if (!counts.has(Number(match[1]))) throw Error("INCORRECT_RESULT_COUNT");
  const top = text.match(/前\s*([1-5])\s*(?:城|座|个)/);
  if (top && /排序|排名|Metric Score/.test(text)) {
    const n = Number(top[1]);
    if (
      selected.length === n &&
      !searches.some((e) =>
        e.result.cities.slice(0, n).every((c, i) => c.slug === selected[i]),
      )
    )
      throw Error("INCORRECT_RANK_PREFIX");
  }
}
export function compactProof(run) {
  return [...run.evidence].map(([id, e]) => {
    let { cities: duplicate, snapshot: savedPlan, ...data } = e.result.data || {};
    if(e.tool==='get_costs' && data.city) data={city:data.city,country_id:data.country_id,fx:data.fx,methodology:data.methodology,coverage:data.coverage,legacy_reference:data.legacy_reference,housing_evidence:data.housing_evidence,country_cost_coverage:data.country_cost_coverage,observation_count:data.observation_count,national_reference:data.national_reference,limitations:data.limitations,observations:(data.observations||[]).map(o=>({provider:o.provider,detail:o.detail,field:o.field,label:o.label,amount:o.amount,currency:o.currency,period:o.period,unit:o.unit,scope:o.scope,household_size:o.household_size,sample_size:o.sample_size,sample_start:o.sample_start,sample_end:o.sample_end,quality:o.quality,quality_flags:o.quality_flags,conversion:o.conversion,source_id:o.source_id}))};
    return {
      id,
      tool: e.tool,
      args: e.args,
      data,
      cities: e.result.cities?.map(({photo,url,...c})=>c),
      sources: e.result.sources?.map(({id,title,publisher,url,accessed_at})=>({id,title,publisher,url,accessed_at})),
      error: e.result.error,
      warnings: e.result.warnings,
    };
  });
}
export function acceptedAudit(check) {
  return check?.supported === true && Array.isArray(check.checks) && check.checks.length>0 && check.checks.every(c=>c.supported===true) && Array.isArray(check.issues) && check.issues.length===0;
}
