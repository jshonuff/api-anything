// Single-route, rate-constrained local search request. Never executes a shell.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const RUNNER=fileURLToPath(new URL('./run.mjs',import.meta.url));
const DATE=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const IATA=/^[A-Z]{3}$/;
function validDate(x){
 if(!DATE.test(x??''))return false;
 const d=new Date(x+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
}
export function validateSearch(value,now=new Date()){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_SEARCH');
 const keys=Object.keys(value);
 if(keys.some(k=>!['origin','destination','date','returnDate','nonstop'].includes(k)))throw Error('UNSUPPORTED_PARAMETER');
 const origin=value.origin,destination=value.destination,date=value.date,returnDate=value.returnDate||null;
 if(typeof origin!=='string'||typeof destination!=='string'||!IATA.test(origin)||!IATA.test(destination)||origin===destination)throw Error('INVALID_AIRPORT');
 if(typeof date!=='string'||!validDate(date)||(returnDate&&(typeof returnDate!=='string'||!validDate(returnDate))))throw Error('INVALID_DATE');
 if(value.nonstop!==undefined&&typeof value.nonstop!=='boolean')throw Error('INVALID_NONSTOP');
 const today=now.toISOString().slice(0,10);
 const max=new Date(Date.parse(today+'T00:00:00Z')+366*86400000).toISOString().slice(0,10);
 if(date<today||date>max||(returnDate&&(returnDate<date||returnDate>max)))throw Error('DATE_OUT_OF_RANGE');
 return {origin,destination,date,returnDate,nonstop:value.nonstop===true};
}
export function buildArguments(value){
 const x=validateSearch(value);
 return [RUNNER,x.origin,x.destination,x.date,...(x.returnDate?['--return',x.returnDate]:[]),
  ...(x.nonstop?['--nonstop']:[]),'--fli'];
}
export async function executeSearch(input,{run=exec}={}){
 const args=buildArguments(input);
 const {stdout}=await run(process.execPath,args,{timeout:330000,maxBuffer:4000000,windowsHide:true,
  env:process.env});
 const result=JSON.parse(stdout);
 if(result?.status!=='DEVELOPMENT_ONLY'||!Array.isArray(result.candidates)||!Array.isArray(result.statusByProvider))
  throw Error('INVALID_PROVIDER_OUTPUT');
 return result;
}
