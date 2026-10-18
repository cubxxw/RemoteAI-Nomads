import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversation, openConversationStore } from '../public/modules/agent-store.js';

const message = (content, role = 'user', extra = {}) => ({
  id: crypto.randomUUID(), role, content, status: 'completed', createdAt: Date.now(), ...extra,
});
const isCode = code => error => error.code === code;

test('unavailable browser storage keeps the conversation usable in explicit memory mode', async () => {
  const store = await openConversationStore({ indexedDB: undefined });
  assert.equal(store.available, false);
  assert.match(store.reason, /本页|内存/);
  const thread = createConversation('一月去哪里住一个月？');
  thread.messages.push(message('一月去哪里住一个月？'));
  const saved = await store.put(thread);
  assert.equal(saved.revision, 1);
  assert.equal((await store.get(thread.id)).messages[0].content, '一月去哪里住一个月？');
  assert.equal((await store.list())[0].messageCount, 1);
  assert.equal(await store.delete(thread.id), true);
  assert.equal(await store.delete(thread.id), false);
  assert.equal(await store.get(thread.id), null);
  store.close();
  await assert.rejects(store.list(), isCode('AGENT_STORE_CLOSED'));
});

test('titles come from a natural first-question excerpt without damaging Unicode', async () => {
  const title = createConversation('  一月去哪里？\n\n预算 2000 元   可以吗  ').title;
  assert.equal(title, '一月去哪里？ 预算 2000 元 可以吗');
  assert.equal(createConversation().title, '新对话');
  const long = createConversation('🦊'.repeat(35));
  assert.ok(!long.title.includes('\uFFFD'));
  assert.ok(Array.from(long.title).length <= 33);
  assert.ok(long.title.endsWith('…'));
  const store = await openConversationStore({ indexedDB: undefined });
  const thread = createConversation();
  thread.messages.push(message('十五天的大理预算怎么安排？'));
  assert.equal((await store.put(thread)).title, '十五天的大理预算怎么安排？');
});

test('JSON export and restore preserve full visible text, citations, draft, budget, and local copies', async () => {
  const store = await openConversationStore({ indexedDB: undefined });
  const thread = createConversation('清迈和槟城怎么选？');
  thread.draft = '交通也算进去';
  thread.useContext = false;
  thread.budget = { version: 1, originalBudget: 2000, currency: 'CNY', currentDays: 15 };
  thread.messages.push(message('清迈和槟城怎么选？'), message('先看预算 [E1]。\n\n| 城市 | 月预算 |\n|---|---|\n| 清迈 | 2000 元 |', 'assistant', {
    result: {
      answer: '先看预算 [E1]。',
      evidence: [{ id: 'E1', tool: 'get_city', label: '读取城市', sources: [{ title: '消费样本', url: 'https://example.com/costs', accessed_at: '2026-10-18', kind: 'primary' }], warnings: ['参考价'] }],
      cities: [{ slug: 'chiang-mai', name: '清迈', country: '泰国', url: '/cities/chiang-mai/', photo: '/photos/chiang-mai.webp' }],
      budget_snapshot: { version: 1, originalBudget: 2000 },
      followups: ['只住十五天呢？'],
    },
    elapsedMs: 12340,
    activity: [{ call_id: 'call-1', tool: 'get_city', label: '读取清迈', ok: true, count: 1, duration_ms: 200 }],
  }));
  const saved = await store.put(thread);
  thread.messages[0].content = '外部修改';
  assert.equal((await store.get(saved.id)).messages[0].content, '清迈和槟城怎么选？');
  const exported = JSON.parse(JSON.stringify(await store.get(saved.id)));
  exported.id = crypto.randomUUID();
  exported.revision = 0;
  const restored = await store.put(exported);
  assert.deepEqual(restored.messages, saved.messages);
  assert.deepEqual(restored.budget, saved.budget);
  assert.equal(restored.draft, '交通也算进去');
  assert.equal(restored.useContext, false);
  const summary = (await store.list()).find(item => item.id === saved.id);
  assert.equal(summary.messageCount, 2);
  assert.equal('messages' in summary, false);
  const copy = await store.get(saved.id);
  copy.messages.length = 0;
  assert.equal((await store.get(saved.id)).messages.length, 2);
});

test('persistence excludes provider credentials, reasoning, audit traces, raw tool arguments, and hidden result fields', async () => {
  const store = await openConversationStore({ indexedDB: undefined });
  const thread = createConversation('保留这句话的完整内容');
  thread.api_key = 'secret-not-persisted';
  thread.messages.push(message('可见回答', 'assistant', {
    reasoning_content: 'private-chain',
    result: {
      answer: '可见回答', reasoning_content: 'private-chain', audit_history: ['private-audit'],
      trace: { token: 'private-token' },
      cities: [{ slug: 'dali', name: '大理', url: '/cities/dali/', api_key: 'private-key' }],
      evidence: [{ id: 'E1', label: '公开资料', sources: [{ title: '来源', url: 'https://example.com', authorization: 'private-auth' }], result: { secret: 'private-result' } }],
    },
    activity: [{ label: '查询城市', tool: 'get_city', args: { secret: 'private-args' }, result: { raw: 'private-result' }, reasoning: 'private-reasoning' }],
  }));
  thread.budget = { currentDays: 15, reasoning_content: 'private-budget-reasoning', headers: { authorization: 'private-auth' } };
  const text = JSON.stringify(await store.put(thread));
  assert.ok(text.includes('可见回答'));
  assert.ok(!text.includes('private-'));
  assert.ok(!text.includes('secret-not-persisted'));
});

