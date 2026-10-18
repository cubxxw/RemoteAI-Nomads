import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createQuota} from '../agent/quota.mjs';

test('concurrent reservations enforce persistent hourly owner limit',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nomads-quota-'));
 try{
  const filename=path.join(dir,'quota.json'),reserve=createQuota(filename);
  const results=await Promise.allSettled(Array.from({length:20},()=>reserve({owner:'one',network:'one'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,12);
  await assert.rejects(createQuota(filename)({owner:'one',network:'other'}),/LIMIT/);
  assert.equal(JSON.parse(await readFile(filename,'utf8')).length,12);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('network and evaluation limits cannot be bypassed by new session owners',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nomads-quota-'));
 try{
  const filename=path.join(dir,'quota.json'),reserve=createQuota(filename);
  await writeFile(filename,JSON.stringify(Array.from({length:24},(_,i)=>({at:Date.now(),owner:String(i),network:'same',evaluation:false}))));
  await assert.rejects(reserve({owner:'new',network:'same'}),/LIMIT/);
  await writeFile(filename,JSON.stringify(Array.from({length:449},()=>({at:Date.now(),owner:'eval',network:'eval',evaluation:true}))));
  await reserve({owner:'last-eval',network:'eval',evaluation:true});
  await assert.rejects(reserve({owner:'eval',network:'eval',evaluation:true}),/EVAL_DAILY_LIMIT/);
  await reserve({owner:'ordinary',network:'ordinary'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
