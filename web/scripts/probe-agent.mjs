import {writeFileSync} from 'node:fs';
const question=process.argv[2]||'按旧月基准，清迈住45天大约多少钱？机票押金算进去了吗？';
const response=await fetch('http://127.0.0.1:8787/api/agent/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});
const text=await response.text();writeFileSync('.data/agent-probe.txt',text);console.log(JSON.stringify({status:response.status,result:text.slice(-2500)}));
