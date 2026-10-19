const DATABASE = "nomads-agent-history-v1";
const OBJECT_STORE = "conversations";
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 100;
const MAX_BYTES = 2 * 1024 * 1024;
const STATUSES = new Set(["pending", "completed", "failed", "cancelled", "interrupted"]);
const PRIVATE_KEY = /^(?:api[_-]?key|secret|authorization|headers|access[_-]?token|refresh[_-]?token|token|tokens|reasoning(?:_content)?|chain_of_thought|audit(?:_history)?|grounding_check|checker|verification|trace|usage)$/i;
const clone = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function failure(code, message) {
  const error = new Error(message);
  error.name = "ConversationStoreError";
  error.code = code;
  return error;
}
const invalid = () => { throw failure("AGENT_STORE_INVALID_RECORD", "这条对话的格式不完整，尚未写入本地历史。"); };
const id = value => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) invalid();
  return value;
};
const timestamp = value => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid();
  return value;
};
const text = value => {
  if (typeof value !== "string") invalid();
  return value;
};
function excerpt(question) {
  const clean = question.replace(/\s+/gu, " ").trim();
  const points = Array.from(clean);
  if (points.length <= 32) return clean || "新对话";
  let prefix = points.slice(0, 32).join("");
  const breakAt = prefix.lastIndexOf(" ");
  if (breakAt >= 18) prefix = prefix.slice(0, breakAt);
  return prefix.replace(/[，、；：,.!?！？\s]+$/u, "") + "…";
}
function newId() {
  return globalThis.crypto?.randomUUID?.() || "conversation-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

export function createConversation(question = "") {
  text(question);
  const now = Date.now();
  return {
    id: newId(), title: excerpt(question), createdAt: now, updatedAt: now, revision: 0,
    messages: [], budget: null, budgetSelection: null, draft: "", useContext: true,
  };
}

// Only JSON data crosses this boundary. Private runtime fields are never history.
function json(value, seen = new Set(), depth = 0) {
  if (depth > 32) invalid();
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    return value;
  }
  if (!Array.isArray(value) && !record(value)) invalid();
  if (seen.has(value)) invalid();
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map(item => json(item, seen, depth + 1));
  else {
    result = {};
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_KEY.test(key) || ["__proto__", "constructor", "prototype"].includes(key)) continue;
      result[key] = json(item, seen, depth + 1);
    }
  }
  seen.delete(value);
  return result;
}
function fields(value, allowed) {
  if (!record(value)) invalid();
  const result = {};
  for (const key of allowed) if (value[key] !== undefined) result[key] = json(value[key]);
  return result;
}
function listOf(value, convert) {
  if (!Array.isArray(value)) invalid();
  return value.map(convert);
}
function visibleResult(value) {
  const result = fields(value, ["answer", "ranking_url", "followups", "budget_snapshot", "budget_options"]);
  if (typeof result.answer !== "string") invalid();
  if (result.ranking_url !== undefined && result.ranking_url !== null && typeof result.ranking_url !== "string") invalid();
  if (result.followups !== undefined) result.followups = listOf(result.followups, text);
  if (value.cities !== undefined) result.cities = listOf(value.cities, city => fields(city, ["slug", "name", "country", "url", "photo"]));
  if (value.evidence !== undefined) result.evidence = listOf(value.evidence, evidence => {
    const item = fields(evidence, ["id", "tool", "label", "warnings"]);
    if (item.warnings !== undefined) item.warnings = listOf(item.warnings, text);
    if (evidence.sources !== undefined) item.sources = listOf(evidence.sources, source => fields(source, ["id", "title", "url", "accessed_at", "kind"]));
    return item;
  });
  if (value.budget_options !== undefined) result.budget_options = listOf(value.budget_options, option => fields(option, ["id", "label", "days", "currency", "spending", "remaining", "remaining_label", "snapshot"]));
  return result;
}
function normalizeMessage(value) {
  if (!record(value) || !["user", "assistant"].includes(value.role) || !STATUSES.has(value.status)) invalid();
  const message = { id: id(value.id), role: value.role, content: text(value.content), status: value.status, createdAt: timestamp(value.createdAt) };
  if (value.questionId !== undefined) message.questionId = id(value.questionId);
  if (value.selectedBudgetOption !== undefined) message.selectedBudgetOption = id(value.selectedBudgetOption);
  if (value.error !== undefined) {
    message.error = text(value.error);
    if (message.error.length > 8000) invalid();
  }
  if (value.result !== undefined) message.result = visibleResult(value.result);
  if (value.activity !== undefined) message.activity = listOf(value.activity, item => fields(item, ["call_id", "tool", "label", "status", "ok", "count", "duration", "duration_ms"]));
  if (value.elapsedMs !== undefined) message.elapsedMs = timestamp(value.elapsedMs);
  return message;
}
function normalize(value) {
  if (!record(value) || !Array.isArray(value.messages)) invalid();
  if (value.messages.length > MAX_MESSAGES) throw failure("AGENT_STORE_MESSAGE_LIMIT", "每段对话最多保存 100 条消息。请导出当前对话，再新建一段。");
  if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || value.revision < 0)) invalid();
  if (value.useContext !== undefined && typeof value.useContext !== "boolean") invalid();
  const messages = value.messages.map(normalizeMessage);
  if (new Set(messages.map(message => message.id)).size !== messages.length) invalid();
  const result = {
    id: id(value.id),
    title: excerpt(messages.find(message => message.role === "user")?.content || text(value.title ?? "")),
    createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt), revision: value.revision ?? 0,
    messages, budget: value.budget == null ? null : json(value.budget), budgetSelection: null,
    draft: text(value.draft ?? ""), useContext: value.useContext ?? true,
  };
  if (result.budget !== null && !record(result.budget)) invalid();
  if (value.budgetSelection != null) {
    if (!record(value.budgetSelection)) invalid();
    result.budgetSelection = { messageId: id(value.budgetSelection.messageId), optionId: id(value.budgetSelection.optionId) };
  }
  ensureSize(result);
  return result;
}
export {normalize as normalizeConversation};
function ensureSize(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) throw failure("AGENT_STORE_RECORD_TOO_LARGE", "这段对话已超过 2 MB，尚未保存新内容。请先导出，再新建对话。");
}
function safeRecord(value) {
  try { return value === undefined ? null : normalize(value); } catch { return null; }
}
function summaries(values) {
  return values.map(safeRecord).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id)).map(({ id, title, createdAt, updatedAt, revision, messages }) => ({ id, title, createdAt, updatedAt, revision, messageCount: messages.length }));
}
function nextRevision(incoming, existing, count) {
  if (incoming.revision === Number.MAX_SAFE_INTEGER) invalid();
  if ((existing && (existing.revision ?? 0) !== incoming.revision) || (!existing && incoming.revision !== 0)) throw failure("AGENT_STORE_CONFLICT", "另一标签页已更新或删除这段对话。当前内容仍保留在本页，请先导出或重新载入历史。");
  if (!existing && count >= MAX_CONVERSATIONS) throw failure("AGENT_STORE_CONVERSATION_LIMIT", "本机已保存 100 段对话。请导出并删除不需要的历史，再新建一段。");
  const saved = { ...incoming, revision: incoming.revision + 1, updatedAt: Math.max(Date.now(), incoming.createdAt) };
  ensureSize(saved);
  return saved;
}
function writeFailure(error) {
  if (error?.name === "ConversationStoreError") return error;
  return failure("AGENT_STORE_WRITE_FAILED", error?.name === "QuotaExceededError" ? "浏览器本地空间不足，尚未保存新内容。请先导出对话，再清理不需要的历史。" : "未能把新内容写入本地历史。当前内容仍保留在本页，请先导出。");
}
function memoryStore() {
  const records = new Map();
  let closed = false;
  const check = () => { if (closed) throw failure("AGENT_STORE_CLOSED", "本地历史连接已关闭。"); };
  return {
    available: false,
    reason: "本地存储不可用，当前对话仅在本页内存中保留。刷新或关闭页面前请导出。",
    async list() { check(); return summaries([...records.values()]); },
    async get(key) { check(); return clone(records.get(id(key)) ?? null); },
    async put(thread) {
      check();
      const incoming = normalize(thread), saved = nextRevision(incoming, records.get(incoming.id), records.size);
      records.set(saved.id, saved);
      return clone(saved);
    },
    async delete(key) { check(); return records.delete(id(key)); },
    close() { closed = true; },
  };
}
function persistentStore(database) {
  let closed = false;
  const check = () => { if (closed) throw failure("AGENT_STORE_CLOSED", "本地历史连接已关闭，请重新打开页面。"); };
  const close = () => { closed = true; database.close(); };
  database.onversionchange = close;
  function read(method, key) {
    check();
    return new Promise((resolve, reject) => {
      let transaction, request;
      try {
        transaction = database.transaction(OBJECT_STORE, "readonly");
        request = transaction.objectStore(OBJECT_STORE)[method](...(key === undefined ? [] : [key]));
      } catch { reject(failure("AGENT_STORE_READ_FAILED", "暂时无法读取本地历史，请重新打开页面。")); return; }
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(failure("AGENT_STORE_READ_FAILED", "暂时无法读取本地历史，请重新打开页面。"));
    });
  }
  return {
    get available() { return !closed; },
    get reason() { return closed ? "本地历史连接已关闭，请重新打开页面。" : ""; },
    async list() { return summaries(await read("getAll")); },
    async get(key) { return safeRecord(await read("get", id(key))); },
    async put(thread) {
      check();
      const incoming = normalize(thread);
      return new Promise((resolve, reject) => {
        let transaction, objectStore, existing, count, saved, problem, received = 0;
        try {
          transaction = database.transaction(OBJECT_STORE, "readwrite");
          objectStore = transaction.objectStore(OBJECT_STORE);
          const update = () => {
            if (++received !== 2) return;
            try {
              saved = nextRevision(incoming, existing, count);
              objectStore.put(saved);
            } catch (error) { problem = error; transaction.abort(); }
          };
          const get = objectStore.get(incoming.id), total = objectStore.count();
          get.onsuccess = () => { existing = get.result; update(); };
          total.onsuccess = () => { count = total.result; update(); };
        } catch (error) { reject(writeFailure(error)); return; }
        transaction.oncomplete = () => resolve(clone(saved));
        transaction.onerror = transaction.onabort = () => reject(writeFailure(problem || transaction.error));
      });
    },
    async delete(key) {
      check();
      id(key);
      return new Promise((resolve, reject) => {
        let transaction, existed = false;
        try {
          transaction = database.transaction(OBJECT_STORE, "readwrite");
          const objectStore = transaction.objectStore(OBJECT_STORE), get = objectStore.getKey(key);
          get.onsuccess = () => { existed = get.result !== undefined; objectStore.delete(key); };
        } catch (error) { reject(writeFailure(error)); return; }
        transaction.oncomplete = () => resolve(existed);
        transaction.onerror = transaction.onabort = () => reject(writeFailure(transaction.error));
      });
    },
    close,
  };
}

export async function openConversationStore({ indexedDB } = {}) {
  try {
    if (indexedDB === undefined) indexedDB = globalThis.indexedDB;
    if (!indexedDB || typeof indexedDB.open !== "function") return memoryStore();
    const database = await new Promise((resolve, reject) => {
      let settled = false;
      const request = indexedDB.open(DATABASE, 1);
      const timer = setTimeout(() => { settled = true; reject(new Error("OPEN_TIMEOUT")); }, 2500);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        settled = true;
        resolve(request.result);
      };
      request.onerror = request.onblocked = () => { clearTimeout(timer); settled = true; reject(request.error || new Error("OPEN_BLOCKED")); };
    });
    return persistentStore(database);
  } catch { return memoryStore(); }
}
