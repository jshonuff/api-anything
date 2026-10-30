import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalServer} from './local-server.mjs';
import {buildArguments,validateSearch,executeSearch} from './local-search.mjs';
const later=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const valid=()=>({origin:'MCI',destination:'DEN',date:later(5),nonstop:true});
const fixture={status:'DEVELOPMENT_ONLY',candidates:[],statusByProvider:[],checkedAt:'synthetic'};
async function listen(search){
 const server=createLocalServer({search,token:'x'.repeat(64)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const addr='http://127.0.0.1:'+server.address().port;
 return {server,addr,stop:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
const post=(addr,body,token='x'.repeat(64),origin=addr)=>fetch(addr+'/api/search',{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Flight-Local-Token':token},
 body:JSON.stringify(body)
});
test('single airport pair and date validated before any provider execution',()=>{
 assert.equal(buildArguments(valid()).at(-1),'--fli');
 assert.ok(buildArguments(valid()).includes('--nonstop'));
 assert.throws(()=>validateSearch({...valid(),origin:'MCI;sh'}));
 assert.throws(()=>validateSearch({...valid(),destination:'MCI'}));
 assert.throws(()=>validateSearch({...valid(),date:'2026-13-40'}));
 assert.throws(()=>validateSearch({...valid(),origin:'MCI',unexpected:'yes'}));
 assert.throws(()=>validateSearch({...valid(),returnDate:later(3)}));
 assert.throws(()=>validateSearch({...valid(),nonstop:'true'}));
});
test('safe execFile argument array; no shell, only production-proven Python FLI switch',async()=>{
 let invoked=false;
 const r=await executeSearch(valid(),{run:async(executable,args,opts)=>{
  invoked=true;assert.equal(executable,process.execPath);
  assert.ok(args.includes('--fli'));assert.ok(!args.includes('--fli-js'));
  assert.ok(!opts.shell);assert.ok(opts.timeout>0);
  return {stdout:JSON.stringify(fixture)};
 }});
 assert.ok(invoked);assert.equal(r.status,'DEVELOPMENT_ONLY');
});
test('localhost session, static asset allowlist, CSP and refusal of invalid tokens',async()=>{
 let calls=0;
 const {addr,stop}=await listen(async()=>{calls++;return fixture;});
 try{
  const session=await fetch(addr+'/api/session');
  assert.equal(session.status,200);
  assert.equal(session.headers.get('cache-control'),'no-store');
  assert.ok(session.headers.get('content-security-policy').includes("default-src 'none'"));
  assert.equal((await session.json()).token.length,64);
  assert.equal((await fetch(addr+'/dashboard/')).status,200);
  assert.equal((await fetch(addr+'/compare-ui.mjs')).status,200);
  assert.equal((await fetch(addr+'/private.txt')).status,404);
  assert.equal((await post(addr,valid(),'bad')).status,403);
  assert.equal((await post(addr,valid(),'x'.repeat(64),'https://unrelated.example')).status,403);
  assert.equal((await post(addr,{...valid(),origin:'MCI; bad'})).status,400);
  assert.equal(calls,0);
  assert.equal((await post(addr,valid())).status,200);
  assert.equal(calls,1);
 }finally{await stop();}
});
test('bad host rejected to prevent DNS rebinding',async()=>{
 const {addr,stop}=await listen(async()=>fixture);
 try{
  const {request}=await import('node:http');
  const result=await new Promise((resolve,reject)=>{
   const x=request({hostname:'127.0.0.1',port:Number(new URL(addr).port),
    path:'/api/session',method:'GET',headers:{Host:'untrusted.example'}},
    res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
   x.on('error',reject);x.end();
  });
  assert.equal(result,403);
 }finally{await stop();}
});
test('one live search at a time; partial source errors do not result in sold-out claims',async()=>{
 let entered;
 const started=new Promise(resolve=>entered=resolve);
 let release;
 const pending=new Promise(resolve=>release=resolve);
 const {addr,stop}=await listen(async()=>{entered();await pending;return fixture;});
 try{
  const first=post(addr,valid());
  await started;
  const other=await post(addr,valid());
  assert.equal(other.status,429);
  release();
  const done=await first;
  assert.equal(done.status,200);
  assert.equal((await done.json()).status,'DEVELOPMENT_ONLY');
 }finally{release?.();await stop();}
});
test('provider exception returns UNKNOWN-like error without leaking runner output',async()=>{
 const {addr,stop}=await listen(async()=>{throw Error('private route details and tokens must not leak');});
 try{
  const r=await post(addr,valid());assert.equal(r.status,502);
  const text=await r.text();
  assert.ok(!text.includes('private route details'));
  assert.ok(text.includes('does not imply sold-out'));
 }finally{await stop();}
});
