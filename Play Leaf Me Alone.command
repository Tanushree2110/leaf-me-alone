#!/bin/bash
cd "$(dirname "$0")"

# Start Vite dev server if not already running on 5173
if ! lsof -i :5173 > /dev/null 2>&1; then
  npm run dev -- --port 5173 &
  sleep 1.2
fi

# Open Leaf Me Alone in Google Chrome
open -a "Google Chrome" "http://localhost:5173/"
