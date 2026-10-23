// The same helpers run in SSR and the browser. A missing mount keeps local demos at /.
export const currentBase = () => globalThis.document?.documentElement?.dataset.nomadsBase || '';

export function sitePath(value, base = currentBase()) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || !base) return value;
  if (value === base || value.startsWith(base + '/') || value.startsWith(base + '?') || value.startsWith(base + '#')) return value;
  return base + (value === '/' ? '' : value);
}

export function appPath(value, base = currentBase()) {
  if (!base || typeof value !== 'string') return value;
  if (value === base) return '/';
  return value.startsWith(base + '/') ? value.slice(base.length) : value;
}

// srcset carries a candidate list (url + optional descriptor), so each root
// relative candidate must be mounted separately. Without this, responsive
// images would request the main site's /images instead of the mounted site.
export function mountSrcset(value, base = currentBase()) {
  return value.split(',').map(candidate => {
    const trimmed = candidate.trim();
    if (!trimmed) return '';
    const separator = trimmed.search(/\s/);
    const url = separator < 0 ? trimmed : trimmed.slice(0, separator);
    const descriptor = separator < 0 ? '' : trimmed.slice(separator);
    return sitePath(url, base) + descriptor;
  }).filter(Boolean).join(', ');
}

export function mountMarkup(html, base = currentBase()) {
  if (!base) return html;
  return html.replace(/\b(srcset|imagesrcset|href|src|action|poster)=(['"])([^'"]*)\2/g, (match, attribute, quote, value) =>
    `${attribute}=${quote}${attribute === 'srcset' || attribute === 'imagesrcset' ? mountSrcset(value, base) : sitePath(value, base)}${quote}`);
}
