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

- **TTS-Provider-Auswahl:** Edge (online, beste Qualität) · **Piper (100% lokal/offline**, 8 Stimmen DE/EN, einmaliger Download ~25–80 MB, Synthese <0,5s auf CPU) · Google-Robo (inoffiziell, Meme-Klassiker). Stimmen-Dropdown gruppiert, Piper-Setup per Klick

- **BYOK-Premium-Stimmen:** eigene Keys pro Dienst eintragen (mit Anleitung in der UI), Stimmen erscheinen im normalen Dropdown — **TTS.Monster** (Twitch-KI-Stimmen, gratis), **Amazon Polly** inkl. „Brian" (eigene AWS-SigV4-Signierung, ohne aws-sdk), **ElevenLabs**, **OpenAI-kompatibel** (lokale KI via XTTS/openedai-speech). Keys bleiben lokal, werden nie an den Renderer zurückgegeben

- **Chat-Befehle:** Trigger-Bedingung „Nachricht ist Befehl (!hype)" — Befehl am Zeilenanfang, mit/ohne Argumente, case-insensitive (Fundament fürs spätere Stream-Kartenspiel)
- **Timer-Trigger:** wiederkehrende Aktionen alle N Sekunden (z.B. alle 10 Min. Socials einblenden + Ansage) — TikFinity-Klassiker, läuft über einen 1s-Ticker

- **Profile (mehrere Overlay-Screens):** beliebig viele Overlays, jedes mit eigenem Format (Hoch-/Querformat) und **eigenem Link** — Hochformat und Querformat können gleichzeitig in verschiedene Quellen gestreamt werden (wie TikTok es erlaubt). Profil-Leiste im Editor: anlegen, umbenennen, duplizieren, Standard setzen, Link kopieren. Overlay-Server liefert pro Link genau dessen Profil, Layout-Broadcasts sind profil-gefiltert
- **Premium-Widget-Design:** kompletter Optik-Overhaul — gemeinsame Design-Basis (`widget-base.css`) mit Glasmorphismus (backdrop-blur, Gradient-Hairline-Rand), Tiefen-Schatten, Neon-Akzent-Glows, Avatar-Glow-Ringe, Medaillen-Ränge + Krone, Shimmer-Sweeps, Spring-Pop & Float-Animationen. Akzentfarbe pro Widget durchgängig. Kein „Stock"-Look mehr

- **Loyalty-Punkte-System (persistent):** Zuschauer sammeln über alle Streams hinweg Punkte für Aktivität (Chat/Follow/Sub/Share/Gift-Coins, Raten einstellbar, eigener Währungsname). JSON-Persistenz mit Schema-Version + atomarem Write, `spend()` für künftige Einlösungen — die Währungs-Basis fürs spätere Stream-Kartenspiel
- **3 neue Widgets:** Punkte-Bestenliste (All-Time Top-Supporter), Countdown (Pausen-/Start-Timer, Glas-Kapsel), Activity-Feed (gemischter Live-Ticker Follow/Sub/Share/Gift)
- **Einstellungen-/Über-Seite:** Loyalty-Regeln, Punkte-Reset, App-Infos (Version, Electron/Node, Overlay-Port, Datenordner öffnen)

- **Stil-Varianten pro Widget:** Follow-Alert in 4 Stilen (Glas/Neon/Minimal/Hype), Leaderboard & Like-Liste in 3 Stilen (Glas-Panel/Neon-durchscheinend/Balken-minimal), Lauftext in 3 Stilen — im Editor per „Stil"-Dropdown wählbar, stream-tauglich (durchscheinend, deckt wenig zu)
- **3 weitere Widgets:** Herzregen (Likes steigen als Emojis auf, transparent), Lauftext-Banner (scrollende Socials/Ansagen, dünn), Top-Gift (Highlight des größten Einzel-Gifts mit Bounce bei Rekord)

### Security
- Schmale Preload-API (kein generisches `invoke`, Audit H2), CSP, sandbox, gehärtete Fuses (RunAsNode aus)
