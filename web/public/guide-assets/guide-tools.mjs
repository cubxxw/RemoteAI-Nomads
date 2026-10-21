import {normalizeScenario,calculateBudget,readScenario,writeScenario,formatMoney} from './budget-model.mjs';

const source=document.querySelector('#guide-config');
if(source){
  const page=JSON.parse(source.textContent);
  const config=page.config;
  const form=document.querySelector('[data-budget-form]');
  const currencies={THB:'泰铢',MYR:'令吉',CNY:'元',USD:'美元',EUR:'欧元',NPR:'尼泊尔卢比',VND:'越南盾',TRY:'土耳其里拉',AZN:'阿塞拜疆马纳特',IDR:'印尼盾',BGN:'保加利亚列弗'};
  const money=(value,currency)=>formatMoney(value,currency).replace(/\b(THB|MYR|CNY|USD|EUR|NPR|VND|TRY|AZN|IDR|BGN)\b/g,key=>currencies[key]);
  const text=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value;};
  const safeLink=(url,label)=>{const a=document.createElement('a');try{const u=new URL(url,location.href);if(!['https:','http:'].includes(u.protocol))return document.createTextNode(label);a.href=u.href;}catch{return document.createTextNode(label);}a.textContent=label;return a;};
  let scenario=readScenario(location.search,config);
  let result=calculateBudget(config,scenario);

  function formValues(){
    const values=Object.fromEntries(new FormData(form));
    if(values.housingNative==='')delete values.housingNative;
    return values;
  }
  function fillForm(){
    for(const name of ['tier','nights','season','work','currency','housingNative']){
      const input=form.elements.namedItem(name);
      if(input)input.value=scenario[name]??'';
    }
  }
  function sourceCell(item){
    const td=document.createElement('td');
    if(item.kind==='user')td.append('用户输入，未经本站核价');
    else if(item.sourceIds.length){
      for(const id of item.sourceIds){const s=config.sources[id];if(s)td.append(safeLink(s.url,s.title),' ');}
      if(item.checkedOn)td.append(document.createTextNode(' · 核价 '+item.checkedOn));
    }else td.append('预算预留');
    const details=document.createElement('details');details.className='table-detail';
    const summary=document.createElement('summary');summary.textContent='计价条件';details.append(summary,document.createTextNode(item.note));td.append(details);return td;
  }
  function renderBudget(){
    result=calculateBudget(config,scenario);
    fillForm();
    text('[data-budget-total]',result.totalDisplay===null?'总价待询价':money(result.totalDisplay,result.currency));
    text('[data-budget-native]',result.totalNative===null?'已知部分 '+money(result.knownSubtotalNative,result.nativeCurrency):money(result.totalNative,result.nativeCurrency));
    text('[data-budget-deposit]','押金：'+result.depositNote);
    text('[data-table-native]',money(result.totalNative,result.nativeCurrency));
    text('[data-table-display]',money(result.totalDisplay,result.currency));
    text('[data-rounding-note]',result.roundingNote);
    const warningList=document.querySelector('[data-budget-warnings]');warningList.replaceChildren();
    for(const warning of result.warnings){const li=document.createElement('li');li.textContent=warning;warningList.append(li);}
    const tbody=document.querySelector('[data-budget-table] tbody');tbody.replaceChildren();
    for(const item of result.items){
      const row=document.createElement('tr');
      for(const [value,cls] of [[item.label,''],[money(item.amountNative,result.nativeCurrency),'money'],[money(item.amountDisplay,result.currency),'money']]){const td=document.createElement('td');td.textContent=value;if(cls)td.className=cls;row.append(td);}
      row.append(sourceCell(item));tbody.append(row);
    }
    for(const card of document.querySelectorAll('[data-tier-choice]')){
      const tier=card.dataset.tierChoice;
      const plan=calculateBudget(config,{...scenario,tier});
      card.setAttribute('aria-pressed',String(tier===scenario.tier));
      card.querySelector('[data-tier-display]').textContent=money(plan.totalDisplay,plan.currency);
      card.querySelector('[data-tier-native]').textContent=plan.totalNative===null?'已知 '+money(plan.knownSubtotalNative,plan.nativeCurrency):money(plan.totalNative,plan.nativeCurrency);
      card.querySelector('.tier-hint').textContent=scenario.nights+'晚预算 · 点选调整';
    }
    text('[data-answer-scope]',`单人 · ${scenario.nights}晚 · ${config.seasonLabels[scenario.season]} · 整间房由一人承担`);
    document.querySelector('[data-user-override-notice]').hidden=scenario.housingNative===undefined;
    updateConsultation();
  }
  function setScenario(input,push=true){
    scenario=normalizeScenario(input,config);
    const query=writeScenario(scenario).toString();
    const href=location.pathname+(query?'?'+query:'')+location.hash;
    if(push&&href!==location.pathname+location.search+location.hash)history.pushState({budget:true},'',href);
    renderBudget();
  }
  function invalidQueryNotice(){
    const params=new URLSearchParams(location.search),normalized=writeScenario(scenario);
    const keys=['tier','nights','season','work','currency','housing'];
    return keys.some(key=>params.has(key)&&params.get(key)!==normalized.get(key));
  }
  form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('change',()=>{const raw=formValues();const normalized=normalizeScenario(raw,config);const invalid=String(raw.nights)!==String(normalized.nights)||(raw.housingNative!==undefined&&Number(raw.housingNative)!==normalized.housingNative);setScenario(normalized);text('[data-budget-status]',invalid?'输入超出有效范围，已按默认规则恢复；控件显示实际使用值。':'预算与链接已按当前参数更新。');});
  for(const button of document.querySelectorAll('[data-tier-choice]'))button.addEventListener('click',()=>{setScenario({...scenario,tier:button.dataset.tierChoice});text('[data-budget-status]','已选'+config.tiers[scenario.tier].label+'方案。');});
  document.querySelector('[data-reset-budget]').addEventListener('click',()=>{setScenario(config.defaultScenario);text('[data-budget-status]','已恢复默认30晚舒适预算。');});
  window.addEventListener('popstate',()=>{scenario=readScenario(location.search,config);renderBudget();text('[data-budget-status]','已从链接恢复预算参数。');});

  async function copy(value,statusSelector,fallback){
    try{await navigator.clipboard.writeText(value);text(statusSelector,'已复制到剪贴板。');return true;}
    catch{
      let area=fallback;
      if(!area){area=document.createElement('textarea');area.className='share-fallback';area.readOnly=true;area.setAttribute('aria-label','可手动复制的内容');document.querySelector(statusSelector).after(area);}
      area.hidden=false;area.value=value;area.focus();area.select();text(statusSelector,'浏览器未允许自动复制，请选中下方内容手动复制。');return false;
    }
  }
  function download(value,name,type='text/plain;charset=utf-8'){
    const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.querySelector('[data-copy-budget]').addEventListener('click',()=>{
    const url=new URL(location.href);url.search=writeScenario(scenario).toString();url.hash='cost';copy(url.href,'[data-budget-status]');
  });

  // Cafe filtering is limited to the verified fields exposed by the page.
  const areaFilter=document.querySelector('[data-cafe-area]'),fieldFilter=document.querySelector('[data-cafe-field]'),searchFilter=document.querySelector('[data-cafe-search]');
  const cafeSearch=new Map(page.places.filter(p=>p.kind==='cafe').map(p=>[p.id,['name','area','address','hours'].filter(key=>p.verifiedFields.includes(key)).map(key=>p[key]||'').join(' ').toLocaleLowerCase()]));
  function filterCafes(){
    let count=0;
    for(const card of document.querySelectorAll('[data-cafe]')){
      const areaOk=areaFilter.value==='all'||card.dataset.area===areaFilter.value;
      const fieldOk=fieldFilter.value==='all'||card.dataset[fieldFilter.value]==='true';
      const searchOk=(cafeSearch.get(card.dataset.cafeId)||'').includes(searchFilter.value.trim().toLocaleLowerCase());
      card.hidden=!(areaOk&&fieldOk&&searchOk);if(!card.hidden)count++;
    }
    text('[data-cafe-count]',count+'家符合条件');document.querySelector('[data-cafe-empty]').hidden=count>0;
  }
  areaFilter.addEventListener('change',filterCafes);fieldFilter.addEventListener('change',filterCafes);searchFilter.addEventListener('input',filterCafes);
  document.querySelector('[data-clear-cafes]').addEventListener('click',()=>{areaFilter.value='all';fieldFilter.value='all';searchFilter.value='';filterCafes();});

  // Only source-verified coordinates are drawn. The server-rendered list always remains available.
  function initMap(){
    const status=document.querySelector('[data-map-status]');
    if(!window.L){status.textContent='地图组件未载入，下面的地点名单和外部地图链接仍可用。';return;}
    const L=window.L;
    const center=page.facts.center;
    const map=L.map('city-map',{scrollWheelZoom:false,keyboard:true}).setView([center.lat,center.lon],13);
    const groups={stay:L.layerGroup().addTo(map),work:L.layerGroup().addTo(map),cafe:L.layerGroup().addTo(map),routes:L.layerGroup().addTo(map)};
    const colors={stay:'#315f40',work:'#966e32',cafe:'#586f80'};
    let tileErrors=0;
    const tiles=L.tileLayer('https://roamorrow.com/nomads/map-tiles/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    tiles.on('tileerror',()=>{tileErrors++;status.textContent='底图未能完整加载；标记与下面的地点名单仍可使用。';});
    const points=[];
    for(const p of page.places){
      if(typeof p.lat!=='number'||typeof p.lon!=='number'||!p.coordinateSource||!groups[p.kind])continue;
      const popup=document.createElement('div');const title=document.createElement('strong');title.textContent=p.name;popup.append(title,document.createElement('br'),document.createTextNode(p.area),document.createElement('br'),document.createTextNode(p.address),document.createElement('br'),safeLink(p.url,'核对出处'),document.createElement('br'));
      const mapUrl=p.mapUrl||'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:p.name+' '+p.address});popup.append(safeLink(mapUrl,'打开位置'));
      const marker=L.circleMarker([p.lat,p.lon],{radius:8,color:colors[p.kind],fillColor:colors[p.kind],fillOpacity:.85,weight:2}).bindPopup(popup).addTo(groups[p.kind]);
      points.push([p.lat,p.lon]);
    }
    for(const route of page.facts.walkingRoutes||[]){
      if(route.mode!=='foot'||route.geometry?.type!=='LineString')continue;
      const from=page.places.find(p=>p.id===route.from),to=page.places.find(p=>p.id===route.to);
      const popup=document.createElement('div');popup.append(document.createTextNode(`${from?.name||route.from} → ${to?.name||route.to}：步行路由估时约${route.minutes}分钟，未现场走过。`),document.createElement('br'),safeLink(route.sourceUrl,'缓存路由来源'));
      L.geoJSON(route.geometry,{style:{color:'#647953',weight:3,dashArray:'5 7'}}).bindPopup(popup).addTo(groups.routes);
    }
    if(points.length>1)map.fitBounds(points,{padding:[25,25],maxZoom:14});
    if(!tileErrors)status.textContent=`${points.length}个地点已有核实坐标；未核地点只保留在名单中。`+((page.facts.walkingRoutes||[]).some(route=>route.mode==='foot'&&route.geometry?.type==='LineString')?'步行路线为缓存路由估时，非现场实测。':'尚未取得可用步行路线，请自行核对出入口和通行条件。');
    document.querySelectorAll('[data-map-layer]').forEach(input=>input.addEventListener('change',()=>{const layer=groups[input.dataset.mapLayer];if(input.checked)layer.addTo(map);else map.removeLayer(layer);}));
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))map.invalidateSize();});observer.observe(document.querySelector('[data-city-map]'));
    window.addEventListener('resize',()=>map.invalidateSize(),{passive:true});
  }

  // A correction is generated locally, not uploaded to a pretend backend.
  const dialog=document.querySelector('[data-correction-dialog]');
  const correctionForm=document.querySelector('[data-correction-form]');let correctionOpener;
  document.querySelectorAll('[data-correction-open]').forEach(button=>button.addEventListener('click',()=>{
    correctionOpener=button;const id=button.dataset.correctionOpen;const place=page.places.find(p=>p.id===id);
    correctionForm.reset();correctionForm.elements.place.value=place?.name||page.facts.name+'指南';correctionForm.elements.currency.value=config.nativeCurrency;correctionForm.elements.source.value=place?.url||'';
    document.querySelector('[data-correction-output]').hidden=true;text('[data-correction-status]','');dialog.showModal();
  }));
  document.querySelector('[data-correction-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>correctionOpener?.focus());
  correctionForm.addEventListener('submit',event=>event.preventDefault());
  function correction(){
    if(!correctionForm.reportValidity())return null;
    const values=Object.fromEntries(new FormData(correctionForm));
    return JSON.stringify({guide:page.city,place:values.place,amount:values.amount===''?null:Number(values.amount),currency:values.currency,source:values.source,note:values.note,createdAt:new Date().toISOString(),verification:'用户补充，未经本站核价',delivery:'本地生成，尚未向站方提交'},null,2);
  }
  document.querySelector('[data-copy-correction]').addEventListener('click',async()=>{const value=correction();if(value){const ok=await copy(value,'[data-correction-status]',document.querySelector('[data-correction-output]'));if(ok)text('[data-correction-status]','已复制更正内容；尚未发送给站方。');}});
  document.querySelector('[data-open-feedback-issue]').addEventListener('click',event=>{const value=correction();if(!value){event.preventDefault();return;}const issue=new URL('https://github.com/cubxxw/RemoteAI-Nomads/issues/new');issue.searchParams.set('title','[价格线索] '+page.facts.name+' / '+correctionForm.elements.place.value);issue.searchParams.set('body','以下为用户补充，待站方核实。\n\n```json\n'+value+'\n```');event.currentTarget.href=issue.href;text('[data-correction-status]','将打开GitHub预填草稿，仍需你登录并确认提交；本页没有发送。');});
  document.querySelector('[data-download-correction]').addEventListener('click',()=>{const value=correction();if(value){download(value,page.city+'-price-correction.json','application/json');text('[data-correction-status]','更正文件下载已发起；尚未发送给站方。');}});

  const consultForm=document.querySelector('[data-consult-form]');
  const consultOutput=document.querySelector('[data-consult-output]');
  function dateString(date){return date.toISOString().slice(0,10);}
  function updateConsultation(){
    if(!consultForm)return;
    const date=consultForm.elements.arrival.value;
    if(!date){consultOutput.value=`我一个人计划从【入住日期】住到【离店日期】，共${scenario.nights}晚。请确认同一房型的含费总房费，水电网和清洁包到什么程度，押金什么时候退，提前退房或取消怎么算。`;return;}
    const arrival=new Date(date+'T00:00:00Z');if(!Number.isFinite(arrival.getTime()))return;
    const checkout=new Date(arrival);checkout.setUTCDate(checkout.getUTCDate()+scenario.nights);
    const place=page.places.find(p=>p.id===consultForm.elements.stay.value);
    consultOutput.value=`你好，我一个人想咨询${place?.name||'这个房型'}，计划从${dateString(arrival)}入住，到${dateString(checkout)}离店，共${scenario.nights}晚。\n\n请确认：\n1. 这个日期、同一房型的含税总房费是多少（请用${currencies[config.nativeCurrency]}报价）？\n2. 水电、网络、清洁和洗衣包含到什么程度，有没有超量收费？\n3. 押金或信用卡预授权多少，什么时候退？\n4. 取消、改期和提前退房如何计费？\n5. 房间有没有可工作的桌椅，线上会议有哪些限制？\n\n谢谢。`;
  }
  consultForm.addEventListener('change',updateConsultation);consultForm.addEventListener('submit',event=>event.preventDefault());
  document.querySelector('[data-copy-consult]').addEventListener('click',()=>{if(!consultForm.reportValidity())return;updateConsultation();copy(consultOutput.value,'[data-consult-status]',consultOutput);});
  document.querySelector('[data-download-consult]').addEventListener('click',()=>{if(!consultForm.reportValidity())return;updateConsultation();download(consultOutput.value,page.city+'-stay-inquiry.txt');text('[data-consult-status]','询价文字下载已发起；没有发送给住处。');});

  renderBudget();filterCafes();
  if(invalidQueryNotice())text('[data-budget-status]','链接有无效参数，已按默认设置恢复；当前控件显示实际使用值。');
  const observeMap=()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();initMap();}},{threshold:.05});observer.observe(document.querySelector('[data-city-map]'));};
  if(document.readyState==='complete')observeMap();else window.addEventListener('load',observeMap,{once:true});
}
