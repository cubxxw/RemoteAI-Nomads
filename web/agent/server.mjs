import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import {
  executeNomadTool,
  toolDefinitions,
  toolLabels,
  argumentProblems,
  validateArgs,
} from "../src/agent-tools.js";
import { parseAnswer } from "./answer.mjs";
import { auditSearchClaims, compactProof, acceptedAudit } from "./grounding.mjs";
import { createQuota } from "./quota.mjs";
import { readWithEvidence } from "./ledger.mjs";
import { reserveConnected } from './admission.mjs';
import { finishPlanDefinition, submitCheckDefinition } from './presentation.mjs';
import { recalculateBudget } from '../src/agent-plan-state.js';
import { materialClaims, requireClaimCoverage } from './material-claims.mjs';
import { createCodexAudit } from './codex-audit.mjs';
import { selectBudgetSnapshot,budgetChoices } from './budget-choice.mjs';
import { loadAgentConfig } from './config.mjs';
import { secretaryPrompt,checkerPrompt } from './prompts.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = await loadAgentConfig(root);
if (!config.AGENT_BRIDGE_SECRET || !config.DEEPSEEK_API_KEY) throw Error('Agent secrets are not configured');
let localEnv;
if (config.LOCAL_D1 === "true") {
  const folder = path.join(
    root,
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );
  const file = readdirSync(folder).find(
    (n) => n.endsWith(".sqlite") && n !== "metadata.sqlite",
  );
  const database = new DatabaseSync(path.join(folder, file), {
    readOnly: true,
  });
  const prepare = (sql, args = []) => ({
    bind(...values) {
      return prepare(sql, values);
    },
    async all() {
      return { results: database.prepare(sql).all(...args) };
    },
    async first() {
      return database.prepare(sql).get(...args) || null;
    },
  });
  localEnv = { DB: { prepare }, PREVIEW: config.PREVIEW || "true" };
}
const reserveQuota = createQuota(path.join(root, ".data/agent/quota.json"));
const runs = new Map(),
  bridgeTokens = new Map(),
  admissions = new Set();
const port = Number(process.env.AGENT_PORT || 8789),
  origin = "http://127.0.0.1:" + port,
  web = config.WEB_ORIGIN || "http://127.0.0.1:8787",
  model = config.DEEPSEEK_MODEL || "deepseek-flash";
