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
# Plattform erkennen. Der Ordnername kommt von electron-forge und enthaelt
# Betriebssystem und Architektur — auf einem Mac heisst er anders als hier, und
# ein fest verdrahteter Linux-Pfad haette dort nur „Binary nicht gefunden"
# gemeldet, ohne zu sagen warum.
case "$(uname -s)" in
  Darwin) PLATTFORM="darwin" ;;
  Linux)  PLATTFORM="linux" ;;
  *)      PLATTFORM="unbekannt" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  *)             ARCH="x64" ;;
esac

if [[ "$PLATTFORM" == "darwin" ]]; then
  OUT_DIR="out/bOtExE Studio-darwin-$ARCH/bOtExE Studio.app/Contents/MacOS"
  BIN="$OUT_DIR/bOtExE Studio"
else
  OUT_DIR="out/bOtExE Studio-$PLATTFORM-$ARCH"
  BIN="$OUT_DIR/botexe-studio"
fi
PORT=9222

# xvfb gibt es nur unter Linux. Auf dem Mac laeuft die App mit echtem
# Fenster-Server, das ist fuer den Durchklick voellig ausreichend.
if [[ "$PLATTFORM" == "linux" ]]; then
  command -v xvfb-run >/dev/null 2>&1 || {
    echo "❌ xvfb-run fehlt. Unter Debian/Ubuntu: sudo apt install xvfb"; exit 1; }
  STARTER=(xvfb-run -a)
else
  STARTER=()
fi

if [[ "${SKIP_BUILD:-0}" != "1" || ! -x "$BIN" ]]; then
  echo "📦 Packe App (electron-forge package)…"
  npm run package || { echo "Package-Build fehlgeschlagen"; exit 1; }
fi
[[ -x "$BIN" ]] || { echo "Binary nicht gefunden: $BIN"; exit 1; }

APP_PID=""
cleanup() {
  [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null
  pkill -f "botexe-studio --no-sandbox" 2>/dev/null
  pkill -f "bOtExE Studio --no-sandbox" 2>/dev/null
  pkill -f "Xvfb" 2>/dev/null
  true
}
trap cleanup EXIT

echo "🚀 Starte App ($PLATTFORM-$ARCH${STARTER:+, xvfb}, Debug-Port $PORT)…"
# WICHTIG: KEIN --disable-gpu! Das schaltet den Compositor ab → es entstehen nie
# Frames, und Page.captureScreenshot hängt endlos (Screenshots waren dadurch
# monatelang unmöglich). Mit SwiftShader (Software-GL) rendert Chromium normal
# weiter und Screenshots kommen in <1s.
"${STARTER[@]}" "$BIN" --no-sandbox --enable-unsafe-swiftshader \
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
