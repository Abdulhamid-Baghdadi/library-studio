#!/bin/bash
# Starts Library Studio on this Mac and opens it in Chrome (or Edge). Close this window to stop it.
# Double-click it in Finder. The first time, macOS may ask: right-click the file → Open → Open.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed: install it from https://nodejs.org and open this file again."
  read -r -p "Press Enter to close."
  exit 1
fi

URL="http://localhost:8771/web/"
(
  sleep 2
  if [ -d "/Applications/Google Chrome.app" ]; then open -na "Google Chrome" --args --new-window "$URL"
  elif [ -d "/Applications/Microsoft Edge.app" ]; then open -na "Microsoft Edge" --args --new-window "$URL"
  else open "$URL"; fi
) &

echo "Library Studio runs at $URL  (close this window to stop it)"
node scripts/serve.js 8771
