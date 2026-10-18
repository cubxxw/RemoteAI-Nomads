import {shell} from './render.js';
import {comparisonBody,comparisonFit} from './comparison-page.js';
import {displayMonth} from '../public/modules/ranking.js';
import {rankingPageFromData} from './rank-pages.js';
const security={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Strict-Transport-Security':'max-age=15552000',
  'Content-Security-Policy':"default-src 'self'; img-src 'self' https://images.unsplash.com https://*.wikimedia.org; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

// This is a pre-published public read model, never an alternate model service.
// Only an exact path in the build manifest can be served during a DB outage.
export async function publishedFallback(request,env){
  if(env.PREVIEW!=='false'||!env.ASSETS||!['GET','HEAD'].includes(request.method))return null;
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')&&url.pathname!=='/api/rankings')return null;
  if(url.pathname.startsWith('/published-pages/'))return null;
  try{
    const manifestResponse=await env.ASSETS.fetch(new Request(new URL('/published-pages/manifest.json',url),{method:'GET'}));
    if(!manifestResponse.ok)return null;
    const manifest=await manifestResponse.json();
    if(manifest.version!==1||!Array.isArray(manifest.paths))return null;
    const pair=url.pathname.match(/^\/compare\/([a-z0-9-]+)\/$/)?.[1]?.split('-vs-');
    if(pair?.length===2&&pair[0]!==pair[1]){
      const rankResponse=await env.ASSETS.fetch(new Request(new URL('/published-pages/rankings.json',url),{method:'GET'}));
      if(!rankResponse.ok)return null;const cities=await rankResponse.json();
      const [a,b]=pair.map(slug=>cities.find(c=>c.slug===slug));if(!a||!b)return null;
      const canonical=[...pair].sort().join('-vs-');if(canonical!==pair.join('-vs-'))return Response.redirect(url.origin+'/compare/'+canonical+'/'+url.search,308);
      const selected=Number(url.searchParams.get('month')),month=Number.isInteger(selected)&&selected>=1&&selected<=12?selected:displayMonth({});
      const body=shell({env,title:a.name+' vs '+b.name+'：数字游民逐项对比',description:comparisonFit(a,b)+' '+comparisonFit(b,a),path:url.pathname,active:'compare',body:comparisonBody(a,b,month),indexable:!url.search&&manifest.paths.includes(url.pathname)});
      return new Response(request.method==='HEAD'?null:body,{headers:{...security,'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=0, s-maxage=60','X-Data-Mode':'published-snapshot','X-Data-Snapshot':String(manifest.snapshot_date||'published')}});
    }
    if(!manifest.paths.includes(url.pathname))return null;
    if(url.pathname==='/'||url.pathname==='/cities/'){
      const ranking=await env.ASSETS.fetch(new Request(new URL('/published-pages/rankings.json',url),{method:'GET'}));
      if(!ranking.ok)return null;
      const page=rankingPageFromData(await ranking.json(),url);
      const body=shell({env,...page});
      return new Response(request.method==='HEAD'?null:body,{headers:{...security,'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=0, s-maxage=60','X-Data-Mode':'published-snapshot','X-Data-Snapshot':String(manifest.snapshot_date||'published')}});
    }
    const path=url.pathname==='/api/rankings'?'/published-pages/rankings.json':url.pathname==='/sitemap.xml'?'/published-pages/sitemap.xml':'/published-pages'+url.pathname;
    const asset=await env.ASSETS.fetch(new Request(new URL(path,url),{method:'GET'}));
    if(!asset.ok)return null;
    const headers=new Headers(asset.headers);headers.set('Cache-Control','public, max-age=0, s-maxage=60');
    headers.set('X-Data-Mode','published-snapshot');headers.set('X-Data-Snapshot',String(manifest.snapshot_date||'published'));
    headers.delete('X-Robots-Tag');headers.delete('ETag');headers.delete('Content-Length');headers.delete('Last-Modified');
    for(const [key,value] of Object.entries(security))headers.set(key,value);
    let body=asset.body;
    if((headers.get('Content-Type')||'').includes('text/html')&&url.search){
      body=(await asset.text()).replace(/<meta name="robots" content="[^"]*">/,'<meta name="robots" content="noindex,follow">');
      headers.delete('Content-Encoding');
    }
    return new Response(request.method==='HEAD'?null:body,{status:200,headers});
  }catch{return null;}
}
