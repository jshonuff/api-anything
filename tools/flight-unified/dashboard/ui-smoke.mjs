import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8765/dashboard/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('#controls').isVisible(),false);
 await page.locator('#demo').click();
 await page.getByText('SYNTHETIC DEMO — NO REAL PRICES').waitFor();
 assert.equal(await page.locator('.card').count(),2);
 assert.equal(await page.locator('.fare').count(),5);
 await page.locator('#source').selectOption('frontier_booking');
 assert.equal(await page.locator('.card').count(),1);
 await page.locator('#source').selectOption('all');
 const first=page.locator('.card').first().locator('.fare').first();
 await first.locator('input[type=number]').fill('27.50');
 await first.locator('input[type=checkbox]').check();
 await first.locator('button').click();
 await first.getByText('Manual difference:',{exact:false}).waitFor();
 // Import an entirely synthetic FLIGHT-1 private Fare Watch export into the same page.
 const emailTime=new Date(Date.now()-60000).toISOString();
 const watchFixture={format:'FLIGHT1_WATCH_EXPORT_V1',exported_at:emailTime,
  watch_destinations:['AUS','BRI','STT'],trips:[{trip_id:'TRP-016',status:'CANCELED'}],
  observations:[{source_provider:'GOING_GMAIL',currency:'USD',price_amount:484,
   observed_at:emailTime,verification_state:'SOURCE_VERIFIED',deal_status:'OBSERVED',
   source_url:'https://mail.google.com/mail/u/0/#all/synthetic',
   metadata:{gmail_message_id:'synthetic',origin:'MCI',destination:'STT',travel_window:'Nov-Feb'}}]};
 await page.locator('#watchFile').setInputFiles({name:'fare-watch-test.json',
   mimeType:'application/json',buffer:Buffer.from(JSON.stringify(watchFixture))});
 await page.getByText('3 watched destination airports',{exact:false}).waitFor();
 assert.equal(await page.locator('#watchRows tr').count(),3);
 await page.locator('#watchFilter').fill('STT');
 assert.equal(await page.locator('#watchRows tr').count(),1);
 assert.ok((await page.locator('#watchRows').innerText()).includes('EMAIL ONLY'));
 assert.ok((await page.locator('#watchSummary').innerText()).includes('0 live bookable prices verified'));
 await page.locator('#clearWatch').click();
 assert.equal(await page.locator('#watchRows tr').count(),0);
 assert.equal(errors.length,0,errors.join('; '));
 console.log(JSON.stringify({ui:'PASS',demo:'SYNTHETIC',cards:2,matchedSources:true,checkout:'MANUAL_ONLY',errors:0}));
}finally{await browser.close();}
