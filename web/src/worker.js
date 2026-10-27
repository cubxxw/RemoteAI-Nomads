import {agentConnectPage} from './agent-connect.js';
import { renderCountryIndex, renderCountryPage, renderGuides, renderCompareIndex, renderAbout } from './content-pages.js';
import { renderCityPage } from './city-page.js';
import {readCityProfile} from './city-profile.js';
import { readCityCosts } from './cost-data.js';
import {mapTile} from './map-tiles.js';
import {agentRoute} from './agent-gateway.js';
import {publishedFallback} from './published-fallback.js';
export { NomadAgent } from './flash-runtime.js';
import { syncCosts, syncFx } from './cost-sync.js';
import { rankingPage, rankedComparison, loadRankings } from "./rank-pages.js";
import { esc, external, shell } from "./render.js";
import {mountedRequest, publicURL} from './site-path.js';
import {cityGuideResponse} from './city-guide-pages.js';
import {destinationDirectoryPage} from './destination-directory.js';
import {publishedArticles, articlePaths} from './article-catalog.js';

const joined = `SELECT c.*, k.name_zh AS country_name FROM cities c JOIN countries k ON k.id=c.country_id`;
let publicReadOutage=null;
const publicWhere = (env) =>
  env.PREVIEW === "false" ? " AND c.publication_status='published'" : "";
const list = async (db, sql, args = []) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
const one = async (db, sql, args = []) =>
  db
    .prepare(sql)
    .bind(...args)
    .first();
const sourceLine = (url, label, date, dateLabel = "核读") =>
  `<p class="source-line">${external(url, label)}${date ? " · " + dateLabel + " " + esc(date) : ""}</p>`;
async function cityData(env, slug) {
  const c = await one(env.DB, joined + " WHERE c.slug=?" + publicWhere(env), [
    slug,
  ]);
  if (!c) return null;
  const [months, ai, visas, quotes, budgetSource, ranking, climate, location, entry, costs] =
    await Promise.all([
      list(env.DB, "SELECT * FROM city_months WHERE city_id=? ORDER BY month", [
        c.id,
      ]),
      list(
        env.DB,
        "SELECT a.*,s.url AS source_url FROM ai_availability a JOIN sources s ON s.id=a.source_id WHERE a.country_id=?",
        [c.country_id],
      ),
      list(
        env.DB,
        "SELECT v.*,s.url AS source_url FROM visa_programs v JOIN sources s ON s.id=v.source_id WHERE v.country_id=?",
        [c.country_id],
      ),
      list(
        env.DB,
        "SELECT q.*,s.url AS source_url FROM workspace_quotes q JOIN sources s ON s.id=q.source_id WHERE q.city_id=?",
        [c.id],
      ),
      c.budget_source_id
        ? one(env.DB, "SELECT * FROM sources WHERE id=?", [c.budget_source_id])
        : null,
      one(
        env.DB,
        "SELECT s.*,r.url source_url FROM city_scores s JOIN sources r ON r.id=s.source_id WHERE s.city_id=?",
        [c.id],
      ),
      list(
        env.DB,
        "SELECT m.*,r.url source_url FROM city_climate_months m JOIN sources r ON r.id=m.source_id WHERE city_id=? ORDER BY month",
        [c.id],
      ),
      one(env.DB, "SELECT l.*,s.url source_url FROM city_locations l JOIN sources s ON s.id=l.source_id WHERE city_id=?", [c.id]),
      one(env.DB, "SELECT e.*,s.url source_url FROM city_entry_conditions e JOIN sources s ON s.id=e.source_id WHERE city_id=? AND passport='CN'", [c.id]),
      readCityCosts(env, c.id, {currency: 'CNY'}),
    ]);
  return { ...c, months, ai, visas, quotes, budgetSource, ranking, climate, location, entry, costs };
}
const aiLabel = (s) =>
  ({
    listed: "官方名单列入",
    not_listed: "名单未逐项列出",
    conditional: "列入，存在地区例外",
    unknown: "待核验",
  })[s] || "待核验";
