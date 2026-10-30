#!/usr/bin/env node
// One-off, deliberately redacted diagnostics. DOES NOT call the verified GoWild checker.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const base=dirname(fileURLToPath(import.meta.url));
const [provider,origin,destination,date]=process.argv.slice(2);
const validCode=s=>/^[A-Z]{3}$/.test(s??'');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s??'');
if(!['fli','eric'].includes(provider)||!validCode(origin)||!validCode(destination)||!validDate(date)) {
 console.error('usage: node diagnose.mjs fli|eric ORIGIN DEST YYYY-MM-DD');
 process.exit(2);
}
const classification=(name,msg='',code='')=>{
 const t=String(msg).toLowerCase();
 if(/429|rate.?limit|throttl/.test(t))return 'RATE_LIMITED';
 if(/403|forbidden|access denied/.test(t))return 'FORBIDDEN';
 if(/404|not found/.test(t))return 'NOT_FOUND';
 if(/401|unauthoriz/.test(t))return 'UNAUTHORIZED';
 if(/500|502|503|504|server error/.test(t))return 'SERVER_ERROR';
 if(/timeout|timed out|abort/.test(t))return 'TIMEOUT';
 if(/token|auth/i.test(name)||/token|authentication/.test(t))return 'AUTH';
 if(/schema|format|decode|parse|invalid/.test(t))return 'PARSE_OR_SCHEMA';
 if(/network|fetch|connection|reset|ssl|certificate|proxy|socket/.test(t))return 'NETWORK';
 return 'UNCLASSIFIED';
};
function print(x){console.log(JSON.stringify(x));}
if(provider==='fli') {
 let stage='IMPORT';
 try {
  const {Airport,FlightSearchFilters,FlightSegment,MaxStops,SeatType,SortBy,SearchFlights,Client,parseFirstWrbPayload}=await import('fli-js');
  stage='FILTER';
  const filters=new FlightSearchFilters({passenger_info:{adults:1,children:0,infants_in_seat:0,infants_on_lap:0},
   flight_segments:[new FlightSegment({departure_airport:[[[Airport[origin]??origin,0]]],
     arrival_airport:[[[Airport[destination]??destination,0]]],travel_date:date})],
   seat_type:SeatType.ECONOMY,stops:MaxStops.NON_STOP,sort_by:SortBy.CHEAPEST,
   bags:{checked_bags:0,carry_on:false}});
  stage='LIVE_FETCH';
  const diagnostics={};
  const oneFetch=async (url,opts)=>{
   const response=await fetch(url,opts);
   const body=await response.clone().text();
   diagnostics.httpStatus=response.status;
   diagnostics.contentType=(response.headers.get('content-type')??'unknown').split(';')[0];
   diagnostics.format=body.trimStart().startsWith('<')?'HTML':body.includes('wrb.fr')?'GOOGLE_WRB':'OTHER';
   diagnostics.bodyLengthBucket=body.length>100000?'LARGE':body.length>10000?'MEDIUM':'SMALL';
   const inner=parseFirstWrbPayload(body);
   diagnostics.hasParsedChunk=inner!==null;
   diagnostics.innerIsArray=Array.isArray(inner);
   diagnostics.block2IsArray=Array.isArray(inner?.[2]?.[0]);
   diagnostics.block3IsArray=Array.isArray(inner?.[3]?.[0]);
   return response;
  };
  const results=await new SearchFlights(new Client({fetchImpl:oneFetch,retries:1})).search(filters,{currency:'USD',topN:5});
  print({provider,stage,status:Array.isArray(results)&&results.length?'RETRIEVED':'EMPTY_OR_NULL',
    count:Array.isArray(results)?results.length:0,diagnostics});
 }catch(e){
  const issuePaths=Array.isArray(e.issues)?e.issues.map(i=>i.path?.join('.')||'root').slice(0,5):[];
  print({provider,stage,status:'ERROR',name:e?.name??'Error',code:typeof e?.code==='string'?e.code:null,
   class:classification(e?.name,e?.message,e?.code),issuePaths});
 }
} else {
 const stage='PYTHON_PROVIDER';
 try {
  const {stdout}=await exec(process.env.FLIGHT_PYTHON||'python3',
   [join(base,'eric_diagnostic.py'),origin,destination,date],{timeout:70000,maxBuffer:100000});
  const x=JSON.parse(stdout); print({provider,stage,...x});
 }catch(e){
  print({provider,stage,status:'ERROR',name:e?.name??'Error',exitCode:e?.code??null,
   class:classification(e?.name,e?.stderr??e?.message,e?.code)});
 }
}
