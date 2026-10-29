import {publicURL} from './site-path.js';

const sections = {
  cities: {name: '城市目录', path: '/destinations/'},
  guides: {name: '出发指南', path: '/guides/'},
  compare: {name: '城市对比', path: '/compare/'},
};

// Supplement only published shell pages. Reviewed graphs already containing a
// breadcrumb retain their original shape, identifiers and editorial dates.
export function pageStructuredData({jsonld, path, title, description, env, indexable}) {
  if (!indexable) return jsonld;
  const nodes = jsonld ? (jsonld['@graph'] || [jsonld]) : [];
  if (nodes.some(node => node['@type'] === 'BreadcrumbList')) return jsonld;
  const url = publicURL(path, env), bits = path.split('/').filter(Boolean);
  const place = nodes.find(node => node['@type'] === 'Place');
  const trail = [{name: '城市排行', item: publicURL('/', env)}];
  const section = sections[bits[0]];
  if (bits.length > 1 && section) trail.push({name: section.name, item: publicURL(section.path, env)});
  if (bits.length) trail.push({name: place?.name || title, item: url});
  const breadcrumb = trail.length > 1 ? {
    '@type': 'BreadcrumbList', '@id': url + '#breadcrumb',
    itemListElement: trail.map((item, i) => ({'@type': 'ListItem', position: i + 1, ...item})),
  } : null;
  const pageType = path === '/about/' ? 'AboutPage'
    : ['/', '/cities/', '/guides/', '/compare/'].includes(path) ? 'CollectionPage' : 'WebPage';
  const page = {'@type': pageType, '@id': url + '#webpage', url, name: title, description, inLanguage: 'zh-CN',
    ...(breadcrumb ? {breadcrumb: {'@id': breadcrumb['@id']}} : {}),
  };
  return {'@context': jsonld?.['@context'] || 'https://schema.org', '@graph': [
    ...nodes.map(node => {const {'@context': context, ...value} = node; return value;}),
    page, ...(breadcrumb ? [breadcrumb] : []),
  ]};
}
