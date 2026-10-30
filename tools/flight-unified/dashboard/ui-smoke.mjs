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
 assert.equal(errors.length,0,errors.join('; '));
 console.log(JSON.stringify({ui:'PASS',demo:'SYNTHETIC',cards:2,matchedSources:true,checkout:'MANUAL_ONLY',errors:0}));
}finally{await browser.close();}
