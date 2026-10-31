#!/usr/bin/env node
// JC-SAVAGE FLIGHT-1: ONE entrypoint for multiple one-way legs or round trip.
// Existing known-working Frontier and Python FLI adapters are called as independent processes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareItinerary,validateItinerary} from './trip-core.mjs';
const exec=promisify(execFile);
const base=dirname(fileURLToPath(import.meta.url));
const file=process.argv[2];
if(!file||process.argv.length!==3){
 console.error('Usage: node tools/flight-unified/trip.mjs /private/path/itinerary.json');
 process.exit(2);
}
const spec=JSON.parse(await readFile(file,'utf8'));
const v=validateItinerary(spec);
let pauseFrontier=false,first=true;
const replies=[];
const problems=[];
for(const leg of v.legs){
 // Frontier should not receive bursts when multi-city legs are inspected together.
 if(!first&&!pauseFrontier)await new Promise(resolve=>setTimeout(resolve,20000));
 first=false;
 const args=[join(base,'run.mjs'),leg.from,leg.to,leg.date,'--fli',
   ...(v.nonstop?['--nonstop']:[]),...(pauseFrontier?['--no-frontier']:[])];
 try{
  const {stdout}=await exec(process.execPath,args,{timeout:200000,maxBuffer:5*1024*1024});
  const data=JSON.parse(stdout);
  replies.push(data);
  if(data.statusByProvider?.find(s=>s.provider==='frontier_booking')?.status==='PARTIAL_OR_UNKNOWN'){
   // Stop further Frontier calls after a likely block or unreadable booking page.
   pauseFrontier=true;
  }
  for(const p of data.problems??[])problems.push({leg,provider:p.provider,reason:p.reason});
 }catch{
  replies.push({status:'DEVELOPMENT_ONLY',candidates:[],statusByProvider:[
   {provider:'frontier_booking',status:'UNKNOWN',count:0},
   {provider:'google_flights_python',status:'UNKNOWN',count:0}
  ]});
  problems.push({leg,provider:'UNIFIED_LEG',reason:'UNAVAILABLE_OR_TIMEOUT'});
  pauseFrontier=true;
 }
}
let roundTripCashQuotes=[];
if(v.kind==='ROUND_TRIP'){
 try{
  const a=v.legs[0],b=v.legs[1];
  const {stdout}=await exec(process.env.FLI_PYTHON||'python3',[
   join(base,'fli_roundtrip_bridge.py'),a.from,a.to,a.date,b.date
  ],{timeout:150000,maxBuffer:1024*1024});
  roundTripCashQuotes=JSON.parse(stdout);
  if(!Array.isArray(roundTripCashQuotes))throw Error('Invalid round-trip source response');
 }catch{
  problems.push({provider:'google_flights_roundtrip',reason:'ROUND_TRIP_QUOTE_UNKNOWN'});
 }
}
const comparison=compareItinerary(spec,replies,{roundTripCashQuotes});
process.stdout.write(JSON.stringify({
 schema:'FLIGHT1_UNIFIED_TRIP_V1',
 checkedAt:new Date().toISOString(),trip:v,comparison,problems,
 execution:'READ_ONLY',goWildBookingConfirmation:'NOT_VERIFIED',
 sources:['frontier_booking','google_flights_python'],
 notice:'One-way fares are separate tickets; round-trip search is a different fare product.'
},null,2)+'\n');
