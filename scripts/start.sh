#!/usr/bin/env bash
# TUĞRUL DOWNLOAD — üretim başlatıcı
#   1) bağımlılıkları doğrular  2) arayüzü (gerekirse) derler  3) API + arayüzü sunar
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
export PYTHONPATH="$ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"
export PORT="${PORT:-8000}"

echo "╭──────────────────────────────────────────────╮"
echo "│  TUĞRUL DOWNLOAD · İndirme Stüdyosu          │"
echo "╰──────────────────────────────────────────────╯"

if ! python3 -c "import yt_dlp, fastapi, uvicorn" >/dev/null 2>&1; then
  echo "→ Python bağımlılıkları kuruluyor…"
  python3 -m pip install --quiet -r backend/requirements.txt --break-system-packages || \
    python3 -m pip install --quiet -r backend/requirements.txt
fi

if [ ! -f frontend/dist/index.html ]; then
  echo "→ Arayüz derleniyor…"
  npm install --silent
  npm --prefix frontend install --silent
  npm --prefix frontend run build
fi

echo "→ Motor: $(python3 -c 'import yt_dlp;print("yt-dlp "+yt_dlp.version.__version__)')"
echo "→ Arayüz: http://localhost:${PORT}"
exec python3 -m tugrul.main
