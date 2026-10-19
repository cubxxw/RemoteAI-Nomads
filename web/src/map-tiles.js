// Only tiles a visitor opens are fetched. No bulk download or offline prefetch.
// Identification, Referer and cache rules: https://operations.osmfoundation.org/policies/tiles/
export async function mapTile(request,env,ctx={},fetcher=fetch) {
 const url=new URL(request.url),parts=url.pathname.match(/^\/map-tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.png$/);
 if(!parts)return new Response('Tile not found',{status:404});
 const [z,x,y]=parts.slice(1).map(Number);
 if(z>19||x>=2**z||y>=2**z)return new Response('Tile not found',{status:404});
 const cache=globalThis.caches?.default,key=new Request(url.origin+url.pathname);
 const saved=await cache?.match(key);if(saved)return request.method==='HEAD'?new Response(null,saved):saved;
 const headers={'User-Agent':'RemoteAI-Nomads/1.0 (+https://github.com/cubxxw/RemoteAI-Nomads)'};
 // Forward the browser's actual referring page; never invent an external origin.
 const referer=request.headers.get('Referer');if(referer)headers.Referer=referer;
 try{
  const upstream=await fetcher(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,{headers,signal:AbortSignal.timeout(12000)});
  if(!upstream.ok||upstream.headers.has('x-blocked')||!upstream.headers.get('Content-Type')?.startsWith('image/'))return new Response('Map tile temporarily unavailable',{status:502,headers:{'Cache-Control':'no-store'}});
  const output=new Headers({'Content-Type':upstream.headers.get('Content-Type'),'Cache-Control':upstream.headers.get('Cache-Control')||'public, max-age=604800','X-Content-Type-Options':'nosniff'});
  for(const name of ['Etag','Last-Modified','Expires'])if(upstream.headers.has(name))output.set(name,upstream.headers.get(name));
  const response=new Response(upstream.body,{headers:output});
  if(cache){const pending=cache.put(key,response.clone());if(ctx.waitUntil)ctx.waitUntil(pending);else await pending;}
  return request.method==='HEAD'?new Response(null,response):response;
 }catch{return new Response('Map tile temporarily unavailable',{status:502,headers:{'Cache-Control':'no-store'}});}
}
