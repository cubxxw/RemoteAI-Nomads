// Split on the SSE wire newline, not JavaScript's broader Unicode line rules.
export function parseAgentEvent(block) {
  let type;const data=[];
  for(const line of block.split('\n')){
    if(line.startsWith('event:'))type=line.slice(6).trim();
    if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
  }
  return type&&data.length?{type,data:JSON.parse(data.join('\n'))}:null;
}
