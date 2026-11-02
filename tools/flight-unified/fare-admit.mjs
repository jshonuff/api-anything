// FLIGHT-1 development-only admission gate for exact airfare observations.
// Pure function: does not fetch providers, trust email advertisements, persist, or send alerts.
// A passed check is a structured candidate, NOT independent authentication or booking proof.
import {createHash} from 'node:crypto';

const IATA = /^[A-Z]{3}$/;
const TIME = /(?:Z|[+-]\d{2}:\d{2})$/;
const validTimestamp = value => typeof value === 'string' && TIME.test(value) && Number.isFinite(Date.parse(value));
const nonempty = (value, max=160) => typeof value === 'string' && value.trim().length>0 && value.trim().length<=max;
const validAmount = n => typeof n==='number' && Number.isFinite(n) && n>0 && n<100000;

/** Stage an exact, explicitly attested fare for review by the existing FLIGHT-1 owner.
 * Never call this on Going/RatePunk headline fares, unverifiable website snippets,
 * or reference-only Google results. Provenance fields require upstream validation.
 */
export function stageComparableFareObservation(input,{now=new Date().toISOString()}={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || !validTimestamp(now))
    throw new Error('Invalid observation input or review clock');
  const e=input.evidence??{}, ticket=input.ticket??{}, reasons=[];
  const reject=reason=>reasons.push(reason);
  if(!['AIRLINE_DIRECT_QUOTE','AIRLINE_CHECKOUT'].includes(e.kind))reject('NOT_EXACT_AIRLINE_EVIDENCE');
  if(e.sourceAuthenticated!==true || !nonempty(e.sourceRef,160))reject('SOURCE_NOT_AUTHENTICATED');
  if(!nonempty(e.sourceUrl,2048) || !/^https:\/\/[^\s/]+\//.test(e.sourceUrl))reject('SOURCE_URL_MISSING');
  if(!validTimestamp(e.observedAt) || Date.parse(e.observedAt)>Date.parse(now) ||
     Date.parse(e.observedAt)<Date.parse(now)-90*86400000)reject('OBSERVATION_TIME_INVALID');
  if(e.exactFareConfirmed!==true)reject('FARE_IDENTITY_NOT_CONFIRMED');
  if(e.allTaxesFeesIncluded!==true || e.baggageAndSeatIncluded!==true)
    reject('ALL_IN_COMPARABILITY_NOT_CONFIRMED');
  if(!validAmount(input.totalUsd) || input.currency!=='USD')reject('TOTAL_NOT_USD');
  if(!['ONE_WAY','ROUND_TRIP','MULTI_CITY'].includes(ticket.tripType) ||
     !['SINGLE_TICKET','SEPARATE_TICKETS'].includes(ticket.topology))reject('TICKET_STRUCTURE_UNKNOWN');
  if(!Number.isInteger(ticket.adults)||ticket.adults<1||ticket.adults>9 ||
     !['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST'].includes(ticket.cabin))reject('PASSENGERS_OR_CABIN_UNKNOWN');
  if(!ticket.bags || !['personal','carryOn','checked'].every(k=>Number.isInteger(ticket.bags[k]) && ticket.bags[k]>=0 && ticket.bags[k]<=9)
     || !nonempty(ticket.seatTerms,120))reject('BAG_OR_SEAT_PROFILE_UNKNOWN');
  if(!Array.isArray(ticket.segments)||ticket.segments.length<1||ticket.segments.length>8)
    reject('SEGMENTS_MISSING');
  else for(const segment of ticket.segments){
    if(!segment || !IATA.test(segment.origin??'') || !IATA.test(segment.destination??'') ||
       segment.origin===segment.destination || !nonempty(segment.flightNumber,14) ||
       !validTimestamp(segment.departureAt) || !validTimestamp(segment.arrivalAt) ||
       Date.parse(segment.departureAt)>=Date.parse(segment.arrivalAt) || !nonempty(segment.fareProduct,100)){
      reject('INEXACT_SEGMENT'); break;
    }
  }
  if(reasons.length) return {state:'HOLD',reasons:[...new Set(reasons)],snapshot:null};
  // Key deliberately includes exact route/flight/date, cabin, fare product, topology,
  // seats/bags, passengers and all-in policy. Repeated independent observations
  // of the identical offer yield the same key; price/timestamp do not enter it.
  const components={ticketTopology:ticket.topology,tripType:ticket.tripType,
    segments:ticket.segments.map(s=>[s.origin,s.destination,s.flightNumber,
      new Date(s.departureAt).toISOString(),new Date(s.arrivalAt).toISOString(),s.fareProduct]),
    adults:ticket.adults,cabin:ticket.cabin,bags:[ticket.bags.personal,ticket.bags.carryOn,ticket.bags.checked],
    seatTerms:ticket.seatTerms.trim(),currency:'USD',fees:'ALL_TAXES_FEES_BAGS_SEAT_INCLUDED'};
  const comparisonKey='FLIGHT1:SHA256:'+createHash('sha256').update(JSON.stringify(components)).digest('hex');
  return {state:'OWNER_REVIEW_REQUIRED',reasons:[],comparisonKey,
    // Explicitly not eligible for analyzeFareHistory until FLIGHT-1 accepts
    // independently verified source evidence and a governed persistence path.
    snapshot:{deal_type:'FLIGHT',provider_name:input.providerName??'Airline direct',
      observed_at:new Date(e.observedAt).toISOString(),price_amount:input.totalUsd,
      currency:'USD',source_provider:'FLIGHT1_EXACT_QUOTE_STAGING',source_url:e.sourceUrl,
      verification_state:'PARTIAL',deal_status:'CANDIDATE_UNVERIFIED',
      metadata:{fare_comparison_key:comparisonKey,fare_comparable_total:false,
        checkout_total_verified:e.kind==='AIRLINE_CHECKOUT',
        quote_state:'CANDIDATE',source_ref:e.sourceRef,
        comparison_components:components,admission_state:'OWNER_REVIEW_REQUIRED',
        bookability:'NOT_LIVE_VERIFIED'}}};
}
