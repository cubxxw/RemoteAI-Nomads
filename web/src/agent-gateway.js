import { executeNomadTool } from "./agent-tools.js";
import { reservePublicAnswer } from './agent-admissions.js';
import { validateFlashInput } from '../agent/flash-agent.mjs';
import {siteLocation} from './site-path.js';
const json = (value, status = 200, headers = {}) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const cookieName = "nomads-agent-session";
export async function agentRoute(request, env) {
  const url = new URL(request.url);
  if (
    !url.pathname.startsWith("/api/agent/") &&
    url.pathname !== "/api/internal/nomad-tool"
  )
    return null;
  if (url.pathname === "/api/internal/nomad-tool") {
    if (
      request.method !== "POST" ||
      !env.AGENT_BRIDGE_SECRET ||
      request.headers.get("Authorization") !==
        "Bearer " + env.AGENT_BRIDGE_SECRET
    )
      return json({ error: "Not found" }, 404);
    const body = await request.text();
    if (body.length > 16000) return json({ error: "Request too large" }, 413);
    try {
      const { name, args } = JSON.parse(body);
      return json(await executeNomadTool(env, name, args));
    } catch {
      return json(
        { error: { code: "TOOL_FAILED", message: "资料读取暂时失败" } },
        503,
      );
    }
  }
  if (!["GET", "POST"].includes(request.method))
    return json({ error: "Method not allowed" }, 405);
  if (
    (request.headers.get("Origin") &&
      request.headers.get("Origin") !== url.origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return json({ error: "Cross-site request refused" }, 403);
  const route = url.pathname.slice("/api/agent".length);
  const operator = !!env.AGENT_BRIDGE_SECRET && request.headers.get('Authorization') === 'Bearer ' + env.AGENT_BRIDGE_SECRET;
  const evaluation=operator&&!!env.NOMAD_AGENT&&/^\/evals\/[a-f0-9-]{36}$/.test(route);
  if (
    !["/answer", "/status", "/cancel"].includes(route) &&
    !/^\/runs\/[a-f0-9-]{36}$/.test(route) && !evaluation
  )
    return json({ error: "Not found" }, 404);
  if (
    (["/answer", "/cancel"].includes(route) && request.method !== "POST") ||
    (!["/answer", "/cancel"].includes(route) && request.method !== "GET")
  )
    return json({ error: "Method not allowed" }, 405);
  if (env.PREVIEW === 'false' && env.PUBLIC_AGENT !== 'true' && !operator)
    return json({error:'旅行小秘书正在进行上线验收，城市排行和资料可以正常使用。'},503);
  if ((!env.NOMAD_AGENT && !env.AGENT_ORIGIN && !env.AGENT_SERVICE) || !env.AGENT_BRIDGE_SECRET)
    return json({ error: "助手服务尚未启动，排行和城市资料仍可使用。" }, 503);
  let cookie = request.headers
    .get("Cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(cookieName + "="))
    ?.split("=")[1];
  const fresh = !cookie || !/^[a-f0-9-]{36}$/.test(cookie);
  if (fresh) cookie = crypto.randomUUID();
  const owner = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cookie)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const service=env.NOMAD_AGENT?env.NOMAD_AGENT.get(env.NOMAD_AGENT.idFromName(owner)):env.AGENT_SERVICE;
  const target=new URL(service?'https://agent.internal':env.AGENT_ORIGIN);
  if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)&&target.protocol!=='https:')
    return json({error:'Invalid agent configuration'},503);
  let body;
  if (request.method === "POST") {
    body = await request.text();
    if (body.length > 24000)
      return json({ error: "提问过长，请缩短后重试。" }, 413);
    try {
      const input=JSON.parse(body);
      if(route==='/answer')validateFlashInput(input);
    } catch {
      return json({ error: "无法读取提问。" }, 400);
    }
  }
  try {
    if (route === '/answer' && env.PUBLIC_AGENT === 'true') {
      const accepted = await reservePublicAnswer(env, owner, request.headers.get('CF-Connecting-IP') || 'unknown');
      if (!accepted) return json({error:'助手当前使用较多，请稍后再试。你可以继续浏览城市资料。',code:'DAILY_OR_HOURLY_LIMIT'},429,{'Retry-After':'3600'});
    }
    const upstream = await (service ? service.fetch.bind(service) : fetch)(target.origin + route, {
      method: request.method,
      headers: {
        Authorization: "Bearer " + env.AGENT_BRIDGE_SECRET,
        "X-Nomads-Owner": owner,
        "X-Nomads-Network": request.headers.get("CF-Connecting-IP") || "local",
        "Content-Type": "application/json",
      },
      body,
      signal: request.signal,
    });
    const headers = new Headers({
      "Content-Type":
        upstream.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (fresh)
      headers.set(
        "Set-Cookie",
        cookieName +
          "=" +
          cookie +
          `; Path=${siteLocation(env).base}/api/agent/; HttpOnly; SameSite=Strict; Max-Age=86400` +
          (url.protocol === "https:" ? "; Secure" : ""),
      );
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    const redact = value => String(value || '').replaceAll(env.AGENT_BRIDGE_SECRET || '__absent_bridge__','[redacted]').replaceAll(env.DEEPSEEK_API_KEY || '__absent_model__','[redacted]').slice(0,240);
    console.error(JSON.stringify({code:'AGENT_GATEWAY_UNAVAILABLE',name:error?.name||'Error',message:redact(error?.message)}));
    if (/D1.*exceeded.*daily row read limit/i.test(error?.message || '')) {
      const next = new Date();next.setUTCHours(24,0,0,0);
      const reset = next.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
      return json({code:'D1_DAILY_READ_LIMIT',error:`今天的城市资料读取额度已用完，服务方将在${reset}（北京时间）重置。问题已保留，仍可查看本机历史。`},503,{'Retry-After':String(Math.max(1,Math.ceil((next.getTime()-Date.now())/1000)))});
    }
    return json({ error: "选城助手暂时无法连接。提问会保留，可以重试。" }, 503);
  }
}
