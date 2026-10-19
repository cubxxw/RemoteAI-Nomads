import {sitePath} from './site-path.js';

// Proxy connections may outlive a closed browser connection. An explicit lease
// bounds abandoned model work without relying on transport disconnect signals.
export function runLiveness(run,{fetcher=fetch,every=setInterval,clear=clearInterval}={}){
 let timer;
 const post=(route,keepalive=false)=>fetcher(sitePath('/api/agent/'+route),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:run.id}),keepalive}).catch(()=>{});
 const stop=()=>{if(timer!==undefined){clear(timer);timer=undefined;}};
 return {
  start(enabled){if(!enabled||timer!==undefined||!run.id)return;timer=every(()=>post('heartbeat'),10000);},
  stop,
  // keepalive permits this authenticated same-origin request during navigation:
  // https://developer.mozilla.org/en-US/docs/Web/API/Request/keepalive
  abandon(){stop();if(run.id)post('cancel',true);run.controller.abort();},
 };
}
