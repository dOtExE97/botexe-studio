# botexe-studio

Lokales TikTok-Live Overlay-Studio — eigenständiger **TikFinity/TikTory-Ersatz** als Electron-Desktop-App.

**MVP „Pur-Kern"** (Bausteine 1+2+3): TikTok-Events → Trigger-Regeln → Overlays/Alerts/Sounds.
Ein Overlay-Screen → **ein Link** → Browser-Quelle in TikTok Live Studio. Sounds spielt die App **lokal** ab.

## Grundprinzipien

1. 🏠 **Lokal-first** — läuft auf dem Stream-PC, keine Cloud-Pflicht, MVP komplett ohne LLM
2. ⚡ **Ressourcenschonend** — läuft neben Stream + Game, schlanke Overlays (TTLS-Browser ist limitiert)
3. 🎨 **Premium-Optik** — Widgets auf dem Niveau kommerzieller Pro-Tools, kein generischer AI-Look
4. 🏗️ **Profi-Engineering** — saubere Schichten, SemVer + Auto-Updates, Tests, CI-Gate

## Architektur (MVP)

```
TikTok Live → [TikTok-Adapter] → [Event-Bus] → [Trigger-Engine] ─┬─→ [Sound-Player] (lokal → Rodecaster)
                                                                  └─→ [Overlay-Engine: DSL · Widget-Registry · Renderer]
                                                                          → [Overlay-Server: 1 Link · WebSocket]
                                                                          → TTLS Browser-Quelle (transparenter Canvas)
```

## Struktur

```
apps/desktop/src/
├── main/
│   ├── core/      ← reine Logik: Event-Bus, Verdrahtung Trigger ↔ Engine (testbar ohne Electron)
│   ├── adapters/  ← I/O: TikTok-Adapter, Overlay-Server, Sound-Player
│   └── services/  ← App-Verdrahtung
├── renderer/      ← App-Shell (UI)
└── shared/        ← Typen, Konstanten
packages/
├── overlay-engine/  ← Layout-DSL + Renderer (eigenständig, versioniert, testbar)
├── widget-kit/      ← Pro-Widgets
└── trigger-engine/  ← Regel-Logik
```

## Entwicklung

```bash
npm install              # einmalig (workspace-root)
npm run dev:desktop      # app im dev-modus starten
npm run lint             # eslint über alle workspaces
npm run typecheck        # tsc --noEmit über alle workspaces
npm test                 # alle unit-/integrationstests (node:test + tsx)
npm run build:desktop    # distributable bauen (out/make/)
```

E2E-Durchstich gegen die laufende App (Screenshots App + Overlay):
`npx electron-forge start -- --remote-debugging-port=9222`, dann
`node --import tsx scripts/e2e-snapshot.ts /tmp` (in `apps/desktop/`).

## Stand (2026-06-11)

| Baustein | Status |
|---|---|
| trigger-engine (Regeln/Bedingungen/Cooldown) | ✅ 16 Tests |
| overlay-engine (DSL + ajv-Validierung, K3) | ✅ 8 Tests |
| Event-Bus, TikTok-Adapter v2 (K1/K2-Fix), Replay | ✅ 28 Tests |
| Overlay-Server (H8-Heartbeat, Backpressure H6) | ✅ 8 Tests |
| Session-Stats (Leaderboard/Goals) | ✅ 7 Tests |
| 6 Widgets (Neo-Arcade Broadcast) | ✅ E2E-Screenshot verifiziert |
| Hochformat-Canvas (1080×1920, TikTok-Default) + TikTok-UI-SafeZones im Editor | ✅ |
| Like-Liste mit Usernamen + Profilbildern (TikFinity-Style) | ✅ |
| Echte TikTok-Gift-Bilder + Profilfotos in Alerts/Feeds | ✅ (live verifizieren) |
| App-Shell (Live · Overlay-Editor · Trigger · Sounds) | ✅ E2E verifiziert |
| Linux-Package (`npm run make`) | ✅ baut + startet |
| Offen | echter Live-Connect, TTLS-Smoke-Test auf Stream-PC, Windows-Build/CI (braucht GitHub-Remote), Auto-Update aktivieren, Sub-Events live verifizieren (v2-lib hat kein subscribe-event mehr) |

## Referenzen

- Design-Spec: [`docs/specs/2026-06-10-tikfinity-ersatz-mvp.md`](docs/specs/2026-06-10-tikfinity-ersatz-mvp.md)
- Build-Briefing: [`docs/specs/2026-06-10-build-briefing.md`](docs/specs/2026-06-10-build-briefing.md)
- Audit der Alt-Codebase: [`docs/specs/2026-06-03-botexe-app-multiagent-audit.md`](docs/specs/2026-06-03-botexe-app-multiagent-audit.md)
- Alt-Codebase (Read-Only-Referenz): `/home/dotexe/repos/botexe-app/` @ `ee0d71f`
