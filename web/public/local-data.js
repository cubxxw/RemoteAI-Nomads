import {openConversationStore} from './modules/agent-store.js';
import {exportLocalData,importLocalData,MAX_BACKUP_BYTES} from './modules/local-migration.js';

const status=document.querySelector('#migration-status'),buttons=[...document.querySelectorAll('button')];
document.querySelector('#current-site').textContent='当前地址：'+location.origin;
async function run(action){
  buttons.forEach(button=>button.disabled=true);
  try{
    const store=await openConversationStore();
    if(!store.available)throw Error('浏览器未允许持久保存对话，请允许这个网站使用本机存储后重试。');
    try{await action(store);}finally{store.close();}
  }catch(error){status.textContent=error.message||'这次没有完成，请重试。';}
  finally{buttons.forEach(button=>button.disabled=false);}
}
document.querySelector('#export-local').addEventListener('click',()=>run(async store=>{
  const backup=await exportLocalData(localStorage,store),text=JSON.stringify(backup,null,2);
  if(new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES)throw Error('记录超过 25 MB，请先在小狐中分批导出对话。');
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='nomads-local-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent=`已导出 ${backup.conversations.length} 段对话、${Object.keys(backup.local).length} 项本机偏好与行程。请在新地址选择这个文件。`;
}));
document.querySelector('#import-local').addEventListener('click',()=>run(async store=>{
  const file=document.querySelector('#backup-file').files[0];if(!file)throw Error('请先选择 JSON 备份文件。');
  if(file.size>MAX_BACKUP_BYTES)throw Error('文件超过 25 MB，请分批迁移。');
  const result=await importLocalData(await file.text(),localStorage,store);
  status.textContent=`已导入 ${result.conversationsImported} 段对话、${result.localImported} 项本机偏好与行程；保留了 ${result.conversationsSkipped} 段已有对话和 ${result.localSkipped} 项已有设置。返回选城页面后即可使用。`;
}));
