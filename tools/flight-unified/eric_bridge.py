#!/usr/bin/env python3
"""Optional bridge to the MIT-licensed ericchansen/flights SDK.

Install from its maintained repository in a separate virtual environment before use.
This adapter only returns CANDIDATE results; GoWild seat verification stays with Frontier booking.
"""
import dataclasses
import json
import sys

def main():
    if len(sys.argv) < 4:
        raise SystemExit("usage: eric_bridge.py ORIGIN DEST YYYY-MM-DD [--nonstop]")
    origin, destination, date = sys.argv[1:4]
    if not (len(origin) == len(destination) == 3 and origin.isalpha() and destination.isalpha()):
        raise SystemExit("invalid airport codes")
    from flights import get_provider
    provider = get_provider("frontier")
    results = provider.flights(origin, destination, date, nonstop_only="--nonstop" in sys.argv)
    print(json.dumps([dataclasses.asdict(f) for f in results], default=str))

if __name__ == "__main__":
    main()
