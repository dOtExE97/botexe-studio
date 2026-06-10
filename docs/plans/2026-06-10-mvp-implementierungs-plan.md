# botexe-studio — Implementierungs-Plan MVP „Pur-Kern"

**Datum:** 2026-06-10 · **Basis:** Design-Spec + Build-Briefing + Audit (alle in `docs/specs/`)
**Verifiziert in Phase 2:** Alt-Repo tsc 0 Errors, ESLint 0 Errors/17 Warnings, 33/49 Tests grün
(16 Failures = better-sqlite3 Electron-ABI, kein Logik-Bug). tiktok-live-connector@2.1.1-beta1:
v2-API (`TikTokLiveConnection` + `WebcastEvent`) hat dedizierte follow/share-Events.

---

## 1. Hybrid-Entscheidungen (Was kopieren · was neu · was weglassen)

### ♻️ KOPIEREN + im neuen Projekt überarbeiten

| Teil | Quelle (botexe-app) | Überarbeitung hier |
|------|--------------------|--------------------|
| Event-Bus | `main/services/event-bus.ts` (48 Z.) | typisierte Topics/Payloads, sonst ~1:1 |
| TikTok-Adapter | `main/adapters/tiktok-adapter.ts` | Port auf **v2-API**, **K1/K2-Fix** (Epoch-Token, Cleanup alter Connection, Context-Reset-Hook bei `connected`), + `share`/`like` sauber, Gift-Combo via `repeatEnd` übernehmen |
| Overlay-Server | `main/services/overlay-server.ts` | **H8-Fix** (Ping/Pong-Heartbeat + `terminate()`), EIN persistenter `subscribeAll` der über Client-Set iteriert (statt Closure pro Client), localhost+Token-Auth übernehmen, Avatar-/Sound-Import-Routen raus |
| Overlay-DSL-Typen | `shared/types/index.ts:99-224` | nach `packages/overlay-engine`, + **ajv-Schema (K3)**: Validierung vor JEDEM Save UND Load, `schemaVersion` + Migrations |
| SafeZone-Profile | `overlay-layout-store.ts:48-148` | TikTok Portrait/Landscape-Zonen übernehmen |
| Widget-Kit (selektiv) | `packages/widget-kit/` | Pro-Widgets portieren, **entkoppeln**: widget-base ins Package, Fonts **lokal gebundelt** statt Google-CDN (lokal-first!), Daten nur noch via WS-Push (kein Polling gegen Editor-Server) |
| Settings-Store | `main/services/store.ts` | electron-store-Muster + `schemaVersion` |
| Build-Setup | `forge.config.ts`, `vite.*.config.ts`, tsconfig, eslint, `release.yml` | als Vorlage; Fuses/ASAR-Unpack/Externals übernehmen, **Tests in CI ergänzen**, RunAsNode-Fuse AUS (kein editor-server mehr) |

### 🆕 NEU bauen

| Teil | Warum neu |
|------|-----------|
| `packages/trigger-engine` | existiert nicht. Reine Logik, TDD: Regel = `{event, conditions, actions[], cooldownMs, enabled}` |
| `packages/overlay-engine` | Runtime-Renderer existiert nicht (Alt: nur Typen + Store). DSL-Schema (ajv) + schlanker Vanilla-JS-Renderer (Layout→DOM, Widget-Registry, WS-Client mit Auto-Reconnect) |
| Sound-Player (lokal) | Alt-Architektur broadcastet Audio an ALLE WS-Clients → würde im TTLS-Browser landen. Neu: Wiedergabe im App-Renderer (App-Shell `<audio>`), nie im Overlay. Außerdem Alt-Bug: liest `payload.value` statt `coins` → big-gift feuerte nie |
| App-Shell | Alt-UI ist LLM-Builder-zentriert. Neu schlank: Verbinden · Overlay-Screen bauen · Trigger · Sounds · Link kopieren. Premium-Design via frontend-design |
| Session-Stats (`main/core`) | Leaderboard/Goal-Stände: kleine aggregierende Klasse + SQLite/JSON-Persistenz mit Schema-Version. Memory-Manager der Alt-App ist Overkill |
| Event-Replay | Recorder (JSONL) + Player → Trigger/Overlays testen ohne Live |

