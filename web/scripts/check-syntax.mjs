import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const files=[];for(const dir of ['src','public','public/modules','agent','scripts','evals','tests'])for(const file of await readdir(dir))if(/\.(js|mjs)$/.test(file))files.push(dir+'/'+file);
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
console.log('Syntax checked: '+files.length+' source, agent, evaluation and verification files.');
