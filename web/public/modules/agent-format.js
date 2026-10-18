import { esc } from './ranking.js';
export function formatAgentAnswer(text, evidenceIds = []) {
  const allowed = new Set(evidenceIds);
  const inline = (value) => {
    let out = '', cursor = 0;
    for (const m of value.matchAll(/\*\*([^*\n]+)\*\*|\[(E\d+)\]/g)) {
      out += esc(value.slice(cursor,m.index));
      out += m[1] ? '<strong>'+esc(m[1])+'</strong>' : allowed.has(m[2]) ? '<button type="button" class="agent-citation" data-evidence-id="'+m[2]+'" aria-label="查看依据'+m[2]+'">'+m[2]+'</button>' : esc(m[0]);
      cursor=m.index+m[0].length;
    }
    return out+esc(value.slice(cursor));
  };
  const lines=String(text).split('\n'),blocks=[];
  const orderedLine=/^\s*(?:\d+[.)]\s+|\d+、\s*)/;
  for (let i=0;i<lines.length;) {
    const line=lines[i];
    if (!line.trim()) {i++;continue;}
    if (/^\s*#{1,4}\s+/.test(line)) {blocks.push('<h3>'+inline(line.replace(/^\s*#{1,4}\s+/,''))+'</h3>');i++;continue;}
    if (/^\s*\|.+\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')) {
      const cells=(s)=>s.trim().replace(/^\||\|$/g,'').split('|').slice(0,8).map(s=>s.trim());
      const header=cells(line);i+=2;const body=[];
      while(i<lines.length&&/^\s*\|.+\|\s*$/.test(lines[i])){const row=cells(lines[i++]);if(body.length<24)body.push('<tr>'+header.map((_,n)=>'<td>'+inline(row[n]||'')+'</td>').join('')+'</tr>');}
      blocks.push('<div class="agent-table-scroll" tabindex="0" role="group" aria-label="预算或对比明细"><table><thead><tr>'+header.map(s=>'<th scope="col">'+inline(s)+'</th>').join('')+'</tr></thead><tbody>'+body.join('')+'</tbody></table></div>');continue;
    }
    const unordered=/^\s*[-*]\s+/.test(line),ordered=orderedLine.test(line);
    if(unordered||ordered){const type=unordered?'ul':'ol',re=unordered?/^\s*[-*]\s+/:orderedLine;const items=[];while(i<lines.length&&re.test(lines[i]))items.push('<li>'+inline(lines[i++].replace(re,''))+'</li>');blocks.push('<'+type+'>'+items.join('')+'</'+type+'>');continue;}
    const paragraph=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!/^\s*(?:#{1,4}\s|[-*]\s|\|)/.test(lines[i])&&!orderedLine.test(lines[i]))paragraph.push(lines[i++]);
    blocks.push('<p>'+inline(paragraph.join('\n'))+'</p>');
  }
  return blocks.join('');
}
