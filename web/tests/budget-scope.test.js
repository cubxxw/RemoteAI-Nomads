import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditBudgetScope} from '../agent/budget-scope.mjs';
test('an unknown departure point cannot silently exclude travel from the budget',()=>{
  assert.throws(()=>auditBudgetScope('2000元不含往返大交通（你没说出发地）。',{question:'一月去，预算2000人民币，中国区'}),/UNCONFIRMED_TRANSPORT_EXCLUSION/);
  assert.doesNotThrow(()=>auditBudgetScope('往返交通报价未知，应从2000元总预算中扣除。若先假设不含机票，可另算生活费情景。',{question:'一月去，预算2000人民币，中国区'}));
});
test('excluding flights does not also exclude a train',()=>{
  const input={question:'1月在中国玩7天，2000人民币，不含往返机票。'};
  assert.throws(()=>auditBudgetScope('| 合计 | 2000 | 不含到达厦门的机票/动车 |',input),/UNCONFIRMED_TRANSPORT_EXCLUSION/);
  assert.doesNotThrow(()=>auditBudgetScope('按你说明不含往返机票，动车是否计入待确认。',input));
});
test('confirmed broad exclusions and prior user scope remain usable',()=>{
  assert.doesNotThrow(()=>auditBudgetScope('不含往返交通与火车票。',{question:'只住7天',history:[{role:'user',content:'2000元生活预算，不含往返交通'}]}));
  assert.throws(()=>auditBudgetScope('不含往返交通。',{question:'2000元',history:[{role:'assistant',content:'不含往返交通'}]}),/UNCONFIRMED_TRANSPORT_EXCLUSION/);
});
test('questions and negated exclusions do not authorize removing flight cost',()=>{
  for(const question of ['预算是否不含机票？','2000元必须包含机票，不能不含机票。'])assert.throws(()=>auditBudgetScope('2000元不含机票。',{question}),/UNCONFIRMED_TRANSPORT_EXCLUSION/);
  assert.throws(()=>auditBudgetScope('2000元不含机票。',{question:'改把机票算进2000元',history:[{role:'user',content:'2000元不含机票'}]}),/UNCONFIRMED_TRANSPORT_EXCLUSION/);
});
test('missing prices do not make an exclusion conditional',()=>{
  for(const answer of ['你没说出发地，2000元不含往返大交通。','机票价格尚未确认，因此2000元不含机票。','预算2000元，机票另算。'])assert.throws(()=>auditBudgetScope(answer,{question:'预算2000元'}),/UNCONFIRMED_TRANSPORT_EXCLUSION/);
  assert.doesNotThrow(()=>auditBudgetScope('若先假设不含机票，生活费可另给一组情景。',{question:'预算2000元'}));
});
test('a following question does not revoke an explicit local exclusion',()=>{
 for(const question of ['预算2000元不含机票，怎么安排？','2000元不含机票，动车是否计入待确认？'])assert.doesNotThrow(()=>auditBudgetScope('不含机票，动车费用待确认。',{question}));
});
test('a later clause can replace an earlier scope in the same message',()=>{
 assert.throws(()=>auditBudgetScope('2000元不含机票。',{question:'刚才说2000元不含机票，现在改为包括机票。'}),/UNCONFIRMED_TRANSPORT_EXCLUSION/);
});
