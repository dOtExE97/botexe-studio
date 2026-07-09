#!/usr/bin/env bash
# run-smoke.sh — Ein-Kommando-Smoke-Test: packt die App (falls nötig), startet
# sie headless über xvfb mit Debug-Port und klickt per smoke-test.ts jede Seite
# durch. Räumt die App/xvfb am Ende immer auf. Exit-Code = Testergebnis.
#
#   ./scripts/run-smoke.sh            # baut bei Bedarf + testet
#   SKIP_BUILD=1 ./scripts/run-smoke.sh   # nutzt vorhandenen out/-Build
set -uo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DESKTOP_DIR"
OUT_DIR="out/bOtExE Studio-linux-x64"
BIN="$OUT_DIR/botexe-studio"
PORT=9222

if [[ "${SKIP_BUILD:-0}" != "1" || ! -x "$BIN" ]]; then
  echo "📦 Packe App (electron-forge package)…"
  npm run package || { echo "Package-Build fehlgeschlagen"; exit 1; }
fi
[[ -x "$BIN" ]] || { echo "Binary nicht gefunden: $BIN"; exit 1; }

APP_PID=""
cleanup() {
  [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null
  pkill -f "botexe-studio --no-sandbox" 2>/dev/null
  pkill -f "Xvfb" 2>/dev/null
  true
}
trap cleanup EXIT

echo "🚀 Starte App headless (xvfb, Debug-Port $PORT)…"
xvfb-run -a "$BIN" --no-sandbox --disable-gpu --disable-software-rasterizer \
  --remote-debugging-port="$PORT" > /tmp/botexe-smoke-app.log 2>&1 &
APP_PID=$!

echo "⏳ Warte auf Debug-Port…"
for i in $(seq 1 40); do
  curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && { echo "   bereit nach ${i}s"; break; }
  sleep 1
  [[ $i -eq 40 ]] && { echo "Debug-Port kam nicht hoch"; tail -20 /tmp/botexe-smoke-app.log; exit 1; }
done

node --import tsx scripts/smoke-test.ts
RESULT=$?
echo "(App-Log: /tmp/botexe-smoke-app.log)"
exit $RESULT
