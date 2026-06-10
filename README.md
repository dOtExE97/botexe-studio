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

## Referenzen

- Design-Spec: [`docs/specs/2026-06-10-tikfinity-ersatz-mvp.md`](docs/specs/2026-06-10-tikfinity-ersatz-mvp.md)
- Build-Briefing: [`docs/specs/2026-06-10-build-briefing.md`](docs/specs/2026-06-10-build-briefing.md)
- Audit der Alt-Codebase: [`docs/specs/2026-06-03-botexe-app-multiagent-audit.md`](docs/specs/2026-06-03-botexe-app-multiagent-audit.md)
- Alt-Codebase (Read-Only-Referenz): `/home/dotexe/repos/botexe-app/` @ `ee0d71f`
