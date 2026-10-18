// HTTP-only agent loop. It does not import DSH, a filesystem, or a shell.
export class FlashSession {
  constructor({apiKey,prompt,definitions,terminal,signal,onRequest,onUsage,execute,fetcher=fetch,effort=terminal==='submit_check'?'none':'low'}) {
    Object.assign(this,{apiKey,definitions,terminal,signal,onRequest,onUsage,execute,fetcher,effort});
    this.messages=[{role:'system',content:prompt}];
    this.allowed=new Set(definitions.map(d=>d.name));
  }
  async run(input) {
    this.messages.push({role:'user',content:input});
    while(true) {
      this.signal.throwIfAborted();
      this.onRequest();
      const response=await this.fetcher.call(globalThis,'https://api.deepseek.com/chat/completions',{
        method:'POST',headers:{Authorization:'Bearer '+this.apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({model:'deepseek-flash',messages:this.messages,tools:this.definitions.map(d=>({type:'function',function:d})),
          thinking:{type:this.effort==='none'?'disabled':'enabled'},reasoning_effort:this.effort,max_tokens:16384}),signal:this.signal,
      });
      if(!response.ok) {
        await response.body?.cancel();
        throw Error(response.status===401?'MODEL_AUTH_FAILED':response.status===402?'MODEL_BALANCE_REQUIRED':response.status===429?'MODEL_RATE_LIMIT':'MODEL_UNAVAILABLE');
      }
      const payload=await response.json();
      this.signal.throwIfAborted();
      this.onUsage(payload.usage||{});
      const choice=payload.choices?.[0],message=choice?.message;
      if(!message || message.role!=='assistant')throw Error('INVALID_MODEL_RESPONSE');
      if(choice.finish_reason==='length')throw Error('MODEL_OUTPUT_LIMIT');
      // DeepSeek requires the complete reasoning_content on later tool turns.
      // It stays in this session and never enters SSE, saved traces, or logs.
      this.messages.push({role:'assistant',content:message.content??null,reasoning_content:message.reasoning_content??'',...(message.tool_calls?.length?{tool_calls:message.tool_calls}:{})});
      const calls=message.tool_calls||[];
      if(!calls.length)return {finalResponse:message.content||''};
      let submitted=false;
      for(const call of calls) {
        this.signal.throwIfAborted();
        let result;
        if(call.type!=='function'||!this.allowed.has(call.function?.name))result={error:{code:'UNAUTHORIZED_TOOL',message:'只能调用本次提供的只读工具。'}};
        else {
          let args;
          try{args=JSON.parse(call.function.arguments);}catch{result={error:{code:'INVALID_TOOL_JSON',message:'参数不是有效JSON，请修正后重试。'}};}
          if(!result) {
            result=await this.execute(call.function.name,args);
            if(call.function.name===this.terminal&&result?.received===true)submitted=true;
          }
        }
        this.messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
      }
      if(submitted)return {finalResponse:message.content||''};
    }
  }
  close(){this.messages=[];this.apiKey=null;}
}
