#!/usr/bin/env bash
# One-time local-only install of pinned Google Flights Python adapter.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
python3 -m venv "$HERE/.venv"
"$HERE/.venv/bin/python" -m pip install "git+https://github.com/jshonuff/fli.git@62eaaed9925c6ea63a606ccdbb74be3040e45d66"
echo "Private local Python FLI environment ready. Start with: node tools/flight-unified/start-local.mjs"
