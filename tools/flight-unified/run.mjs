#!/usr/bin/env node
// Development-only local orchestrator. Read-only, fail-open by provider, never writes to Supabase.
// Usage: node tools/flight-unified/run.mjs DFW DEN 2026-11-05 [--return 2026-11-09] [--fli] [--eric] [--nonstop]
// Requires Node >= 22 and optional fli-js / installed ericchansen/flights.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeFrontier,normalizeEric,normalizeFli,summarizeSources} from './normalize.mjs';
const exec=promisify(execFile);
const base=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
const [origin,destination,date]=args;
const flagValue=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
const returnDate=flagValue('--return');
const codeOk=s=>/^[A-Z]{3}$/.test(s??'');
function dateOk(s) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s??'')) return false;
 const d=new Date(s+'T00:00:00Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===s;
}
if(!codeOk(origin)||!codeOk(destination)||origin===destination||!dateOk(date)||(returnDate&&!dateOk(returnDate))) {
 console.error('Usage: node run.mjs ORIGIN DEST YYYY-MM-DD [--return YYYY-MM-DD] [--fli] [--eric] [--nonstop]');
 process.exit(2);
}
if(returnDate && returnDate<date) { console.error('Return must be on or after departure.'); process.exit(2); }
const routes=[{from:origin,to:destination,date},...(returnDate?[{from:destination,to:origin,date:returnDate}]:[])];
const timeout=90000;
const normalized=[];
const problems=[];
const temp=await mkdtemp(join(tmpdir(),'flight-unified-'));
try {
 // The known-good script executes untouched and is the sole source of observed GoWild fares.
 try {
  const script=resolve(base,'../gowild-check/gowild-check.js');
  const cli=[script,origin,destination,date,...(returnDate?['--return',returnDate]:[]),...(args.includes('--nonstop')?['--nonstop']:[])];
  await exec(process.execPath,cli,{cwd:temp,timeout:timeout+ (returnDate?30000:0),maxBuffer:2*1024*1024});
  const out=join(temp,'results-'+origin+'-'+date+(returnDate?'-rt-'+returnDate:'')+'.json');
  const report=JSON.parse(await readFile(out,'utf8'));
  normalized.push(...normalizeFrontier(report));
 }catch(e) {
  problems.push({provider:'frontier_booking',status:'UNKNOWN',reason:e.killed?'TIMEOUT_OR_RATE_LIMIT':'REQUEST_OR_PARSE_FAILURE'});
  for(const r of routes)normalized.push({provider:'frontier_booking',origin:r.from,destination:r.to,date:r.date,status:'UNKNOWN',itineraries:[]});
 }
 // Optional Google Flights provider. A failure here cannot erase observed Frontier fares.
 if(args.includes('--fli')) for(const r of routes) try {
  const {Airport,FlightSearchFilters,FlightSegment,MaxStops,SeatType,SortBy,SearchFlights}=await import('fli-js');
  const flt=new FlightSearchFilters({
   passenger_info:{adults:1,children:0,infants_in_seat:0,infants_on_lap:0},
   flight_segments:[new FlightSegment({
    departure_airport:[[[Airport[r.from]??r.from,0]]],
    arrival_airport:[[[Airport[r.to]??r.to,0]]],
    travel_date:r.date})],
   seat_type:SeatType.ECONOMY,
   stops:args.includes('--nonstop')?MaxStops.NON_STOP:MaxStops.ANY,
   sort_by:SortBy.CHEAPEST
  });
  const flights=await new SearchFlights().search(flt,{currency:'USD'});
  if(!flights)throw new Error('No confirmed result');
  normalized.push(normalizeFli(flights,{origin:r.from,destination:r.to,date:r.date,checkedAt:new Date().toISOString()}));
 }catch(e) {
  problems.push({provider:'google_flights',status:'UNKNOWN',reason:'PROVIDER_UNAVAILABLE_OR_NO_RESULTS'});
  normalized.push({provider:'google_flights',origin:r.from,destination:r.to,date:r.date,status:'UNKNOWN',itineraries:[]});
 }
 // Independent optional Python SDK corroboration (not a substitute for GoWild booking evidence).
 if(args.includes('--eric')) for(const r of routes) try {
  const {stdout}=await exec(process.env.FLIGHT_PYTHON||'python3',
   [join(base,'eric_bridge.py'),r.from,r.to,r.date,...(args.includes('--nonstop')?['--nonstop']:[])],
   {cwd:temp,timeout,maxBuffer:1024*1024});
  const data=JSON.parse(stdout);
  if(!Array.isArray(data))throw new Error('Unexpected Python response');
  normalized.push(normalizeEric(data,{origin:r.from,destination:r.to,date:r.date,checkedAt:new Date().toISOString()}));
 }catch(e) {
  problems.push({provider:'eric_frontier',status:'UNKNOWN',reason:'PROVIDER_UNAVAILABLE_OR_FAILED'});
  normalized.push({provider:'eric_frontier',origin:r.from,destination:r.to,date:r.date,status:'UNKNOWN',itineraries:[]});
 }
 const summary=summarizeSources(normalized,{outboundDate:date,returnDate});
 // A failed comparison is not a sold-out signal.
 process.stdout.write(JSON.stringify({origin,destination,date,returnDate,problems,...summary},null,2)+'\n');
} finally {await rm(temp,{recursive:true,force:true});}
