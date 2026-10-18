import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';
import {reserveConnected} from '../agent/admission.mjs';
test('disconnect while waiting for quota cannot start a later model task',async()=>{
 let releaseQuota,entered,closed,finished;let modelStarts=0;
 const waiting=new Promise(r=>entered=r),disconnected=new Promise(r=>closed=r),settled=new Promise(r=>finished=r);
 const gate=new Promise(r=>releaseQuota=r);
 const server=http.createServer(async(req,res)=>{res.once('close',closed);const connection=await reserveConnected(req,res,()=>{entered();return gate;});if(connection){modelStarts++;connection.release();res.end('unexpected');}finished();});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const request=http.get({hostname:'127.0.0.1',port:server.address().port,path:'/'});request.on('error',()=>{});
 try{await waiting;request.destroy();await disconnected;releaseQuota();await settled;assert.equal(modelStarts,0);}
 finally{request.destroy();server.close();await once(server,'close');}
});
