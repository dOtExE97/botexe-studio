# Changelog

Alle nennenswerten Änderungen. Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [0.3.1] — 2026-06-17

### Fixed
- **„Rahmen ausblenden" entfernt jetzt wirklich den Kasten.** Der Schalter nullte nur Hintergrund + Schatten — der sichtbare Milchglas-Kasten kam aber zusätzlich vom Blur (`backdrop-filter`) und der Gradient-Randlinie, die stehen blieben. Jetzt verschwindet beides → nur noch der Inhalt.
- **Sport-Ticker robuster:** transiente „fetch failed"-Aussetzer (z.B. WM-Abruf) werden mit Timeout + einer automatischen Wiederholung abgefangen, statt im Log zu landen.

### Changed
- **Herzregen (Likes):** deutlich **mehr Herzen** pro Like und **schöneres Aufsteigen** — sie steigen höher hinaus, schwingen sanft und faden erst ganz oben aus (vorher spärlich und früh verschwunden).

---

## [0.3.0] — 2026-06-17

**Highlight: Verbinden ist jetzt kostenlos.** TikTok-Live lässt sich ohne Bezahl-Plan verbinden — über Eulers gratis Cloud-WebSocket mit einem kostenlosen Community-Key.

### Added
- **Gratis-Verbindung über Eulers Cloud-WebSocket** (neuer Standard): Eulerstream hat das Selbst-Signieren hinter den Business-Plan gelegt („requires a Business plan"); der **Cloud-WebSocket** ist dagegen im kostenlosen Community-Plan enthalten und verbindet mit dem **Gratis-Key**. Empfängt Chat/Geschenke/Likes/Follows. Eingebaute 8-Stunden-Reconnect-Logik (Zähler/Bestenlisten überstehen den Reconnect).
- **Verbindungs-Modus-Umschalter** in den Einstellungen: **Cloud (gratis, Standard)** vs. **Direkt** (selbst signieren, kann zusätzlich Chat senden, braucht aber einen kostenpflichtigen Business-Key).
- **Onboarding für den Key**: klare 3-Schritt-Anleitung + Button **„Gratis-Key holen"**, der direkt `eulerstream.com/register` öffnet.
- **Sport-Ticker-Ausbau**: Datumsfilter (behebt das WM-„fetch failed"-Timeout), **Tabelle/Standings**, **Mannschaftsfilter**, Ansicht Matches / Tabelle / Beides (als Slider) und mehr Optionen für die Anzahl angezeigter Spiele.
- **„Rahmen ausblenden" für alle Widgets**: universeller Schalter — nur der Inhalt, ohne Glas-Rahmen/Schatten (wie bei der Like-Liste), damit Overlays den Bildschirm nicht zu stark zudecken.

### Changed
- **Sign-/API-Key-Feld** in einen eigenen, prominenten Abschnitt „TikTok-Verbindung" verschoben, mit **„gesetzt"-Status** — der Key ist jetzt fürs Verbinden nötig, nicht nur fürs Senden.

### Fixed
- **Key wird nicht mehr versehentlich gelöscht**, wenn man das leere Feld anklickt und wieder verlässt (Speichern nur bei nicht-leerem Wert).
- **Klare Fehlermeldung statt Retry-Spam**, wenn der Sign-Server (eulerstream) die Verbindung ablehnt.

---

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

- **TikFinity-Look nachgebaut (nach Referenzbildern):** Coin-Glas als echtes Einmachglas mit Deckel, das sich von unten mit hunderten kleiner bunter Münzen füllt (statt großer gestapelter Bilder); Leaderboard/Like-Liste neuer Stil „Arcade" — keine Box, runde Avatare in der Reihe, Kronen pro Rang, dicke bunte Konturschrift (Gold/Silber/Bronze/Grün), ▲-Werte, frei schwebend auf Transparenz
- **Konturschrift-Helfer** (`widget-base.css`): dicke schwarze Textkontur (TikFinity-Signatur) für alle Widgets nutzbar

- **Premium-Font lokal gebündelt:** Lilita One (chunky rounded) + Baloo 2 als Widget-Display-/Body-Font — der TikFinity-typische fette Comic-Look, komplett offline (kein CDN)
- **Coin-Glas = echte Geschenke:** jedes Gift fällt als weißer Ball mit dem echten Gift-Bild darin ins Einmachglas; je mehr Coins, desto größer der Ball; füllt sich dicht von unten (framerate-unabhängige Delta-Time-Physik, robust gegen Fenster-Drosselung)
- **Arcade-Leaderboard verfeinert:** größere Avatare, Kronen pro Rang (Gold/Silber/Bronze), runde fette Konturschrift, ▲-Werte — sehr nah am TikFinity-Original

- **Wechsel-Bestenliste (Rotator):** ein Widget, das untereinander Top Gifter → Top Likes → Top Punkte zeigt und smooth durchrotiert (Sekunden + Reihenfolge einstellbar) — Hochformat-tauglich, mit Medaillen, Kronen, Konturschrift, ▲-Werten
- **Coin-Glas runder & realistischer:** bauchiges Bonbon-Glas (gerundete Schultern + Boden) mit getöntem Glas-Look, Reflexen und Schraubdeckel statt schmalem Becher

- **Zuschauer-Verwaltung:** eigene Seite — pro Zuschauer Punkte vergeben/abziehen (−10/+10/+100), VIP markieren, vom Chat-Vorlesen sperren (Troll-Schutz), eigene TTS-Stimme zuweisen; Aktivitäts-Stats (Gifts/Coins/Likes), Suche. Punkte-System um Flags/Stats erweitert (schemaVersion 2 mit Migration)
- **Glücksrad-Widget:** animiertes Preis-Rad mit frei wählbaren Segmenten; dreht bei einer Trigger-Aktion (z.B. „!spin") und zeigt den Gewinn — mit **Punkte-Economy** (Kosten pro Spin werden dem Zuschauer abgezogen, kein Spin bei zu wenig Punkten). Trigger-Aktion „Glücksrad drehen" im Editor
- **Profi-Glücksrad:** Standfuß (Pfosten + Sockel) im Canvas gezeichnet, **blendet sich beim Spin automatisch ein und nach dem Ergebnis wieder aus**, echte Spin-Animation (Anlauf rückwärts → Ease-out-Auslauf, klickender Zeiger an den Segmentkanten), Pins am Rand, Ergebnis-Popup mit Gewinner-Name. Im Editor: Auto-Ein-/Ausblenden-Schalter + eigener Titel
- **Live-Vorschau im Overlay-Editor:** das ECHTE Overlay läuft als skaliertes iframe direkt im Editor-Canvas — man sieht jedes Widget live (inkl. Animationen, drehendem Rad, Demo-Gifts/Likes/Chat), während man es einstellt; Drag/Resize-Handles schweben transparent darüber. Runtime-Vorschaumodus (`?preview=1`) erzeugt lokal Demo-Daten, kein Live-Stream nötig. Umschaltbar
- **Media-Widget (Bild/Video):** eigene Bilder & Videos importieren (PNG/JPG/GIF/WEBP/MP4/WEBM) und im Stream einblenden — **dauerhaft** (Logo/Banner/Wasserzeichen) oder **per Trigger** (blendet sich ein, spielt ab, verschwindet von selbst). Use-Case: **Begrüßungsvideo bei einem Superfan-Gift**. Visueller Thumbnail-Picker im Editor mit Import-Button, Modus/Anpassung/Rahmen einstellbar. Neue Trigger-Aktion „Medium abspielen". Server liefert Medien mit HTTP-Range (Video-Seeking)
- **Fix:** neu angelegte Overlay-Profile scheiterten still an der Layout-Validierung (Canvas bekam ein verbotenes `label`-Feld) — Profile speichern jetzt zuverlässig. Service-Tests (points-store, media-library, aws-sigv4, tts-byok) laufen jetzt im Test-Glob mit
- **App-UI auf Premium-Niveau:** gebündelte Lilita One als Display-Font (statt Archivo Black), Body-Hintergrund mit dezenten Akzent-Radials, neues Glas-/Glow-Utility-System (`.bx-card/.bx-input/.bx-select/.bx-pill/.bx-btn-accent`), gestylte native Selects (kein OS-Look mehr). Alle Seiten (Einstellungen, Stimme, Trigger, Zuschauer, Sounds, Live) durchgängig im Premium-Look mit lucide-Icons statt Emoji; Live-Cockpit mit Glas-Stat-Karten + Chunky-Zahlen
- **Widget-Politur:** Herzregen rendert echte SVG-Herz-Sprites mit Glow (statt Roh-Emoji, Emoji-Override bleibt), Live-Zähler mit monochromen SVG-Icons statt bunter Emoji, Countdown mit lebendigen Roll-Ziffern beim Sekundenwechsel, Punkte-Bestenliste mit Medaillen + Krone (wie Top-Gifter), Emoji-Brüche in Activity-Feed/Follow-Alert/Top-Gift durch saubere Inline-SVG-Icons ersetzt
- **Multi-Action-Combos:** eine Trigger-Regel feuert mehrere Aktionen mit pro-Aktion-Verzögerung (Alert jetzt, Sound +0,5s, Ansage +2s …) — `delayMs` am Action-Typ, Studio plant verzögert, „+Sek."-Feld im Trigger-Editor
- **Punkte-Einlöse-Store:** Zuschauer geben per Chat-Befehl gesammelte Punkte aus → Belohnung (Sound/Ansage/Alert/Medium), wie Twitch-Kanalpunkte; reicht das Guthaben nicht, passiert nichts. Globaler Cooldown pro Einlösung. Eigene Store-Seite
- **Manuelles Panel + globale Hotkeys:** Software-Stream-Deck — Soundboard (Klick = Sound) + Schnell-Aktionen, auslösbar per Klick oder globalem Tastenkürzel (auch wenn die App im Hintergrund läuft), Hotkey-Aufnahme im UI
- **Audio-Ausgabegerät wählbar:** Sounds & TTS auf ein beliebiges Ausgabegerät routen (`setSinkId`) — Standard reicht für jeden, Mischpult/virtuelles Kabel optional
- **Design-Abnahme-Fixes (Widgets):** `encodeURI`-Doppel-Encoding zerstörte Profilbilder (leere Avatare in Leaderboard/Rotator/Alerts/Feeds/Chat — hätte auch echte CDN-URLs mit %-Sequenzen getroffen) → sicheres Quote-Escaping; Punkte-Bestenliste in der Editor-Vorschau gefüllt (Demo-`topPoints`); Herzregen-Sprites streamtauglich vergrößert; Emoji-Kronen durch SVG-Kronen ersetzt (plattform-konsistent)
- **Stream-Bingo** 🎯: Bingo-Brett (3×3 bis 5×5) mit Auto-Zielen (Gift-Namen + Like-/Coin-/Follower-Meilensteine relativ zum Rundenstart) — Zellen haken sich LIVE ab (Spring-Haken + Sound), komplette Reihen/Spalten/Diagonalen bekommen eine goldene Durchstreich-Linie + BINGO-Banner, volles Brett würfelt automatisch eine neue Runde. Deterministisch über mehrere Overlay-Clients
- **Zahlen-Raten** 🔢: App denkt sich eine Zahl aus (Bereich einstellbar, z.B. 1–10 oder 1–100), Zuschauer raten im Chat — optional Höher/Niedriger-Tipps, Treffer flippt die Kacheln auf mit Gewinner (Name + Avatar), Konfetti + Sound, automatische neue Runde. (Beides TikFinity-PRO-Features — hier gratis)
- **Spiel-Widget-Sounds**: Overlay-Spiele lösen Sounds sicher über die App aus (WS-Rückkanal mit Dedup — kein Doppel-Ton bei OBS+TTLS gleichzeitig)
- **Begrüßung neuer Zuschauer:** Trigger-Bedingung „Allererste Nachricht (neuer Zuschauer)" — z.B. „Willkommen {user}!" als Ansage/Alert beim ersten Chat überhaupt
- **Counter-Widget:** manueller Zähler („Tode: 7") im Premium-Glas-Look — hoch/runter per Panel-Klick, **Hotkey** oder Chat-Befehl (neue Aktion „Counter ±"); Wert überlebt Overlay-Reloads
- **Store-Ausbau:** Glücksrad als Einlöse-Belohnung („!spin für 100 Punkte" jetzt direkt im Store baubar); Warn-Hinweis in Trigger & Store, wenn eine Aktion auf ein gelöschtes Widget zeigt
- **Onboarding & Test-Tools:** „So geht's los"-Banner (3 Schritte, dismissbar) im Live-Cockpit; Test-Sub/-Share-Buttons + Freitext-Test-Chat (Befehle wie „!spin" ohne Live testbar)
- **Selbst-Audit-Fixes (Korrektheit/Sicherheit/UX):** `settings.get()` tiefe Kopie (kein mutable-Cache-Leak); BYOK-Keys werden nicht mehr an den Renderer gegeben; doppelter Punkte-Abzug bei Spin-Rad-Belohnung behoben; Redemption-Cooldowns bei neuem Stream zurückgesetzt; `delayMs` geclamped; Overlay-WS gehärtet (maxPayload, clientlog Cap/Rate-Limit/Newline-Strip); OverlayPage auf Premium-Optik gehoben (war als einzige Seite ausgelassen); **Bestätigung bei destruktiven Aktionen** (Punkte-Reset, Löschen); **Test-Button pro Trigger & Einlösung**; neue settings-store-Migrations-Tests
- **Diagnose/Robustheit fürs Ausliefern:** Datei-Logging pro App-Start (`userData/logs/`, letzte 15), Renderer-Fehler (uncaught/Promise/React-ErrorBoundary) + Overlay-Widget-Fehler (WS-Rückkanal) landen alle im zentralen Log; ErrorBoundary mit Crash-Screen statt weißem Bildschirm; sichtbares Toast-Fehler-Feedback (TTS-/Verbindungs-/Sound-Fehler); „Logs öffnen"-Button in den Einstellungen
- **Editor-UX auf Profi-Niveau:** alle Widget-Einstellungen wählbar (5 Lücken geschlossen), Sekunden statt ms, Schalter, Erklärung bei jeder Einstellung
- **TTS respektiert Zuschauer:** gesperrte (gemutete) Zuschauer werden nicht vorgelesen; eigene Stimme pro Zuschauer hat Vorrang

### Security
- Schmale Preload-API (kein generisches `invoke`, Audit H2), CSP, sandbox, gehärtete Fuses (RunAsNode aus)
