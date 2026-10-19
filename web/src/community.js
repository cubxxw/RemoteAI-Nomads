import snapshots from '../data/osm-community.json' with {type:'json'};
export const communityFor = slug => snapshots[slug] || null;
export const enrichCommunity = city => ({...city,communityPlaces:communityFor(city.slug)});
