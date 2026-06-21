# Security-Backlog (verschobene Findings)

Gesammelte, **nicht-akute** Härtungsideen aus dem Mehr-Modell-Audit (Codex GPT
am 2026-06-21, gegengeprüft mit Claude). Die akuten Punkte wurden in v0.3.6
direkt behoben (siehe unten). Die hier gelisteten sind Defense-in-Depth — gut
zu haben, aber kein akutes Loch, v.a. weil die App `contextIsolation`/Sandbox
nutzt (Schadcode *im* Renderer-Fenster ist sehr unwahrscheinlich).

## Bereits behoben (v0.3.6)
- ✅ **protobufjs DoS** (kritisch + 2× hoch, im Produkt über `tiktok-live-connector`) — via `npm audit fix` gepatcht.
- ✅ **MyInstants-Import SSRF** — Download nutzt jetzt dieselbe Allowlist wie der Vorhör-Pfad (nur myinstants.com, HTTPS, .mp3, keine Redirects).
- ✅ **CI `npm install` → `npm ci`** — reproduzierbare Builds gegen die Lockfile.

## Offen — wenn mal Zeit ist

### URL-Protokoll-/Host-Validierung für lokale Integrationen
OBS-URL, Streamer.bot-URL und OpenAI-kompatible TTS-`baseUrl` sind frei wählbar
(teils gewollt für Power-User mit LAN-OBS). Härtung:
- Protokolle hart prüfen: OBS/Streamer.bot nur `ws:`/`wss:`, TTS-baseUrl nur `http:`/`https:`.
- Bei nicht-lokalen Hosts (≠ 127.0.0.1/localhost) eine UI-Warnung + bewusster Trust-State.
- Dateien: `apps/desktop/src/main.ts` (OBS), `obs-service.ts`, `streamerbot-service.ts`, `tts-byok.ts`.

### Zentrale Validierung für Trigger-Regeln/Actions/Redemptions/Panel-Buttons
IPC-Setter prüfen aktuell nur `Array.isArray(...)` und casten. Daten kommen zwar
aus dem eigenen Editor (Backups werden secret-stripped), aber ein zentrales
Schema wäre sauberer:
- `validateTriggerRule` / `validateTriggerAction` / `validatePanelButton` mit Bounds
  (Strings, IDs, Delays, Volumes, URLs, Hotkeys, Kosten).
- Beim IPC-Setzen, beim Import UND beim Laden aus Settings wiederverwenden.
- Ungültige Einträge mit UI-Fehler ablehnen statt still zu persistieren.
- Dateien: `apps/desktop/src/main.ts` (IPC-Setter), `studio.ts` (importConfig), `packages/trigger-engine`.

### Overlay-Token: Rotation + Rechte-Trennung
Das Overlay-/Control-Token steckt (nötig für OBS/TTLS) in URLs → in Logs/Screenshots sichtbar.
- Token-Rotation in den Einstellungen anbieten.
- Read-only-Overlay-Token vs. Control-Token (`/api/panel/fire`, `/api/test-event`) trennen.
- `/api/test-event` optional in Production abschaltbar.
- Datei: `apps/desktop/src/main/adapters/overlay-server.ts`.

### Dependency-Pflege
- Dependabot/Renovate aktivieren (automatische Update-PRs).
- Production-`npm audit` als Non-Blocking-CI-Job.
- Veraltet: ESLint 8 + `@typescript-eslint` 5 (vs. TS 5.9), Vite 5, `tiktok-live-connector` (beta in kritischem Pfad).

### Aufräumen
- Alte GitHub-Issues schließen (längst gefixt, betreffen App 0.2.1/0.2.2):
  - #1: TTLS/OBS-Link-Button geht nicht
  - #2: TikTok-Connect geht nicht
