// Entirely synthetic test data; never treat these amounts as actual travel quotes.
export const demo={
  isDemonstration:true,origin:'DEN',destination:'LAS',date:'2026-11-03',returnDate:null,
  checkedAt:'2026-10-30T12:00:00Z',
  profile:{adults:1,personalItems:1,carryOnBags:0,checkedBags:0},
  statusByProvider:[{provider:'frontier_booking',status:'OBSERVED',count:1},
    {provider:'google_flights_python',status:'REFERENCE_ONLY',count:2}],
  candidates:[
    {provider:'frontier_booking',flight:'FR2549',origin:'DEN',destination:'LAS',
      date:'2026-11-03',departure:'2026-11-03T09:30:00',arrival:'2026-11-03T10:45:00',
      currency:'USD',stops:0,goWildStatus:'FARE_OBSERVED',checkedAt:'2026-10-30T12:00:00Z',
      fares:{gowild:25.00,discount_den:70.00,standard:115.00}},
    {provider:'google_flights_python',flight:'F92549',origin:'DEN',destination:'LAS',
      date:'2026-11-03',departure:'2026-11-03T09:30:00',arrival:'2026-11-03T10:45:00',
      currency:'USD',stops:0,checkedAt:'2026-10-30T12:00:00Z',
      fares:{google_cash:82.00}},
    {provider:'google_flights_python',flight:'WN100',origin:'DEN',destination:'LAS',
      date:'2026-11-03',departure:'2026-11-03T11:00:00',arrival:'2026-11-03T12:12:00',
      currency:'USD',stops:0,checkedAt:'2026-10-30T12:00:00Z',
      fares:{google_cash:64.00}}
  ]
};
