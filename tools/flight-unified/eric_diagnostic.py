#!/usr/bin/env python3
"""One-shot redacted diagnostics; no credentials, persistence or booking."""
import json
import re
import sys

def classify(exc):
    name=type(exc).__name__
    msg=str(exc).lower()
    if re.search(r"429|throttl|rate.limit", msg): return "RATE_LIMITED"
    if re.search(r"403|forbidden", msg): return "FORBIDDEN"
    if re.search(r"401|unauthori", msg): return "UNAUTHORIZED"
    if re.search(r"404|not found", msg): return "NOT_FOUND"
    if re.search(r"50[0-4]|server error", msg): return "SERVER_ERROR"
    if re.search(r"timeout|timed out", msg): return "TIMEOUT"
    if re.search(r"token|auth", name+" "+msg, re.I): return "AUTH"
    if re.search(r"json|schema|decode|parse|unexpected", msg): return "PARSE_OR_SCHEMA"
    if re.search(r"ssl|connection|proxy|socket|network", msg): return "NETWORK"
    return "UNCLASSIFIED"

stage = "IMPORT"
try:
    from flights import get_provider
    stage = "INITIALIZE"
    provider = get_provider("frontier")
    stage = "LIVE_FETCH"
    rows = list(provider.flights(sys.argv[1], sys.argv[2], sys.argv[3], nonstop_only=True))
    print(json.dumps({"status": "RETRIEVED" if rows else "EMPTY", "stage": stage, "count": len(rows)}))
except Exception as exc:
    status=getattr(getattr(exc,"response",None),"status_code",None)
    print(json.dumps({"status": "ERROR","stage":stage,"name":type(exc).__name__,
      "httpStatus":status,"class":classify(exc)}))
