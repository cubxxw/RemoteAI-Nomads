import test from 'node:test';import assert from 'node:assert/strict';
import{materialClaims,requireClaimCoverage}from'../agent/material-claims.mjs';
test('affordability, scope, housing definitions and unsolicited DST judgments are all selected for audit',()=>{
 const claims=materialClaims('结论\n2000元按此规划。\n只能匹配床位，撑不起整租一个月。\n两地均处夏令时。\n住房项只计实际房租。\nCostCompass未提供上游发布方。');
 for(const phrase of ['只能匹配','夏令时','只计实际房租','未提供上游'])assert.ok(claims.some(c=>c.text.includes(phrase)));
});
test('checking an easy true number cannot silently omit a consequential claim',()=>{
 const claims=materialClaims('2000元除以30天约66.67元每天。\n所以只有免费住宿才能成行。');
 assert.throws(()=>requireClaimCoverage({checks:[{claim_id:claims[0].id,supported:true}]},claims),/INCOMPLETE/);
 assert.doesNotThrow(()=>requireClaimCoverage({checks:claims.map(c=>({claim_id:c.id,supported:true}))},claims));
});
test('decimal amounts remain intact and the audit set is bounded',()=>{
 const claims=materialClaims('36.7 元是住宿规划上限。\n'+Array.from({length:30},(_,i)=>`第${i}座城市更便宜。`).join('\n'));
 assert.ok(claims.some(c=>c.text.includes('36.7')));assert.ok(claims.length<=24);
 assert.ok(claims.some(c=>c.text.includes('第29座城市')));
});

test('a terse factual answer still receives a claim id',()=>assert.deepEqual(materialClaims('01:00。'),[{id:'C1',text:'01:00。'}]));
test('short consequential claims remain audited next to a longer sentence',()=>{
 const claims=materialClaims('建议先核对出发时的官方入境政策。\n免签365天。\n住宿免费。');
 assert.ok(claims.some(c=>c.text.includes('免签365天')));
 assert.ok(claims.some(c=>c.text.includes('住宿免费')));
 assert.throws(()=>requireClaimCoverage({checks:[{claim_id:'C1',supported:true}]},claims),/INCOMPLETE/);
});

test('tables, formulas, and comparisons without a keyword remain covered',()=>{
 const claims=materialClaims('东京房租显著高于全国均值。\n| 指标 | 计算 |\n| --- | --- |\n| 默认分 | 安全×0.3 + 社区×0.05 |');
 assert.ok(claims.some(c=>c.text.includes('显著高于')));
 assert.ok(claims.some(c=>c.text.includes('社区×0.05')));
 assert.ok(!claims.some(c=>c.text.includes('---')));
});
test('audit ids are unique and refer to the server-bound complete original',()=>{
 const claims=[{id:'C1',text:'全国统计正确，但东京不可能住得起。'}];
 assert.throws(()=>requireClaimCoverage({checks:[{claim_id:'C1'},{claim_id:'C1'}]},claims),/INCOMPLETE/);
 const checked=requireClaimCoverage({checks:[{claim_id:'C1',claim:'全国统计正确',supported:true}]},claims);
 assert.equal(checked.checks[0].claim,claims[0].text);
});
