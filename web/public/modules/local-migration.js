import {normalizeConversation} from './agent-store.js';

const FORMAT='nomads-local-backup';
export const MAX_BACKUP_BYTES=25*1024*1024;
const keys=new Set(['nomads-saved','nomads-compare','nomads-ranking-view-v1','nomads-trip-month-v1','nomads-agent-active-v1','nomads-agent-draft-v1']);
const guideKey=/^nomads:guide:[a-z0-9-]{1,100}$/;
const allowed=key=>keys.has(key)||/^nomads-city-plan-v1:[a-z0-9-]{1,100}$/.test(key)||guideKey.test(key);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validLocalValue(key,value){
 if(typeof value!=='string'||value.length>100000)return false;
 if(!guideKey.test(key))return true;
 try{const checks=JSON.parse(value);return Array.isArray(checks)&&checks.length<=500&&checks.every(item=>Number.isInteger(item)&&item>=0&&item<=10000);}catch{return false;}
}

export async function exportLocalData(storage,store){
  const local={};
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i),value=allowed(key)?storage.getItem(key):null;if(allowed(key)&&validLocalValue(key,value))local[key]=value;
  }
  const conversations=[];
  for(const summary of await store.list()){
    const value=await store.get(summary.id);if(value)conversations.push(normalizeConversation(value));
  }
  return {format:FORMAT,version:1,exportedAt:new Date().toISOString(),local,conversations};
}

export async function importLocalData(text,storage,store){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES)throw Error('文件超过 25 MB，请分批导出对话后再迁移。');
  const backup=JSON.parse(text);
  const previousExport=backup.format===undefined&&backup.local===undefined;
  if(backup.version!==1||(!previousExport&&backup.format!==FORMAT)||!Array.isArray(backup.conversations)||backup.conversations.length>100)throw Error('这不是支持的游民记录备份。');
  const local=backup.local??{};
  if(!record(local)||Object.keys(local).length>500||Object.entries(local).some(([key,value])=>!allowed(key)||!validLocalValue(key,value)))throw Error('备份中的本机偏好格式不正确。');
  // Validate the complete file before the first write. Store normalization drops
  // runtime/private fields and rejects malformed visible conversation records.
  const conversations=backup.conversations.map(normalizeConversation);
  if(new Set(conversations.map(value=>value.id)).size!==conversations.length)throw Error('备份中有重复的对话标识。');
  const result={localImported:0,localSkipped:0,conversationsImported:0,conversationsSkipped:0};
  for(const thread of conversations){
    if(await store.get(thread.id)){result.conversationsSkipped++;continue;}
    await store.put({...thread,revision:0});result.conversationsImported++;
  }
  for(const [key,value] of Object.entries(local)){
    if(storage.getItem(key)!==null){result.localSkipped++;continue;}
    storage.setItem(key,value);result.localImported++;
  }
  return result;
}
