// Browser test exercises the LOCAL search API with a fake provider. Never contacts airlines.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createLocalServer} from './local-server.mjs';
const date=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
let calls=0;
const search=async params=>{
 calls++;
 assert.equal(params.origin,'MCI');assert.equal(params.destination,'DEN');
 assert.equal(params.date,date);assert.equal(params.nonstop,true);
 return {status:'DEVELOPMENT_ONLY',origin:'MCI',destination:'DEN',date,returnDate:null,
  checkedAt:new Date().toISOString(),isDemonstration:true,
  statusByProvider:[{provider:'frontier_booking',status:'OBSERVED',count:1},
   {provider:'google_flights_python',status:'REFERENCE_ONLY',count:1}],
  candidates:[{provider:'frontier_booking',flight:'FR135',origin:'MCI',destination:'DEN',
   date,departure:date+'T13:00:00',arrival:date+'T14:20:00',currency:'USD',stops:0,
   goWildStatus:'FARE_OBSERVED',fares:{gowild:20,standard:80}}]};
};
const server=createLocalServer({search});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/dashboard/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);
 await page.locator('#searchOrigin').fill('MCI');
 await page.locator('#searchDestination').fill('DEN');
 await page.locator('#searchDate').fill(date);
 await page.locator('#searchNonstop').check();
 await page.locator('#searchButton').click();
 await page.getByText('SYNTHETIC DEMO — NO REAL PRICES').waitFor();
 assert.equal(await page.locator('.card').count(),1);
 assert.equal(calls,1);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({localSearchUI:'PASS',provider:'MOCK_ONLY',cards:1,networkRequestsToAirlines:0,errors:0}));
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
