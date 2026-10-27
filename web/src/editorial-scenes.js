import manifest from '../data/editorial-images.json' with {type: 'json'};
import {esc} from './render.js';

// Shared renderer for editorial illustrations. Keep creation details in the
// asset manifest and describe the scene in alt text without a creation badge.
export const editorialScenes = Object.freeze(manifest.assets.map(asset => Object.freeze(asset)));
const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));

export function editorialScene(id) {
  const scene = byId.get(id);
  if (!scene) throw new Error('Unknown editorial scene: ' + id);
  return scene;
}

// Responsive sources with explicit intrinsic dimensions. Callers choose sizes
// for their layout; site-path mountMarkup rewrites every candidate URL.
export function sceneImage(id, {className = '', sizes = '100vw', loading = 'lazy', priority = false} = {}) {
  const scene = editorialScene(id), {large, small} = scene.sources;
  return `<img class="${className}" src="${esc(large.path)}" srcset="${esc(small.path)} ${small.width}w, ${esc(large.path)} ${large.width}w" sizes="${esc(sizes)}" width="${large.width}" height="${large.height}" loading="${priority ? 'eager' : loading}"${priority ? ' fetchpriority="high"' : ''} decoding="async" alt="${esc(scene.alt)}" data-editorial-scene="1" data-photo-label="${esc(scene.label)}">`;
}

export function sceneFigure(id, {className = '', sizes = '100vw', loading = 'lazy', priority = false} = {}) {
  return `<figure class="editorial-scene ${className}">${sceneImage(id, {className: 'editorial-scene-image', sizes, loading, priority})}</figure>`;
}
