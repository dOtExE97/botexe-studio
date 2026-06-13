# Plan: Feedback aus dem ersten 5h-Live-Stream (Alex, 13.06.2026)

Erster echter Live-Betrieb: 5h stabil, TTS + Like-/Coin-Liste + Zahlen-Raten
kamen super an. Hier die Verbesserungen, systematisch + mit Lösung & Prio.

> **Stand 13.06.: ALLES ERLEDIGT ✅ (188 Tests grün).** Batch 1, Galerie (G1+G2),
> Feuerwerk-Upgrade, B2.1 Widget-Styling (Schrift/Größe/Farbe alle Text-Widgets),
> B2.2 Top-Gift/Top-Streak, B2.3 Like-Fontäne, B2.4 Bingo-Gift-Picker, B3.1 Spiel-
> Leaderboard, B3.2 Palette-Kategorien, B3.3 Stats (Kommentare + Woche/Monat/Jahr),
> B3.4 Begrüßungsvideo pro Zuschauer, B3.5 TTS-Timing (echtes Audio-Ende).
> → Bereit für einen neuen Windows-Build.

### B2.4 Bingo voll konfigurierbar ✅
`gifts`-Feld ist jetzt ein visueller `<GiftListEditor>` (Chips mit Bild +
GiftPicker aus dem Katalog) statt Textfeld. Größe 3×3–5×5 + Meilenstein-Schritte
(Likes/Coins/Follower) bleiben einstellbar → freie Wahl der Felder.

### B3.1 Spiel-Leaderboard ✅
PointsStore: `recordWin`/`topWinners` (TDD). guess-number meldet Sieger via
`ctx.reportWin(winId=layerId+Runde, user)`; Server dedupliziert über winId
(OBS+TTLS+Vorschau = 1×, getestet). Rotator-Quelle `wins` („Top Gewinner" 🏆).

### B3.3 Stats erweitert ✅
Live-Cockpit: Karte „Kommentare" ergänzt. Neuer `StatsHistory`-Store (TDD):
beendete Sessions werden mit Datum abgelegt; Zeitraum-Leiste Woche/Monat/Jahr
auf der LivePage (summiert vergangene Streams + laufende Session).

### B3.4 Begrüßungsvideo pro Zuschauer ✅
PointsStore `welcomeMediaId`; Zuschauer-Tab: Dropdown „Begrüßung" (Media-Bib).
Bei Teamherz (sub) spielt das Medium auf dem ersten Trigger-Media-Widget
(`play_media` mit `params.mediaUrl`-Override in `media.js`).

### B3.5 TTS-Timing ✅
Statt Zeichen-Schätzung wartet die Queue aufs ECHTE Audio-Ende: Renderer meldet
`reportSoundEnded` → `tts.notifyEnded`; Schätzung nur noch als Sicherheits-
Fallback. Sauberes Gating, keine Überlappung mehr (TDD).

## 🔴 BATCH 1 — Kritische Bugs ✅ ERLEDIGT

### B1.1 Combos: „10x Rose → nur 1 (kleine) Rakete"
**Diagnose:** Streakable Gifts (giftType 1) werden korrekt zu EINEM Event mit
`count`=10 zusammengefasst. Das Feuerwerk skaliert aber nur über `totalCoins`
(10 Coins → winzige power) und macht 1 Rakete. Zudem `maxRockets`-Cap (3)
verwirft bei mehreren Gifts überzählige → „teils 1 Rakete".
**Lösung:** Feuerwerk + Glas auf `count` reagieren lassen — mehrere Raketen pro
Combo (z.B. min(count, maxRockets) gestaffelt), Burst-Größe auch aus count.
Coin-Glas: Combo wirft `count` Bälle, nicht einen. maxRockets-Default höher.

### B1.2 Bingo kaum lesbar + keine Gift-Bilder
**Diagnose:** Schrift zu klein bei 3×3 in kleinem Layer; Gift-Zellen zeigten
keine Bilder (Katalog-Fetch lief evtl. erst nach Render / Default-Größe zu klein).
**Lösung:** Schrift skaliert mit Zellgröße (clamp/cqw), Gift-Bild groß + Name
klein darunter, Kontrast hoch (dunklerer Zell-BG). Katalog-Bilder garantiert
anwenden (auch retro nach Render). Default-Widgetgröße größer.

### B1.3 Auto-Reconnect beim nächsten Live (wie TikFinity)
**Diagnose:** Bei `streamEnd` geht der Adapter in `streamEnded=true` und
reconnected NICHT — nächstes Live = manuell verbinden.
**Lösung:** Nach streamEnd (und auf Wunsch dauerhaft) „Auto-Connect"-Modus:
periodisch `fetchIsLive` pollen und automatisch verbinden, sobald @user wieder
live ist. Schalter im Live-Tab „Automatisch verbinden". Username merken (tut er
schon).

