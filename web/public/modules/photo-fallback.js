// One honest fallback for every failed image: SSR placeholders cover cities
// without a photo, this covers runtime load errors on server-rendered and
// dynamic surfaces alike (ranking rows, command palette, compare picker).
// A failed real city photo is never swapped for another city's photo; the
// fallback keeps the city name and states the gap. Guard flags make the
// fallback single-shot so a fallback can never loop back into loading.
export function photoFallbackLabel(img) {
  return String(img?.getAttribute?.('data-photo-label') || img?.alt || '').replace(/(城市风景|城市实景|城市照片)$/, '').trim();
}

export function photoFallbackNode(img, doc) {
  const label = photoFallbackLabel(img);
  const scene = img?.getAttribute?.('data-ai-scene') === '1';
  const node = doc.createElement('div');
  node.setAttribute('class', 'photo-placeholder');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', label ? `${label}（${scene ? 'AI 场景图' : '城市图像'}待补）` : '图片暂不可用');
  node.setAttribute('data-photo-fallback', '1');
  const name = doc.createElement('span');
  name.textContent = label || '图片';
  const note = doc.createElement('small');
  note.textContent = scene ? 'AI 场景图待补' : label ? '城市图像待补' : '图片暂不可用';
  node.append(name, note);
  return node;
}

export function installPhotoFallback(doc) {
  const replaceFailed = img => {
    if (img?.tagName !== 'IMG' || img.dataset?.fallbackApplied === 'true') return;
    if (img.dataset) img.dataset.fallbackApplied = 'true';
    // Keep the failed element out of the loading loop before replacing it.
    img.removeAttribute('srcset');
    img.removeAttribute('src');
    img.replaceWith(photoFallbackNode(img, doc));
  };
  doc.addEventListener('error', event => replaceFailed(event.target), true);
  // A module can load after an eager image has already failed. Pending lazy
  // images remain untouched; a selected URL and a completed zero-width image
  // identify a real failure rather than an image that has not loaded yet.
  for (const img of Array.from(doc.images || [])) {
    if ((img.currentSrc || img.getAttribute('src') || img.getAttribute('srcset')) && img.complete && img.naturalWidth === 0) replaceFailed(img);
  }
}
