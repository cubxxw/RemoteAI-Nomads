// Only presentation data belongs in local history. Server audit traces and
// hidden model reasoning deliberately never enter a conversation record.
import {sitePath} from './site-path.js';
const answerFields=['answer','cities','evidence','ranking_url','followups','budget_snapshot','budget_options'];
export function visibleAnswer(value){
  if(!value||typeof value.answer!=='string')throw Error('无效的回答');
  const result={};for(const key of answerFields)if(value[key]!==undefined)result[key]=structuredClone(value[key]);
  return result;
}
export function modelHistory(thread){
  const byId=new Map(thread.messages.map(m=>[m.id,m]));const pairs=[];
  for(const message of thread.messages){
    if(message.role!=='assistant'||message.status!=='completed'||!message.result?.answer)continue;
    const user=byId.get(message.questionId);if(!user||user.role!=='user')continue;
    pairs.push([{role:'user',content:user.content},{role:'assistant',content:message.result.answer}]);
  }
  return pairs.slice(-3).flat();
}
export function recoverInterrupted(thread){
  let changed=false;
  for(const message of thread.messages)if(message.role==='assistant'&&message.status==='pending'){
    message.status='interrupted';message.content='上次回答已中断。问题保留在这里，可以重新查询。';changed=true;
  }
  return changed;
}
export function localPath(value){
  return typeof value==='string'&&/^\/(?!\/)[^\s\\]*$/.test(value)?sitePath(value):null;
}
export function conversationMarkdown(thread){
  const lines=['# '+thread.title,'','导出自 RemoteAI Nomads · 本机对话记录',''];
  for(const message of thread.messages){
    lines.push('## '+(message.role==='user'?'你':'小狐'),'');
    lines.push(message.result?.answer||message.content||'','');
    if(message.role==='assistant'&&message.result?.evidence?.length){
      lines.push('依据：','');
      for(const evidence of message.result.evidence){
        lines.push('- '+evidence.id+' · '+evidence.label);
        for(const source of evidence.sources||[])if(/^https?:\/\//.test(source.url||''))lines.push('  - '+source.title+' · '+source.url);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}
