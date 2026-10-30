import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createLocalServer} from './local-server.mjs';
import {createTailnetGateway,validateTailnetConfig} from './tailnet-gateway.mjs';

const host='flight-1.private-tail.ts.net';
const user='private-owner@example.org';
const validDate=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
const fixture={status:'DEVELOPMENT_ONLY',origin:'MCI',destination:'DEN',date:validDate,
 returnDate:null,candidates:[],statusByProvider:[{provider:'frontier_booking',status:'UNKNOWN',count:0}]};
const payload=JSON.stringify({origin:'MCI',destination:'DEN',date:validDate,nonstop:true});
async function listening(server){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return server.address().port;
}
async function withServers(callback){
 let calls=0;
 const backend=createLocalServer({search:async()=>{calls++;return fixture},token:'X'.repeat(64)});
 const backendPort=await listening(backend);
 const gateway=createTailnetGateway({hostname:host,user,backendPort,gatewayPort:8766});
 // Fixed test gateway port avoids ambiguity in explicit forwarded-host case.
 await new Promise(resolve=>gateway.listen(8766,'127.0.0.1',resolve));
 try{await callback({port:8766,calls:()=>calls});}
 finally{
  await new Promise(resolve=>gateway.close(resolve));
  await new Promise(resolve=>backend.close(resolve));
 }
}
function request({port,method='GET',path='/api/session',hostname=host,login=user,
                  origin,forwardedHost,forwardedProto='https',token,body}){
 const headers={Host:hostname,'Tailscale-User-Login':login,'X-Forwarded-Proto':forwardedProto};
 if(forwardedHost)headers['X-Forwarded-Host']=forwardedHost;
 if(origin!==undefined)headers.Origin=origin;
 if(token!==undefined)headers['X-Flight-Local-Token']=token;
 if(body!==undefined){headers['Content-Type']='application/json';headers['Content-Length']=Buffer.byteLength(body);}
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,method,path,headers},res=>{
   const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,
     headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error',reject);
  req.end(body);
 });
}
test('fail-closed configuration, no wildcard identities or non-tailnet hosts',()=>{
 assert.throws(()=>validateTailnetConfig({hostname:'example.com',user,backendPort:8765,gatewayPort:8766}));
 assert.throws(()=>validateTailnetConfig({hostname:host,user:'*',backendPort:8765,gatewayPort:8766}));
 assert.throws(()=>validateTailnetConfig({hostname:host,user,backendPort:8765,gatewayPort:8765}));
 assert.equal(validateTailnetConfig({hostname:host,user,backendPort:8765,gatewayPort:8766}).hostname,host);
});
test('missing identity, wrong user, wrong host, and insecure proxy denied before local session',async()=>{
 await withServers(async({port,calls})=>{
  for(const r of [
   {login:''},{login:'other-user@example.org'},
   {hostname:'evil.example.com'},
   {forwardedProto:'http'},
   {hostname:'127.0.0.1:8766',forwardedHost:'wrong.private-tail.ts.net'}
  ]){
   const response=await request({port,...r});
   assert.equal(response.status,403,response.body);
   assert.ok(!response.body.includes('X'.repeat(64)));
  }
  assert.equal(calls(),0);
 });
});
test('identity-checked mobile requests proxy only whitelisted assets and authenticated search',async()=>{
 await withServers(async({port,calls})=>{
  const session=await request({port});
  assert.equal(session.status,200,session.body);
  assert.equal(JSON.parse(session.body).token,'X'.repeat(64));
  assert.equal((await request({port,path:'/dashboard/'})).status,200);
  assert.equal((await request({port,path:'/compare-ui.mjs'})).status,200);
  assert.equal((await request({port,path:'/hidden.txt'})).status,404);
  assert.equal((await request({port,method:'DELETE',path:'/api/search'})).status,404);
  assert.equal((await request({port,method:'POST',path:'/api/search',
   origin:'https://hostile.example',body:payload,token:'X'.repeat(64)})).status,403);
  assert.equal((await request({port,method:'POST',path:'/api/search',
   origin:'https://'+host,body:payload,token:'WRONG'})).status,403);
  const result=await request({port,method:'POST',path:'/api/search',origin:'https://'+host,
    body:payload,token:'X'.repeat(64)});
  assert.equal(result.status,200,result.body);
  assert.equal(JSON.parse(result.body).status,'DEVELOPMENT_ONLY');
  assert.equal(calls(),1);
 });
});
test('Serve-style forwarded localhost host is accepted only with matching identity and forwarded host',async()=>{
 await withServers(async({port})=>{
  const ok=await request({port,hostname:'127.0.0.1:8766',forwardedHost:host});
  assert.equal(ok.status,200,ok.body);
  const bad=await request({port,hostname:'127.0.0.1:8766',forwardedHost:host,login:'bad@example.org'});
  assert.equal(bad.status,403);
 });
});
test('oversized payload denied before it reaches flight provider',async()=>{
 await withServers(async({port,calls})=>{
  const x=await request({port,method:'POST',path:'/api/search',origin:'https://'+host,
    token:'X'.repeat(64),body:JSON.stringify({data:'a'.repeat(2050)})});
  assert.equal(x.status,413,x.body);assert.equal(calls(),0);
 });
});
