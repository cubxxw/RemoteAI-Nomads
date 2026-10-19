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

export function mountMarkup(html, base = currentBase()) {
  if (!base) return html;
  return html.replace(/\b(href|src|action|poster)=(['"])(\/[^'"]*)\2/g, (match, attribute, quote, value) =>
    `${attribute}=${quote}${sitePath(value, base)}${quote}`);
}
