import {SHARE_FORMATS,createShare,shareText,normalizeCityProfile} from './share-model.js';
import {sitePath} from './site-path.js';
let active;
export async function loadCityShareProfile(card,{signal,fetcher=globalThis.fetch}={}){
 signal?.throwIfAborted();
 if(card.kind!=='city'||card.private||!card.citySlug)return card;
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),4000);
 try{
  const response=await fetcher(sitePath('/city-profiles/'+card.citySlug+'.json'),{signal:controller.signal});
  if(!response.ok)return card;
  const raw=await response.text();signal?.throwIfAborted();if(raw.length>96000)return card;
  const profile=normalizeCityProfile(JSON.parse(raw),card.citySlug);return profile?createShare({...card,cityProfile:profile}):card;
 }catch(error){signal?.throwIfAborted();return card;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function ensureStyle(){if(document.querySelector('link[data-share-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=sitePath('/share.css');link.dataset.shareStyle='';document.head.append(link);}
export function openShare(initial,opener,{personal,label='包含我填写的方案',personalNote='个人填写只进入图片与配文，公开链接不含这些金额。'}={}){
 if(active?.open)return;ensureStyle();let card=initial,epoch=0,controller,output,page=0,urls=[],loadedProfile,profileLoaded=false;
 const dialog=document.createElement('dialog');active=dialog;dialog.className='share-studio';dialog.id='share-studio';dialog.setAttribute('aria-labelledby','share-title');
 dialog.innerHTML=`
 <header class="share-heading"><div><h2 id="share-title">分享城市与旅途</h2><p data-share-object></p></div><button type="button" data-share-close aria-label="关闭分享">×</button></header>
 <div class="share-studio-body">
  <section class="share-preview-panel" aria-label="分享图片预览">
   <div class="share-preview"><a data-share-original target="_blank" rel="noopener noreferrer" aria-label="查看分享图片原图" hidden><img data-share-preview hidden alt=""></a><p data-share-loading role="status">正在准备图片，链接与配文已经可以使用。</p></div>
   <div class="share-pages" hidden><button type="button" data-share-prev aria-label="上一张">←</button><span data-share-page-count></span><button type="button" data-share-next aria-label="下一张">→</button></div>
   <button type="button" class="share-text-action" data-share-save-all hidden>下载整组图片</button>
  </section>
  <section class="share-settings" aria-label="分享方式">
   <fieldset class="share-format"><legend>图片样式</legend><div class="share-segments"><label><input type="radio" name="share-format" value="portrait" data-share-edition checked><span data-share-photo-label>照片版</span></label><label><input type="radio" name="share-format" value="text" data-share-edition><span>文字版</span></label></div></fieldset><p class="share-platform-hint" data-share-platform></p><p class="share-profile-note" data-share-profile-note hidden>城市风貌、地标与当地生活，带着一起分享。</p>
   <label class="share-check" data-share-personal-label hidden><input type="checkbox" data-share-personal><span data-share-personal-name></span></label><p class="share-personal-note" data-share-private-note hidden></p>
   <div class="share-primary-actions"><button type="button" class="share-save" data-share-save disabled>保存图片</button></div>
   <div class="share-secondary-actions"><button type="button" class="share-text-action" data-share-copy-link>复制链接</button><span data-share-action-divider aria-hidden="true">·</span><button type="button" class="share-text-action" data-share-native disabled>系统分享</button></div>
   <label class="share-field share-manual-link" data-share-url-label hidden>手动复制链接<input data-share-url readonly spellcheck="false" aria-label="分享链接"></label>
   <p class="share-feedback" data-share-status role="status" aria-live="polite"></p><button type="button" class="share-text-action" data-share-retry hidden>重新生成图片</button>
   <section class="share-caption" aria-label="配文与来源"><div class="share-caption-heading"><label for="share-caption-text">配文与来源</label><button type="button" class="share-text-action" data-share-copy-text>复制配文</button></div><textarea id="share-caption-text" data-share-caption rows="5" aria-label="配文（可编辑，不改动图片）"></textarea></section>
   <details class="share-edit"><summary>调整图片文字</summary><label class="share-field">图片标题<input data-share-edit-title maxlength="200"></label><label class="share-field" data-share-body-label hidden>图片正文（可删减所选回答）<textarea data-share-body rows="6"></textarea></label></details>
   <p class="share-range" data-share-range></p>
  </section>
 </div>`;
 const $=selector=>dialog.querySelector(selector),status=$('[data-share-status]'),preview=$('[data-share-preview]');
 if(initial.kind!=='city'){$('#share-title').textContent='分享';$('[data-share-photo-label]').textContent='竖图';}
 $('[data-share-profile-note]').hidden=initial.kind!=='city';
 $('[data-share-object]').textContent=card.title;
 function revoke(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
 function setCard(next){card=createShare(next);$('[data-share-object]').textContent=card.title;$('[data-share-edit-title]').value=card.title;$('[data-share-caption]').value=shareText(card);$('[data-share-url]').value=card.url||'';$('[data-share-url-label]').hidden=true;$('[data-share-copy-link]').hidden=!card.url;$('[data-share-action-divider]').hidden=!card.url;$('[data-share-range]').textContent=card.linkNote||(card.kind==='answer'?'只分享你选择的这一条回答与引用，不含问题和完整对话。':'个人报价、会议安排与对话记录不会自动加入分享。');}
 function showPage(){const item=output.pages[page];preview.src=urls[page];$('[data-share-original]').href=urls[page];$('[data-share-original]').hidden=false;$('[data-share-save-all]').hidden=output.pages.length<2;preview.alt=card.title+'，第'+(page+1)+'张，共'+output.pages.length+'张；完整文字见配文。';preview.hidden=false;$('[data-share-loading]').hidden=true;$('.share-pages').hidden=output.pages.length<2;$('[data-share-page-count]').textContent=(page+1)+' / '+output.pages.length;$('[data-share-prev]').disabled=page===0;$('[data-share-next]').disabled=page===output.pages.length-1;$('[data-share-save]').textContent=output.pages.length>1?'保存第 '+(page+1)+' 张':'保存图片';dialog.dataset.exportWidth=item.width;dialog.dataset.exportHeight=item.height;dialog.dataset.exportBytes=item.blob.size;}
 async function generate(){const id=++epoch;let renderCard=card;const textOnly=$('[data-share-edition]:checked').value==='text';controller?.abort();const renderController=new AbortController();controller=renderController;output=null;page=0;revoke();preview.hidden=true;$('[data-share-original]').hidden=true;$('[data-share-save-all]').hidden=true;preview.removeAttribute('src');$('.share-pages').hidden=true;$('[data-share-loading]').hidden=false;$('[data-share-loading]').textContent='正在准备图片…';$('[data-share-retry]').hidden=true;for(const selector of ['[data-share-save]','[data-share-native]'])$(selector).disabled=true;
  const format=SHARE_FORMATS.find(row=>row.id==='portrait');$('[data-share-platform]').textContent=format.width+' × '+format.height;status.textContent='';
  try{
   if(renderCard.kind==='city'&&!renderCard.private&&renderCard.citySlug){
    if(!profileLoaded){const enriched=await loadCityShareProfile(renderCard,{signal:renderController.signal});if(!dialog.open||id!==epoch)return;loadedProfile=enriched.cityProfile;profileLoaded=true;}
    if(loadedProfile){const previousCaption=shareText(card);renderCard=createShare({...renderCard,cityProfile:loadedProfile});card=renderCard;if($('[data-share-caption]').value===previousCaption)$('[data-share-caption]').value=shareText(renderCard);}
   }
   const {renderShare}=await import('./share-render.js'),result=await renderShare(renderCard,'portrait',{signal:renderController.signal,textOnly});if(!dialog.open||id!==epoch)return;output=result;dialog.dataset.exportEdition=result.textOnly?'text':'portrait';urls=result.pages.map(item=>URL.createObjectURL(item.blob));showPage();dialog.dataset.exportMs=Math.round(result.elapsedMs);$('[data-share-save]').disabled=false;$('[data-share-native]').disabled=typeof navigator.share!=='function';status.textContent=result.notices?.length?result.notices.join(' '):output.pages.length>1?'内容较长，已分成 '+output.pages.length+' 张；每张都可单独保存。':'图片已准备好，也可长按预览保存。';}
  catch(error){if(!dialog.open||id!==epoch||error.name==='AbortError')return;$('[data-share-loading]').textContent=error.message||'图片暂未生成，请重试。';status.textContent='链接与配文仍可使用。';$('[data-share-retry]').hidden=false;}
 }
 function close(){dialog.close();}
 $('[data-share-close]').addEventListener('click',close);dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 dialog.addEventListener('close',()=>{++epoch;controller?.abort();revoke();dialog.remove();if(active===dialog)active=null;if(opener?.isConnected)opener.focus({preventScroll:true});},{once:true});
 dialog.querySelectorAll('[data-share-edition]').forEach(input=>input.addEventListener('change',generate));$('[data-share-retry]').addEventListener('click',generate);
 if(personal){$('[data-share-personal-label]').hidden=false;$('[data-share-personal-name]').textContent=label;$('[data-share-personal]').addEventListener('change',()=>{const checked=$('[data-share-personal]').checked;try{setCard(checked?personal():initial);$('[data-share-private-note]').hidden=!checked;$('[data-share-private-note]').textContent=personalNote;generate();}catch(error){$('[data-share-personal]').checked=false;status.textContent=error.message;}});}
 $('[data-share-edit-title]').addEventListener('change',()=>{try{setCard({...card,title:$('[data-share-edit-title]').value});generate();}catch(error){status.textContent=error.message;}});
 $('[data-share-prev]').addEventListener('click',()=>{if(page>0){page--;showPage();}});$('[data-share-next]').addEventListener('click',()=>{if(page<output.pages.length-1){page++;showPage();}});
 async function copy(value,fallback){const copyEpoch=epoch;try{await navigator.clipboard.writeText(value);if(dialog.open&&epoch===copyEpoch)status.textContent='已复制。';}catch{if(dialog.open&&epoch===copyEpoch){if(fallback===$('[data-share-url]'))$('[data-share-url-label]').hidden=false;fallback.focus();fallback.select();status.textContent='浏览器未允许自动复制，已选中内容，可手动复制。';}}}
 $('[data-share-copy-text]').addEventListener('click',()=>copy($('[data-share-caption]').value,$('[data-share-caption]')));$('[data-share-copy-link]').addEventListener('click',()=>copy(card.url,$('[data-share-url]')));
 $('[data-share-save]').addEventListener('click',()=>{if(!output)return;const a=document.createElement('a');a.href=urls[page];a.download='Roamorrow-'+card.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,64)+'-'+(output.textOnly?'text':'portrait')+'-'+(page+1)+(output.pages[page].blob.type==='image/jpeg'?'.jpg':'.png');dialog.append(a);a.click();a.remove();status.textContent='已发起图片下载；也可长按预览图保存。';});
 $('[data-share-save-all]').addEventListener('click',async()=>{if(!output)return;const group=output,saveEpoch=epoch;try{const {zipSync}=await import('../vendor/fflate/fflate.mjs'),files={};for(const [index,item] of group.pages.entries())files['Roamorrow-'+(index+1)+(item.blob.type==='image/jpeg'?'.jpg':'.png')]=new Uint8Array(await item.blob.arrayBuffer());if(!dialog.open||epoch!==saveEpoch)return;const url=URL.createObjectURL(new Blob([zipSync(files,{level:0})],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='Roamorrow-images.zip';dialog.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已发起整组图片下载。';}catch{if(dialog.open&&epoch===saveEpoch)status.textContent='整组下载暂不可用，每张图片仍可单独保存。';}});
 $('[data-share-native]').addEventListener('click',()=>{if(!output)return;const files=output.pages.map((item,index)=>new File([item.blob],'Roamorrow-'+(index+1)+(item.blob.type==='image/jpeg'?'.jpg':'.png'),{type:item.blob.type}));try{if(!navigator.canShare?.({files})){status.textContent='这个浏览器暂不支持分享图片文件，请先保存图片。';return;}const pending=navigator.share({files,title:card.title});Promise.resolve(pending).then(()=>{if(dialog.open)status.textContent='已交给系统分享；接收状态请在目标应用查看。';},error=>{if(dialog.open)status.textContent=error.name==='AbortError'?'已取消分享，图片仍可保存。':'系统分享暂不可用，请先保存图片。';});}catch{status.textContent='系统分享暂不可用，请先保存图片。';}});
 if(initial.kind==='answer'){$('[data-share-body-label]').hidden=false;$('[data-share-body]').value=initial.body;$('[data-share-body]').addEventListener('change',()=>{try{setCard({...card,body:$('[data-share-body]').value});generate();}catch(error){status.textContent=error.message;}});}
 setCard(initial);document.body.append(dialog);dialog.showModal();$('[data-share-close]').focus({preventScroll:true});generate();return dialog;
}
