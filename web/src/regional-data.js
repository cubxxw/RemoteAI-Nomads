const DAY = 86400000;
// Explicit reviewed relationships only. Proximity and same-country identity are insufficient.
export async function readRegionalReferences(env, cityId, {now = new Date().toISOString()} = {}) {
  const {results = []} = await env.DB.prepare(`SELECT o.*,a.name_zh area_name,a.level area_level,g.relation,
    s.url source_url,s.title source_title FROM regional_reference_observations o
    JOIN geo_areas a ON a.id=o.area_id JOIN city_geo_areas g ON g.area_id=a.id
    JOIN sources s ON s.id=o.source_id WHERE g.city_id=?
    AND NOT EXISTS (SELECT 1 FROM regional_reference_observations n WHERE n.area_id=o.area_id
      AND n.provider=o.provider AND n.field=o.field AND (n.sample_end>o.sample_end OR
      (n.sample_end=o.sample_end AND (n.checked_at>o.checked_at OR (n.checked_at=o.checked_at AND n.id>o.id)))))
    ORDER BY o.category,o.field`).bind(cityId).all();
  return results.map(({payload_hash,...o}) => {
    const age_days = Math.max(0, Math.floor((Date.parse(now)-Date.parse(o.sample_end+'T00:00:00Z'))/DAY));
    return {...o, city_id:null, scope:'regional', observed_at:o.sample_end,
      quality:'official_reference', stale:age_days>(o.period==='year'?550:60),
      quality_flags:['regional_reference','not_city_quote','not_monthly_budget',...(age_days>60&&o.period!=='year'?['stale_observation']:[])],
      detail:{area_id:o.area_id,area_name:o.area_name,area_level:o.area_level,population_scope:o.population_scope,
        market_type:o.market_type,published_at:o.published_at,source_locator:o.source_locator,
        is_price_floor:false,can_sum_as_monthly_budget:false}};
  });
}

export async function regionalCoverage(env,countryId) {
  const {results=[]}=await env.DB.prepare(`SELECT c.slug,c.name_zh,a.name_zh area_name,a.level area_level,
    COUNT(o.id) observations FROM cities c JOIN city_geo_areas g ON g.city_id=c.id
    JOIN geo_areas a ON a.id=g.area_id JOIN regional_reference_observations o ON o.area_id=a.id
    WHERE c.country_id=? AND c.publication_status='published'
    GROUP BY c.id,a.id ORDER BY c.slug,a.id`).bind(countryId).all();
  return results;
}
