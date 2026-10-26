import test from 'node:test';
import assert from 'node:assert/strict';
import {createShare,SHARE_FORMATS,shareText} from '../public/modules/share-model.js';
const renderer=await import('../public/modules/share-render.js').catch(()=>({}));
const ctx={font:'',measureText(value){return {width:[...value].length*32};}};
test('measured Chinese wrapping preserves every character, including long unspaced words',()=>{
 const input='清迈，住一个月。LongUnbrokenPlaceName不缩小文字';const lines=renderer.wrapText(ctx,input,192);assert.equal(lines.join(''),input);assert.ok(lines.every(line=>ctx.measureText(line).width<=192));
});
test('Chinese punctuation does not hang alone at the start of a new line',()=>{
 const input='清迈呀。住一阵（再决定）。';const lines=renderer.wrapText(ctx,input,96);assert.equal(lines.join(''),input);assert.ok(lines.every(line=>!/[。，、；：！？）】》]/.test(line[0]||'')));assert.ok(lines.every(line=>!/[（【《]$/.test(line)));assert.ok(lines.every(line=>ctx.measureText(line).width<=96));
});
test('a long answer continues on other pages without dropping warnings or sources',()=>{
 const card=createShare({title:'旅居前先核对',body:'不要把均价当作下限。'.repeat(150),caveats:['末尾重要限制不能丢失'],sources:[{title:'原资料',date:'2025-03-01',url:'https://example.com/'}]});
 for(const format of SHARE_FORMATS){const layout=renderer.layoutShare(ctx,card,format);assert.ok(layout.pages.length>1);const blocks=layout.pages.flatMap(page=>page.blocks),all=blocks.map(b=>b.text||'').join('');assert.ok(all.includes('末尾重要限制不能丢失'));assert.ok(shareText(card).includes('2025-03-01'));assert.equal((blocks.filter(b=>b.role==='content').map(b=>b.text).join('').match(/不要把均价当作下限。/g)||[]).length,150);assert.ok(layout.pages.every(page=>page.blocks.every(block=>block.y+block.height<=format.height)),'no block crosses the image boundary');}
});
test('layout does not invent photos and retains data at every aspect ratio',()=>{
 const card=createShare({title:'清迈',facts:[{label:'历史月参考',value:'待补充',note:'不是现价'}],caveats:['工作许可另查']});
 for(const format of SHARE_FORMATS){const layout=renderer.layoutShare(ctx,card,format);assert.ok(layout.pages[0].blocks.some(block=>block.text?.includes('待补充')));assert.equal(layout.pages[0].blocks.some(block=>block.type==='photo'),false);}
});
test('unrenderable titles fail explicitly instead of drawing cropped text',()=>{
 const card=createShare({title:'清'.repeat(200),url:'https://roamorrow.com/nomads/'}),sized={font:'',measureText(value){return {width:[...value].length*Number(this.font.match(/(\d+)px/)?.[1]||36)};}};for(const format of SHARE_FORMATS.slice(0,4))assert.throws(()=>renderer.layoutShare(sized,card,format),/标题/);
});
test('images omit source boilerplate and photo credits while dates stay attached to their facts',()=>{
 const card=createShare({title:'清迈',url:'https://roamorrow.com/nomads/cities/chiang-mai/',facts:[{label:'历史月参考',value:'US$850',note:'核对 2026-10-17'}],sources:[{title:'城市资料',date:'2025-03-01',url:'https://example.com/'}],photos:[{url:'/images/city-chiang-mai.webp',credit:'Nawit science / CC BY-SA 4.0',source:'https://example.com/photo'}]});
 for(const format of SHARE_FORMATS){const imageText=renderer.layoutShare(ctx,card,format,{photo:true}).pages.flatMap(page=>page.blocks).map(block=>block.text||'').join('');assert.doesNotMatch(imageText,/来源见配文|各项日期见配文|Nawit science|CC BY-SA|2025-03-01/);assert.match(imageText,/2026-10-17/);}
 assert.match(shareText(card),/Nawit science \/ CC BY-SA 4.0/);assert.match(shareText(card),/https:\/\/example.com\/photo/);
});
test('long photo credits remain in accompanying text without replacing the photo with a text edition',()=>{
 const card=createShare({title:'瓦尔纳',photos:[{url:'/images/city-varna.webp',credit:'摄影署名'.repeat(150),source:'https://example.com/photo'}]});const result=renderer.prepareShareLayout(ctx,card,SHARE_FORMATS[0],{photo:true});assert.equal(result.textOnly,false);assert.equal(result.layout.pages[0].blocks.some(block=>block.type==='photo'),true);assert.match(shareText(card),/摄影署名/);assert.deepEqual(result.notices,[]);
});
test('dense share links reserve a larger QR area instead of blocking image export',()=>{
 const card=createShare({title:'我的选城条件',url:'https://roamorrow.com/nomads/?q='+encodeURIComponent('清迈'.repeat(50))});const layout=renderer.layoutShare(ctx,card,SHARE_FORMATS[3],{qrSize:300});const qr=layout.pages[0].blocks.find(block=>block.type==='qr');assert.equal(qr.width,300);assert.ok(qr.y+qr.height<=630);for(const block of layout.pages[0].blocks.filter(block=>block.type==='text'&&block.y>qr.y))assert.ok(block.x+block.width<=qr.x);
});
test('facts can continue across pages when a dense QR leaves a shorter content area',()=>{
 const sized={font:'',measureText(value){return {width:[...value].length*Number(this.font.match(/(\d+)px/)?.[1]||36)};}},card=createShare({title:'11月，下一站住哪里',subtitle:'综合推荐',url:'https://roamorrow.com/nomads/',facts:[{label:'当前条件',value:'暂时没有符合的城市',note:'打开链接可继续调整条件'}]});const layout=renderer.layoutShare(sized,card,SHARE_FORMATS[3],{qrSize:300});assert.ok(layout.pages.flatMap(page=>page.blocks).map(block=>block.text||'').join('').includes('暂时没有符合的城市'));assert.ok(layout.pages.every(page=>page.blocks.every(block=>block.y+block.height<=630)));
});
