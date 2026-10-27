import {SHARE_FORMATS} from './share-model.js';
import {sitePath} from './site-path.js';
const FONT='Inter, "PingFang SC", "Noto Sans CJK SC", sans-serif';
const INK='#1f1a14',TEXT='#3e3429',MUTED='#6b5d4c',PAPER='#faf8f6';
export function wrapText(ctx,input,width){
 const lines=[],closing=/[。，、；：！？）】》〉」』〕.,;:!?%]/,opening=/[（【《〈「『〔(\[]/;
 for(const paragraph of String(input).split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>width){const parts=[...line];let carry='';if(closing.test(char)){while(parts.length&&closing.test(parts.at(-1)))carry=parts.pop()+carry;if(parts.length)carry=parts.pop()+carry;}else if(opening.test(parts.at(-1)))carry=parts.pop();if(parts.length){lines.push(parts.join(''));line=carry;}else{lines.push(line);line='';}}line+=char;}lines.push(line);}return lines;
}
function layoutCityProfile(ctx,card,format,{photo=false,qrSize:requestedQR,heroHeight:fitHeroHeight}={}){
 const {width:w,height:h}=format,wide=w>h,margin=wide?48:52,width=w-margin*2,profile=card.cityProfile,qrSize=requestedQR||(wide?138:152);
 const pages=[];let page,y;
 const font=(size,weight=400)=>ctx.font=`${weight} ${size}px ${FONT}`;
 const measure=(value,available,size,weight=400)=>{font(size,weight);return wrapText(ctx,value,available);};
 const height=(value,available,size,weight=400)=>measure(value,available,size,weight).length*Math.ceil(size*1.3);
 const advisory=(card.advisories||[]).join(' '),footerTextWidth=width-qrSize-26;
 const footerText=advisory||'城市资料与历史旅居参考；完整口径、来源及照片署名见配文。';
 const footerLines=measure(footerText,footerTextWidth,wide?18:20),footerHeight=Math.max(qrSize+22,footerLines.length*(wide?24:27)+106),footerY=h-margin-footerHeight,bottom=footerY-20;
 if(footerTextWidth<120||bottom<170)throw Error('分享链接较长，请使用配文中的完整链接。');
 const line=(value,x,top,available,size=26,weight=400,color=TEXT,role='profile-detail')=>{
  for(const text of measure(value,available,size,weight)){page.blocks.push({type:'text',text,x,y:top,width:available,height:Math.ceil(size*1.3),size,weight,color,role});top+=Math.ceil(size*1.3);}return top;
 };
 function start(first=false){
  page={blocks:[]};pages.push(page);
  page.blocks.push({type:'text',text:'roamorrow',x:margin,y:32,width:340,height:38,size:28,weight:600,color:INK});
  page.blocks.push({type:'text',text:(card.month?card.month+'月 / ':'')+'城市手记',x:w-margin-320,y:36,width:320,height:32,size:23,weight:400,color:MUTED,align:'right'});
  y=88;
  if(first&&photo){const heroHeight=fitHeroHeight||(wide?Math.min(174,Math.round(h*.23)):Math.min(400,Math.round(h*.237)));if(y+heroHeight+18+height(card.title,width,wide?46:62,500)<bottom){page.blocks.push({type:'photo',role:'city-hero',x:margin,y,width,height:heroHeight});y+=heroHeight+18;}}
  const titleSize=first?(wide?46:62):wide?32:38,title=card.title+(first?'':' / 续');
  const titleHeight=height(title,width,titleSize,500);
  if(y+titleHeight>bottom)throw Error('标题较长，请在“调整图片文字”中缩短图片标题。');
  y=line(title,margin,y,width,titleSize,500,INK,'city-title');
  if(first){const nameEn=profile.nameEn||card.subtitle.split(' / ')[0];if(nameEn){if(y+height(nameEn,width,24)+8>bottom)start();y=line(nameEn,margin,y+4,width,24,400,MUTED,'city-name-en')+7;}}
  else y+=18;
 }
 function ensure(required){
  if(y+required>bottom){
   const heading=page.blocks.at(-1)?.role==='profile-section'?page.blocks.at(-1):null;
   if(heading)page.blocks.splice(-2);
   start();
   if(heading){page.blocks.push({type:'rule',x:margin,y:y+2,width,height:1});y+=12;page.blocks.push({...heading,y});y+=heading.height+6;}
  }
  return y+required<=bottom;
 }
 function flow(value,{size=25,weight=400,color=TEXT,role='profile-detail',gap=10}={}){
  if(!value)return;
  for(const text of measure(value,width,size,weight)){const lineHeight=Math.ceil(size*1.3);if(!ensure(lineHeight))throw Error('标题较长，请缩短标题后再生成。');page.blocks.push({type:'text',text,x:margin,y,width,height:lineHeight,size,weight,color,role});y+=lineHeight;}y+=gap;
 }
 function section(title){ensure(70);page.blocks.push({type:'rule',x:margin,y:y+2,width,height:1});y+=12;flow(title,{size:20,weight:500,color:MUTED,role:'profile-section',gap:6});}
 function paired(rows,{columns=2,labelSize=23,valueSize=25,noteSize=21,landmark=false}={}){
  const gap=landmark?30:48,cols=wide?2:columns,cw=(width-(cols-1)*gap)/cols;
  for(let offset=0;offset<rows.length;offset+=cols){
   const group=rows.slice(offset,offset+cols),valueSizes=group.map(row=>{
    if(landmark)return valueSize;
    let size=valueSize;const measuredWidth=()=>{font(size,500);const metrics=ctx.measureText(row.value);return Math.max(metrics.width,(metrics.actualBoundingBoxLeft||0)+(metrics.actualBoundingBoxRight||0));};
    while(size>30&&measuredWidth()>cw-10)size--;return size;
   });
   const longNotes=group.filter(row=>!landmark&&row.note&&measure(row.note,cw,noteSize).length>2),scopeSize=Math.max(20,noteSize),scopeNotes=longNotes.map(row=>({text:row.label+'口径  /  '+row.note}));
   const labelHeight=Math.max(...group.map(row=>height(row.label||row.title,cw,labelSize,landmark?500:400))),valueHeight=Math.max(...group.map((row,index)=>height(row.value||row.detail,cw,valueSizes[index],landmark?400:500))),noteHeight=Math.max(0,...group.map(row=>row.note&&!longNotes.includes(row)?height(row.note,cw,noteSize):0)),scopeHeight=scopeNotes.reduce((sum,row)=>sum+height(row.text,width,scopeSize)+4,0),required=labelHeight+6+valueHeight+(noteHeight?7+noteHeight:0)+(scopeHeight?10+scopeHeight:0)+12;
   if(!ensure(required)){
    for(const row of group){flow(row.label||row.title,{size:labelSize,weight:500,gap:5});flow(row.value||row.detail,{size:valueSize,weight:landmark?400:500,gap:row.note?5:14});if(row.note)flow(row.note,{size:noteSize,color:MUTED,gap:18});}continue;
   }
   for(const [column,row]of group.entries()){
    const x=margin+column*(cw+gap);line(row.label||row.title,x,y,cw,labelSize,landmark?500:400,landmark?INK:MUTED,landmark?'landmark-title':'fact-label');
    line(row.value||row.detail,x,y+labelHeight+6,cw,valueSizes[column],landmark?400:500,landmark?TEXT:INK,landmark?'profile-detail':'fact-value');
    if(row.note&&!longNotes.includes(row))line(row.note,x,y+labelHeight+6+valueHeight+7,cw,noteSize,400,MUTED,'fact-note');
   }
   let scopeTop=y+labelHeight+6+valueHeight+(noteHeight?7+noteHeight:0)+10;
   for(const row of scopeNotes)scopeTop=line(row.text,margin,scopeTop,width,scopeSize,400,MUTED,'fact-scope')+4;
   y+=required;
  }
 }
 start(true);
 if(profile.tagline)flow(profile.tagline,{size:wide?25:26,color:TEXT,role:'city-tagline',gap:12});
 const tags=profile.tags.length?profile.tags:card.tags;
 if(tags.length){font(22);let x=0;ensure(44);for(const tag of tags){const chipWidth=ctx.measureText(tag).width+28;if(chipWidth>width)continue;if(x&&x+chipWidth>width){x=0;y+=44;ensure(44);}page.blocks.push({type:'chip',text:tag,x:margin+x,y,width:chipWidth,height:36,size:22});x+=chipWidth+12;}y+=46;}
 if(profile.geography.length){
  const coordinates=profile.geography.filter(row=>/坐标|经纬/.test(row.label)),places=profile.geography.filter(row=>!/坐标|经纬/.test(row.label));
  if(places.length)flow('地理位置  /  '+places.map(row=>row.value).join(' · '),{size:24,role:'profile-geography',gap:8});
  for(const row of coordinates)flow(row.label+'  /  '+row.value,{size:19,color:MUTED,role:'profile-geography',gap:8});
 }
 const metadata=profile.statistics.filter(row=>/语言|货币|时区/.test(row.label));
 const metadataLabel=row=>/语言/.test(row.label)&&/国家(?:或|\/|、)?地区|国家口径|地区口径/.test(row.note)?'国家/地区语言':row.label;
 if(metadata.length)flow(metadata.map(row=>metadataLabel(row)+' / '+row.value).join('   ·   '),{size:19,color:MUTED,role:'profile-metadata',gap:8});
 const known=card.facts.filter(row=>row.value&&!/待补|暂无|未知/.test(row.value)&&!/网络|入境|入住/.test(row.label)),stats=[...profile.statistics.filter(row=>!/语言|货币|时区/.test(row.label)),...known].slice(0,4);
 if(stats.length){section('城市坐标 · 旅居参考');paired(stats,{columns:Math.min(3,stats.length),labelSize:21,valueSize:36,noteSize:18});}
 if(profile.landmarks.length){section('城市地标');paired(profile.landmarks,{columns:2,labelSize:26,valueSize:24,noteSize:20,landmark:true});}
 if(profile.culture.length){section('风土与日常');for(const row of profile.culture){flow(row.label+'  /  '+row.value,{size:22,gap:row.note?3:7});if(row.note)flow(row.note,{size:20,color:MUTED,gap:10});}}
 for(const [index,item]of pages.entries()){
  page=item;page.blocks.push({type:'rule',x:margin,y:footerY,width,height:1});
  const sourceCount=profile.sources.length,sourceLabel=sourceCount?'资料来源 '+sourceCount+' 处 · 完整出处见配文':'城市资料 · 完整口径见配文';
  let top=line(sourceLabel,margin,footerY+18,footerTextWidth,wide?18:20,500,INK,'profile-provenance');
  line(footerText,margin,top+10,footerTextWidth,wide?18:20,advisory?500:400,MUTED,advisory?'advisory':'profile-provenance');
  const domain=card.url?new URL(card.url).host:'roamorrow';
  page.blocks.push({type:'text',text:domain+(pages.length>1?'   '+(index+1)+' / '+pages.length:''),x:margin,y:h-margin-27,width:footerTextWidth,height:27,size:19,weight:400,color:MUTED});
  if(card.url)page.blocks.push({type:'qr',x:w-margin-qrSize,y:footerY+18,width:qrSize,height:qrSize});
 }
 // A short spillover should use a slightly shallower real-photo crop before
 // creating a sparse extra image. Longer pieces still continue at full size.
 if(!fitHeroHeight&&!wide&&h>=1350&&pages.length===2){
  const hero=pages[0].blocks.find(block=>block.type==='photo'),tail=pages[1].blocks.filter(block=>block.role&&!['city-title','profile-provenance','advisory'].includes(block.role));
  const tailHeight=tail.length?Math.max(...tail.map(block=>block.y+block.height))-Math.min(...tail.map(block=>block.y)):0;
  if(hero&&hero.height>260&&tailHeight>0&&tailHeight<=240)return layoutCityProfile(ctx,card,format,{photo,qrSize:requestedQR,heroHeight:Math.max(260,hero.height-96)});
 }
 return {width:w,height:h,pages};
}
export function layoutShare(ctx,card,format,{photo=false,qrSize:requestedQR}={}){
 if(card.kind==='city'&&card.cityProfile&&!card.private&&!card.body&&!card.items.length)return layoutCityProfile(ctx,card,format,{photo,qrSize:requestedQR});
 const {width:w,height:h}=format,wide=w>h,margin=wide?52:64;
 const cityPoster=card.kind==='city'&&card.facts.length===4&&!card.body&&!card.items.length&&!card.private;
 const qrSize=requestedQR||(wide?138:168);
 const pages=[];let page,y;
 const setFont=(size,weight=400)=>ctx.font=`${weight} ${size}px ${FONT}`;
 const footerWidth=card.url?w-margin*2-qrSize-24:w-margin*2,caution=card.caveats.join(' '),maxFootLines=wide?3:4;
 setFont(wide?22:26);const cautionLines=wrapText(ctx,caution,footerWidth);
 const selectedNote=cautionLines.length<=maxFootLines?caution:(card.essentialCaveat||(card.private?'个人填写，未核验；只列已知费用，未包含项见配文。公开链接不含个人金额。':'历史资料供参考，实际价格、天气与停留条件请核对原页。'));
 const note=[...(card.advisories||[]).filter(warning=>!selectedNote.includes(warning)),selectedNote].filter(Boolean).join(' ');
 const footerNote=cityPoster?'':note;
 const noteLines=wrapText(ctx,footerNote,footerWidth),noteHeight=footerNote?noteLines.length*Math.ceil((wide?22:26)*1.4):0;
 const footer=Math.max(wide?134:206,card.url?qrSize+36:0,18+noteHeight+16+38),bottom=h-footer-24;
 function add(text,x,top,width,size=36,weight=400,color=TEXT,role){setFont(size,weight);const lines=wrapText(ctx,text,width);for(const line of lines){page.blocks.push({type:'text',role,text:line,x,y:top,width,height:Math.ceil(size*1.4),size,weight,color});top+=Math.ceil(size*1.4);}return top;}
 function start(){page={blocks:[]};pages.push(page);page.blocks.push({type:'text',text:'roamorrow',x:margin,y:42,width:340,height:40,size:30,weight:600,color:INK});
  const category=card.private?'个人手记':({city:'城市手记',ranking:'下一站',comparison:'两城之间',guide:'旅居笔记',answer:'选城笔记',checklist:'出发清单'})[card.kind]||'旅居资料';
  page.blocks.push({type:'text',text:card.month?card.month+'月 / '+category:category,x:w-margin-340,y:46,width:340,height:34,size:26,weight:400,color:MUTED});
  const continued=pages.length>1;
  y=add(card.title+(continued?' / 续':''),margin,wide?88:106,w-margin*2,continued?40:wide?56:72,500,INK);
  if(!continued&&card.subtitle)y=add(card.subtitle,margin,y+8,w-margin*2,28,400,MUTED);y+=wide?18:24;
  if(cityPoster&&card.advisories.length)y=add(card.advisories.join(' '),margin,y,w-margin*2,wide?26:30,500,INK,'advisory')+16;
  if(y>bottom)throw Error('标题较长，请在“调整图片文字”中缩短图片标题，或选择竖图。');
 }
 start();const mainWidth=wide&&photo?Math.round(w*.5)-margin:w-margin*2;
 const content=[];
 if(card.summary&&!cityPoster&&!(wide&&card.kind==='city'))content.push({text:card.summary,size:wide?30:36,weight:400,gap:24});
 if(cityPoster&&card.tags.length)content.push({tags:card.tags});
 if(card.facts.length)content.push({facts:card.facts});
 card.items.forEach((row,index)=>{content.push({text:(card.kind==='ranking'?(index+1)+'  ':'')+row.title,size:wide?34:42,weight:500,gap:5});if(row.detail)content.push({text:row.detail,size:wide?26:30,color:MUTED,gap:26});});
 if(card.body)for(const paragraph of card.body.split(/\n\s*\n/))content.push({text:paragraph,size:wide?30:36,gap:24});
 // Long caveats flow with content; a compact, complete safety line repeats on every page.
 if(!cityPoster&&cautionLines.length>maxFootLines)content.push({text:caution,size:wide?28:32,color:MUTED,gap:24});
 function factGrid(facts,width){
  const cols=facts.length===2||cityPoster?2:1,cw=(width-(cols-1)*32)/cols;
  const sizes=[wide?22:26,wide?36:46,wide?20:24];
  const rows=[];
  for(let i=0;i<facts.length;i+=cols){
   const heights=sizes.map((size,part)=>Math.max(...facts.slice(i,i+cols).map(fact=>{const value=[fact.label,fact.value,fact.note][part];setFont(size);return value?wrapText(ctx,value,cw).length*Math.ceil(size*1.4):0;})));
   rows.push({heights,height:heights[0]+8+heights[1]+8+heights[2]+28});
  }
  return {cols,cw,sizes,rows,height:rows.reduce((sum,row)=>sum+row.height,0)};
 }
 function factHeight(facts,width){return factGrid(facts,width).height;}
 function tagRows(tags,width){
  setFont(26);let x=0,y=0;const chips=[];
  for(const tag of tags){const widthNeeded=ctx.measureText(tag).width+32;if(widthNeeded>width)continue;if(x&&x+widthNeeded>width){x=0;y+=54;}chips.push({text:tag,x,y,width:widthNeeded,height:42});x+=widthNeeded+12;}
  return {chips,height:chips.length?y+62:0};
 }
 const estimated=content.reduce((sum,row)=>{if(row.facts)return sum+factHeight(row.facts,mainWidth);if(row.tags)return sum+tagRows(row.tags,mainWidth).height;setFont(row.size,row.weight);return sum+wrapText(ctx,row.text,mainWidth).length*Math.ceil(row.size*1.4)+(row.gap||0);},0);
 if(photo){
  const photoHeight=wide?Math.min(220,bottom-y):Math.min(350,Math.floor(h*.27),bottom-y-estimated-30);
  if(photoHeight>=150){const x=wide?Math.round(w*.55):margin,pw=wide?w-margin-x:w-margin*2;page.blocks.push({type:'photo',x,y,width:pw,height:photoHeight});if(!wide)y+=photoHeight+28;}
 }
 for(const row of content){
  if(row.tags){const tags=tagRows(row.tags,mainWidth);if(y+tags.height>bottom)start();for(const chip of tags.chips)page.blocks.push({type:'chip',...chip,x:margin+chip.x,y:y+chip.y});y+=tags.height;continue;}
  if(row.facts){
   const grid=factGrid(row.facts,mainWidth);
   if(cityPoster&&y+grid.height>bottom)start();
   for(let offset=0;offset<row.facts.length;offset+=grid.cols){
    const rowMetrics=grid.rows[Math.floor(offset/grid.cols)];
    if(y+rowMetrics.height>bottom)start();
    if(y+rowMetrics.height>bottom){
     // Extremely long values flow intact when even a fresh page cannot fit a grid row.
     for(const fact of row.facts.slice(offset,offset+grid.cols))for(const [part,value] of [fact.label,fact.value,fact.note].entries()){
      if(!value)continue;const size=grid.sizes[part];setFont(size);
      for(const line of wrapText(ctx,value,mainWidth)){const lineHeight=Math.ceil(size*1.4);if(y+lineHeight>bottom)start();if(y+lineHeight>bottom)throw Error('标题较长，请缩短后再生成。');page.blocks.push({type:'text',role:'content',text:line,x:margin,y,width:mainWidth,height:lineHeight,size,weight:part===1?500:400,color:part===1?INK:MUTED});y+=lineHeight;}y+=8;
     }
     continue;
    }
    for(const [column,fact] of row.facts.slice(offset,offset+grid.cols).entries()){
     const x=margin+column*(grid.cw+32),valueY=y+rowMetrics.heights[0]+8,noteY=valueY+rowMetrics.heights[1]+8;
     add(fact.label,x,y,grid.cw,grid.sizes[0],400,MUTED,'fact-label');
     add(fact.value,x,valueY,grid.cw,grid.sizes[1],500,INK,'fact-value');
     if(fact.note)add(fact.note,x,noteY,grid.cw,grid.sizes[2],400,MUTED,'fact-note');
    }
    y+=rowMetrics.height;
   }
   y+=12;continue;
  }
  setFont(row.size,row.weight);const lines=wrapText(ctx,row.text,mainWidth),lineHeight=Math.ceil(row.size*1.4);
  for(const line of lines){if(y+lineHeight>bottom){start();if(y+lineHeight>bottom)throw Error('标题较长，请缩短标题后再生成。');}page.blocks.push({type:'text',role:'content',text:line,x:margin,y,width:mainWidth,height:lineHeight,size:row.size,weight:row.weight||400,color:row.color||TEXT});y+=lineHeight;}
  y+=row.gap||0;
 }
 for(const [index,p] of pages.entries()){
  page=p;const footY=h-footer;page.blocks.push({type:'rule',x:margin,y:footY,width:w-margin*2,height:1});
  if(footerNote)add(footerNote,margin,footY+18,footerWidth,wide?22:26,400,MUTED);
  const domain=card.url?new URL(card.url).host+new URL(card.url).pathname.replace(/\/$/,''):'';
  setFont(22);let label=domain;while(label&&ctx.measureText(label).width>footerWidth-75)label=label.slice(0,-1);if(label!==domain)label+='…';
  if(label||pages.length>1)page.blocks.push({type:'text',text:label+(pages.length>1?'  '+(index+1)+'/'+pages.length:''),x:margin,y:h-38,width:footerWidth,height:30,size:22,weight:400,color:INK});
  if(card.url)page.blocks.push({type:'qr',x:w-margin-qrSize,y:footY+18,width:qrSize,height:qrSize});
 }
 return {width:w,height:h,pages};
}
export function prepareShareLayout(ctx,card,format,{photo=false,textOnly=false,qrSize}={}){
 const layout=layoutShare(ctx,textOnly?{...card,photos:[]}:card,format,{photo:photo&&!textOnly,qrSize});
 return {layout,textOnly,notices:[]};
}
function timeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer));}
async function loadPhoto(photo,signal){
 const response=await fetch(sitePath(photo.url),{signal});if(!response.ok)throw Error('照片暂未载入，可重试或选择文字版。');
 const blob=await response.blob();return createImageBitmap(blob);
}
export async function renderShare(card,formatId='portrait',{signal,textOnly=false}={}){
 const started=performance.now(),format=SHARE_FORMATS.find(row=>row.id===formatId);if(!format)throw Error('图片比例不可用。');
 await timeout(document.fonts.ready,4000,'字体暂未准备好，请重试。');signal?.throwIfAborted();
 let bitmap;try{
  const canvas=document.createElement('canvas');canvas.width=format.width;canvas.height=format.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('这个浏览器暂不支持生成图片，链接和配文仍可使用。');
  let qr,qrSize;if(card.url){const {default:qrcode}=await import('../vendor/qrcode/qrcode.mjs');qr=qrcode(0,'M');qr.addData(card.url);qr.make();qrSize=Math.max(format.width>format.height?138:168,(qr.getModuleCount()+8)*2);}
  const prepared=prepareShareLayout(ctx,card,format,{photo:card.photos.length>0,textOnly,qrSize});textOnly=prepared.textOnly;const {layout,notices}=prepared;
  if(card.photos.length&&!textOnly){const pending=loadPhoto(card.photos[0],signal);try{bitmap=await timeout(pending,7000,'照片加载较慢，可重试或选择文字版。');}catch(error){pending.then(image=>image.close(),()=>{});throw error;}}
  const pages=[];
  for(const page of layout.pages){signal?.throwIfAborted();ctx.fillStyle=PAPER;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textBaseline='top';
   for(const block of page.blocks){
    if(block.type==='text'){ctx.fillStyle=block.color;ctx.font=`${block.weight} ${block.size}px ${FONT}`;ctx.textAlign=block.align||'left';ctx.fillText(block.text,block.align==='right'?block.x+block.width:block.x,block.y);ctx.textAlign='left';}
    if(block.type==='chip'){ctx.fillStyle='#eee6dc';ctx.beginPath();ctx.roundRect(block.x,block.y,block.width,block.height,block.size?4:21);ctx.fill();ctx.fillStyle=TEXT;ctx.font=`400 ${block.size||26}px ${FONT}`;ctx.fillText(block.text,block.x+(block.size?14:16),block.y+7);}
    if(block.type==='rule'){ctx.fillStyle='#ded4c9';ctx.fillRect(block.x,block.y,block.width,1);}
    if(block.type==='photo'&&bitmap){const scale=Math.max(block.width/bitmap.width,block.height/bitmap.height),sw=block.width/scale,sh=block.height/scale;ctx.drawImage(bitmap,(bitmap.width-sw)/2,(bitmap.height-sh)/2,sw,sh,block.x,block.y,block.width,block.height);}
    if(block.type==='qr'&&qr){const count=qr.getModuleCount(),module=Math.floor(block.width/(count+8)),size=(count+8)*module;if(module<2)throw Error('分享链接较长，请使用配文中的完整链接。');const x=block.x+Math.floor((block.width-size)/2),y=block.y;ctx.fillStyle='#fff';ctx.fillRect(x,y,size,size);ctx.fillStyle=INK;for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c))ctx.fillRect(x+(c+4)*module,y+(r+4)*module,module,module);}
   }
   let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('图片导出失败，请重试。');
   if(blob.size>4*1024*1024)blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
   if(!blob||blob.size>4*1024*1024)throw Error('图片较大，请改用文字版。');
   pages.push({blob,width:canvas.width,height:canvas.height});
  }
  return {pages,layout,notices,textOnly,elapsedMs:performance.now()-started};
 }finally{bitmap?.close();}
}
