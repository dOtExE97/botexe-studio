# Changelog

Alle nennenswerten Änderungen. Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [Unreleased] — MVP „Pur-Kern"

### Added
- **TikTok-Adapter** auf v2-API (`TikTokLiveConnection`): Chat, Gift (+Combo), Follow, Sub*, Like, Share, Viewer-Count; Reconnect mit Epoch-Token — keine Doppel-Connections/Doppel-Events (Audit K1/K2)
- **Trigger-Engine**: „Wenn Event (+Bedingung) → Aktion" — Bedingungen (Gift ≥ Coins, Combo ≥ N, Gift-Name, Chat-Keyword, Viewer ≥ N), Cooldown pro Regel, deterministisch über Event-Zeit
- **Overlay-Engine**: Layout-DSL mit ajv-Validierung vor Save **und** Load (K3), Schema-Version + Migrationspfad, Hochformat (1080×1920, TikTok-Default) & Querformat, TikTok-UI-SafeZones
- **Overlay-Server**: EIN Link für TikTok Live Studio, WebSocket mit Heartbeat (H8), ein persistenter Bus-Listener, Backpressure bei Gift-Bombing (H6), 127.0.0.1 + Token-Auth, `POST /api/test-event`
- **9 Widgets** (Neo-Arcade Broadcast): Gift-Alert (Profilfoto + Gift-Bild), Follow-/Sub-/Share-Alert, Goal-Bar, Top Gifter, **Like-Liste** (Usernamen + Profilbilder), Gift-Feed, Chat-Box, **Geschenke-Glas** (echte Gift-Bilder stapeln sich als Kugeln), **Gift-Feuerwerk** (Raketen = Gift-Bilder, Burst skaliert mit Coins), **Live-Zähler**
- **Akzentfarbe pro Widget** im Editor (Color-Picker)
- **Sounds lokal**: Wiedergabe in der App (→ Mischpult), nie im Overlay; Import per Datei-Dialog + **MyInstants-Suche** mit Direkt-Import
- **Event-Replay**: Stream aufnehmen (JSONL) und ohne Live wieder abspielen; Test-Event-Buttons
- **App-Shell**: Live-Cockpit, Overlay-Editor (Drag/Resize, SafeZone-Guides), Trigger-Editor, Sound-Verwaltung
- **Qualität**: 72 Tests (node:test, ohne Electron lauffähig), CI-Gate (Lint + Typecheck + Test), E2E-Screenshot-Tour via CDP

*Sub-Events: tiktok-live-connector v2 emittiert kein dediziertes subscribe-Event mehr — wird beim Live-Test verifiziert.

- **TTS (Baustein-4-Schnitt):** Chat-Vorlesen wie TikFinity (an/aus, Vorlese-Format, Befehle überspringen) mit **eigener stabiler Stimme pro Zuschauer** oder fester Stimme; 16 kuratierte Edge-TTS-Stimmen (DE/AT/EN, gratis); Trigger-Aktion „Ansage sprechen" mit Platzhaltern ({user}, {gift}, {coins}, …); Troll-Schutz (Links raus, Emoji-/Zeichen-Spam eingedampft, Längen-Cap, Queue-Cap bei Fluten); Wiedergabe lokal über die App

### Security
- Schmale Preload-API (kein generisches `invoke`, Audit H2), CSP, sandbox, gehärtete Fuses (RunAsNode aus)
