// A refresh must name its scope; the default command only fills gaps.
export function selectPlaceCities(catalog, summaries, {selected, refresh = false} = {}) {
  if (refresh && !selected?.length) throw new Error('--refresh requires --slugs=city-a,city-b');
  if (selected && (!selected.length || selected.some(slug => !catalog.some(city => city.slug === slug)))) throw new Error('Unknown or empty city slug');
  const scoped = catalog.filter(city => !selected || selected.includes(city.slug));
  if (selected && scoped.some(city => !Number.isFinite(city.lat) || !Number.isFinite(city.lon))) throw new Error('Selected city has no verified coordinates');
  return scoped.filter(city => Number.isFinite(city.lat) && Number.isFinite(city.lon) && (refresh || !summaries[city.slug]));
}
