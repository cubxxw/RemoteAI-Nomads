import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversation,openConversationStore} from '../public/modules/agent-store.js';
import {exportLocalData,importLocalData} from '../public/modules/local-migration.js';

function storage(values={}) {
  const rows=new Map(Object.entries(values));
  return {get length(){return rows.size;},key:i=>[...rows.keys()][i],getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};
}

test('local export includes Nomads records and preferences but excludes other apps and running locks',async()=>{
  const local=storage({'nomads-saved':'["chiang-mai"]','nomads-agent-running-v1':'private-lock','other-app-token':'private-token'});
  const store=await openConversationStore({indexedDB:null}),thread=createConversation('清迈的下午');
  await store.put(thread);
  const backup=await exportLocalData(local,store);
  assert.deepEqual(backup.local,{'nomads-saved':'["chiang-mai"]'});
  assert.equal(backup.conversations.length,1);
  assert.equal(backup.conversations[0].id,thread.id);
  assert.doesNotMatch(JSON.stringify(backup),/private-lock|private-token/);
});

test('local import preserves existing destination values and conversation revisions',async()=>{
  const source=storage({'nomads-saved':'["chiang-mai"]','nomads-trip-month-v1':'11'}),from=await openConversationStore({indexedDB:null});
  const thread=createConversation('出发计划');await from.put(thread);
  const backup=await exportLocalData(source,from),destination=storage({'nomads-saved':'["tokyo"]'}),to=await openConversationStore({indexedDB:null});
  const saved=await to.put({...thread,draft:'新站已有草稿'});
  const result=await importLocalData(JSON.stringify(backup),destination,to);
  assert.equal(destination.getItem('nomads-saved'),'["tokyo"]');
  assert.equal(destination.getItem('nomads-trip-month-v1'),'11');
  assert.equal((await to.get(thread.id)).draft,'新站已有草稿');
  assert.equal((await to.get(thread.id)).revision,saved.revision);
  assert.deepEqual(result,{localImported:1,localSkipped:1,conversationsImported:0,conversationsSkipped:1});
});

test('invalid or unrelated backups are rejected before any destination writes',async()=>{
  const local=storage(),store=await openConversationStore({indexedDB:null});
  for(const backup of [{version:2},{format:'other-app',version:1,local:{},conversations:[]},{format:'nomads-local-backup',version:1,local:{'other-token':'x'},conversations:[]},{format:'nomads-local-backup',version:1,local:{'nomads-saved':'[]'},conversations:[{id:'broken'}]}]){
    await assert.rejects(importLocalData(JSON.stringify(backup),local,store));
    assert.equal(local.length,0);assert.equal((await store.list()).length,0);
  }
});

test('the previous conversation-only export format imports visible records without runtime fields',async()=>{
  const store=await openConversationStore({indexedDB:null}),thread=createConversation('旧站记录');
  thread.secret='must-not-copy';thread.revision=4;
  const result=await importLocalData(JSON.stringify({version:1,exportedAt:'2026-10-19',conversations:[thread]}),storage(),store);
  assert.equal(result.conversationsImported,1);
  const imported=await store.get(thread.id);
  assert.equal(imported.revision,1);assert.equal(imported.secret,undefined);
});