### ❌ WEGLASSEN (Bausteine 4–6, später)

LLM-Provider (7×) · TTS-Provider (3×) · Orchestrator · Memory-Manager/Conversation-Memory ·
Builder-Tools · Editor-Server · VRM-Avatar · Telemetry. `packages/tiktok-connector` ist
Karteileiche (Desktop importiert die Lib direkt) — kommt nicht mit.

---

## 2. Architektur-Invarianten (aus Spec §6 + Audit)

1. **Backpressure überall (H6):** Event-Bus-Konsumenten mit gedeckelten Queues; Overlay-Push
   koalesziert State-Updates (letzter Stand gewinnt), Alerts in begrenzter Queue (max N, Rest droppen + Zähler).
2. **Ein Link:** `http://127.0.0.1:<port>/overlay?token=…` rendert den aktiven Screen transparent (1920×1080, skaliert via CSS-Transform).
3. **Sound nie im Overlay-HTML.** WS-Kanal `overlay` (Widgets) strikt getrennt von App-internen Kanälen.
4. **Core ohne Electron-Imports** → unit-testbar mit `node:test` + tsx, läuft in CI ohne Rebuild.
5. **Persistenz:** alles mit `schemaVersion` + Migrationspfad.

---

## 3. Bau-Reihenfolge mit Testpunkten (Branch `feat/mvp-pur-kern`)

| # | Schritt | Testpunkt |
|---|---------|-----------|
| 1 | **Scaffold:** electron-forge + Vite + TS-strict + ESLint/Prettier, Workspaces, CI (lint+typecheck+test) | App startet, CI-Workflow grün |
| 2 | **trigger-engine** (pure, TDD) | Unit-Tests: Matching, Bedingungen (gift≥N, keyword, combo), Cooldown |
| 3 | **overlay-engine: DSL + ajv-Schema (K3)** + Layout-Store mit Validierung vor Save/Load | Unit-Tests: valide/invalide Layouts, Migration v1 |
| 4 | **Event-Bus (typed) + TikTok-Adapter v2 (K1/K2-Fix) + Replay-Recorder/-Player** | Unit-Tests Adapter-Normalisierung via Fixtures; Reconnect-Szenario-Test (Epoch) |
| 5 | **Overlay-Server (H8) + Overlay-Runtime/Renderer** | Browser auf Link → Replay-Events → Widgets reagieren; Heartbeat räumt tote Clients |
| 6 | **Widget-Kit:** Gift-Alert · Follow-/Sub-Alert · Goal-Bar · Leaderboard · Gift-Feed · **Chat-Box (neu)**, Premium-Polish, Fonts lokal | visuelle Prüfung 1920×1080 transparent, Performance-Blick (CPU) |
| 7 | **Trigger-Verdrahtung + lokaler Sound-Player + Session-Stats** | E2E mit Replay: „Gift ≥ N → Alert + Sound lokal" |
| 8 | **App-Shell:** Connect, Screen-Editor (Canvas + SafeZones), Trigger-UI, Sound-Zuordnung, Link kopieren | manueller Durchstich: Screen bauen → Link → Browser |
| 9 | **Release-Engineering:** SemVer, Changelog, Auto-Update (update-electron-app), GitHub-Actions-Release (Windows) | `npm run make` lokal erzeugt lauffähiges Paket |
| 10 | **Smoke-Test Stream-PC:** Link in TTLS, echter Live-Connect, Trigger live | Definition of Done §12 der Spec |

Jeder Schritt = eigene(r) Conventional Commit(s), CI bleibt grün.