const visaHTML = (v) =>
  `<details class="evidence-detail"><summary>${esc(v.name)}<span>${esc(v.kind)}</span></summary><div><dl class="fact-list"><dt>停留与有效期</dt><dd>${esc(v.stay_text)}</dd><dt>财务要求</dt><dd>${esc(v.financial_rule)}</dd><dt>工作范围</dt><dd>${esc(v.work_scope)}</dd><dt>护照与领区</dt><dd>${esc(v.passport_scope)}</dd><dt>需要留意</dt><dd>${esc(v.restriction)}</dd><dt>证据状态</dt><dd>${esc(v.verification)} · 资料日期 ${esc(v.source_published_at || "未标明")}</dd></dl>${sourceLine(v.source_url, "查看官方说明", v.checked_at)}</div></details>`;

async function cityPage(env, slug, url) {
  const [c, profile] = await Promise.all([cityData(env, slug), readCityProfile(env, slug)]);
  return c ? renderCityPage({...c, profile}, env, {month:url?.searchParams.get('month')}) : null;
}

async function compareIndex(env) {
  const [articles, cities] = await Promise.all([
    list(env.DB, "SELECT * FROM editorial_pages WHERE kind='comparison'" + (env.PREVIEW === 'false' ? " AND status='published'" : '')),
    list(env.DB, joined + ' WHERE 1=1' + publicWhere(env) + ' ORDER BY c.featured_order,c.name_en'),
  ]);
  return renderCompareIndex(articles, cities);
}
async function countryIndex(env) {
  const rows = await list(
    env.DB,
    `SELECT k.*,count(c.id) AS city_count FROM countries k LEFT JOIN cities c ON c.country_id=k.id${publicWhere(env)} GROUP BY k.id ORDER BY k.region,k.name_en`,
  );
  return renderCountryIndex(rows);
}

async function countryPage(env, code) {
  const id = code.startsWith("legacy:") ? code : code.toUpperCase();
  const c = await one(env.DB, "SELECT * FROM countries WHERE id=?", [id]);
  if (!c) return null;
  const [cities, stats, ai, visas] = await Promise.all([
    list(
      env.DB,
      joined +
        " WHERE c.country_id=?" +
        publicWhere(env) +
        " ORDER BY c.featured_order,c.name_en",
      [id],
    ),
    list(
      env.DB,
      "SELECT o.*,d.label,d.unit,d.scope,s.url FROM metric_observations o JOIN metric_definitions d ON d.id=o.metric_id JOIN sources s ON s.id=o.source_id WHERE o.country_id=?",
      [id],
    ),
    list(
      env.DB,
      "SELECT a.*,s.url AS source_url FROM ai_availability a JOIN sources s ON s.id=a.source_id WHERE country_id=?",
      [id],
    ),
    list(
      env.DB,
      "SELECT v.*,s.url AS source_url FROM visa_programs v JOIN sources s ON s.id=v.source_id WHERE country_id=?",
      [id],
    ),
  ]);
  return renderCountryPage(c, cities, stats, ai, visas, visaHTML, aiLabel);
}

async function guidesPage(env, slug) {
  const rows = await list(
    env.DB,
    "SELECT * FROM editorial_pages WHERE kind='guide'" +
      (env.PREVIEW === "false" ? " AND status='published'" : "") +
      (slug ? " AND slug=?" : ""),
    slug ? [slug] : [],
  );
  if (slug && !rows.length) return null;
  return renderGuides(rows, slug, env);
}
async function about(env) {
  const counts = await one(env.DB, `SELECT
    (SELECT count(*) FROM cities c WHERE 1=1${publicWhere(env)}) AS cities,
    (SELECT count(*) FROM cities c WHERE c.photo_url IS NOT NULL AND c.photo_url<>''${publicWhere(env)}) AS photos,
    (SELECT count(DISTINCT m.city_id) FROM city_climate_months m JOIN cities c ON c.id=m.city_id WHERE 1=1${publicWhere(env)}) AS climate,
    (SELECT count(*) FROM city_locations m JOIN cities c ON c.id=m.city_id WHERE 1=1${publicWhere(env)}) AS locations,
    (SELECT count(DISTINCT m.city_id) FROM cost_observations m JOIN cities c ON c.id=m.city_id WHERE m.provider='costcompass'${publicWhere(env)}) AS costs`);
  return renderAbout(counts, env);
}

