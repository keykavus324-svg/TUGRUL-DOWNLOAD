#!/usr/bin/env bash
# Geliştirme sunucusu: API + (varsa) Vite
set -e
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/backend"
export PORT="${PORT:-8000}"
if [ ! -d node_modules ]; then npm install --silent; fi
if [ ! -d frontend/dist ] && [ "$1" != "--api-only" ]; then
  (cd frontend && npm install --silent)
  npm run build --silent
fi
python3 -m tugrul.main
