import test from 'node:test';
import assert from 'node:assert/strict';
import {readCityProfile} from '../src/city-profile.js';

const profile = {schemaVersion:1,slug:'pokhara',name:'博卡拉',landmarks:[{title:'费瓦湖',detail:'湖畔的日常风景'}],sources:[{title:'旅游局',url:'https://ntb.gov.np/en/pokhara'}]};
test('city pages load only their matching public editorial asset',async()=>{
  const requests=[];
  const env={ASSETS:{async fetch(request){requests.push(new URL(request.url).pathname);return Response.json(profile);}}};
  const result=await readCityProfile(env,'pokhara');
  assert.equal(result.name,'博卡拉');
  assert.equal(result.landmarks[0].title,'费瓦湖');
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(requests,['/city-profiles/pokhara.json']);
  for(const slug of ['../private','pokhara?token=secret','/pokhara',null])assert.equal(await readCityProfile(env,slug),null);
  assert.equal(requests.length,1);
});
test('missing, mismatched or damaged editorial assets leave the city tools available',async()=>{
  assert.equal(await readCityProfile({},'pokhara'),null);
  for(const response of [new Response('missing',{status:404}),new Response('damaged'),Response.json({...profile,slug:'other-city'}),new Response('x'.repeat(96001))]){
    assert.equal(await readCityProfile({ASSETS:{async fetch(){return response;}}},'pokhara'),null);
  }
  assert.equal(await readCityProfile({ASSETS:{async fetch(){throw Error('asset unavailable');}}},'pokhara'),null);
});