const system=secretaryPrompt;
const same = (a, b) => {
  const x = Buffer.from(a || ""),
    y = Buffer.from(b || "");
  return x.length === y.length && timingSafeEqual(x, y);
};
const respond = (res, data, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function readBody(req, max = 24000) {
  const chunks = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += c.length;
    if (bytes > max) throw Error("INPUT_LIMIT");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function emit(run, event, data) {
  const payload = { event, ...data, at: Date.now() };
  run.events.push(payload);
  if (!run.res.destroyed && !run.res.writableEnded)
    run.res.write(
      "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n",
    );
}
const publicRun = (run) => ({
  id: run.id,
  status: run.status,
  model,
  harness: "DeepSeek Harness 0.2.1-alpha.2",
  elapsed_ms: (run.ended || Date.now()) - run.started,
  model_requests: run.requests,
  tool_calls: run.calls,
  usage: run.usage,
  events: run.events
    .filter((e) =>
      [
        "tool_start",
        "tool_end",
        "model",
        "done",
        "error",
        "cancelled",
      ].includes(e.event),
    )
    .map(({ at, event, call_id, tool, label, duration_ms, ok, count }) => ({
      at,
      event,
      call_id,
      tool,
      label,
      duration_ms,
      ok,
      count,
    })),
  evidence_checked: run.verified,
  runtime_reaped: !!run.reaped,
  grounding_check: run.grounding
    ? {
        model: run.grounding.model,
        supported: run.grounding.supported,
        attempts: run.grounding.attempts,
      }
    : undefined,
});
async function tool(run, name, args) {
  if (run.controller.signal.aborted) throw Error("CANCELLED");
  const presentation=[finishPlanDefinition,submitCheckDefinition].find(d=>d.name===name);
  if(presentation){
    if(!validateArgs(args,presentation.parameters)) {
      const problems=argumentProblems(args,presentation.parameters);
      (run.presentation_errors??=[]).push({tool:name,problems});
      return {received:false,error:{code:'INVALID_PRESENTATION',problems},message:'提交字段不符合工具定义；修正这些字段，再调用同一工具。'};
    }
    if(name==='finish_plan' && run.phase!=='validation') {run.draft=structuredClone(args);run.draft_version=(run.draft_version || 0)+1;}
    else if(name==='submit_check' && run.phase==='validation') run.check_submission=args;
    else throw Error('INVALID_PRESENTATION_ROLE');
    return {received:true,message:'已收到草稿。交由后续核对；不要重复输出整篇。'};
  }
  const def = toolDefinitions.find((d) => d.name === name);
  if (!def) throw Error("INVALID_TOOL_ARGUMENTS");
  if(!validateArgs(args,def.parameters))return {error:{code:'INVALID_TOOL_ARGUMENTS',problems:argumentProblems(args,def.parameters),message:'参数与工具定义不符，请修正后再调用。'}};
  if (
    name === "get_sources" &&
    args.source_ids.some((id) => !run.sourceIds.has(id))
  )
    throw Error("UNREAD_SOURCE");
  return readWithEvidence(
    run,
    { name, args, label: toolLabels[name] },
    async () => {
      if(name==='recalculate_budget') {
        if(!run.previousBudget)return {error:{code:'PREVIOUS_PLAN_REQUIRED',message:'当前对话没有预算快照；请沿用已确认文字条件建立计划，不要捏造上次单价。'}};
        return {data:recalculateBudget(run.previousBudget,args),cities:[],sources:[],warnings:[],read_only:true};
      }
      if (localEnv) return executeNomadTool(localEnv, name, args);
      const response = await fetch(web + "/api/internal/nomad-tool", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.AGENT_BRIDGE_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, args }),
        signal: run.controller.signal,
      });
      if (!response.ok) throw Error("DATABASE_UNAVAILABLE");
      return response.json();
    },
    (event, data) => emit(run, event, data),
  );
}

