import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright';
import {createLocalServer} from './local-server.mjs';
import {createTailnetGateway} from './tailnet-gateway.mjs';

const host='flight-1.private-tail.ts.net';
const user='owner@example.org';
const date=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
let requests=0;
const backend=createLocalServer({search:async input=>{
 requests++;
 assert.equal(input.origin,'MCI');
 assert.equal(input.destination,'DEN');
 return {status:'DEVELOPMENT_ONLY',isDemonstration:true,origin:'MCI',destination:'DEN',date,
  returnDate:null,statusByProvider:[{provider:'frontier_booking',status:'OBSERVED',count:1}],
  checkedAt:new Date().toISOString(),candidates:[{
   provider:'frontier_booking',flight:'FR2549',origin:'MCI',destination:'DEN',date,
   departure:date+'T07:00:00',arrival:date+'T08:05:00',stops:0,currency:'USD',
   goWildStatus:'FARE_OBSERVED',fares:{gowild:25,standard:85}
  }]};
 }});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
const gateway=createTailnetGateway({
 hostname:host,user,backendPort:backend.address().port,gatewayPort:8766
});
await new Promise(resolve=>gateway.listen(8766,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const problems=[];page.on('pageerror',err=>problems.push(err.message));
 // Simulated Tailscale Serve identity injection and HTTPS origin. No real tailnet involved.
 await page.route('https://'+host+'/**',async route=>{
  const original=route.request();
  const url=new URL(original.url());
  const rawBody=original.postDataBuffer();
  const headers={Host:host,'Tailscale-User-Login':user,'X-Forwarded-Proto':'https'};
  if(original.method()==='POST'){
   headers.Origin='https://'+host;
   headers['Content-Type']='application/json';
   headers['Content-Length']=String(rawBody?.length??0);
   const token=original.headers()['x-flight-local-token'];
   if(token)headers['X-Flight-Local-Token']=token;
  }
  try {
   const upstream=await new Promise((resolve,reject)=>{
    const call=http.request({hostname:'127.0.0.1',port:8766,method:original.method(),
      path:url.pathname+url.search,headers},response=>{
      const chunks=[];response.on('data',c=>chunks.push(c));
      response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks),
        type:response.headers['content-type']??'application/json'}));
    });
    call.on('error',reject);call.end(rawBody??undefined);
   });
   await route.fulfill({status:upstream.status,body:upstream.body,contentType:upstream.type});
  }catch(err){problems.push(String(err));await route.abort();}
 });
 await page.goto('https://'+host+'/dashboard/',{waitUntil:'networkidle'});
 await page.locator('#searchOrigin').fill('MCI');
 await page.locator('#searchDestination').fill('DEN');
 await page.locator('#searchDate').fill(date);
 await page.locator('#searchButton').click();
 await page.getByText('SYNTHETIC DEMO — NO REAL PRICES').waitFor();
 assert.equal(await page.locator('.card').count(),1);
 assert.equal(requests,1);
 assert.deepEqual(problems,[]);
 console.log(JSON.stringify({mobileViewport:'390x844',privateGateway:'SIMULATED',
  mobileSearch:'PASS',serverIdentity:'ENFORCED',actualTailnetDeployment:false,
  liveAirlineCalls:0,errors:0}));
}finally{
 await browser.close();
 await new Promise(resolve=>gateway.close(resolve));
 await new Promise(resolve=>backend.close(resolve));
}
