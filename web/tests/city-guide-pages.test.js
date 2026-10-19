import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {cityGuideResponse} from '../src/city-guide-pages.js';
const html='<!doctype html><html lang="zh-CN"><head><meta name="robots" content="index,follow"><link rel="canonical" href="https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/"><link rel="stylesheet" href="/nomads/guide-assets/guide.css"></head><main><h1>清迈旅居一个月要花多少钱</h1></main></html>';
const env={SITE_ORIGIN:'https://roamorrow.com/nomads',PREVIEW:'false',DB:{prepare(){throw Error('Guide must not query D1');}},ASSETS:{async fetch(r){assert.equal(new URL(r.url).pathname,'/city-guides/chiang-mai-monthly-budget.html');return new Response(html,{headers:{'Content-Type':'text/html','X-Robots-Tag':'noindex'}});}}};
test('published city guide is indexable and can load without D1',async()=>{
 const r=await worker.fetch(new Request('https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/'),env,{waitUntil(){}});
 assert.equal(r.status,200);assert.equal(r.headers.get('X-Robots-Tag'),'index, follow');const body=await r.text();assert.match(body,/content="index,follow"/);assert.doesNotMatch(body,/noindex/);assert.match(body,/清迈旅居/);assert.match(r.headers.get('Content-Security-Policy'),/style-src 'self' 'unsafe-inline'/);assert.doesNotMatch(r.headers.get('Content-Security-Policy'),/script-src[^;]*unsafe-inline/);
});
test('budget scenario query keeps canonical but does not index duplicate variants',async()=>{
 const r=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/?nights=7&currency=USD'),env);assert.equal(r.status,200);assert.match(await r.text(),/content="noindex,follow"/);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('HEAD and preview do not invent a published body or index permission',async()=>{
 const head=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/',{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
 const preview=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/'),{...env,PREVIEW:'true'});assert.match(await preview.text(),/noindex,follow/);
});
test('unknown guide falls through and a missing registered artifact returns honest 503',async()=>{
 assert.equal(await cityGuideResponse(new Request('https://roamorrow.com/guides/not-known/'),env),null);
 const r=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/'),{...env,ASSETS:{async fetch(){return new Response('missing',{status:404});}}});assert.equal(r.status,503);
});
