import {parseAgentEvent} from '../public/modules/agent-sse.js';
// Keep completed events even if a later network read fails. In particular the
// run id must survive so the operator can inspect the real server outcome.
export async function consumeEvents(response, onEvent) {
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
  const flush=()=>{
    let end;
    while((end=pending.indexOf('\n\n'))>=0){
      const block=pending.slice(0,end);pending=pending.slice(end+2);
      const event=parseAgentEvent(block);
      if(event)onEvent(event.type,event.data);
    }
  };
  try {while(true){const {done,value}=await reader.read();if(done)break;pending=(pending+decoder.decode(value,{stream:true})).replaceAll('\r\n','\n');flush();}pending+=decoder.decode();flush();}
  finally{reader.releaseLock();}
}