## ⭐ Headline (Wunsch 13.06. nachgereicht): Geschenke-Galerie + Gift-Suche ✅ ERLEDIGT

> Umgesetzt: `GiftCatalog` um Erstsender+Datum & „inLastRoom" erweitert (TDD),
> `getGiftCatalog`-IPC, `useGiftCatalog`-Hook, `<GiftPicker>`-Komponente,
> `GalleryPage` (3 Ansichten/Suche/Sortierung/Erstsender-Badge/Aktions-Panel),
> Gift→Regel-Helfer in trigger-engine (`upsertGiftRule` etc., TDD). GiftPicker
> ersetzt das Textfeld bei `gift_slug_is`. Overlay-Server hängt Token an relative
> JS-Imports an (sonst lädt das Feuerwerk-Combo-Modul nicht).

### G1 Geschenke-Galerie als eigene Menü-Seite
Eigene Seite „Geschenke" (Nav-Icon Gift): zeigt ALLE je gesehenen Gifts aus
dem Katalog (642+) als visuelles Raster mit echtem Bild, Name, Coin-Wert,
Häufigkeit. Suche + Sortierung (Wert/Name/zuletzt gesehen). Pro Gift direkt
**Aktionen zuordnen** (wie TikFinity): Sound, Alert/Feuerwerk, TTS-Ansage,
Punkte, … → legt im Hintergrund eine Trigger-Regel `event:gift` +
`gift_slug_is` an (oder editiert die bestehende). Mehrere Aktionen pro Gift
kombinierbar (nutzt die schon vorhandene Multi-Action-Engine).
**Braucht:** `getGiftCatalog`-IPC (gibt es nur als Overlay-HTTP-Route → in den
Preload spiegeln), Galerie-Page, Gift→Regel-Mapping-Helfer.

### G2 Gift-Schnellsuche auf der Trigger-Seite
`gift_slug_is` ist heute ein blankes Textfeld. → Visueller Gift-Picker mit
Suche + Thumbnails (gleicher Katalog), damit man das Gift nicht abtippen muss.
Gilt auch für Bingo-Felder (B2.4) und den Store. Eine wiederverwendbare
`<GiftPicker>`-Komponente.

## 🎆 Feuerwerk-Upgrade (Wunsch 13.06.) ✅ ERLEDIGT
Größere Bursts, Glitzer-Sterne (twinkle), heller Initial-Blitz, **mehrfarbige
Bursts** (zwei Paletten gemischt), **Verbund** (kräftige Raketen brechen oben in
mehrere kleine Nach-Bursts = multi-break shell), goldener Funken-Schweif. Combo
einstellbar (Auffächern/Eine-große, max Raketen, Burst-Größe). **Sound an die
Animation gekoppelt**: Pfeife beim Aufstieg (`botexe-pfeife.wav`) + Boom bei der
Explosion (`botexe-boom.wav`), über `ctx.playSound` (Server dedupliziert die
Salve). gift-fireworks aus `collectGiftSounds` raus → kein Sofort-Doppel-Boom.
Sounds via `scripts/gen-firework-sounds.mjs` synthetisiert.

## 🟡 BATCH 2 — Wichtige Features

### B2.1 Widget-Styling: Schriftart, -größe, -farbe pro Widget ✅ (Haupt-Text-Widgets)
**Umgesetzt:** Runtime setzt `--bx-font-display/-body` (Schriftart, 7 lokale/
System-Fonts) + `--bx-text` (Farbe) auf den Layer-Root und skaliert den Inhalt
über einen Zoom-Wrapper (Größe Klein→Sehr groß, ohne Box-Änderung). Editor-Set
`STYLE_FIELDS` (Schriftart/Größe/Textfarbe) an Top-Gift, Top-Streak, Leaderboard
(Gifter+Likes), Top-Rotator, Punkte-Board, Live-Zähler; deren Haupttext auf
`var(--bx-text,#fff)` gesweept. **Offen:** dieselben 3 Felder bei den restlichen
Text-Widgets (gift-feed, chat-box, activity-feed, goal-bar, counter, countdown,
text-ticker) nachziehen — gleicher Mechanismus, nur Registry + kleiner Sweep.

