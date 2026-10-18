// Small, credential-free feasibility probes. No crawling, D1 writes or ranking updates.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=join(root,'.data/china-source-probe');
const args=process.argv.slice(2);
assert.ok(args.every(arg=>arg==='--include-bulk'),'Only --include-bulk is supported. Outputs stay under web/.data.');
const sources=[
 ['costcompass-cities','https://costcompass.net/data/cities.json','json'],
 ['costcompass-prices','https://costcompass.net/data/prices.csv','csv'],
 ['dali-weekly','https://cif.mofcom.gov.cn/cif/html/market_scanner/2026/6/1781505968329.html','html'],
 ['dali-city-2024','https://www.yndali.gov.cn/dlsrmzf/c106688/pc/content/1983722742204174336/content_1983722742204174336.html','html'],
 ['nasa-dali','https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=100.21229&latitude=25.58474&start=2023&end=2025&format=JSON','json'],
 ['wikidata-anji','https://www.wikidata.org/wiki/Special:EntityData/Q551437.json','json'],
];
if(args.includes('--include-bulk'))sources.push(['geonames-cn','https://download.geonames.org/export/dump/CN.zip','zip']);
await mkdir(output,{recursive:true});
const results=[];
for(let offset=0;offset<sources.length;offset+=2){
  await Promise.all(sources.slice(offset,offset+2).map(async([id,url,extension])=>{
    const row={id,url,checked_at:new Date().toISOString()};
    try{
      const response=await fetch(url,{headers:{'User-Agent':'RemoteAI-Nomads source feasibility audit (+https://github.com/cubxxw/RemoteAI-Nomads)'},signal:AbortSignal.timeout(35000)});
      row.status=response.status;row.type=response.headers.get('content-type');
      if(!response.ok){await response.body?.cancel();throw Error('HTTP '+response.status);}
      const maxBytes=extension==='zip'?32*1024*1024:4*1024*1024;
      if(Number(response.headers.get('content-length'))>maxBytes){await response.body.cancel();throw Error('Response exceeds probe size limit');}
      const reader=response.body.getReader(),chunks=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw Error('Response exceeds probe size limit');}chunks.push(value);}
      const bytes=Buffer.concat(chunks,size);
      row.bytes=bytes.length;row.sha256=createHash('sha256').update(bytes).digest('hex');row.file=id+'.'+extension;
      await writeFile(resolve(output,row.file),bytes);
    }catch(error){row.error=error.message;}
    results.push(row);console.log(JSON.stringify(row));
  }));
}
results.sort((a,b)=>a.id.localeCompare(b.id));
await writeFile(join(output,'requests.json'),JSON.stringify(results,null,2)+'\n');
if(results.some(row=>row.error))process.exitCode=1;
