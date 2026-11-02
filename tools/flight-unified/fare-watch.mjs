// FLIGHT-1 Fare Watch: local, private, read-only model of an owner-produced export.
// Does NOT contact Supabase/Gmail, qualify live fares, watch prices, or dispatch alerts.
export const WATCH_FORMAT='FLIGHT1_WATCH_EXPORT_V1';
const IATA=/^[A-Z]{3}$/;
const timestamp=x=>typeof x==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const amount=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=100000;
const safeSource=x=>{
 if(typeof x!=='string'||x.length>2048)return null;
 try{const url=new URL(x);return url.protocol==='https:'&&url.hostname==='mail.google.com'&&
    (url.pathname.startsWith('/mail/')||url.pathname==='/mail')?url.href:null;}catch{return null;}
};
const error=message=>{throw new Error('FARE_WATCH_'+message);};
export function buildFareWatchModel(packet,{now=new Date().toISOString()}={}){
 if(!packet||typeof packet!=='object'||Array.isArray(packet)||packet.format!==WATCH_FORMAT)
   error('UNSUPPORTED_FORMAT');
 if(!timestamp(now)||!timestamp(packet.exported_at)||Date.parse(packet.exported_at)>Date.parse(now)+60000)
   error('INVALID_EXPORT_CLOCK');
 if(!Array.isArray(packet.watch_destinations)||packet.watch_destinations.length>250||
    !Array.isArray(packet.observations)||packet.observations.length>5000||
    !Array.isArray(packet.trips??[])||packet.trips?.length>2000)error('INVALID_SIZE');
 const watch=new Set();
 for(const code of packet.watch_destinations){
  if(typeof code!=='string'||!IATA.test(code)||watch.has(code))error('INVALID_AIRPORTS');
  watch.add(code);
 }
 const records=[],keys=new Set(),nowMs=Date.parse(now);
 for(const r of packet.observations){
  const m=r?.metadata??{},origin=m.origin,destination=m.destination,price=Number(r?.price_amount);
  if(r?.source_provider!=='GOING_GMAIL'||r?.currency!=='USD'||
     !IATA.test(origin??'')||!IATA.test(destination??'')||origin===destination||
     !watch.has(destination)||!amount(price)||!timestamp(r.observed_at)||Date.parse(r.observed_at)>nowMs||
     !['PARTIAL','SOURCE_VERIFIED'].includes(r.verification_state))continue;
  const sig=[m.gmail_message_id,origin,destination,price].join('|');
  if(keys.has(sig))continue; keys.add(sig);
  records.push({origin,destination,price,observedAt:new Date(r.observed_at).toISOString(),
    travelWindow:typeof m.travel_window==='string'?m.travel_window.slice(0,160):'',
    sourceUrl:safeSource(r.source_url),source:'Going email',
    // Even a verified sender is NOT proof of actual airline booking inventory.
    verification:'EMAIL_OBSERVED_NOT_LIVE_VERIFIED',
    historical:r.deal_status==='HISTORICAL'||nowMs-Date.parse(r.observed_at)>72*3600000});
 }
 records.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||
   a.destination.localeCompare(b.destination)||a.origin.localeCompare(b.origin));
 const destinations=[...watch].sort().map(destination=>{
  const matching=records.filter(r=>r.destination===destination);
  return {destination,observations:matching.length,latest:matching[0]??null,
    state:matching.length?'EMAIL_ONLY_NOT_LIVE_VERIFIED':'NO_EMAIL_OBSERVATION'};
 });
 const canceled=(packet.trips??[]).filter(t=>t?.status==='CANCELED'||t?.status==='REMOVED_BY_JC')
  .map(t=>({tripId:String(t.trip_id??'').slice(0,100),status:'INACTIVE'}));
 const exportedAt=new Date(packet.exported_at).toISOString();
 return {format:WATCH_FORMAT,exportedAt,owner:'FLIGHT-1',
  destinations,records,watchCount:watch.size,observationCount:records.length,
  canceledTrips:canceled,verifiedBookableCount:0,
  sourceOnly:true,priceTrend:'NOT_AVAILABLE_WITHOUT_EXACT_COMPARABLE_FARES',
  note:'Going email offers are historical or source-only. No fare here is a verified live ticket, price movement, or buy recommendation.'};
}
