#!/usr/bin/env python3
"""Optional read-only FLI Python adapter (Google cash-fare comparison, not GoWild verification)."""
import json
import sys

def main():
    if len(sys.argv) < 4:
        raise SystemExit("usage: fli_python_bridge.py ORIGIN DEST YYYY-MM-DD [--nonstop]")
    origin, destination, date = sys.argv[1:4]
    if any(len(x)!=3 or not x.isascii() or not x.isalpha() for x in (origin,destination)):
        raise SystemExit("invalid IATA codes")
    from fli.models import Airport, PassengerInfo, FlightSearchFilters, FlightSegment, SeatType, MaxStops, SortBy
    from fli.search import SearchFlights
    filters = FlightSearchFilters(
        passenger_info=PassengerInfo(adults=1),
        flight_segments=[FlightSegment(
            departure_airport=[[Airport[origin],0]],arrival_airport=[[Airport[destination],0]],
            travel_date=date)],
        seat_type=SeatType.ECONOMY,
        stops=MaxStops.NON_STOP if "--nonstop" in sys.argv else MaxStops.ANY,
        sort_by=SortBy.CHEAPEST)
    results = SearchFlights().search(filters, currency="USD")
    rows = []
    for item in results or []:
        if not hasattr(item, "model_dump"):
            continue  # round-trip tuples are outside this single-leg bridge
        data = item.model_dump(mode="json", exclude={"booking_token", "layovers"})
        legs = data.get("legs") or []
        rows.append({"price":data.get("price"),"currency":data.get("currency"),
            "stops":data.get("stops"),"duration":data.get("duration"),
            "legs":[{
                "airline":v.get("airline"),"flight_number":v.get("flight_number"),
                "departure_datetime":v.get("departure_datetime"),"arrival_datetime":v.get("arrival_datetime")
            } for v in legs]})
    print(json.dumps(rows, separators=(",",":")))

if __name__ == "__main__":
    main()
