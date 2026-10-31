#!/usr/bin/env python3
"""Google Flights *round-trip search* bridge. Read-only; final prices must be checked at checkout.
Never equate the prices of two independent one-ways with a single-ticket round trip.
"""
import json
import sys

def main():
    if len(sys.argv)!=5:
        raise SystemExit("usage: fli_roundtrip_bridge.py ORIGIN DEST OUT_DATE RETURN_DATE")
    o,d,departure,return_date=sys.argv[1:5]
    from fli.models import Airport,PassengerInfo,FlightSearchFilters,FlightSegment,SeatType,MaxStops,SortBy,TripType
    from fli.search import SearchFlights
    filters=FlightSearchFilters(
        trip_type=TripType.ROUND_TRIP,
        passenger_info=PassengerInfo(adults=1),
        flight_segments=[
          FlightSegment(departure_airport=[[Airport[o],0]],arrival_airport=[[Airport[d],0]],travel_date=departure),
          FlightSegment(departure_airport=[[Airport[d],0]],arrival_airport=[[Airport[o],0]],travel_date=return_date),
        ],seat_type=SeatType.ECONOMY,stops=MaxStops.ANY,sort_by=SortBy.CHEAPEST)
    results=SearchFlights().search(filters,top_n=3,currency="USD")
    quotes=[]
    for pair in results or []:
        if not isinstance(pair,tuple) or len(pair)!=2:continue
        out,back=pair
        price=getattr(back,"price",None)
        if not isinstance(price,(int,float)) or price<0:continue
        rows=[]
        for flight in pair:
            rows.append({"flights":[str(getattr(leg,"flight_number","")) for leg in flight.legs],
              "departure":str(getattr(flight.legs[0],"departure_datetime","")) if flight.legs else None})
        quotes.append({"provider":"google_flights_python","currency":"USD","total":round(price,2),
          "legs":rows,"priceSource":"SECOND_LEG_SHOPPING_SEARCH",
          "verification":"REFERENCE_ONLY_NOT_CHECKOUT",
          "fareStructure":"ROUND_TRIP_SEARCH_NOT_SUM_OF_ONE_WAYS"})
    print(json.dumps(quotes[:15],separators=(",",":")))

if __name__=="__main__":
    main()
