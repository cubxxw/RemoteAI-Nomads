import {esc,money,parseState,KEYS,LABELS,DEFAULT_WEIGHTS} from './ranking.js';
import {budgetSymbol} from './budget-currency.js';
import {formatAgentAnswer} from './agent-format.js';
import {runLiveness} from './agent-liveness.js';
import {parseAgentEvent} from './agent-sse.js';
import {createConversation,openConversationStore} from './agent-store.js';
import {visibleAnswer,modelHistory,recoverInterrupted,localPath,conversationMarkdown} from './agent-conversation.js';
import {sitePath,appPath} from './site-path.js';
const $=id=>document.getElementById(id);
const dialog=$('nomad-agent'),transcript=$('agent-transcript'),question=$('agent-question'),launcher=$('companion-launcher');
const cache=new Map(),deleted=new Set(),conflicted=new Set();
const activeKey='nomads-agent-active-v1',draftKey='nomads-agent-draft-v1',leaseKey='nomads-agent-running-v1';
let store,active,running=null,opener=null,historyMode=false,saveChain=Promise.resolve(),noticeTimer,unread=false,changingMode=false,selectionVersion=0,hasOpened=false;
const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
// A duplicated tab inherits sessionStorage; give each document its own identity.
const tabId=crypto.randomUUID();
const liveForeign=()=>{const l=read(leaseKey);return l&&l.tabId!==tabId&&Date.now()-l.at<240000?l:null;};
function lease(run){write(leaseKey,{tabId,threadId:run.thread.id,at:Date.now()});}
function clearLease(){if(read(leaseKey)?.tabId===tabId)write(leaseKey,null);}
function announce(text,action,label=''){
  clearTimeout(noticeTimer);const bar=$('agent-notice');bar.hidden=false;bar.querySelector('span').textContent=text;
  const button=bar.querySelector('button');button.hidden=!action;button.textContent=label;button.onclick=action||null;
  if(!action)noticeTimer=setTimeout(()=>{bar.hidden=true;},9000);
}
function status(text){$('agent-status').textContent=text;}
function pet(){
  const state=running?'thinking':unread?'ready':'rest';launcher.dataset.state=state;
  launcher.querySelector('.fox-art').dataset.foxPose=state==='thinking'?'thinking':state==='ready'?'content':'rest';
  $('companion-label').textContent=state==='thinking'?'在查证了':state==='ready'?'回答好了':'小狐旅伴';
  launcher.setAttribute('aria-label',state==='thinking'?'小狐正在查证，打开查看进度':state==='ready'?'小狐有新的回答，打开查看':'和小狐聊聊旅行，打开对话与本机历史');
}
function resizeComposer(){question.style.height='auto';question.style.height=Math.min(120,Math.max(52,question.scrollHeight))+'px';}
function rememberDraft(){if(!active||deleted.has(active.id))return;active.draft=question.value;if(!active.messages.length)active.title=Array.from(active.draft.trim()).slice(0,28).join('')||'新的旅行计划';write(draftKey,{id:active.id,text:active.draft,useContext:active.useContext,at:Date.now()});}
function rememberActive(){if(active)write(activeKey,active.id);}
async function persist(thread){
  if(!thread.messages.length&&!thread.draft.trim()&&!thread.revision)return false;
  const snapshot=structuredClone(thread);
  const job=saveChain.then(async()=>{
    if(deleted.has(thread.id)||conflicted.has(thread.id))return false;
    snapshot.revision=thread.revision;
    const saved=await store.put(snapshot);thread.revision=saved.revision;thread.updatedAt=saved.updatedAt;
    $('agent-save-state').textContent=store.available?'对话已保存在这台设备':'当前仅在本页暂存';return true;
  }).catch(error=>{
    if(error.code==='AGENT_STORE_CONFLICT')conflicted.add(thread.id);
    $('agent-save-state').textContent='这次内容尚未保存';
    announce(error.code==='AGENT_STORE_CONFLICT'?'另一个页面更新了这段记录。此页内容还在，可以先导出。':'没有存到本机，当前内容还在。可以导出备份。',()=>exportThread(thread),'导出');
    return false;
  });
  saveChain=job.then(()=>{});return job;
}
function currentContext(){
  if(!active?.useContext)return {};
  const url=new URL(location.href),s=parseState(url),path=appPath(url.pathname),city=path.match(/^\/cities\/([^/]+)\/$/),pair=path.match(/^\/compare\/([^/]+)-vs-([^/]+)\/$/),country=path.match(/^\/countries\/([^/]+)\/$/);
  return {...s,source:'current page',...(city?{city:city[1]}:{}),...(pair?{cities:[pair[1],pair[2]]}:{}),...(country?{country:/^[a-z]{2}$/i.test(country[1])?country[1].toUpperCase():document.querySelector('main h1')?.textContent.trim()}: {})};
}
function describeContext(){
  const c=currentContext(),parts=[];
  if(c.city)parts.push(document.querySelector('.city-breadcrumbs [aria-current="page"]')?.textContent||'当前城市');
  if(c.country)parts.push(document.querySelector('main h1')?.textContent.trim()||c.country);
  if(c.cities)parts.push('当前两座城市');if(c.q)parts.push(c.q);if(c.region)parts.push(c.region);
  if(c.budget)parts.push('≤'+budgetSymbol(c.budgetCurrency)+c.budget.toLocaleString('en-US'));if(c.month)parts.push(c.month+'月');if(c.warm)parts.push('避寒');
  if(c.recommendedOnly||c.season)parts.push('原推荐月份');
  if(c.weights&&KEYS.some(k=>c.weights[k]!==DEFAULT_WEIGHTS[k])){const leader=KEYS.reduce((a,b)=>c.weights[a]>=c.weights[b]?a:b);parts.push(LABELS[leader]+'优先');}
  const text=!active?.useContext?'只参考你的问题':parts.join(' · ')||'问题中的新条件优先';
  $('agent-context-description').textContent=text;$('agent-context-description').title=text;
}
function controls(){
  const own=running?.thread.id===active?.id,foreign=liveForeign();
  $('agent-send').hidden=!!own;$('agent-send').disabled=!!running||!!foreign;
  $('agent-stop').hidden=!own;$('agent-stop').disabled=!!running?.stopping;
  $('agent-stop').title=running?.needsConfirmation?'再次确认停止':'停止当前回答';
  question.readOnly=!!foreign&&foreign.threadId===active?.id;
  $('agent-use-context').disabled=!!own||foreign?.threadId===active?.id;
  $('agent-running-elsewhere').hidden=!(running&&!own)&&!foreign;
  $('agent-running-elsewhere').querySelector('span').textContent=foreign?'另一个页面正在回答，请稍后再发。':'小狐正在完成另一段对话。';
  $('agent-view-running').hidden=!!foreign&&!running;
  $('agent-delete').disabled=!!own||foreign?.threadId===active?.id;
  transcript.querySelectorAll('.agent-retry').forEach(button=>{button.disabled=!!running||!!foreign;});
  transcript.querySelectorAll('.agent-budget-choice button,.agent-followups button,.agent-starters button').forEach(button=>{button.disabled=foreign?.threadId===active?.id;});
}
function welcome(){
  const section=document.createElement('section');section.className='agent-welcome';
  section.innerHTML='<div class="agent-welcome-art"><span class="fox-art" data-fox-pose="curious" aria-hidden="true"></span></div><h3>下一站，想怎么生活？</h3><p>说说预算、季节和工作安排。<br>我们把吃住和取舍，一起拆开想。</p><div class="agent-starters"><button type="button" data-agent-question="一月在中国，2000元人民币预算，如何安排一段短住？">2000元，安排一段短住</button><button type="button" data-agent-question="清迈和槟城怎么选？比较预算、季节和远程工作条件。">清迈和槟城，怎么选？</button></div>';
  return section;
}
function renderActivity(message){
  if(!message.activity?.length)return null;
  const details=document.createElement('details');details.className='agent-activity';
  const summary=document.createElement('summary');summary.textContent=message.elapsedMs?message.activity.length+' 次查询 · '+(message.elapsedMs/1000).toFixed(1)+'秒':'查看查询过程';details.append(summary);
  const list=document.createElement('ol');
  for(const entry of message.activity){const row=document.createElement('li'),label=document.createElement('span'),state=document.createElement('span');label.textContent=entry.label;state.className='agent-step-state';state.textContent=entry.status||(entry.ok===undefined?'查询中':entry.ok?'已完成':'未完成');row.append(label,state);list.append(row);}
  details.append(list);return details;
}
function renderAnswer(content,value,thread,message){
  content.innerHTML=formatAgentAnswer(value.answer,(value.evidence||[]).map(e=>e.id));
  if(value.budget_options?.length){
    const choices=document.createElement('section');choices.className='agent-budget-choices';
    const heading=document.createElement('h3');heading.textContent='选一组假设，接着算';
    const note=document.createElement('p');note.className='agent-budget-choice-note';note.textContent='选择后沿用原单价。这些是预算假设，不是报价。';choices.append(heading,note);
    for(const option of value.budget_options){
      const row=document.createElement('div');row.className='agent-budget-choice';const text=document.createElement('span');text.textContent=option.label+' · '+option.remaining_label+' '+option.remaining+' '+option.currency;
      const button=document.createElement('button');button.type='button';const selected=thread.budgetSelection?.messageId===message.id&&thread.budgetSelection?.optionId===option.id;button.textContent=selected?'已沿用':'沿用这组';button.setAttribute('aria-pressed',String(selected));
      button.addEventListener('click',()=>{if(liveForeign()?.threadId===thread.id){announce('另一个页面正在更新这段对话，完成后再选择。');return;}thread.budget=structuredClone(option.snapshot);thread.budgetSelection={messageId:message.id,optionId:option.id};persist(thread);renderThread({scrollToEnd:false});status('已沿用原单价和预留，可以继续问“改成15天”。');question.focus();});
      row.append(text,button);choices.append(row);
    }
    content.append(choices);
  }
  const cities=(value.cities||[]).filter(c=>localPath(c.url));
  if(cities.length){const cards=document.createElement('div');cards.className='agent-cities';cards.innerHTML=cities.map(c=>`<a class="agent-city" href="${esc(localPath(c.url))}">${localPath(c.photo)?`<img src="${esc(sitePath(c.photo.endsWith('.webp')?c.photo.replace('.webp','.thumb.webp'):c.photo))}" width="56" height="48" alt="" loading="lazy">`:''}<div><strong>${esc(c.name)}<span>${esc(c.country)}</span></strong><span>查看预算、季节和远程工作条件</span></div><span aria-hidden="true">›</span></a>`).join('');content.append(cards);}
  const actions=document.createElement('div');actions.className='agent-result-actions';
  if(localPath(value.ranking_url)){const button=document.createElement('button');button.type='button';button.textContent='应用到排行';button.addEventListener('click',()=>{const path=localPath(value.ranking_url);if(['/','/cities/'].includes(appPath(location.pathname))){history.pushState({nomads:true},'',path);window.dispatchEvent(new PopStateEvent('popstate'));close();}else location.href=path;});actions.append(button);}
  if(cities.length>=2&&cities.slice(0,2).every(c=>/^[a-z0-9-]+$/.test(c.slug))){const pair=cities.slice(0,2),link=document.createElement('a');link.href=sitePath('/compare/'+pair.map(c=>c.slug).sort().join('-vs-')+'/');link.textContent='对比'+pair.map(c=>c.name).join('与');actions.append(link);}
  if(actions.childElementCount)content.append(actions);
  if(value.evidence?.length){
    const details=document.createElement('details');details.className='agent-evidence';const summary=document.createElement('summary');summary.textContent=value.evidence.length+' 项依据与价格口径';details.append(summary);
    for(const evidence of value.evidence){
      const group=document.createElement('section');group.className='agent-source-group';group.tabIndex=-1;group.dataset.evidenceGroup=evidence.id;
      const heading=document.createElement('h3');heading.textContent=evidence.id+' · '+evidence.label;group.append(heading);
      for(const warning of new Set(evidence.warnings||[])){const p=document.createElement('p');p.textContent=warning;group.append(p);}
      if(!evidence.sources?.length){const p=document.createElement('p');p.textContent='本次程序计算。假设和单位见回答。';group.append(p);}
      for(const source of evidence.sources||[]){const a=document.createElement('a');if(/^https?:\/\//.test(source.url||'')){a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';}a.textContent=source.title+' · '+source.accessed_at+(source.kind==='legacy'?' · 旧资料':'');group.append(a);}
      details.append(group);
    }
    content.append(details);
    for(const button of content.querySelectorAll('[data-evidence-id]'))button.addEventListener('click',()=>{details.open=true;const group=[...details.querySelectorAll('[data-evidence-group]')].find(g=>g.dataset.evidenceGroup===button.dataset.evidenceId);group?.focus({preventScroll:true});group?.scrollIntoView({block:'nearest',behavior:'auto'});});
  }
  if(value.followups?.length){const suggestions=document.createElement('div');suggestions.className='agent-followups';for(const text of value.followups){const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('click',()=>fillQuestion(text));suggestions.append(button);}content.append(suggestions);}
  const copy=document.createElement('button');copy.type='button';copy.className='agent-copy';copy.textContent='复制回答';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(value.answer);copy.textContent='已复制';}catch{copy.textContent='请选择上方文字复制';}});content.append(copy);
  const share=document.createElement('button');share.type='button';share.className='agent-copy';share.textContent='分享这条回答';share.addEventListener('click',async()=>{const [{openShare},{createShare}]=await Promise.all([import('./share-ui.js'),import('./share-model.js')]);openShare(createShare({kind:'answer',title:'选城笔记',body:value.answer,url:null,private:true,caveats:['所选回答供讨论，价格与停留条件请核对引用来源。'],sources:(value.evidence||[]).flatMap(group=>group.sources||[]).filter(row=>/^https?:\/\//.test(row.url||'')).map(row=>({title:row.title||'引用来源',url:row.url,date:row.accessed_at||''}))}),share);});content.append(share);
}
function messageNode(message,thread){
  const article=document.createElement('article');article.className='agent-message agent-message-'+message.role;article.dataset.messageId=message.id;article.setAttribute('aria-label',message.role==='user'?'你的问题':'小狐的回答');
  const label=document.createElement('span');label.className='agent-message-label';label.textContent=message.role==='user'?'你':'小狐';
  const content=document.createElement('div');content.className='agent-message-content';article.append(label,content);
  if(message.result&&message.status==='completed')renderAnswer(content,message.result,thread,message);
  else if(message.status==='pending'){
    const p=document.createElement('div');p.className='agent-pending';p.innerHTML='<span class="agent-pending-dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>';p.lastElementChild.textContent=running?.thread.id===thread.id?running.phase:'这段回答尚未完成';content.append(p);
  }else{
    const p=document.createElement('p');p.textContent=message.content;content.append(p);
    if(message.role==='assistant'&&['failed','cancelled','interrupted'].includes(message.status)){
      const user=thread.messages.find(m=>m.id===message.questionId);
      if(user){const button=document.createElement('button');button.type='button';button.className='agent-retry';button.textContent=message.status==='cancelled'?'重新查询':'重试这个问题';button.disabled=!!running;button.addEventListener('click',()=>ask(user.content,{thread,retry:message}));content.append(button);}
    }
  }
  const activity=renderActivity(message);if(activity)article.append(activity);return article;
}
function renderThread({scrollToEnd=true}={}){
  if(!active)return;const top=transcript.scrollTop;transcript.replaceChildren();
  if(!active.messages.length)transcript.append(welcome());else for(const message of active.messages)transcript.append(messageNode(message,active));
  $('agent-thread-title').textContent=active.title;$('agent-thread-title').title=active.title;
  if(document.activeElement!==question)question.value=active.draft||'';
  $('agent-use-context').checked=active.useContext!==false;describeContext();resizeComposer();controls();
  if(scrollToEnd)scrollLatest();else transcript.scrollTop=top;
}
function scrollLatest(){const last=[...transcript.querySelectorAll('.agent-message-assistant')].at(-1);if(last)transcript.scrollTop+=last.getBoundingClientRect().top-transcript.getBoundingClientRect().top-12;else transcript.scrollTop=0;}
function updateMessage(run,{answer=false}={}){
  if(active?.id!==run.thread.id||historyMode)return;
  const current=[...transcript.querySelectorAll('[data-message-id]')].find(n=>n.dataset.messageId===run.message.id);if(!current){renderThread();return;}
  const near=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<150;
  const expanded=current.querySelector('.agent-activity')?.open;
  const fresh=messageNode(run.message,run.thread);current.replaceWith(fresh);if(expanded&&fresh.querySelector('.agent-activity'))fresh.querySelector('.agent-activity').open=true;
  if(near){if(answer)transcript.scrollTop+=fresh.getBoundingClientRect().top-transcript.getBoundingClientRect().top-16;else transcript.scrollTop=transcript.scrollHeight;}
  status(run.phase);
}
async function selectThread(id){
  const selection=++selectionVersion;if(active)rememberDraft();let thread=cache.get(id)||await store.get(id);if(!thread||selection!==selectionVersion)return;
  if(running?.thread.id===id)thread=running.thread;
  const foreign=liveForeign();
  if(!running&&(!foreign||foreign.threadId!==id)&&recoverInterrupted(thread))await persist(thread);
  if(selection!==selectionVersion)return;
  cache.set(id,thread);active=thread;rememberActive();historyMode=false;$('agent-history').hidden=true;$('agent-chat').hidden=false;$('agent-history-toggle').setAttribute('aria-expanded','false');
  question.value=active.draft||'';renderThread();status(running?.thread.id===id?running.phase:'一起把下一站想清楚。');
}
async function newThread(){
  await ready;const selection=++selectionVersion;if(active){rememberDraft();if(active.messages.length||active.draft)await persist(active);}if(selection!==selectionVersion)return;
  active=createConversation();cache.set(active.id,active);rememberActive();historyMode=false;$('agent-history').hidden=true;$('agent-chat').hidden=false;$('agent-history-toggle').setAttribute('aria-expanded','false');question.value='';renderThread();status('新的计划，从这里开始。');question.focus();
}
function dateLabel(at){const date=new Date(at),today=new Date();return date.toDateString()===today.toDateString()?'今天 '+date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString('zh-CN',{month:'long',day:'numeric'});}
async function renderHistory(){
  const list=$('agent-history-list'),query=$('agent-history-search').value.trim().toLowerCase();
  const records=await store.list();const merged=new Map(records.map(r=>[r.id,r]));
  for(const thread of cache.values())if(!deleted.has(thread.id)&&(thread.messages.length||thread.draft))merged.set(thread.id,{...thread,messageCount:thread.messages.length});
  const rows=[...merged.values()].filter(t=>!deleted.has(t.id)&&!(t.messageCount===0&&['新对话','新的旅行计划'].includes(t.title))&&(!query||t.title.toLowerCase().includes(query))).sort((a,b)=>b.updatedAt-a.updatedAt);
  list.replaceChildren();if(!rows.length){const p=document.createElement('p');p.className='agent-history-empty';p.textContent=query?'没有找到这段对话。试试城市名。':'聊过的城市和计划，会留在这里。';list.append(p);return;}
  for(const row of rows){
    const item=document.createElement('div');item.className='agent-history-item'+(row.id===active?.id?' is-current':'');
    const button=document.createElement('button');button.type='button';button.className='agent-history-select';button.dataset.conversationId=row.id;const title=document.createElement('strong');title.textContent=row.title;const detail=document.createElement('span');detail.textContent=dateLabel(row.updatedAt)+(running?.thread.id===row.id?' · 正在回答':row.messageCount?' · '+Math.ceil(row.messageCount/2)+' 轮对话':' · 草稿');button.append(title,detail);button.addEventListener('click',()=>selectThread(row.id));item.append(button);list.append(item);
  }
}
async function showHistory(){
  await ready;if(active)rememberDraft();historyMode=true;$('agent-chat').hidden=true;$('agent-history').hidden=false;$('agent-history-toggle').setAttribute('aria-expanded','true');$('agent-more').hidden=true;await renderHistory();$('agent-history-search').focus();
}
function fillQuestion(text){if(!active)return;if(liveForeign()?.threadId===active.id){announce('另一个页面正在更新这段对话，完成后再写。');return;}question.value=text;rememberDraft();persist(active);resizeComposer();question.focus();}
function download(name,data,type){const blob=new Blob([data],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
function exportThread(thread=active){if(!thread)return;download('nomads-'+thread.title.replace(/[\\/:*?"<>|]/g,'').slice(0,38)+'.md',conversationMarkdown(thread),'text/markdown;charset=utf-8');}
async function exportAll(){
  await ready;await saveChain;const rows=await store.list(),threads=[];
  for(const row of rows){const thread=cache.get(row.id)||await store.get(row.id);if(thread)threads.push(thread);}
  for(const thread of cache.values())if(!deleted.has(thread.id)&&!threads.some(t=>t.id===thread.id)&&(thread.messages.length||thread.draft))threads.push(thread);
  download('nomads-conversations-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),conversations:threads},null,2),'application/json;charset=utf-8');
}
async function deleteActive(){
  if(!active)return;if(running?.thread.id===active.id||liveForeign()?.threadId===active.id){announce('先停止这段回答，再删除。');return;}
  const removed=structuredClone(active);deleted.add(removed.id);await saveChain;
  try{await store.delete(removed.id);}catch{deleted.delete(removed.id);announce('未能删除本机记录，请稍后再试。');return;}
  cache.delete(removed.id);conflicted.delete(removed.id);
  const d=read(draftKey);if(d?.id===removed.id)write(draftKey,null);active=null;await newThread();
  announce('这段对话已从本机删除。',async()=>{deleted.delete(removed.id);removed.revision=0;cache.set(removed.id,removed);if(await persist(removed)){await selectThread(removed.id);$('agent-notice').hidden=true;}},'撤销');
}
function saveActivity(run,event){
  const key=event.call_id||event.tool;let item=run.message.activity.find(e=>e.key===key);
  if(!item){item={key,label:event.label,tool:event.tool};run.message.activity.push(item);}
  Object.assign(item,{label:event.label,status:event.ok===undefined?'查询中':event.ok?'已完成':'未完成',...(event.ok!==undefined?{ok:event.ok}:{}),...(event.duration_ms!==undefined?{duration_ms:event.duration_ms}:{})});
}
async function confirmStop(run){
  if(!run||run.stopping)return false;run.liveness?.stop();run.stopping=true;controls();run.phase='正在停止这次查询…';if(active?.id===run.thread.id)status(run.phase);run.controller.abort();
  let confirmed=false;
  try{
    if(!run.id){const response=await fetch(sitePath('/api/agent/status'));if(!response.ok)throw Error();const state=await response.json();const ownLease=read(leaseKey);if(state.active_runs?.length===1&&(run.accepted||(ownLease?.tabId===tabId&&ownLease.threadId===run.thread.id)))run.id=state.active_runs[0];if(!state.active_runs?.length)confirmed=true;}
    if(run.id){
      const response=await fetch(sitePath('/api/agent/cancel'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:run.id})});if(!response.ok)throw Error();let state=await response.json();
      for(let i=0;i<10&&!state.runtime_reaped&&['running','stopping','finalizing'].includes(state.status);i++){await new Promise(r=>setTimeout(r,400));const poll=await fetch(sitePath('/api/agent/runs/'+run.id));if(!poll.ok)throw Error();state=await poll.json();}
      confirmed=state.runtime_reaped===true;
    }
    if(!confirmed)throw Error();
    if(run.message.status!=='completed'){run.message.status='cancelled';run.message.content='已停止。你可以调整计划后继续。';}
    run.phase='本次任务已关闭。';await persist(run.thread);updateMessage(run);if(running===run)running=null;run.liveness?.stop();clearInterval(run.heartbeat);clearLease();controls();pet();
  }catch{run.needsConfirmation=true;run.phase='暂未确认停止，请再点一次停止。';if(active?.id===run.thread.id)status(run.phase);}
  finally{run.stopping=false;controls();}
  return confirmed;
}
async function ask(text,{thread=active,retry=null}={}){
  await ready;text=text.trim();if(!text)return;if(running||liveForeign()){announce('先等当前回答完成，或停止后再发。');return;}
  if(deleted.has(thread.id))return;
  const history=modelHistory(thread),context=currentContext(),previousBudget=thread.budget?structuredClone(thread.budget):null;
  let user,message;
  if(retry){message=retry;user=thread.messages.find(m=>m.id===retry.questionId);message.status='pending';message.content='';delete message.result;message.activity=[];delete message.elapsedMs;}
  else{user={id:crypto.randomUUID(),role:'user',content:text,status:'completed',createdAt:Date.now()};message={id:crypto.randomUUID(),role:'assistant',questionId:user.id,content:'',status:'pending',createdAt:Date.now(),activity:[]};thread.messages.push(user,message);}
  if(thread.title==='新的旅行计划'||thread.messages.length===2)thread.title=Array.from(text.replace(/\s+/g,' ')).slice(0,28).join('');
  thread.draft='';if(active?.id===thread.id)question.value='';if(read(draftKey)?.id===thread.id)write(draftKey,null);
  const run={thread,message,controller:new AbortController(),phase:'正在理解你的计划…',id:null,accepted:false,stopping:false,needsConfirmation:false};run.liveness=runLiveness(run);running=run;lease(run);run.heartbeat=setInterval(()=>lease(run),10000);pet();renderThread();status(run.phase);rememberActive();await persist(thread);
  let terminal=false,answered=false;
  try{
    const response=await fetch(sitePath('/api/agent/answer'),{method:'POST',headers:{'Content-Type':'application/json','X-Nomads-Stream-Lease':'1'},body:JSON.stringify({question:text,context,history,previous_budget:previousBudget}),signal:run.controller.signal});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'助手暂时不可用，问题已经保留。');}run.accepted=true;
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const {done,value}=await reader.read();if(done)break;buffer=(buffer+decoder.decode(value,{stream:true})).replaceAll('\r\n','\n');let at;
      while((at=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,at);buffer=buffer.slice(at+2);const parsed=parseAgentEvent(block);if(!parsed)continue;const {type,data}=parsed;
        if(type==='start'){run.id=data.run_id;run.liveness.start(data.lease_ms);}
        if(type==='model'||type==='checking'){run.phase=data.label+'…';updateMessage(run);}
        if(type==='tool_start'||type==='tool_end'){saveActivity(run,data);run.phase=data.label+(type==='tool_end'?' · 已完成':'…');updateMessage(run);persist(thread);}
        if(type==='answer'){answered=true;message.result=visibleAnswer(data);message.content=data.answer;message.status='completed';if(data.budget_snapshot){thread.budget=structuredClone(data.budget_snapshot);thread.budgetSelection=null;}else if(data.budget_options?.length){thread.budget=null;thread.budgetSelection=null;}run.phase='回答好了，依据可以点开查看。';await persist(thread);updateMessage(run,{answer:true});if(!dialog.open||active?.id!==thread.id||historyMode)unread=true;pet();}
        if(type==='done'){terminal=true;if(!answered)throw Error('没有收到完整回答，问题已经保留。');if(data.trace?.elapsed_ms!==undefined)message.elapsedMs=data.trace.elapsed_ms;const saved=await persist(thread);run.phase=saved&&store.available?'回答已保存在本机。':'回答好了，可以导出备份。';updateMessage(run);}
        if(type==='cancelled'){terminal=true;message.status='cancelled';message.content='已停止。你可以调整计划后继续。';run.phase='本次任务已关闭。';await persist(thread);updateMessage(run);}
        if(type==='error'){terminal=true;throw Error(data.message||'这次未能完成，可以调整问题后重试。');}
      }
    }
    if(!terminal&&!run.stopping)throw Error('连接已中断，问题保留在这里。');
  }catch(error){
    if(run.stopping||run.controller.signal.aborted)return;
    if(run.accepted&&!terminal){if(!(await confirmStop(run))){message.status='interrupted';message.content='连接中断，正在确认上一任务已停止。';await persist(thread);updateMessage(run);return;}}
    if(message.status!=='completed'){message.status='failed';message.content=/[\u4e00-\u9fff]/.test(error.message)?error.message:'连接暂时中断，问题已保留，可以重试。';run.phase='这次未完成，问题已保留。';await persist(thread);updateMessage(run);}
  }finally{
    if(running===run&&!run.stopping&&!run.needsConfirmation){running=null;run.liveness?.stop();clearInterval(run.heartbeat);clearLease();controls();pet();if(historyMode)renderHistory();}
  }
}
const ready=(async()=>{
  store=await openConversationStore();const rows=await store.list(),remembered=read(activeKey);
  const id=rows.some(r=>r.id===remembered)?remembered:rows[0]?.id;
  active=id?await store.get(id):null;if(!active)active=createConversation();cache.set(active.id,active);
  if(!liveForeign()&&recoverInterrupted(active))await persist(active);
  const draft=read(draftKey);if(draft?.id===active.id&&typeof draft.text==='string'){active.draft=draft.text;active.useContext=draft.useContext!==false;}
  rememberActive();$('agent-save-state').textContent=store.available?'对话记录只留在这台设备':'此浏览器无法保存，仅在本页暂存';
  if(!store.available)announce('浏览器未允许本机保存。仍可聊天，也可以导出记录。');
  question.value=active.draft;renderThread();pet();return store;
})();
function viewport(){
  const view=window.visualViewport;dialog.style.setProperty('--agent-viewport-height',(view?.height||innerHeight)+'px');dialog.style.setProperty('--agent-viewport-width',(view?.width||innerWidth)+'px');dialog.style.setProperty('--agent-viewport-top',(view?.offsetTop||0)+'px');dialog.style.setProperty('--agent-viewport-left',(view?.offsetLeft||0)+'px');
  const tray=$('compare-tray');let clearance=0;if(tray&&!tray.hidden&&matchMedia('(max-width:700px)').matches)clearance=tray.getBoundingClientRect().height+20;
  document.documentElement.style.setProperty('--companion-clearance',clearance+'px');
}
function showDialog(){if(dialog.open)return;matchMedia('(max-width:700px)').matches?dialog.showModal():dialog.show();viewport();}
export async function open(button){
  await ready;opener=button||launcher;
  if(button?.id==='companion-launcher'&&dialog.open){close();return;}
  const showLatest=unread||!hasOpened;unread=false;pet();showDialog();if(showLatest&&!historyMode)scrollLatest();hasOpened=true;document.querySelectorAll('[data-open-agent],[data-agent-open]').forEach(b=>b.setAttribute('aria-expanded','true'));
  if(button?.dataset.agentQuestion)fillQuestion(button.dataset.agentQuestion);else if(!matchMedia('(pointer:coarse)').matches)question.focus();
  describeContext();controls();
}
function close(){if(!dialog.open)return;rememberDraft();if(active)persist(active);dialog.close();document.querySelectorAll('[data-open-agent],[data-agent-open]').forEach(b=>b.setAttribute('aria-expanded','false'));opener?.focus({preventScroll:true});pet();}
$('agent-close').addEventListener('click',close);
dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.open&&!dialog.matches(':modal')){e.preventDefault();if(!$('agent-more').hidden){$('agent-more').hidden=true;$('agent-more-toggle').setAttribute('aria-expanded','false');}else if(historyMode)selectThread(active.id);else close();}});
formEvents();
function formEvents(){
  $('agent-form').addEventListener('submit',e=>{e.preventDefault();ask(question.value);});
  question.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('agent-form').requestSubmit();}});
  question.addEventListener('input',()=>{rememberDraft();resizeComposer();persist(active);});
  $('agent-use-context').addEventListener('change',()=>{active.useContext=$('agent-use-context').checked;rememberDraft();describeContext();persist(active);});
  $('agent-stop').addEventListener('click',()=>confirmStop(running));
  $('agent-new').addEventListener('click',newThread);
  $('agent-history-toggle').addEventListener('click',()=>historyMode?selectThread(active.id):showHistory());
  $('agent-history-back').addEventListener('click',()=>selectThread(active.id));
  $('agent-history-search').addEventListener('input',renderHistory);
  $('agent-view-running').addEventListener('click',()=>running&&selectThread(running.thread.id));
  $('agent-export').addEventListener('click',()=>exportThread());$('agent-export-all').addEventListener('click',exportAll);$('agent-delete').addEventListener('click',deleteActive);
  $('agent-more-toggle').addEventListener('click',()=>{const menu=$('agent-more');menu.hidden=!menu.hidden;$('agent-more-toggle').setAttribute('aria-expanded',String(!menu.hidden));});
  dialog.addEventListener('click',e=>{const starter=e.target.closest('[data-agent-question]');if(starter)fillQuestion(starter.dataset.agentQuestion);if(e.target.closest('#agent-more button')){$('agent-more').hidden=true;$('agent-more-toggle').setAttribute('aria-expanded','false');}});
  window.addEventListener('pagehide',()=>{if(active)rememberDraft();clearLease();if(running){running.suspended=true;running.liveness.abandon();}});
  window.addEventListener('pageshow',async e=>{if(!e.persisted)return;await ready;if(running?.suspended){const run=running;run.liveness?.stop();clearInterval(run.heartbeat);running=null;if(recoverInterrupted(run.thread))await persist(run.thread);}else if(recoverInterrupted(active))await persist(active);renderThread({scrollToEnd:false});pet();});
  window.addEventListener('popstate',describeContext);document.addEventListener('nomads:rows-updated',describeContext);
  window.addEventListener('storage',async e=>{if(e.key!==leaseKey||running||!active)return;if(!liveForeign()){const id=active.id;const fresh=await store.get(id);if(active.id===id&&fresh&&fresh.revision>active.revision){active=fresh;cache.set(active.id,active);renderThread({scrollToEnd:false});}}controls();});
  const tray=$('compare-tray');if(tray){new ResizeObserver(viewport).observe(tray);new MutationObserver(viewport).observe(tray,{attributes:true,attributeFilter:['hidden']});}
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
  window.addEventListener('resize',()=>{if(dialog.open&&dialog.matches(':modal')!==matchMedia('(max-width:700px)').matches){changingMode=true;dialog.close();showDialog();changingMode=false;}viewport();});
  dialog.addEventListener('close',()=>{if(!changingMode)document.querySelectorAll('[data-open-agent],[data-agent-open]').forEach(b=>b.setAttribute('aria-expanded','false'));});
  viewport();
}