async function runAgent(run, input) {
  const directory = path.join(root, ".data/agent/tmp", run.id);
  const token = randomBytes(24).toString("hex");
  run.children = [];
  const childEnv = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "TMPDIR",
      "HTTPS_PROXY",
      "HTTP_PROXY",
      "ALL_PROXY",
      "NO_PROXY",
      "https_proxy",
      "http_proxy",
      "all_proxy",
      "no_proxy",
    ]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  );
  Object.assign(childEnv, {
    DEEPSEEK_API_KEY: config.DEEPSEEK_API_KEY,
    NODE_USE_ENV_PROXY: "1",
    NO_PROXY: "127.0.0.1,localhost,::1",
    no_proxy: "127.0.0.1,localhost,::1",
  });
  async function create(role, prompt, definitions, selectedModel, maxTokens) {
    run.controller.signal.throwIfAborted();
    const patch = [
      ...[
        "persistent-bash",
        "persistent-pwsh",
        "tool-working-directory",
        "llm-retry",
        "session-title",
      ].map((id) => ({ id, disabled: true })),
      {
        id: "sandbox-policy",
        name: "@deepseek-ai/dsh-sandbox-policy",
        config: { mode: "read-only", workspaceRoot: directory },
      },
      {
        id: "tools",
        name: "@deepseek-ai/dsh-tools",
        config: { mode: "native" },
      },
      {
        insert: [
          {
            id: "nomad-database-tools",
            name: path.join(root, "agent/nomad-plugin.mjs"),
            inject: ["tools", "llm"],
            config: {
              definitions,
              bridgeUrl: origin,
              token,
              expiresAt: run.started + 120000,
            },
          },
        ],
      },
    ];
    const patchPath = path.join(directory, role + ".patch.json");
    await writeFile(patchPath, JSON.stringify(patch), { mode: 0o600 });
    run.controller.signal.throwIfAborted();
    const h = new DeepSeekHarness({
      profile: "sdk-minimal",
      patches: [patchPath],
      dshHome: path.join(directory, role + "-home"),
      processCwd: directory,
      cwd: directory,
      env: { ...childEnv, DSH_SYSTEM_PROMPT: prompt },
      provider: "deepseek-official",
      model: selectedModel,
      reasoningEffort: "low",
      maxTokens,
      initializeTimeoutMs: 20000,
      requestTimeoutMs: 125000,
    });
    run.children.push(h);
    return h;
  }
  const abort = () => {
    run.status = "stopping";
    emit(run, "stopping", { message: "正在停止并关闭本次任务…" });
    for (const child of run.children) child.close().catch(() => {});
  };
  run.controller.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {run.stop_reason='timeout';run.controller.abort();}, 120000);
  if (run.controller.signal.aborted) abort();
  let answer, failure;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    bridgeTokens.set(token, run);
    run.controller.signal.throwIfAborted();
    const harness = await create(
      "planner",
      system,
      [...toolDefinitions,finishPlanDefinition],
      model,
      8192,
    );
    run.harness = harness;
    const context = {
      current_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
      }).format(new Date()),
      current_filters: input.context || {},
      planning_defaults: {party_size:1,days:null,transport_to_destination:'未说明；用户明确包含时优先用户条件'},
      previous_budget: run.previousBudget || null,
      history: (input.history || []).slice(-6),
    };
    run.controller.signal.throwIfAborted();
    let response = await harness.run(
      JSON.stringify({ context, question: input.question }),
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      run.controller.signal.throwIfAborted();
      if(run.limit_hit) throw Error(run.limit_hit);
      run.rawAnswer = run.draft ? JSON.stringify(run.draft) : response.finalResponse || "";
      try {
        if(!run.draft) throw Error('DRAFT_NOT_SUBMITTED');
        answer = parseAnswer(run.rawAnswer, run);
        answer.proposal_version=run.draft_version;
        auditSearchClaims(answer, run);
      } catch (error) {
        if (attempt === 2) throw error;
        run.contract_errors ??= [];
        run.contract_errors.push(error.message);
        emit(run, "checking", { label: "正在校正回答格式与引用" });
        run.draft=null;
        response = await harness.run(
          JSON.stringify({
            question:
              "最终回答未通过结构核对：" +
              error.message +
              (error.message === "TOO_MANY_CITY_CARDS"
                ? "。city_slugs最多5个。请根据原问题从已经读取的候选中选择所需数量，不要把工具最多10个返回值全部复制为卡片。"
                : "") +
              "。只修正这个结构或引用问题，用finish_plan重新提交，不直接打印JSON。可用证据ID：" +
              [...run.evidence.keys()].join(",") +
              "；有效城市slug：" +
              [...run.cities.keys()].join(","),
          }),
          { sessionId: response.sessionId },
        );
        continue;
      }
      run.phase = "validation";
      run.check_submission=null;
      emit(run, "checking", { label: "正在核对回答与本次依据" });
      const proof = compactProof(run);
      const claims = materialClaims(answer.answer);
      const checkInput = JSON.stringify({
        context,
        question: input.question,
        answer: answer.answer,
        claims,
        cities: answer.cities,
        evidence: proof,
      });
      let check, checkResponse;
      let checker;
      if(config.AGENT_CHECKER==='codex-local'){
        if(!localEnv)throw Error('LOCAL_CHECKER_REQUIRES_LOCAL_D1');
        if(++run.requests>18||(run.checking_requests=(run.checking_requests||0)+1)>6)throw Error('MODEL_BUDGET');
        checker=await createCodexAudit({signal:run.controller.signal,timeoutMs:Math.min(45000,Math.max(1,run.started+120000-Date.now()))});
        run.children.push(checker);
        const result=await checker.run(JSON.parse(checkInput));check=result.check;
        run.independent_usage??=[];run.independent_usage.push(result.usage);
      }else{
       checker=await create('checker-'+attempt,checkerPrompt,[submitCheckDefinition],model,8192);
       for (let formatAttempt = 0; formatAttempt < 2; formatAttempt++) {
        run.controller.signal.throwIfAborted();
        run.check_submission=null;
        checkResponse = await checker.run(
          formatAttempt
            ? "上次未得到有效核验。请按原证据核验并用submit_check提交：\n" +
                checkInput
            : checkInput,
          checkResponse?.sessionId
            ? { sessionId: checkResponse.sessionId }
            : undefined,
        );
        if(run.limit_hit) throw Error(run.limit_hit);
        try {
          check = run.check_submission || JSON.parse(
            (checkResponse.finalResponse || "")
              .trim()
              .replace(/^```(?:json)?\s*/, "")
              .replace(/\s*```$/, ""),
          );
          check = requireClaimCoverage(check,claims);
          break;
        } catch {
          run.checker_failures ??= [];
          run.checker_failures.push({length:(checkResponse.finalResponse || '').length,content:checkResponse.finalResponse || '',status:checkResponse.status});
          if (formatAttempt === 1) throw Error("CHECKER_FORMAT_UNAVAILABLE");
          emit(run, "checking", { label: "核验结果未能读取，正在重试" });
        }
       }
      }
      run.grounding = {
        model: config.AGENT_CHECKER==='codex-local'?'codex-local-default':model,
        supported: acceptedAudit(check),
        issues: Array.isArray(check.issues) ? check.issues : [],
        checks: Array.isArray(check.checks) ? check.checks : [],
        attempts: (run.validation_attempts =
          (run.validation_attempts || 0) + 1),
      };
      (run.audit_history??=[]).push({proposal_version:answer.proposal_version,proposal_sha256:createHash('sha256').update(answer.answer).digest('hex'),answer:answer.answer,claims:structuredClone(claims),check:structuredClone(check)});
      await checker.close();
      run.controller.signal.throwIfAborted();
      if (run.grounding.supported) break;
      if (attempt === 2) throw Error("UNSUPPORTED_ANSWER");
      emit(run, "checking", { label: "发现不一致，正在按依据修正" });
      if(config.AGENT_CHECKER==='codex-local'&&check.revision){
        // A correction is a new proposal, never an approval of the old draft.
        // Parse citations/cards now, then audit the complete revision in a fresh invocation.
        const calculations=check.revision.budget_calculations||[];
        if(!Array.isArray(calculations)||calculations.length>3)throw Error('INVALID_REVISION_CALCULATIONS');
        for(const calculation of calculations){
          const args={...calculation};if(args.solve_for===null)delete args.solve_for;
          const result=await tool(run,'plan_budget',args);
          if(result.error||!result._evidence_id)throw Error('INVALID_REVISION_CALCULATIONS');
          run.evidence.get(result._evidence_id).purpose='alternative_calculation';
          check.revision.evidence_ids=[...new Set([...check.revision.evidence_ids,result._evidence_id])];
        }
        const corrected=parseAnswer(JSON.stringify(check.revision),run);auditSearchClaims(corrected,run);
        run.draft=structuredClone(check.revision);run.draft_version++;
        run.revisions=(run.revisions||0)+1;
        continue;
      }
      run.phase = "planning";
      run.draft=null;
      response = await harness.run(
        JSON.stringify({
          question:
            "请解决刚才回答中的具体问题，保持原用户意图，用finish_plan重新提交。核验意见：" +
            run.grounding.issues.join("；"),
        }),
        { sessionId: response.sessionId },
      );
    }
    if (!answer || !run.grounding?.supported)
      throw Error("UNSUPPORTED_ANSWER");
    run.verified = answer.evidence_checked;
    answer.grounding_check = run.grounding;
    const snapshot=selectBudgetSnapshot(run.evidence,answer.evidence.map(e=>e.id));
    if(snapshot)answer.budget_snapshot=snapshot;
    answer.budget_options=budgetChoices(run.evidence,answer.evidence.map(e=>e.id));
    run.status = "finalizing";
  } catch (error) {
    if (!run.controller.signal.aborted)
      console.error(
        JSON.stringify({
          run: run.id,
          error: /^[A-Z_]{1,80}$/.test(String(error.message))
            ? error.message
            : "AGENT_RUNTIME_ERROR",
          name: error.name,
        }),
      );
    failure = run.controller.signal.aborted
      ? run.stop_reason === 'timeout' ? 'TIME_LIMIT' : "CANCELLED"
      : /^[A-Z_]{1,80}$/.test(String(error.message))
        ? error.message
        : "AGENT_RUNTIME_ERROR";
  } finally {
    clearTimeout(timer);
    run.controller.signal.removeEventListener("abort", abort);
    const closed = await Promise.allSettled(run.children.map((h) => h.close()));
    run.reaped = closed.every((r) => r.status === "fulfilled");
    if (!run.reaped) failure = "RUNTIME_CLOSE_FAILED";
    bridgeTokens.delete(token);
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      failure = "SESSION_CLEANUP_FAILED";
    }
    run.ended = Date.now();
    if (!failure) {
      run.status = "completed";
      emit(run, "answer", answer);
      emit(run, "done", { trace: publicRun(run) });
    } else {
      run.status = failure === "CANCELLED" ? "cancelled" : "failed";
      emit(run, run.status === "cancelled" ? "cancelled" : "error", {
        code: failure,
        runtime_reaped: run.reaped,
        message:
          run.status === "cancelled"
            ? "已停止，本次任务已关闭。"
            : ({TIME_LIMIT:'这次查证超过了两分钟，任务已关闭。问题已保留，可以先选一个目的地或缩小问题后重试。',MODEL_BUDGET:'这次问题用了较多步骤，已达到单次处理额度。问题已保留，可以分成两步继续。',TOOL_BUDGET:'这次查询项目较多，已达到单次查询额度。可以先选两座城市继续比较。',UNSUPPORTED_ANSWER:'回答里仍有未核实的事实，我暂时没有把它作为结论发出。可以保留问题重试或换一个具体条件。'}[failure] || "这次资料查询暂未完成。问题已保留，可以重试。"),
      });
    }
    run.res.end();
    await mkdir(path.join(root, ".data/agent/traces"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      path.join(root, ".data/agent/traces", run.id + ".json"),
      JSON.stringify(publicRun(run)),
      { mode: 0o600 },
    );
    setTimeout(() => runs.delete(run.id), 3600000).unref();
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const route = new URL(req.url, origin).pathname;
    if (["/tool", "/reserve", "/usage"].includes(route)) {
      const token = (req.headers.authorization || "").replace("Bearer ", ""),
        run = bridgeTokens.get(token);
      if (!run || run.controller.signal.aborted)
        return respond(res, { error: "Invalid run" }, 403);
      const body = await readBody(req, 64000);
      if (route === "/tool")
        return respond(res, await tool(run, body.name, body.args));
      if (route === "/reserve") {
        ++run.requests;
        const key=run.phase === 'validation' ? 'checking_requests' : 'planning_requests';
        run[key]=(run[key] || 0)+1;
        if (run.requests > 18 || run[key] > (key === 'checking_requests' ? 6 : 12)) {run.limit_hit='MODEL_BUDGET';throw Error("MODEL_BUDGET");}
        emit(run, "model", {
          round: run.requests,
          label:
            run.phase === "validation"
              ? "正在核对回答与依据"
              : run.requests === 1
                ? "正在理解条件"
                : "正在核对并组织答案",
        });
        return respond(res, { ok: true });
      }
      for (const [k, v] of Object.entries(body.usage || {}))
        if (typeof v === "number" && Number.isFinite(v) && v >= 0)
          run.usage[k] = (run.usage[k] || 0) + v;
      return respond(res, { ok: true });
    }
    if (
      !same(req.headers.authorization, "Bearer " + config.AGENT_BRIDGE_SECRET)
    )
      return respond(res, { error: "Not found" }, 404);
    const owner = req.headers["x-nomads-owner"];
    if (!/^[a-f0-9]{64}$/.test(owner || ""))
      return respond(res, { error: "Owner required" }, 403);
    if (route === "/status")
      return respond(res, {
        ready: !!config.DEEPSEEK_API_KEY,
        model,
        harness: "DeepSeek Harness",
        read_only: true,
        active_runs: [...runs.values()]
          .filter(
            (r) =>
              r.owner === owner &&
              ["running", "stopping", "finalizing"].includes(r.status),
          )
          .map((r) => r.id),
      });
    if (route.startsWith("/evals/")) {
      const run = runs.get(route.split("/").at(-1));
      return run && run.owner === owner
        ? respond(res, {
            ...publicRun(run),
            grounding_check: run.grounding,
            contract_errors: run.contract_errors || [],
            checker_failures: run.checker_failures || [],
            presentation_errors: run.presentation_errors || [],
            independent_usage: run.independent_usage || [],
            audit_history: run.audit_history || [],
            raw_answer: run.rawAnswer,
            evidence: [...run.evidence].map(([id, e]) => ({ id, ...e })),
          })
        : respond(res, { error: "Not found" }, 404);
    }
    if (route.startsWith("/runs/")) {
      const run = runs.get(route.split("/").at(-1));
      return run && run.owner === owner
        ? respond(res, publicRun(run))
        : respond(res, { error: "Not found" }, 404);
    }
    const body = await readBody(req);
    if (route === "/cancel") {
      const run = runs.get(body.run_id);
      if (!run || run.owner !== owner)
        return respond(res, { error: "Not found" }, 404);
      run.controller.abort();
      await Promise.race([
        run.settled,
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
      return respond(
        res,
        {
          cancelled: run.status === "cancelled" && run.reaped,
          status: run.status,
          runtime_reaped: !!run.reaped,
        },
        run.status === "stopping" ? 202 : 200,
      );
    }
    if (route !== "/answer" || req.method !== "POST")
      return respond(res, { error: "Not found" }, 404);
    if (
      typeof body.question !== "string" ||
      !body.question.trim() ||
      body.question.length > 3000 ||
      !Array.isArray(body.history || [])
    )
      return respond(res, { error: "请输入不超过3000字的问题。" }, 400);
    let previousBudget=null;
    if(body.previous_budget) {
      try {previousBudget=recalculateBudget(body.previous_budget,{days:body.previous_budget.currentDays}).snapshot;}
      catch {return respond(res,{error:'上次预算记录无效，请重新确认预算。'},400);}
    }
    const active = [...runs.values()].filter((r) =>
      ["running", "stopping", "finalizing"].includes(r.status),
    );
    if (
      active.length + admissions.size >= 4 ||
      admissions.has(owner) ||
      active.some((r) => r.owner === owner)
    )
      return respond(res, { error: "已有回答正在进行，请先停止或稍候。" }, 429);
    admissions.add(owner);
    let connection;
    try {
      connection=await reserveConnected(req,res,()=>reserveQuota({
        owner,
        network: String(req.headers["x-nomads-network"] || "local"),
        evaluation: req.headers["x-nomads-eval"] === "1",
      }));
    } catch {
      admissions.delete(owner);
      return respond(
        res,
        { error: "本时段助手使用次数已达上限，请稍后再试；排行榜仍可使用。" },
        429,
      );
    }
    if (!connection) {
      admissions.delete(owner);
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    const run = {
      id: randomUUID(),
      owner,
      res,
      controller: connection.controller,
      started: Date.now(),
      status: "running",
      events: [],
      requests: 0,
      calls: 0,
      usage: {},
      evidence: new Map(),
      cities: new Map(),
      sourceIds: new Set(),
      verified: false,
      previousBudget,
    };
    runs.set(run.id, run);
    admissions.delete(owner);
    res.on("close", () => {
      if (["running", "stopping", "finalizing"].includes(run.status))
        run.controller.abort();
    });
    connection.release();
    emit(run, "start", { run_id: run.id, model, read_only: true });
    run.settled = runAgent(run, body).catch((error) => {
      run.status = "failed";
      run.ended = Date.now();
      emit(run, "error", {
        code: "RUNTIME_START_FAILED",
        message: "助手未能启动，提问已保留。",
      });
      console.error(
        JSON.stringify({
          run: run.id,
          error: String(error.message)
            .replaceAll(config.DEEPSEEK_API_KEY || "__no_key__", "[redacted]")
            .slice(0, 180),
        }),
      );
      if (!res.writableEnded) res.end();
    });
  } catch (error) {
    if (!res.headersSent)
      respond(
        res,
        {
          error: "请求暂时未能完成。",
          code: String(error.message).slice(0, 60),
        },
        400,
      );
    else res.end();
  }
});
server.listen(port, process.env.AGENT_HOST || "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      agent: "ready",
      port,
      model,
      tools: toolDefinitions.length,
    }),
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    for (const r of runs.values()) r.controller.abort();
    await Promise.allSettled([...runs.values()].map((r) => r.harness?.close()));
    server.close(() => process.exit(0));
  });
