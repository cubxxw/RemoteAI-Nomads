import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildPublicPages} from './build-public-pages.mjs';
const configPath='wrangler.production.jsonc';
let config;
try { config=JSON.parse(await readFile(configPath,'utf8')); }
catch(error) { if(error.code==='ENOENT') throw new Error('Copy wrangler.production.example.jsonc to wrangler.production.jsonc and configure your deployment first.'); throw error; }
// Rebuild the public fallback before hashing, so every release includes its
// current components and passes the published-only privacy gate first.
await buildPublicPages({origin:config.vars.SITE_ORIGIN});
const hash=createHash('sha256');
async function add(path){
  const entries=await readdir(path,{withFileTypes:true});
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path+'/'+entry.name;
    if(entry.isDirectory())await add(file);
    else if(entry.isFile()){hash.update(file+'\0');hash.update(await readFile(file));}
  }
}
for(const path of ['src','agent','public','migrations','deploy'])await add(path);
for(const file of ['package.json','package-lock.json','.dockerignore']){
  hash.update(file+'\0');hash.update(await readFile(file));
}
hash.update(config.vars.SITE_ORIGIN);
if(process.argv.includes('--with-agent') || process.argv.includes('--stage-agent')){
  config.services=[{binding:'AGENT_SERVICE',service:'remoteai-nomads-agent'}];
  config.vars.PUBLIC_AGENT=process.argv.includes('--with-agent')?'true':'false';
  config.triggers={crons:['15 2 * * *','15 2 15 * *']};
  config.limits={cpu_ms:30000};
}
if(process.argv.includes('--native-agent') || process.argv.includes('--stage-native-agent')){
  delete config.services;
  delete config.limits;
  config.durable_objects={bindings:[{name:'NOMAD_AGENT',class_name:'NomadAgent'}]};
  config.migrations=[{tag:'nomad-flash-v1',new_sqlite_classes:['NomadAgent']}];
  config.vars.DEEPSEEK_MODEL='deepseek-flash';
  config.vars.PUBLIC_AGENT=process.argv.includes('--native-agent')?'true':'false';
}
hash.update(JSON.stringify({...config,vars:{...config.vars,RELEASE_ID:undefined}}));
const sourceHash=hash.digest('hex');
config.vars.RELEASE_ID='nomads-'+sourceHash.slice(0,16);
await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
await mkdir('.data/deploy',{recursive:true});
await writeFile('.data/deploy/manifest.json',JSON.stringify({release_id:config.vars.RELEASE_ID,source_sha256:sourceHash,created_at:new Date().toISOString(),origin:config.vars.SITE_ORIGIN,agent:config.vars.PUBLIC_AGENT==='true'},null,2)+'\n');
console.log(JSON.stringify({release_id:config.vars.RELEASE_ID,origin:config.vars.SITE_ORIGIN,agent:config.vars.PUBLIC_AGENT==='true'}));
