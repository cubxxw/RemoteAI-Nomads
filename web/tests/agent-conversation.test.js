import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleAnswer,modelHistory,recoverInterrupted,localPath,conversationMarkdown} from '../public/modules/agent-conversation.js';

test('only visible answer fields enter a conversation, without shared references',()=>{
  const input={answer:'按天拆开预算 [E1]',cities:[{slug:'penang'}],evidence:[{id:'E1'}],budget_snapshot:{days:7},grounding_check:{reasoning:'private'},trace:{token:'private'},api_key:'private'};
  const saved=visibleAnswer(input);assert.deepEqual(Object.keys(saved),['answer','cities','evidence','budget_snapshot']);
  saved.budget_snapshot.days=15;assert.equal(input.budget_snapshot.days,7);
  assert.throws(()=>visibleAnswer({answer:23}));
});

test('model context contains only the last three completed pairs from this conversation',()=>{
  const messages=[];
  for(let i=1;i<=5;i++)messages.push({id:'u'+i,role:'user',content:'问题'+i},{id:'a'+i,role:'assistant',questionId:'u'+i,status:i===5?'pending':'completed',result:{answer:'答案'+i}});
  messages.push({id:'failed',role:'assistant',questionId:'u5',status:'failed',content:'retry'},{id:'orphan',role:'assistant',questionId:'missing',status:'completed',result:{answer:'orphan'}});
  const thread={messages};const before=structuredClone(thread);
  assert.deepEqual(modelHistory(thread).map(m=>m.content),['问题2','答案2','问题3','答案3','问题4','答案4']);
  assert.deepEqual(thread,before);assert.equal(modelHistory(thread).length,6);
});

test('interrupted answers become explicitly retryable without changing successful answers or budget',()=>{
  const thread={budget:{days:7},messages:[{role:'assistant',status:'pending',content:''},{role:'assistant',status:'completed',content:'keep'}]};
  assert.equal(recoverInterrupted(thread),true);assert.equal(thread.messages[0].status,'interrupted');
  assert.match(thread.messages[0].content,/重新查询/);assert.equal(thread.messages[1].content,'keep');assert.deepEqual(thread.budget,{days:7});
  assert.equal(recoverInterrupted(thread),false);
});

test('actions may navigate only to same-origin paths',()=>{
  for(const value of ['javascript:alert(1)','https://evil.example/','//evil.example/','/\\evil.example/','/\n/evil.example/','not-a-path',null])assert.equal(localPath(value),null);
  for(const value of ['/','/?month=1&budget=300','/cities/chiang-mai/'])assert.equal(localPath(value),value);
});

test('readable export retains source links and excludes private runtime fields',()=>{
  const out=conversationMarkdown({title:'清迈短住',trace:'private',messages:[{role:'user',content:'预算如何拆？'},{role:'assistant',content:'',result:{answer:'按七天计算 [E1]',grounding_check:'private',evidence:[{id:'E1',label:'预算',sources:[{title:'城市资料',url:'https://example.com/city'}]}]}}]});
  assert.match(out,/预算如何拆/);assert.match(out,/按七天计算 \[E1\]/);assert.match(out,/https:\/\/example.com\/city/);assert.doesNotMatch(out,/private/);
});
