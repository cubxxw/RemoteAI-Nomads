// Query and published projection use the same current-observation boundary.
// Full historical rows remain in the public seed and website database.
export function latestCostObservations(rows) {
  const ordered = [...rows].sort((a,b) => (b.sample_end || '').localeCompare(a.sample_end || '') ||
    (b.checked_at || '').localeCompare(a.checked_at || '') || b.id.localeCompare(a.id));
  const seen = new Set();
  return ordered.filter(o => {
    const key = [o.provider, o.city_id || o.area_id || o.country_id, o.scope, o.field].join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
