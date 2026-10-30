#!/usr/bin/env bash
# Development-only FLI-JS bootstrap from reviewed, MIT-licensed source.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PIN="62eaaed9925c6ea63a606ccdbb74be3040e45d66"
git init -q "$TMP/fli"
git -C "$TMP/fli" remote add origin https://github.com/jshonuff/fli.git
git -C "$TMP/fli" fetch --quiet --depth 1 origin "$PIN"
git -C "$TMP/fli" checkout --quiet FETCH_HEAD
npm --prefix "$TMP/fli/fli-js" install --ignore-scripts --no-audit --no-fund
npm --prefix "$TMP/fli/fli-js" run build
TARBALL="$(cd "$TMP/fli/fli-js" && npm pack --silent)"
npm --prefix "$HERE" install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund "$TMP/fli/fli-js/$TARBALL"
(cd "$HERE" && node --input-type=module -e "import('fli-js').then(x => { if (!x.SearchFlights || !x.FlightSearchFilters) process.exit(2); console.log('FLI-JS local import OK (pinned source build)'); })")
