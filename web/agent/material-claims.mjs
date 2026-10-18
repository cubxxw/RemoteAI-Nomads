// Coverage is not truth. Include prose, tables and formulas, without guessing which
// words make a claim important. Group consecutive sentences instead of dropping a tail.
export function materialClaims(answer) {
 const parts=String(answer).replace(/\*\*/g,'').split(/\n+/).filter(line=>!/^\s*\|?[\s:|\-]+\|?\s*$/.test(line))
  .flatMap(line=>(line.replace(/^\s*#{1,6}\s+/,'').match(/[^。！？；]+[。！？；]?/g)||[]))
  .map(text=>text.trim()).filter(text=>text.length>0&&!/[？?]$/.test(text));
 if(!parts.length&&String(answer).trim())parts.push(String(answer).trim());
 const width=Math.max(1,Math.ceil(parts.length/24)),groups=[];
 for(let i=0;i<parts.length;i+=width)groups.push(parts.slice(i,i+width).join('\n'));
 return groups.map((text,i)=>({id:'C'+(i+1),text}));
}
export function requireClaimCoverage(check, claims) {
 if(!Array.isArray(check?.checks))throw Error('INCOMPLETE_CLAIM_AUDIT');
 const ids=check.checks.map(c=>c.claim_id);
 if(ids.length!==claims.length||new Set(ids).size!==ids.length||claims.some(c=>!ids.includes(c.id))||ids.some(id=>!claims.some(c=>c.id===id)))throw Error('INCOMPLETE_CLAIM_AUDIT');
 // Bind the reviewed original on the server; a model cannot replace half a claim
 // with an easier paraphrase and present that paraphrase as the audited text.
 const originals=new Map(claims.map(c=>[c.id,c.text]));
 return {...check,checks:check.checks.map(c=>({...c,claim:originals.get(c.claim_id)}))};
}
