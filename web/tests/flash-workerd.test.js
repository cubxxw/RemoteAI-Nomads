import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pkg from 'miniflare';
const {Miniflare,convertV4MiniflareOptions}=pkg;
test('Flash client works in the actual Workers runtime rather than only Node',async()=>{
  const script=await readFile(new URL('../agent/flash-client.mjs',import.meta.url),'utf8')+`
  export default {async fetch(){try{
    const client=new FlashSession({apiKey:'fixture',prompt:'Test',definitions:[],signal:new AbortController().signal,onRequest(){},onUsage(){},execute(){}});
    return Response.json(await client.run('Hello'));
  }catch(error){return Response.json({name:error.name,message:error.message});}}};`;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-17',
    outboundService:async()=>Response.json({choices:[{message:{role:'assistant',content:'Fixture answer',reasoning_content:'private'}}],usage:{}})}));
  try{assert.deepEqual(await (await mf.dispatchFetch('https://fixture.test/')).json(),{finalResponse:'Fixture answer'});}
  finally{await mf.dispose();}
});
