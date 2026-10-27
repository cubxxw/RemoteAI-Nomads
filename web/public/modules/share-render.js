import {SHARE_FORMATS} from './share-model.js';
import {sitePath} from './site-path.js';
const FONT='Inter, "PingFang SC", "Noto Sans CJK SC", sans-serif';
const INK='#1f1a14',TEXT='#3e3429',MUTED='#6b5d4c',PAPER='#faf8f6';
export function wrapText(ctx,input,width){
 const lines=[],closing=/[。，、；：！？）】》〉」』〕.,;:!?%]/,opening=/[（【《〈「『〔(\[]/;
 for(const paragraph of String(input).split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>width){const parts=[...line];let carry='';if(closing.test(char)){while(parts.length&&closing.test(parts.at(-1)))carry=parts.pop()+carry;if(parts.length)carry=parts.pop()+carry;}else if(opening.test(parts.at(-1)))carry=parts.pop();if(parts.length){lines.push(parts.join(''));line=carry;}else{lines.push(line);line='';}}line+=char;}lines.push(line);}return lines;
}
const CITY_INK='#123c32',CITY_TEXT='#37423c',CITY_MUTED='#68766e',CITY_PAPER='#f8faf6';
const isCityProfile=card=>card.kind==='city'&&card.cityProfile&&!card.private&&!card.body&&!card.items.length;
export function resolveShareFormat(card,formatOrId='portrait'){
 const format=typeof formatOrId==='string'?SHARE_FORMATS.find(row=>row.id===formatOrId):formatOrId;
 if(!format)throw Error('图片比例不可用。');
 return isCityProfile(card)&&format.id==='portrait'?{...format,width:1080,height:1800}:format;
}
function layoutCityProfile(ctx,card,format,{photo=false,qrSize:requestedQR}={}){
 const {width:w,height:h}=format,wide=w>h,margin=wide?48:56,width=w-margin*2,profile=card.cityProfile;
 const qrSize=requestedQR||(wide?138:132),pages=[];let page,y;
 const font=(size,weight=400)=>ctx.font=`${weight} ${size}px ${FONT}`;
 const measure=(value,available,size,weight=400)=>{font(size,weight);return wrapText(ctx,value,available);};
 const lineHeight=size=>Math.ceil(size*1.3);
 const height=(value,available,size,weight=400)=>value?measure(value,available,size,weight).length*lineHeight(size):0;
 const advisory=(card.advisories||[]).join(' '),footerTextWidth=width-qrSize-28;
 if(footerTextWidth<120)throw Error('分享链接较长，请使用配文中的完整链接。');
 const footerHeight=Math.max(card.url?qrSize:0,advisory?height(advisory,footerTextWidth,19,500)+40:28),footerY=h-margin-footerHeight,bottom=footerY-12;
 const line=(value,x,top,available,size=24,weight=400,color=CITY_TEXT,role='profile-detail')=>{
  for(const text of measure(value,available,size,weight)){page.blocks.push({type:'text',text,x,y:top,width:available,height:lineHeight(size),size,weight,color,role});top+=lineHeight(size);}return top;
 };
 const rule=(top=y)=>page.blocks.push({type:'rule',x:margin,y:top,width,height:1,color:'#d8e0d8'});
 const country=profile.geography.find(row=>/国家|地区/.test(row.label))?.value||card.subtitle.split(' / ').slice(1).join(' / ');
 const nameEn=profile.nameEn||card.subtitle.split(' / ')[0],secondary=[nameEn,country].filter(Boolean).join(' · ');
 const tags=profile.tags.length?profile.tags:card.tags;
 let afterHero=[];
 function start(first=false){
  page={blocks:[]};pages.push(page);
  if(first){
   const heroHeight=wide?Math.round(h*.34):Math.round(h*(h>=1600?.43:.36)),heroText=photo?'#ffffff':CITY_INK;
   page.blocks.push({type:photo?'photo':'surface',role:'city-hero',x:0,y:0,width:w,height:heroHeight,color:'#e9eee7'});
   if(photo)page.blocks.push({type:'shade',x:0,y:0,width:w,height:heroHeight});
   page.blocks.push({type:'text',text:'roamorrow',x:margin,y:wide?24:40,width:340,height:40,size:28,weight:600,color:heroText,role:'brand'});
   let titleSize=wide?58:h>=1600?126:86;
   while(titleSize>52&&height(card.title,width,titleSize,600)>heroHeight*.42)titleSize-=2;
   const titleHeight=height(card.title,width,titleSize,600),secondarySize=wide?23:34;
   let tagline=profile.tagline,heroTags=tags;
   const chipRows=values=>{font(22);let used=0,rows=values.length?1:0;for(const value of values){const needed=ctx.measureText(value).width+24;if(used&&used+needed>width){used=0;rows++;}used+=needed+12;}return rows;};
   const required=()=>titleHeight+(secondary?height(secondary,width,secondarySize)+8:0)+(tagline?height(tagline,width,wide?23:28)+16:0)+chipRows(heroTags)*42;
   if(required()>heroHeight-(wide?88:140)){afterHero.push({text:tagline,role:'city-tagline'});tagline='';}
   if(required()>heroHeight-(wide?88:140)){afterHero.push({tags:heroTags});heroTags=[];}
   if(required()>heroHeight-(wide?76:126))throw Error('标题较长，请在“调整图片文字”中缩短图片标题。');
   let top=heroHeight-required()-(wide?20:48);
   top=line(card.title,margin,top,width,titleSize,600,heroText,'city-title');
   if(secondary)top=line(secondary,margin,top+8,width,secondarySize,400,heroText,'city-name-en');
   if(tagline)top=line(tagline,margin,top+16,width,wide?23:28,400,heroText,'city-tagline');
   if(heroTags.length){top+=16;font(22);let x=margin;for(const tag of heroTags){const chipWidth=ctx.measureText(tag).width+24;if(x>margin&&x+chipWidth>w-margin){x=margin;top+=42;}page.blocks.push({type:'chip',text:tag,x,y:top,width:chipWidth,height:34,size:22,color:heroText,background:photo?'rgba(255,255,255,.18)':'#dce6dc',padding:12});x+=chipWidth+12;}}
   y=heroHeight+(wide?22:28);
  }else{
   line('roamorrow',margin,28,width,24,600,CITY_INK,'brand');
   y=line(card.title+' / 续',margin,76,width,wide?34:42,500,CITY_INK,'city-title')+22;
  }
  if(y>bottom)throw Error('标题较长，请缩短标题后再生成。');
 }
 function ensure(required){
  if(y+required>bottom){
   const heading=page.blocks.at(-1)?.role==='profile-section'?page.blocks.at(-1):null;
   if(heading)page.blocks.splice(-2);
   start();
   if(heading){rule();y+=14;page.blocks.push({...heading,y});y+=heading.height+10;}
  }
  return y+required<=bottom;
 }
 function flow(value,{size=24,weight=400,color=CITY_TEXT,role='profile-detail',gap=10}={}){
  if(!value)return;
  for(const text of measure(value,width,size,weight)){const lh=lineHeight(size);if(!ensure(lh))throw Error('标题较长，请缩短标题后再生成。');page.blocks.push({type:'text',text,x:margin,y,width,height:lh,size,weight,color,role});y+=lh;}y+=gap;
 }
 function section(title){ensure(76);rule();y+=14;flow(title,{size:23,weight:600,color:CITY_INK,role:'profile-section',gap:10});}
 function paired(rows,{columns=2,labelSize=23,valueSize=24,noteSize=21,landmark=false,dominant=false,metadata=false,detail=false}={}){
  const gap=32,cols=wide?Math.min(3,columns):columns,cw=(width-(cols-1)*gap)/cols;
  for(let offset=0;offset<rows.length;offset+=cols){
   const group=rows.slice(offset,offset+cols),sizes=group.map(row=>{
    let size=valueSize;if(dominant){const measured=()=>{font(size,600);const metrics=ctx.measureText(row.value);return Math.max(metrics.width,(metrics.actualBoundingBoxLeft||0)+(metrics.actualBoundingBoxRight||0));};while(size>40&&measured()>cw-8)size--;}return size;
   });
   const labelHeight=Math.max(...group.map(row=>height(row.label||row.title,cw,labelSize,landmark?600:400))),valueHeight=Math.max(...group.map((row,index)=>height(row.value||row.detail,cw,sizes[index],dominant?600:400))),noteHeight=Math.max(0,...group.map(row=>row.inlineNote?height(row.inlineNote,cw,noteSize):0)),required=labelHeight+8+valueHeight+(noteHeight?8+noteHeight:0)+18;
   if(!ensure(required)){
    for(const row of group){flow(row.label||row.title,{size:labelSize,weight:landmark?600:500,color:CITY_INK,role:landmark?'landmark-title':metadata?'metadata-label':'fact-label',gap:5});flow(row.value||row.detail,{size:dominant?Math.min(valueSize,44):valueSize,weight:dominant?600:400,role:landmark||detail?'profile-detail':metadata?'profile-metadata':'fact-value',gap:8});if(row.inlineNote)flow(row.inlineNote,{size:noteSize,color:CITY_MUTED,role:'fact-note',gap:14});}continue;
   }
   for(const [column,row]of group.entries()){
    const x=margin+column*(cw+gap);
    if(column)page.blocks.push({type:'rule',x:x-gap/2,y,width:1,height:required-18,color:'#d8e0d8'});
    line(row.label||row.title,x,y,cw,labelSize,landmark?600:400,landmark?CITY_INK:CITY_MUTED,landmark?'landmark-title':metadata?'metadata-label':'fact-label');
    line(row.value||row.detail,x,y+labelHeight+8,cw,sizes[column],dominant?600:400,dominant?CITY_INK:CITY_TEXT,landmark||detail?'profile-detail':metadata?'profile-metadata':'fact-value');
    if(row.inlineNote)line(row.inlineNote,x,y+labelHeight+8+valueHeight+8,cw,noteSize,400,CITY_MUTED,'fact-note');
   }
   y+=required;
  }
 }
 start(true);
 for(const row of afterHero){if(row.text)flow(row.text,{size:26,role:row.role,gap:16});if(row.tags)flow(row.tags.join(' · '),{size:22,color:CITY_MUTED,role:'city-tags',gap:18});}
 const metadata=profile.statistics.filter(row=>/语言|货币|时区/.test(row.label));
 const numeric=profile.statistics.filter(row=>!/语言|货币|时区/.test(row.label));
 const known=card.facts.filter(row=>row.value&&!/待补|暂无|未知/.test(row.value)&&!/网络|入境|入住/.test(row.label));
 const population=numeric.filter(row=>/人口/.test(row.label)),cost=known.filter(row=>/花费|预算|费用/.test(row.label)),climate=known.filter(row=>/温|气候/.test(row.label));
 const primary=[...population,...cost,...climate],extra=[...numeric.filter(row=>!population.includes(row)),...known.filter(row=>!cost.includes(row)&&!climate.includes(row))];
 const primaryRows=primary.map(row=>({...row,label:cost.includes(row)?'历史月花费':climate.includes(row)?(card.month?card.month+'月均温':row.label.replace('历史','')):row.label,inlineNote:climate.includes(row)?(row.note.match(/\d{4}\s*[–—-]\s*\d{4}/)?.[0]?'气候统计：'+row.note.match(/\d{4}\s*[–—-]\s*\d{4}/)[0]:''):''}));
 if(primaryRows.length)paired(primaryRows,{columns:Math.min(3,primaryRows.length),labelSize:24,valueSize:56,noteSize:20,dominant:true});
 const scopeRows=population.filter(row=>row.note);
 for(const row of scopeRows){
  const scopeSize=21,padding=12,scopeHeight=height(row.note,width-padding*2,scopeSize)+padding*2;
  if(ensure(scopeHeight+14)){page.blocks.push({type:'surface',role:'population-scope-band',x:margin,y,width,height:scopeHeight,color:'#eaf0e8',radius:5});line(row.note,margin+padding,y+padding,width-padding*2,scopeSize,400,CITY_INK,'fact-scope');y+=scopeHeight+14;}
  else flow(row.note,{size:scopeSize,color:CITY_INK,role:'fact-scope',gap:16});
 }
 if(profile.geography.length){
  const coordinates=profile.geography.filter(row=>/坐标|经纬/.test(row.label)),places=profile.geography.filter(row=>!/坐标|经纬|国家|地区/.test(row.label));
  // Country belongs with the bilingual city heading; the body keeps the more
  // specific geography and any factual description attached to that location.
  if(places.length||coordinates.length){ensure(112);rule();y+=14;flow('地理位置',{size:23,weight:600,color:CITY_INK,role:'profile-section',gap:6});
   for(const row of places)flow([row.value,row.note].filter(Boolean).join(' · '),{size:24,role:'profile-geography',gap:6});
   for(const row of coordinates)flow('城市点位：'+row.value,{size:20,color:CITY_MUTED,role:'profile-geography',gap:14});}
 }
 for(const row of extra)flow(row.label+' / '+row.value+(row.note?' · '+row.note:''),{size:24,role:'profile-detail',gap:14});
 if(metadata.length){
  const rows=metadata.map(row=>({...row,label:/语言/.test(row.label)&&/国家(?:或|\/|、)?地区|国家口径|地区口径/.test(row.note)?'国家/地区语言':row.label}));
  paired(rows,{columns:Math.min(3,rows.length),labelSize:22,valueSize:24,metadata:true});
 }
 if(profile.landmarks.length){section('主要地标');paired(profile.landmarks,{columns:2,labelSize:26,valueSize:24,landmark:true});}
 if(profile.culture.length){
  ensure(110);rule();y+=14;
  paired(profile.culture.map(row=>({...row,inlineNote:row.note})),{columns:Math.min(2,profile.culture.length),labelSize:23,valueSize:24,noteSize:21,detail:true});
 }
 for(const [index,item]of pages.entries()){
  page=item;
  if(advisory)line(advisory,margin,footerY,footerTextWidth,19,500,CITY_INK,'advisory');
  const url=card.url?new URL(card.url):null,label=url?url.host+url.pathname+url.search:'roamorrow',suffix=pages.length>1?'  '+(index+1)+' / '+pages.length:'',linkSize=19;
  let visible=label;while(visible&&height(visible+(visible===label?'':'…')+suffix,footerTextWidth,linkSize)>52)visible=visible.slice(0,-1);
  const link=visible+(visible===label?'':'…')+suffix;
  line(link,margin,h-margin-Math.max(26,height(link,footerTextWidth,linkSize)),footerTextWidth,linkSize,400,CITY_MUTED,'share-url');
  if(card.url)page.blocks.push({type:'qr',x:w-margin-qrSize,y:footerY,width:qrSize,height:qrSize});
 }
 return {width:w,height:h,background:CITY_PAPER,pages};
}
export function layoutShare(ctx,card,format,{photo=false,qrSize:requestedQR}={}){
 format=resolveShareFormat(card,format);
 if(isCityProfile(card))return layoutCityProfile(ctx,card,format,{photo,qrSize:requestedQR});
 const {width:w,height:h}=format,wide=w>h,margin=wide?52:64;
 const cityPoster=card.kind==='city'&&card.facts.length===4&&!card.body&&!card.items.length&&!card.private;
 const qrSize=requestedQR||(wide?138:168);
 const pages=[];let page,y;
 const setFont=(size,weight=400)=>ctx.font=`${weight} ${size}px ${FONT}`;
 const footerWidth=card.url?w-margin*2-qrSize-24:w-margin*2,caution=card.caveats.join(' '),maxFootLines=wide?3:4;
 setFont(wide?22:26);const cautionLines=wrapText(ctx,caution,footerWidth);
 const selectedNote=cautionLines.length<=maxFootLines?caution:(card.essentialCaveat||(card.private?'个人填写，未核验。只列已知费用，未包含项见配文。公开链接不含个人金额。':'历史资料供参考，实际价格、天气与停留条件请核对原页。'));
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
 const started=performance.now(),format=resolveShareFormat(card,formatId);
 await timeout(document.fonts.ready,4000,'字体暂未准备好，请重试。');signal?.throwIfAborted();
 let bitmap;try{
  const canvas=document.createElement('canvas');canvas.width=format.width;canvas.height=format.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('这个浏览器暂不支持生成图片，链接和配文仍可使用。');
  let qr,qrSize;if(card.url){const {default:qrcode}=await import('../vendor/qrcode/qrcode.mjs');qr=qrcode(0,'M');qr.addData(card.url);qr.make();qrSize=Math.max(isCityProfile(card)&&format.width<=format.height?132:format.width>format.height?138:168,(qr.getModuleCount()+8)*2);}
  const prepared=prepareShareLayout(ctx,card,format,{photo:card.photos.length>0,textOnly,qrSize});textOnly=prepared.textOnly;const {layout,notices}=prepared;
  if(card.photos.length&&!textOnly){const pending=loadPhoto(card.photos[0],signal);try{bitmap=await timeout(pending,7000,'照片加载较慢，可重试或选择文字版。');}catch(error){pending.then(image=>image.close(),()=>{});throw error;}}
  const pages=[];
  for(const page of layout.pages){signal?.throwIfAborted();ctx.fillStyle=layout.background||PAPER;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textBaseline='top';
   for(const block of page.blocks){
    if(block.type==='text'){ctx.fillStyle=block.color;ctx.font=`${block.weight} ${block.size}px ${FONT}`;ctx.textAlign=block.align||'left';ctx.fillText(block.text,block.align==='right'?block.x+block.width:block.x,block.y);ctx.textAlign='left';}
    if(block.type==='chip'){ctx.fillStyle=block.background||'#eee6dc';ctx.beginPath();ctx.roundRect(block.x,block.y,block.width,block.height,block.size?4:21);ctx.fill();ctx.fillStyle=block.color||TEXT;ctx.font=`400 ${block.size||26}px ${FONT}`;ctx.fillText(block.text,block.x+(block.padding??(block.size?14:16)),block.y+(block.size?5:7));}
    if(block.type==='rule'){ctx.fillStyle=block.color||'#ded4c9';ctx.fillRect(block.x,block.y,block.width,block.height);}
    if(block.type==='surface'){ctx.fillStyle=block.color;ctx.beginPath();ctx.roundRect(block.x,block.y,block.width,block.height,block.radius||0);ctx.fill();}
    if(block.type==='shade'){const shade=ctx.createLinearGradient(0,block.y,0,block.y+block.height);shade.addColorStop(0,'rgba(5,25,24,.04)');shade.addColorStop(.32,'rgba(5,25,24,.05)');shade.addColorStop(1,'rgba(5,25,24,.82)');ctx.fillStyle=shade;ctx.fillRect(block.x,block.y,block.width,block.height);}
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
