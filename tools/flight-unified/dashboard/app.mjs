import {buildDashboardModel,reconcileCheckout} from '../compare-ui.mjs';
const $=id=>document.getElementById(id);
const node=(tag,value,cls)=>{const x=document.createElement(tag);if(value!=null)x.textContent=String(value);if(cls)x.className=cls;return x;};
const money=x=>Number.isFinite(x)?x.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unpriced';
let model=null;
function card(f,quotes){
 const c=node('article',null,'card');
 c.append(node('h3',f.origin+' → '+f.destination+'  ·  '+f.flight));
 c.append(node('p',f.date+' · '+(f.stops===0?'Nonstop':f.stops==null?'Stops unknown':f.stops+' stops')+' · '+f.departure,'muted'));
 c.append(node('p',f.hasObservedGoWild?'GoWild fare observed by Frontier':'GoWild not verified for this result','label'));
 for(const q of quotes){
  const box=node('div',null,'fare');
  const head=node('div',null,'fare-head');
  head.append(node('strong',q.label+': '+money(q.amount)),node('span',q.provider));
  box.append(head,node('p',q.verification+' · Checkout NOT VERIFIED','muted'));
  const label=node('label','Checkout total (USD): ');
  const input=node('input');input.type='number';input.min='0';input.step='0.01';input.placeholder='Optional manual total';
  label.append(input);
  const confirm=node('label',' I checked this itinerary at checkout.');
  const checkbox=node('input');checkbox.type='checkbox';confirm.prepend(checkbox);
  const verify=node('button','Compare checkout');
  const message=node('p',null,'verification');
  if(q.verification==='CANDIDATE_ONLY'){verify.disabled=true;input.disabled=true;checkbox.disabled=true;}
  verify.addEventListener('click',()=>{
   const x=reconcileCheckout(q,input.value,{confirmedByHuman:checkbox.checked});
   message.textContent=x.status==='MANUALLY_RECONCILED_NOT_BOOKING_GUARANTEE'?
     'Manual difference: '+money(x.delta)+'. Not proof of booking.':
     'Not verified. Enter the real checkout amount and check the confirmation.';
  });
  box.append(label,confirm,verify,message);c.append(box);
 }
 return c;
}
function render(){
 if(!model)return;
 const summary=$('summary'),results=$('results');
 summary.replaceChildren();results.replaceChildren();
 const banner=node('div',null,'overview');
 banner.append(node('h2',model.isDemonstration?'SYNTHETIC DEMO — NO REAL PRICES':'Imported private search result'));
 banner.append(node('p',(model.route.origin??'?')+' → '+(model.route.destination??'?')+
  ' · '+(model.route.date??'date unspecified')+' · '+model.flights.length+' unique flights'+
  ' · '+model.duplicatesCollapsed+' exact matches joined'));
 if(model.roundTrip?.best?.total!=null){
  banner.append(node('p','Frontier fare combination: '+money(model.roundTrip.best.total)+
   ' — Booking and final checkout not verified.'));
 }
 summary.append(banner);$('controls').hidden=false;
 const source=$('source').value,max=$('maxPrice').value,stop=$('onlyNonstop').checked,
       gowild=$('onlyGoWild').checked;
 let n=0;
 for(const f of model.flights){
  if(stop&&f.stops!==0)continue;
  const qs=f.quotes.filter(q=>(source==='all'||q.provider===source)&&
    (max===''||q.amount<=Number(max)));
  if(!qs.length)continue;
  if(gowild&&!qs.some(q=>q.type==='gowild'&&q.verification==='FRONTIER_FARE_OBSERVED'))continue;
  results.append(card(f,qs));n++;
 }
 $('message').textContent=n?n+' itineraries shown. Prices remain provisional.':
   'No matching priced results. This is not evidence of sold-out flights.';
}
function openData(data){model=buildDashboardModel(data);render();}
$('dataFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{if(file.size>5e6)throw Error('Maximum file size is 5 MB');
  openData(JSON.parse(await file.text()));}catch(error){
   $('message').textContent='Could not read result: '+error.message;
 }
 e.target.value='';
});
for(const id of ['source','maxPrice','onlyNonstop','onlyGoWild'])
 $(id).addEventListener('input',render);
$('demo').addEventListener('click',async()=>{
 const {demo}=await import('./demo.mjs');openData(demo);
});

$('searchForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=$('searchButton');
 if(button.disabled)return;
 const request={
  origin:$('searchOrigin').value.trim().toUpperCase(),
  destination:$('searchDestination').value.trim().toUpperCase(),
  date:$('searchDate').value,
  returnDate:$('searchReturn').value||null,
  nonstop:$('searchNonstop').checked
 };
 button.disabled=true;
 $('message').textContent='Searching both flight providers. Results are not guaranteed until checkout.';
 try{
  const sessionResponse=await fetch('/api/session',{cache:'no-store',credentials:'omit'});
  if(!sessionResponse.ok)throw Error('This page is not running on the FLIGHT-1 local search server.');
  const {token}=await sessionResponse.json();
  if(typeof token!=='string')throw Error('Local search authorization unavailable.');
  const response=await fetch('/api/search',{
   method:'POST',cache:'no-store',credentials:'omit',
   headers:{'Content-Type':'application/json','X-Flight-Local-Token':token},
   body:JSON.stringify(request)
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error==='SEARCH_ALREADY_RUNNING'?
   'A search is already running. Finish that one before starting another.':
   'Search unavailable. The source may have changed or blocked a request; this is not a sold-out result.');
  openData(data);
 }catch(error){
  $('message').textContent=error.message||'No verified results. Try again later.';
 }finally{button.disabled=false;}
});
