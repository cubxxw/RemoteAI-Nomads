import manifest from '../data/editorial-images.json' with {type: 'json'};
import {esc} from './render.js';

// Shared renderer for the three AI-generated editorial scenes (2026-10-23).
// Every scene is fictional: the visible 「AI 场景创作」 label and fictional
// alt text travel with the markup and must never be stripped. See
// web/data/editorial-images.json for provenance and exact-scene descriptions.
export const AI_SCENE_LABEL = manifest.label;
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
  return `<img class="${className}" src="${esc(large.path)}" srcset="${esc(small.path)} ${small.width}w, ${esc(large.path)} ${large.width}w" sizes="${esc(sizes)}" width="${large.width}" height="${large.height}" loading="${priority ? 'eager' : loading}"${priority ? ' fetchpriority="high"' : ''} decoding="async" alt="${esc(scene.alt)}" data-ai-scene="1" data-photo-label="${esc(AI_SCENE_LABEL)}">`;
}

export function sceneFigure(id, {className = '', sizes = '100vw', loading = 'lazy', priority = false} = {}) {
  return `<figure class="ai-scene ${className}">${sceneImage(id, {className: 'ai-scene-image', sizes, loading, priority})}<figcaption class="ai-scene-label">${esc(AI_SCENE_LABEL)}</figcaption></figure>`;
}
