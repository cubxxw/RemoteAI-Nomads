import test from 'node:test';import assert from 'node:assert/strict';
const {gradeShareRelease,SHARE_DIMENSIONS}=await import('../evals/share-grade.mjs').catch(()=>({}));
test('unmeasured dimensions never become passing quality scores',()=>{const result=gradeShareRelease({});assert.equal(result.passed,false);assert.equal(result.dimensions.visual,null);});
test('every dimension must exceed 96 with matching evidence, not an average',()=>{
 const dimensions=Object.fromEntries(SHARE_DIMENSIONS.map(key=>[key,{score:97,evidence:[{kind:['reading','visual'].includes(key)?'target-user':key==='platform'?'platform-receipt':'maintainer',artifact:'real-evidence.json'}]}]));
 assert.equal(gradeShareRelease({dimensions}).passed,true);dimensions.accuracy.score=96;assert.equal(gradeShareRelease({dimensions}).passed,false);
});
test('automated checks cannot masquerade as taste or real-user comprehension',()=>{
 const dimensions=Object.fromEntries(SHARE_DIMENSIONS.map(key=>[key,{score:100,evidence:[{kind:'automated',artifact:'tests.json'}]}]));assert.equal(gradeShareRelease({dimensions}).passed,false);
});
test('one critical failure blocks release even when every score is 100',()=>{
 const dimensions=Object.fromEntries(SHARE_DIMENSIONS.map(key=>[key,{score:100,evidence:[{kind:['reading','visual'].includes(key)?'target-user':key==='platform'?'platform-receipt':'maintainer',artifact:'evidence.json'}]}]));assert.equal(gradeShareRelease({dimensions,criticalFailures:['wrong currency']}).passed,false);
});
