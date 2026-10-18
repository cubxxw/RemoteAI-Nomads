import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRankings} from '../src/rank-pages.js';
function catalog(){
 let queries=0,fail=false;
 return {get queries(){return queries;},set fail(v){fail=v;},DB:{prepare(sql){return {bind(){return this;},async all(){queries++;if(fail)throw Error('DATABASE_UNAVAILABLE');await new Promise(r=>setTimeout(r,5));return {results:sql.includes('SELECT c.id,c.slug')?[{id:'x',slug:'test-city',name_zh:'测试城',safety:8}]:[]};}};}}};
}
test('production catalog coalesces concurrent reads, isolates returned values, and invalidates on release',async()=>{
 const db=catalog(),env={DB:db.DB,PREVIEW:'false',RELEASE_ID:'cache-test-v1',SITE_ORIGIN:'https://cache-test.example'};
 const [a,b]=await Promise.all([loadRankings(env),loadRankings(env)]);assert.equal(db.queries,3);
 a[0].scores.safety=0;a[0].months[0].status='altered';assert.equal(b[0].scores.safety,8);assert.equal(b[0].months[0].status,'unknown');
 await loadRankings(env);assert.equal(db.queries,3);
 await loadRankings({...env,RELEASE_ID:'cache-test-v2'});assert.equal(db.queries,6);
});
test('preview catalogs are never cached, and a failed public read can be retried',async()=>{
 const db=catalog();await loadRankings({DB:db.DB,PREVIEW:'true'});await loadRankings({DB:db.DB,PREVIEW:'true'});assert.equal(db.queries,6);
 const env={DB:db.DB,PREVIEW:'false',RELEASE_ID:'cache-retry-v1',SITE_ORIGIN:'https://cache-test.example'};db.fail=true;
 await assert.rejects(loadRankings(env),/DATABASE_UNAVAILABLE/);db.fail=false;
 const rows=await loadRankings(env);assert.equal(rows[0].slug,'test-city');
});
