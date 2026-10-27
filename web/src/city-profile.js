import {normalizeCityProfile} from '../public/modules/share-model.js';

// Public editorial profiles are the same bounded records used by the share card.
// An unavailable optional profile must never take the planning tools offline.
export async function readCityProfile(env, slug) {
  if (!env.ASSETS || typeof slug !== 'string' || slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const response = await env.ASSETS.fetch(new Request('https://public-assets.invalid/city-profiles/' + slug + '.json'));
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > 96000) return null;
    return normalizeCityProfile(JSON.parse(body), slug);
  } catch {
    return null;
  }
}