### B2.2 Top-Geschenk + Top-Streak (User + Gift-Bild)
- Top-Gift gibt es — erweitern: Spender-Avatar + Name prominent + Gift-Bild.
- NEU `top-streak.js`: höchste Combo der Session (User-Avatar + Gift-Bild +
  „xN"-Streak-Zahl). Stats brauchen `topStreak` (count + user + gift).

### B2.3 Like-Fontäne wie TikFinity (Mini-Herzen)
**Lösung:** heart-rain überarbeiten — viele kleine Herzen aus EINER Quelle
(unten mittig) als Fontäne aufsteigend statt verteilt; dichter, kleiner,
weicher Bogen. Canvas-Variante für Performance bei vielen Likes.

### B2.4 Bingo voll konfigurierbar
**Lösung:** Pro Zelle wählbar (Grid-Editor): Typ + Wert; Gift-Zellen über
**visuellen Gift-Picker aus dem Katalog** (642 Gifts mit Bildern!). „Auto"
bleibt als Schnellstart. Welche Felder/Ziele = freie Wahl.

## 🟢 BATCH 3 — Größere Features

### B3.1 Spiel-Leaderboard (Zahlen-Raten-Siege etc.)
**Lösung:** Gewinn-Zähler pro User persistent (im Points-Store als Stat
`gameWins` o.ä.). Rotator bekommt 4. Quelle „Top Gewinner". Eigenes Widget
optional.

### B3.2 Widget-Palette aufräumen (Kategorien/Dropdowns)
**Lösung:** Palette in Klappgruppen: „Alerts", „Listen", „Spiele", „Ziele/
Counter", „Stats", „Ambient/Deko", „Media". Suchfeld. Macht die lange Liste
übersichtlich (Bild 1/2).

### B3.3 Stats erweitern: Kommentare + Coins-Karte + Zeiträume
**Lösung:** Stat-Karte „Kommentare" (chats — Zähler existiert schon in totals).
Coins-Karte prüfen (war da). Zeiträume Woche/Monat/Jahr = persistente
Aggregation (eigener Stats-Verlauf-Store, eigene Ansicht/Tab). Größer.

### B3.4 Zuschauer: mehr Einstellungen + Begrüßungsvideo pro User
**Lösung:** Pro Zuschauer (Zuschauer-Tab): eigenes Begrüßungs-Medium zuweisen
(aus Media-Bibliothek) → spielt bei dessen nächstem Event/Teamherz automatisch.
Braucht: Media-Zuordnung pro User im Points-Store + Trigger „bei Teamherz von
VIP X → Media". Evtl. generelle „Aktion pro Zuschauer"-Regeln.

### B3.5 TTS-Timing bei mehreren Nachrichten
**Diagnose:** Serielle Wiedergabe über Dauer-SCHÄTZUNG (~60ms/Zeichen + 250ms) —
bei vielen Nachrichten driftet das (zu früh/zu spät überlappend).
**Lösung:** Echte Audiodauer aus der Datei nehmen (Renderer meldet `ended`
zurück), erst dann nächste Ansage. Sauberes Queue-Gating statt Schätzung.

## 🛠️ Editor-Canvas + Safe-Zones (Wunsch 13.06.) ✅
**Root-Cause „nur Boxen, keine Widgets":** Die Production-CSP des Renderers
(`script-src 'self'`, kein `unsafe-inline`) wurde via `onHeadersReceived` auf
ALLE Responses gelegt — auch aufs eingebettete Overlay-iframe. Dessen Config
kommt per Inline-`<script>window.BOTEXE_OVERLAY=…` → blockiert → Runtime startet
nie → leeres iframe. In OBS/TTLS (externe Browser) keine CSP → läuft; in Dev ist
die CSP ganz aus → fiel nie auf. **Fix:** lokales Overlay (127.0.0.1/localhost/
localtest.me) bekommt eine eigene lockere CSP, die strikte gilt nur fürs App-Shell.
**Design:** Widget-Rahmen erscheinen nur bei Hover/Auswahl (echtes WYSIWYG, die
Live-Widgets sind die Hauptsache), Safe-Zones weicher (Tönung + dünner Rand +
Pill-Label + Schraffur bei Sperrzonen).

## 🔬 Audit 13.06. (4 parallele Agenten) — Backlog

### Korrektheits-Fixes ✅ (sofort erledigt)
- **Feuerwerk-Sounds waren tot**: `this.ctx` (Widget-Kontext mit playSound) wurde
  vom Canvas-2D-Kontext überschrieben → Pfeife/Boom feuerten nie. Getrennt als
  `this.host`. (Regression von heute!)
- **Combo-Power-Überschätzung**: combo.js leitete `coinsPerUnit` aus `totalCoins`
  ab statt `totalCoins/count` → Combos ohne expliziten Einzelwert zu stark. Fix + Test.
- **Bingo-Timer-Leak**: Auto-Runde/Banner-Timer ohne destroy-Cleanup → liefen auf
  totem Widget. `this.timers`-Set + clear in destroy.
- **soundDedup-Leak**: Map wuchs unbegrenzt → Prune wie bei gameWinDedup.
- **media.js**: `duration` NaN/Infinity (Live-Quelle) → Finite-Guard.
- **gift-jar Backpressure**: fraß Boden-Bälle auch wenn nur `falling` voll → erst falling deckeln.

### Feature-Lücken
- 🔴 **Auto-Update** ✅: `update-electron-app` scharf (Repo gesetzt, notifyUser:false),
  manuelle „Nach Updates suchen" + „installieren & neu starten" in Settings,
  Event-Weiterleitung ans UI. `PublisherGithub` in forge.config + CI-Publish-Job
  bei Versions-Tag `v*` (Squirrel-Delta = nur Änderungen laden).
  **⚠️ Braucht öffentliche Releases** — update.electronjs.org bedient keine privaten Repos.
- 🔴 **Config-Backup/Export-Import** ✅: ein JSON-Bundle (Settings/Trigger/Store/Panel/
  Overlays/Zuschauer) per Datei-Dialog, Settings-Buttons, `points.exportEntries/importEntries`
  (TDD). Sounds/Medien bleiben als Dateien im Datenordner.
- 🟡 **Chat-Moderation** ✅ (Wort-Blocklist): `containsBlockedWord` (TDD), greift im
  TTS-Vorlesen, `moderation.blockedWords` in Settings + UI. (Caps/Link-Filter offen.)
- 🟢 **Sport-Liveticker** ✅: neues Widget `sport-ticker.js` — zeigt Fußballspiele
  (WM/Ligen) mit Wappen + Stand, pollt `/sport`, **blitzt bei jedem Tor auf** (+ Sound).
  Provider football-data.org (BYOK, WM=2000/BL=2002/PL=2021/CL=2001) ODER OpenLigaDB
  (keyless, bl1/bl2/dfb). `SportService` (Main, fetch+Cache 20s, Key serverseitig),
  `normalizeMatches` (TDD), `/sport`-Route, Settings-Key-Feld.
- 🟢 **Stats-CSV-Export** ✅: `studio.exportStatsCsv()` + CSV-Button in der Zeitraum-
  Leiste (LivePage), Datei-Dialog, BOM für Excel.
- 🟢 **Join-Begrüßung** ✅: neues Event `join` (TikTok „member"), Adapter-Listener,
  Trigger-Event-Option „Zuschauer betritt Stream" → frei beregelbar (mit Cooldown).
- 🟢 **OBS-WebSocket-Steuerung** ✅: `ObsService` (obs-websocket-js v5, Auto-Reconnect),
  Trigger-Aktionen `obs_scene`/`obs_visibility`, Settings-Sektion (URL/Passwort/Status),
  Trigger-Editor Szenen-Dropdown. → „Großes Gift → OBS-Szene wechseln".
- 🟢 **Stream-Deck-Plugin (Stufe 3)** ✅: vollständiges `.sdPlugin` (Manifest, plugin.js,
  Property Inspector, generierte PNG-Icons, README) in `streamdeck/`. Lokaler Steuer-
  Endpunkt `/api/panel` + `/api/panel/fire` (token-auth, getestet), Verbindungs-Info
  (URL+Token) in Settings → Stream Deck. **Bonus-Fix: Token jetzt PERSISTENT** (war
  pro Start zufällig → OBS-/Overlay-Links brachen nach jedem Neustart!).
- 🟢 **Hype-Train** ✅: neues Widget `hype-train.js` — Gifts & Likes treiben einen Zug
  in Stufen (Level 1→max), füllt sich live, verlängert den Timer, eskaliert die Farbe,
  Level-Up-Sound. Event-getrieben (onEvent), Container-Queries, TTLS-Anti-Throttle.
- 🟢 i18n, Code-Signing-Zertifikat, Trading-Card-Game (später).

### Premium-Designs (Themes) + neues Widget (13.06.) ✅
**Theme-System:** `THEMES`-Var-Bündel in `runtime/applyWidgetStyle` — 8 edle Skins
(Glas/Neon/Synthwave/Arcade/Luxus/Midnight/Inferno/Mint/Minimal) als `theme`-Prop
durchwählbar. Weil alle Widgets die CSS-Vars (--bx-glass/-shadow/-radius/-text/-font)
nutzen, übernimmt JEDES Widget den Look sofort — Akzentfarbe bleibt separat (Theme +
Brand-Farbe kombinierbar). `THEME_FIELD` in STYLE_FIELDS (alle Text-Widgets) + Spiele/
Hype/Sport/Subathon. Default 'glas' = aktueller Look.
**Neues Widget Subathon-Timer** (`subathon.js`): Countdown, den Gifts/Follower/Likes
verlängern (Sek. pro Coin/Follow/Like, Max-Cap, „+Xs"-Pop, Low-Time-Blink, Sound).

### Theme-Ausbau + Politur + helle Skins + Meilenstein-Widget (13.06.) ✅
**+8 Themes (jetzt 17):** 6 dunkle (Vapor, Holo, Royal, Forest, Mono, Aurora) +
2 **helle** (Paper, Bubblegum). Helle Themes setzen `--bx-text` auf dunkel, `--bx-ink`
auf hell und das neue Token `--bx-text-shadow` auf hell (in `widget-base.css`), damit
Kontur/Schatten auf hellem Grund nicht matschen. Alle 17 als `theme`-Prop durchwählbar
(`THEME_FIELD`-Dropdown, gruppiert dunkel/hell mit ☀️-Markierung).
**Lesbarkeits-Sweep für helle Themes:** Haupt-Titel/Zahlen, die direkt auf dem Panel
liegen (guess-number, sport-ticker, bingo, hype-train), von hartem `#fff` auf
`var(--bx-text,#fff)`. Texte auf dunkel getönten Innenflächen (Zeilen/Zellen) bleiben
weiß — dort liest Weiß auch auf hellem Theme besser. Outline-Schriften (dicke dunkle
Kontur) sind ohnehin auf beiden Untergründen lesbar.
**Politur:** dezentes Einschweben jedes Widgets beim Mount (`.bx-enter` in
`widget-base.css`, Runtime setzt die Klasse — außer bei vollflächigen Effekt-Widgets
Feuerwerk/Herzregen, die ihren eigenen Auftritt haben).
**Neues Widget Meilenstein-Konfetti** (`milestone-confetti.js`): feiert erreichte Marken
einer Metrik (Follower/Coins/Likes/Gifts) — entweder Schritt (alle N) ODER feste Liste
(„1000, 5000, 10000"). Bei Übertritt: Glow-Banner ploppt mit Zahl + Botschaft, 70er
Konfetti-Regen, optionaler Sound. Reine Schwellen-Logik `nextMilestone` DOM-frei +
TDD-getestet (6 Tests). Merkt sich beim ersten Stats-Push nur den Stand (kein
rückwirkendes Feiern). Editor-Vorschau führt sich selbst vor (neues `preview`-Flag in
der Widget-ctx → alle 7 s eine Demo-Feier).

### Audit nach Theme-Ausbau (4 parallele Agenten, 13.06.) ✅
- 🔴 **Helle Themes blieben weiß/unlesbar** — Kern-Bug: alle Text-Widgets hatten
  `textColor: '#ffffff'` als Default-Prop; `applyWidgetStyle` setzte `--bx-text` aus
  `props.textColor` IMMER (Default truthy) NACH dem Theme → überschrieb die dunkle
  Theme-Textfarbe. Fix: Default `textColor: ''` (leer = Theme/Standard gewinnt) an
  allen 14 Widgets. Erst dadurch greifen paper/bubblegum überhaupt.
- 🔴 **Über-Sweep der B2.1-Runde**: Konturschriften (weiße Füllung + dicke dunkle
  Kontur, TikFinity-Look) hatten ihre Füllung fälschlich auf `var(--bx-text)` —
  auf hellem Theme = dunkle Füllung + dunkle Kontur = unlesbarer Glyph. Fix: bei
  diesen Texten (top-rotator name/val/title, leaderboard-arcade title/val,
  top-streak-X) die **Kontur** auf `var(--bx-ink,#0a0b12)` umgestellt — `--bx-ink`
  ist die Gegenfarbe (dunkles Theme→dunkle Kontur, helles Theme→helle Kontur, da
  paper/bubblegum `--bx-ink` hell setzen). Damit bleibt die Füllung themebar UND es
  liest auf beiden. (Grün-gefüllte Arcade-Namen behalten dunkle Kontur.)
- 🔴 **goal-bar `%`-Text** lag auf dem immer-dunklen Fortschritts-Track, war aber auf
  `var(--bx-text)` → dunkel-auf-dunkel auf hellem Theme. Fix: zurück auf festes `#fff`
  (Track ist theme-unabhängig dunkel).
- 🔴 **gift-alert / follow-alert Name** (direkt auf dem hell werdenden Glas-Panel)
  von hartem `#fff` auf `var(--bx-text,#fff)`.
- 🟡 **milestone-confetti** ist selbst ein Vollbild-Effekt → von `.bx-enter` ausgenommen
  (wie Feuerwerk/Herzregen). **nextMilestone** gegen unsortierte Listen gehärtet
  („kleinste > cur" statt „erste > cur") + Test. **189 Tests grün.**
- Geprüft & ok: Dropdown↔THEMES-Keys konsistent (17↔17), kein Var-Leak (frisches el
  je Render), PREVIEW keine TDZ (Mount erst zur Laufzeit), milestone-confetti landet
  via extraResource im Windows-Build (keine Allowlist).

### Command-System („Bot", 13.06.) ✅
Eigene Seite „Befehle": `!befehl → Antwort`. `ChatCommand`-Modell + `matchChatCommand`
(trigger-engine, TDD), Settings-Liste, `maybeRunCommand` in studio (Rechte-Stufe
all/followers/subs/mods + globaler Cooldown), Antwort per TTS (`speakForEvent`) und/oder
in den Chat (`sendChat`, nutzt das neue Login). CommandsPage (wie StorePage) + Nav.
Platzhalter via `renderSpeakTemplate` ({user}/{text}).

### Logging-Audit (13.06.) ✅
Gefunden: rohe `console.*`-Ausgaben (v.a. aus Libs: tiktok-live-connector, obs-websocket-js,
ws) landeten NICHT im Datei-Log — nur in den DevTools. Fix: `initFileLogging` patcht jetzt
`console.log/info/warn/error` → spiegelt alles (inkl. Error-Stacks) in die Logdatei, ohne
Doppel-Schreiben (write() nutzt die gesicherte Original-Console). Damit deckt das Datei-Log
ab: eigene `log.*`, alle Fremd-Console-Ausgaben, `process.on(uncaughtException/unhandled-
Rejection)` (main) sowie Renderer-`window.error`/`unhandledrejection`/ErrorBoundary
(→ `logRenderer`) und Overlay-Widget-Fehler (`reportClientError`).

### Audit-Fixes nach Chat-Senden/Streamer.bot (2 Agenten, 13.06.) ✅
- 🔴 **`tt-target-idc` fehlte** → die Lib wirft im Konstruktor, sobald sessionId ohne
  ttTargetIdc gesetzt ist → JEDER Connect crashte nach Login. Fix: sessionId NICHT mehr
  im Konstruktor (Connect bleibt unauthentifiziert, kein Crash); Login liest BEIDE
  Cookies; `sendMessage` bekommt `{sessionId, ttTargetIdc}` EXPLIZIT → sendet auch, wenn
  man sich erst nach dem Connect einloggt. (Test angepasst.)
- 🟠 **Stream-Deck-PI speicherte nie** (`setSettings` mit `piUUID` statt `piContext`) → gefixt.
- 🟡 Hype-Train `scheduleFrame`-Cancel ohne `cancelAnimationFrame` (Stray-Frame nach
  destroy) → gefixt. Streamer.bot loggt jetzt, wenn `GetActions` leer bleibt (Auth-Hinweis).
- ✅ Bestätigt sauber: OBS-Service (v5-API), persistenter Token, Panel-Routen, Cookie-Read
  aus der richtigen Partition-Session, IPC-Kette vollständig, Trigger-Aktions-Setter.

### Chat-Senden + Streamer.bot ✅ ERLEDIGT (13.06.)
- **TikTok-Chat schreiben**: Die Lib `tiktok-live-connector` v2.1.1 hat `sendMessage()` +
  Option `sessionId`. → Login-Fenster (Electron BrowserWindow, eigene `persist:tiktok`-
  Session, echter Chrome-UA gegen TikToks Electron-Block) liest den `sessionid`-Cookie aus.
  Adapter `sendChat()`, Studio rate-limitet (1/30s). Trigger-Aktion `send_chat` (Template)
  + manuelles Sendefeld im Live-Cockpit. sessionId/signApiKey werden NICHT roh an den
  Renderer gegeben (nur Boolean-Status). Optionaler Euler-Sign-Key in Settings.
- **Streamer.bot-Brücke**: `StreamerbotService` (WS-Client zu ws://127.0.0.1:8080/,
  Auto-Reconnect, `GetActions`/`DoAction`). Trigger-Aktion `streamerbot_action`
  (Aktions-Dropdown aus GetActions). Settings-Sektion + Status.

### Verifizierte Roadmap-Kandidaten (Chat-Bot) — recherchiert 13.06.
- **TikFinity HAT eine Streamer.bot-Integration** (WebSocket; Events → Streamer.bot,
  Streamer.bot kann Nachrichten zurück pushen). → Wir könnten eine WS-Brücke bauen.
- **TikFinity KANN in den TikTok-Chat schreiben** — NICHT per offizieller API, sondern
  über die eingeloggte Session (Desktop-App-Login ODER Browser-Extension), stark
  rate-limited (~1 Nachricht/30s). → In Electron via eingebettete, eingeloggte
  TikTok-Webview + DOM/Session-Automation replizierbar (ToS-Graubereich, fragil).
- **Command-/Bot-System** (Overlay+TTS-Antworten, Cooldowns, Rechte, Platzhalter),
  **KI-Buddy** (lokale LLMs via LM Studio/Ollama → TTS-Reaktionen), **Giveaway** offen.

### UX/UI-Verbesserungen
- ✅ Sound-Löschen mit `ConfirmButton` abgesichert.
- ✅ „GO LIVE" → „MIT TIKTOK VERBINDEN".
- ✅ Sidebar in Gruppen geclustert (Stream / Reaktionen / Medien / Mehr) + Live-Punkt am Live-Eintrag.
- ✅ Widget-Abhängigkeits-Hinweis (Trigger-Seite); ✅ Undo-Toast nach Löschen (Trigger);
  ✅ Trigger-Regel duplizieren; ✅ Trigger-Suche/Filter; ✅ Intro wieder-einblendbar (?-Button);
  ✅ lokale Sound-Suche; ✅ Punkte-Direkteingabe (ViewersPage); ✅ Connect-Fehler als Toast;
  ✅ Toast info/success farblich getrennt (sky/emerald); ✅ Sound-Import-Fehler → Toast.
- Mini-Reste (sehr niedrig): Duplizieren bei Store/Panel, ErrorBoundary-Retry, Toast-Pause-on-Hover.

## Reihenfolge-Vorschlag
Batch 1 (Bugs) → Batch 2 (Styling/Top-Streak/Like-Fontäne/Bingo-Config) →
Batch 3 (Leaderboard/Palette/Stats/Zuschauer-Video/TTS-Timing).
Jeder Batch = ein Windows-Build zum Live-Testen.