test('stale tabs cannot silently overwrite a newer conversation revision', async () => {
  const store = await openConversationStore({ indexedDB: undefined });
  const initial = await store.put(createConversation('初始问题'));
  const firstTab = await store.get(initial.id), secondTab = await store.get(initial.id);
  firstTab.draft = '第一标签页的新内容';
  const newer = await store.put(firstTab);
  assert.equal(newer.revision, 2);
  secondTab.draft = '过期标签页的旧内容';
  await assert.rejects(store.put(secondTab), isCode('AGENT_STORE_CONFLICT'));
  assert.equal((await store.get(initial.id)).draft, '第一标签页的新内容');
  await store.delete(initial.id);
  await assert.rejects(store.put(newer), isCode('AGENT_STORE_CONFLICT'));
  assert.equal(await store.get(initial.id), null);
});

test('visible failure state, assistant pairing, activity, and budget selection survive reload', async () => {
  const store = await openConversationStore({ indexedDB: undefined });
  const thread = createConversation('十五天预算');
  const user = message('十五天预算');
  const assistant = message('连接中断，问题已保留', 'assistant', {
    status: 'interrupted', questionId: user.id, error: '连接中断，问题已保留', selectedBudgetOption: 'E1-0',
    activity: [{ label: '读取消费分项', status: 'completed', duration: 1200 }],
  });
  thread.messages.push(user, assistant);
  thread.budgetSelection = { messageId: assistant.id, optionId: 'E1-0' };
  const saved = await store.put(thread);
  assert.deepEqual((await store.get(saved.id)).messages[1], assistant);
  assert.deepEqual((await store.get(saved.id)).budgetSelection, thread.budgetSelection);
});

test('capacity limits reject writes explicitly while keeping previous messages intact', async () => {
  const store = await openConversationStore({ indexedDB: undefined });
  let saved = await store.put(createConversation('已保存的对话'));
  const oversized = structuredClone(saved);
  oversized.messages = Array.from({ length: 101 }, () => message('不能无声截断'));
  await assert.rejects(store.put(oversized), isCode('AGENT_STORE_MESSAGE_LIMIT'));
  assert.equal((await store.get(saved.id)).messages.length, 0);
  const huge = structuredClone(saved);
  huge.messages.push(message('字'.repeat(800000)));
  await assert.rejects(store.put(huge), isCode('AGENT_STORE_RECORD_TOO_LARGE'));
  assert.equal((await store.get(saved.id)).revision, saved.revision);
  for (let index = 1; index < 100; index++) await store.put(createConversation('对话 ' + index));
  await assert.rejects(store.put(createConversation('第 101 条')), isCode('AGENT_STORE_CONVERSATION_LIMIT'));
  saved.draft = '达到总量上限仍能更新现有对话';
  saved = await store.put(saved);
  assert.equal(saved.draft, '达到总量上限仍能更新现有对话');
  await store.delete(saved.id);
  await store.put(createConversation('删除之后可以新增'));
  assert.equal((await store.list()).length, 100);
});

test('invalid records and non-JSON budget state fail before writing', async () => {
  const store = await openConversationStore({ indexedDB: undefined });
  const thread = createConversation();
  thread.messages.push(message('不是允许的角色', 'system'));
  await assert.rejects(store.put(thread), isCode('AGENT_STORE_INVALID_RECORD'));
  thread.messages = [message('不是允许的状态', 'assistant', { status: 'checking' })];
  await assert.rejects(store.put(thread), isCode('AGENT_STORE_INVALID_RECORD'));
  thread.messages = [];
  thread.budget = { notFinite: Infinity };
  await assert.rejects(store.put(thread), isCode('AGENT_STORE_INVALID_RECORD'));
  thread.budget = {};
  thread.budget.self = thread.budget;
  await assert.rejects(store.put(thread), isCode('AGENT_STORE_INVALID_RECORD'));
  assert.equal((await store.list()).length, 0);
});

// A read-only IDB event stand-in tests record isolation, not browser transaction semantics.
const readOnlyIndexedDB = records => ({
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {},
        transaction() {
          const transaction = { error: null };
          const requestFor = value => {
            const read = {};
            queueMicrotask(() => {
              read.result = value;
              read.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            });
            return read;
          };
          transaction.objectStore = () => ({ getAll: () => requestFor(records), get: id => requestFor(records.find(row => row.id === id)) });
          return transaction;
        },
      };
      request.onsuccess?.();
    });
    return request;
  },
});

test('a damaged IndexedDB record is isolated without hiding healthy conversations', async () => {
  const healthy = createConversation('正常的历史记录');
  healthy.messages.push(message('正常的问题'));
  const broken = { ...createConversation('损坏记录'), messages: [{ role: 'system', content: 'bad' }] };
  const store = await openConversationStore({ indexedDB: readOnlyIndexedDB([broken, healthy]) });
  assert.equal(store.available, true);
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.list())[0].id, healthy.id);
  assert.equal(await store.get(broken.id), null);
  assert.equal((await store.get(healthy.id)).messages[0].content, '正常的问题');
});

test('a denied IndexedDB open falls back safely and does not claim persistent storage', async () => {
  const indexedDB = { open() { throw new DOMException('Denied', 'SecurityError'); } };
  const store = await openConversationStore({ indexedDB });
  assert.equal(store.available, false);
  assert.match(store.reason, /本页|内存/);
  await store.put(createConversation('仍然能问问题'));
  assert.equal((await store.list()).length, 1);
});

test('a restricted IndexedDB property getter also returns the explicit memory fallback', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new DOMException('Denied', 'SecurityError'); } });
  try {
    const store = await openConversationStore();
    assert.equal(store.available, false);
    await store.put(createConversation('本页仍可继续'));
    assert.equal((await store.list()).length, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else delete globalThis.indexedDB;
  }
});
