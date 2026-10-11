#!/bin/sh
# Starts Library Studio on this Linux PC and opens it in Chrome, Chromium or Edge.
# Run it from a terminal (./start-library-studio.sh) or double-click it; Ctrl+C or close the terminal to stop it.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed: install it (https://nodejs.org or your package manager) and start this file again."
  exit 1
fi

URL="http://localhost:8771/web/"
(
  sleep 2
  for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge; do
    if command -v "$b" >/dev/null 2>&1; then exec "$b" --new-window "$URL" >/dev/null 2>&1; fi
  done
  xdg-open "$URL" >/dev/null 2>&1
) &

echo "Library Studio runs at $URL  (Ctrl+C to stop it)"
exec node scripts/serve.js 8771
