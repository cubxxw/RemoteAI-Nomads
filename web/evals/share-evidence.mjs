import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';
export async function shareEvidence(root){
 const files=['public/modules/share-model.js','public/modules/share-render.js','public/modules/share-guide-model.js','public/modules/share-content.js','public/modules/share-ui.js','public/share.css','public/published-pages/rankings.json','evals/share-fixtures.mjs'];
 const hash=createHash('sha256');for(const file of files){hash.update(file);hash.update(await readFile(resolve(root,file)));}
 return {sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint:hash.digest('hex'),sourceFiles:files};
}
