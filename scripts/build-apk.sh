#!/usr/bin/env bash
# TUĞRUL DOWNLOAD — Android APK derleyici
#
# Gereksinimler: Node 18+, JDK 17/21, Android SDK (ANDROID_HOME veya ANDROID_SDK_ROOT)
# Kullanım:  bash scripts/build-apk.sh [debug|release]
#
# Çıktı: dist-apk/tugrul-download-<sürüm>[-debug].apk
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
MODE="${1:-debug}"
VERSION="$(node -p "require('./package.json').version")"

echo "╭──────────────────────────────────────────────╮"
echo "│  TUĞRUL DOWNLOAD · Android APK derlemesi     │"
echo "╰──────────────────────────────────────────────╯"

if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
  echo "! ANDROID_HOME / ANDROID_SDK_ROOT tanımlı değil." >&2
  echo "  Android SDK kurun: https://developer.android.com/studio#command-tools" >&2
  exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# 1) arayüzü statik (çevrimdışı) modda derle
echo "→ Arayüz derleniyor (statik motor)…"
npm --prefix frontend install --silent
npm --prefix frontend run build:ghpages

# 2) Capacitor senkronizasyonu (web varlıkları → android/assets)
echo "→ Capacitor senkronize ediliyor…"
( cd frontend && npx cap sync android )

# 2b) sürüm bilgisini Gradle'a yansıt
VERSION_CODE="${VERSION_CODE:-$(date +%y%m%d)}"
sed -i.bak -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]+\"/versionName \"${VERSION}\"/" \
  frontend/android/app/build.gradle
rm -f frontend/android/app/build.gradle.bak

# 3) Gradle
cd frontend/android
if [ "$MODE" = "release" ] && [ ! -f keystore.properties ]; then
  echo "! Release imzası için frontend/android/keystore.properties gerekli." >&2
  echo "  Örnek: storeFile=../tugrul.keystore / storePassword=… / keyAlias=… / keyPassword=…" >&2
  exit 1
fi
TASK=$([ "$MODE" = "release" ] && echo assembleRelease || echo assembleDebug)
echo "→ Gradle: $TASK"
GRADLE_LOG="$ROOT/dist-apk/gradle-$MODE.log"
mkdir -p "$ROOT/dist-apk"
if [ -x ./gradlew ]; then
  ./gradlew --no-daemon --stacktrace "$TASK" 2>&1 | tee "$GRADLE_LOG" || true
else
  gradle --no-daemon --stacktrace "$TASK" 2>&1 | tee "$GRADLE_LOG" || true
fi
if ! grep -qE "BUILD SUCCESSFUL" "$GRADLE_LOG"; then
  echo "✖ Derleme başarısız. Son 60 satır:" >&2
  tail -60 "$GRADLE_LOG" >&2
  echo "  (tam günlük: dist-apk/gradle-$MODE.log)" >&2
  exit 1
fi

OUT="$ROOT/dist-apk"
mkdir -p "$OUT"
SUFFIX=$([ "$MODE" = "release" ] && echo "" || echo "-debug")
if [ "$MODE" = "release" ]; then
  SRC=$(find app/build/outputs/apk/release -name "*.apk" | head -1)
else
  SRC=$(find app/build/outputs/apk/debug -name "*.apk" | head -1)
fi
cp "$SRC" "$OUT/tugrul-download-${VERSION}${SUFFIX}.apk"
echo "✔ APK hazır: $OUT/tugrul-download-${VERSION}${SUFFIX}.apk ($(du -h "$OUT/tugrul-download-${VERSION}${SUFFIX}.apk" | cut -f1))"
