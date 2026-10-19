import test from 'node:test';
import assert from 'node:assert/strict';
import {mapTile} from '../src/map-tiles.js';
test('tile relay only allows bounded tile coordinates, with fixed upstream and visible identity',async()=>{
 let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://tile.openstreetmap.org/13/6347/3661.png');assert.match(options.headers['User-Agent'],/RemoteAI-Nomads/);assert.equal(options.headers.Referer,'https://nomads.test/cities/chiang-mai/');return new Response('tile',{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});};
 for(const path of ['/map-tiles/20/1/1.png','/map-tiles/2/4/0.png','/map-tiles/13/1/-1.png','/map-tiles/https://evil.test/'])assert.equal((await mapTile(new Request('https://nomads.test'+path),{}, {},fetcher)).status,404);
 const response=await mapTile(new Request('https://nomads.test/map-tiles/13/6347/3661.png',{headers:{Referer:'https://nomads.test/cities/chiang-mai/'}}),{}, {},fetcher);
 assert.equal(calls,1);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'public, max-age=86400');
});
test('blocked images, upstream failure and timeouts never become cached successful tiles',async()=>{
 for(const fetcher of [async()=>new Response('blocked',{headers:{'Content-Type':'image/png','x-blocked':'Access denied'}}),async()=>new Response('failed',{status:429}),async()=>{throw new Error('network')}]){
  const result=await mapTile(new Request('https://nomads.test/map-tiles/13/6347/3661.png'),{}, {},fetcher);assert.equal(result.status,502);assert.equal(result.headers.get('Cache-Control'),'no-store');
 }
});
