import {esc,external} from './render.js';

// Official source bodies/navigation read on 2026-10-19. These are specific
// verification routes; they do not turn the imported entry tag into a permit.
const entryResources=new Map([
  ['TH',{title:'泰国驻华使馆：中国普通护照免签说明',url:'https://thaiembbeij.org/th/news/updateofvisaexemption/',published:'2026-09-02',text:'使馆此说明列出中国普通护照单次停留最长 30 天；延期需按个人情况另行申请。请出发前重查。'}],
  ['MY',{title:'马来西亚移民局：中马互免签证问答',url:'https://www.imi.gov.my/index.php/en/https-www-imi-gov-my-index-php-f-a-q-malaysia-china-visa-exemption-agreement/',text:'按自己的护照种类查一次能停留多久、累计能住多久，再看入境要准备什么材料。'}],
  ['ID',{title:'印度尼西亚移民部门：签证分类与官方申请入口',url:'https://bontang.imigrasi.go.id/layanan-publik/kategori/wna/sub/daftar-visa-indonesia',text:'按出行目的查签证分类与官方申请入口；具体国籍资格和可从事活动仍需核对。'}],
]);
export function entryResourceMarkup(code){
  const resource=entryResources.get(code);if(!resource)return '';
  return `<div class="city-official-resource"><h3>查官方入境说明</h3><p>${esc(resource.text)}</p>${external(resource.url,resource.title)}<small>${resource.published?'原文 '+resource.published+' · ':''}核对入口 2026-10-19</small><p class="city-caption">入境要求、能住多久和远程工作许可，要分别确认。下方签证方案也要对照自己的条件看。</p></div>`;
}
export function workspaceResourceMarkup(slug){
  if(slug!=='lisbon')return '';
  return `<article class="city-workspace city-workspace-resource"><div><h4>Second Home Mercado</h4><span>里斯本 · 使用规则</span></div><p>看好具体工位的使用规则，再判断能否满足平时的会议安排。</p><dl class="city-evidence-list"><dt>日票进入</dt><dd>运营方列出周一至周五 08:00–22:00；周末日票不开放。</dd><dt>会议条件</dt><dd>官网列有电话间；里斯本会员不含会议室额度。空位、预约与具体收费仍需向场地确认。</dd><dt>网络</dt><dd>商家介绍有Wi-Fi，我们没有在现场测试网速或会议质量。</dd></dl><p class="city-source">${external('https://secondhome.io/faqs/','运营方开放时间与使用规则')} · ${external('https://secondhome.io/coworking-space-lisbon/','里斯本场地与当前方案')}<span>核对 2026-10-19</span></p></article>`;
}