const application = {
  async scheduled(controller, env, ctx) {
    // Default: daily FX. Full monthly cost sync needs a CPU-capable environment.
    const monthly = controller.cron === '15 2 15 * *';
    ctx.waitUntil(monthly ? syncCosts(env) : syncFx(env));
    if (env.PUBLIC_AGENT === 'true') ctx.waitUntil(env.DB.prepare('DELETE FROM agent_admissions WHERE created_at<?').bind(Date.now()-172800000).run());
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (env.PREVIEW === 'false' && url.protocol === 'http:') {
      const secure = new URL(env.SITE_ORIGIN);
      secure.pathname = url.pathname;
      secure.search = url.search;
      return Response.redirect(secure.href, 308);
    }
    const agentResponse=await agentRoute(request,env);if(agentResponse)return agentResponse;
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    if(url.pathname.startsWith('/map-tiles/'))return mapTile(request,env,ctx);
    const editorial = await cityGuideResponse(request, env);
    if (editorial) return editorial;
    try {
      const outageKey=env.SITE_ORIGIN+'|'+env.RELEASE_ID;
      if(env.PREVIEW==='false'&&publicReadOutage?.key===outageKey&&publicReadOutage.retryAt>Date.now()&&!['/healthz','/release.json','/robots.txt'].includes(url.pathname)){
        const published=await publishedFallback(request,env);if(published)return published;
      }
      if (url.pathname === '/release.json') return Response.json({release_id:env.RELEASE_ID || 'local',version_id:env.WORKER_VERSION?.id || null,mode:env.PREVIEW==='false'?'production':'preview'},{headers:{'Cache-Control':'no-store'}});
      if (url.pathname === '/healthz') {
        const data=await one(env.DB,"SELECT count(*) AS cities FROM cities WHERE publication_status='published'");
        return Response.json({ok:true,release_id:env.RELEASE_ID || 'local',cities:data.cities},{headers:{'Cache-Control':'no-store'}});
      }
      if (url.pathname === "/robots.txt")
        return new Response(
          env.PREVIEW !== "false"
            ? "User-agent: *\nDisallow: /\n"
            : `User-agent: *\nAllow: /\nSitemap: ${env.SITE_ORIGIN}/sitemap.xml\n`,
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        );
      if (url.pathname === "/sitemap.xml") {
        const links = [];
        if (env.PREVIEW === "false") {
          links.push("/", "/destinations/", "/guides/", "/compare/", "/about/", "/developers/");
          links.push(...articlePaths());
          for (const c of await list(
            env.DB,
            "SELECT slug FROM cities WHERE publication_status='published'",
          ))
            links.push("/cities/" + c.slug + "/");
          for (const p of await list(
            env.DB,
            "SELECT slug,kind FROM editorial_pages WHERE status='published'",
          ))
            links.push(
              "/" +
                (p.kind === "comparison" ? "compare" : "guides") +
                "/" +
                p.slug +
                "/",
            );
        }
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(links)].map((l) => {const modified=publishedArticles().find(a=>a.path===l)?.updatedAt;return `<url><loc>${esc(publicURL(l, env))}</loc>${modified ? `<lastmod>${esc(modified)}</lastmod>` : ''}</url>`;}).join("")}</urlset>`,
          { headers: { "Content-Type": "application/xml" } },
        );
      }
      if (url.pathname === "/api/rankings")
        return Response.json(await loadRankings(env), {
          headers: {
            "Cache-Control":
              env.PREVIEW === "false" ? "public, max-age=60" : "no-store",
          },
        });
      if (url.pathname.startsWith("/api/"))
        return new Response("Not found", { status: 404 });
      if (!url.pathname.endsWith("/"))
        return Response.redirect(
          url.origin + url.pathname + "/" + url.search,
          308,
        );
      const cacheable = env.PREVIEW === "false" && !url.search;
      const cacheUrl = new URL(url);
      cacheUrl.searchParams.set('__release', env.RELEASE_ID || 'local');
      const cacheKey = new Request(cacheUrl.toString());
      if (cacheable) {
        const hit = await caches.default.match(cacheKey);
        if (hit) return hit;
      }
      let page;
      const bits = url.pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
      if (!bits.length) page = await rankingPage(env, url);
      else if (bits.length === 1 && bits[0] === "developers")
        page = agentConnectPage();
      else if (bits.length === 1 && bits[0] === "destinations")
        page = destinationDirectoryPage(await loadRankings(env), env);
      else if (bits.length === 1 && bits[0] === "cities")
        page = await rankingPage(env, url);
      else if (bits.length === 2 && bits[0] === "cities")
        page = await cityPage(env, bits[1], url);
      else if (bits[0] === "compare" && bits.length === 1)
        page = await compareIndex(env);
      else if (bits[0] === "compare" && bits.length === 2)
        page = await rankedComparison(env, bits[1], url);
      else if (bits[0] === "countries" && bits.length === 1)
        page = await countryIndex(env);
      else if (bits[0] === "countries" && bits.length === 2)
        page = await countryPage(env, bits[1]);
      else if (bits[0] === "guides" && bits.length <= 2)
        page = await guidesPage(env, bits[1]);
      else if (bits[0] === "about" && bits.length === 1) page = await about(env);
      if (page?.redirect)
        return Response.redirect(url.origin + page.redirect, 308);
      let status = 200;
      if (!page) {
        status = 404;
        page = {
          title: "这个地方还没有页面",
          description: "返回城市目录继续查找。",
          body: '<div class="empty"><h1>这一页，还没写到。</h1><p>可以从城市目录重新找起。</p><a class="button" href="/cities/">回到城市目录</a></div>',
        };
      }
      // Query state is shareable, but only the clean public page is indexable.
      // Keep city pages consistent with ranking, guide and outage responses.
      const indexable = env.PREVIEW === 'false' && page.indexable && !url.search;
      const response = new Response(
        request.method === "HEAD" ? null : shell({ ...page, indexable, env }),
        {
          status,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "X-Robots-Tag": indexable ? 'index, follow' : 'noindex, follow',
            "Cache-Control":
              cacheable && status === 200
                ? "public, max-age=0, s-maxage=300"
                : "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Strict-Transport-Security": "max-age=15552000",
            "Content-Security-Policy":
              "default-src 'self'; img-src 'self' blob: https://images.unsplash.com https://*.wikimedia.org; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
          },
        },
      );
      if (cacheable && status === 200 && request.method === "GET")
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error("Page render failed:", error.message);
      if(env.PREVIEW==='false'&&env.RELEASE_ID&&/D1.*exceeded.*daily row read limit/i.test(error.message||''))publicReadOutage={key:env.SITE_ORIGIN+'|'+env.RELEASE_ID,retryAt:Date.now()+60000};
      if(url.pathname==='/healthz')return Response.json({ok:false,code:'D1_UNAVAILABLE',release_id:env.RELEASE_ID||'local'},{status:503,headers:{'Cache-Control':'no-store'}});
      const published=await publishedFallback(request,env);if(published)return published;
      return new Response("暂时无法读取资料，请稍后重试。", {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  },
};

export default {
  scheduled: application.scheduled,
  fetch(request, env, ctx) {return mountedRequest(request, env, ctx, application.fetch);},
};
