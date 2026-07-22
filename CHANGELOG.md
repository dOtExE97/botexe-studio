# Changelog

Alle nennenswerten Änderungen. Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [0.25.0] — 2026-07-22

### Frische, wirklich unterschiedliche Widget-Designs 🎨
Die Themes sahen sich zu ähnlich (fast alle „dunkle Karte, andere Tönung"). Jetzt hat **jedes Theme einen eigenen Charakter** — eigene Form, Rand, Schriftart und Farbwelt statt nur Farbe:
- **Neon** (Cyber-Glow + Bungee), **Synthwave** (Retro-Pink/Lila), **Inferno** (Glut/Orange + Anton), **Terminal** (grün, Pixel-Schrift) — NEU
- **Sticker** (Comic + harte Kontur + Luckiest Guy), **Carbon** (harte schwarze Kante), **Holo** (echt irisierend), **Chrome** (poliertes Metall)
- Helle Themes **Mint, Vapor, Paper (Marker-Schrift), Bubblegum, Frost** — sauber lesbar
- Insgesamt **24 Themes**, jedes klar erkennbar. Im Dropdown mit Emoji + Kurzbeschreibung, dazu die Live-Design-Galerie.

## [0.24.0] — 2026-07-22

### TikFinity-Import: Overlay & Trigger kommen jetzt wirklich rüber 🔧
Zwei echte Probleme beim realen Import behoben:
- **Leeres Overlay nach dem Import:** Das importierte Layout wurde zwar angelegt, aber nicht als *aktiv* gesetzt (`activeLayoutId` zeigte noch aufs alte Profil) → das neue Profil zeigte nichts. Jetzt wird das TikFinity-Overlay direkt aktiviert.
- **Trigger „reagierten nicht sichtbar":** Deine TikFinity-Trigger waren oft *„Gift → zeig diese Animation/dieses Video"*. Die Grafiken sind TikFinity-Eigentum (nicht kopierbar), also gingen die Trigger vorher ihre sichtbare Wirkung verloren — manche fielen ganz weg. Jetzt liefert der Import **immer einen Gift- und Follow-Alert** mit, und solche Trigger feuern **stattdessen unseren Alert** (Gift-Bild + Spender). So macht „Gift → Reaktion" wieder etwas Sichtbares.

## [0.23.1] — 2026-07-22

### Fix: Einfügen ging nur mit Strg+V
Electron liefert von Haus aus **kein Rechtsklick-Menü** — darum ging „Einfügen" in Eingabefeldern nur per Strg+V, nicht per Rechtsklick. Jetzt hat die App ein **app-weites Kontextmenü** (Ausschneiden / Kopieren / Einfügen / Alles auswählen) in allen Feldern. Zusätzlich haben die **Key-Felder** (eulerstream & KI) jetzt einen eigenen **„Einfügen"-Knopf**, der den Key direkt aus der Zwischenablage übernimmt & speichert.

## [0.23.0] — 2026-07-22

### Fix: KI-Assistent lief in einen „Abrechnung"-Fehler 🔧
Google hat das bisherige Standard-Modell `gemini-2.0-flash` aus dem Gratis-Tier genommen (Kontingent = 0 → 429 „billing"-Fehler) und ältere 2.5-Modelle für neue Nutzer gesperrt. Dadurch bekam **jeder** KI-Wunsch diesen Fehler, obwohl der Key gültig war. Jetzt nutzt die App standardmäßig **`gemini-flash-latest`** (Alias aufs jeweils aktuelle Gratis-Flash-Modell), migriert alte gespeicherte Modellwerte automatisch, und zeigt bei Kontingent-Fehlern eine klare Meldung statt des kryptischen Google-Texts.

### Neu: Modell direkt in der App wählen 🤖
Beim Gemini-Assistenten gibt's jetzt ein **Dropdown mit den Modellen, die dein Key wirklich kann** (live abgerufen, auf die Text-Modelle gefiltert, „-latest"-Aliase oben) — kein Abtippen mehr. Standard bleibt **„✨ Automatisch (aktuelles Gratis-Modell)"** für den sorglosen Weg; wer will, wählt gezielt ein anderes.

## [0.22.1] — 2026-07-21

### Fix: 4 Gewinnt / Tic Tac Toe verschwanden nach Inaktivität
Ein Duell-Spiel wurde nach 2 Minuten ohne Eingabe komplett beendet — das Widget verschwand aus dem Overlay und musste **manuell neu gestartet** werden. Jetzt öffnet Inaktivität stattdessen eine **frische Runde**: Das Spiel bleibt sichtbar und offen für neue „!join", ohne Handgriff. Einzelspiele (Galgenmännchen) enden nach Inaktivität wie bisher.

## [0.22.0] — 2026-07-21

### Fokussierter Erst-Bildschirm 🎯
Die Live-Seite war vor dem Verbinden überladen — 7 Null-Statistiken, Chat-Spiele, Giveaway, Stream-Boss standen gleichberechtigt neben dem einen, das zählt: „starte hier". Jetzt sind diese **Live-Werkzeuge offline eingeklappt** (eine Leiste „Werden aktiv, sobald du verbunden bist" — aufklappbar für Neugierige), sodass der **Startklar-Check der Held** ist. Verbunden klappt alles automatisch auf. Der redundante Key-Warn-Absatz ist raus (der Startklar-Check führt eh dorthin). Die Test-Werkzeuge bleiben sichtbar — die laufen auch ohne Live durch die ganze Kette. Ergebnis: klarer „mach zuerst das"-Erst-Eindruck für Umsteiger.

## [0.21.1] — 2026-07-21

### Fix: Geschenke-Galerie „Letztes Live" zeigte alle Gifts
Die „Letztes Live"-Ansicht sammelte über mehrere Streams hinweg an — blieb die App zwischen zwei Lives offen (der neue Stream zählte als Reconnect), wurde die Markierung nie geleert, und irgendwann standen dort *alle* je erhaltenen Gifts. Jetzt hängt der Reset an der **Room-ID** (jeder Live = neuer Raum): Wechselt sie, wird „Letztes Live" geleert — robust gegen Reconnect und App-Neustart (gleicher Raum nach Neustart = Fortsetzung, kein versehentlicher Reset). Der angesammelte Zustand bereinigt sich beim nächsten Verbinden von selbst. Nebenbei: Master-Gift-Namen mit führenden Leerzeichen werden in der Anzeige getrimmt.

## [0.21.0] — 2026-07-21

### Coin-Glas: Bälle stapeln sich jetzt physisch 🪙
Die Geschenk-Bälle fallen nicht mehr an zufällige Stellen, sondern **sammeln sich als echter Haufen am Boden** — über eine Spalten-Höhenkarte, mit leichtem Abpraller beim Landen und Reinrollen in tiefere Lücken. Ergebnis: ein dichter, natürlich geformter Coin-Haufen wie bei TikFinity, aber ohne schwere Physik-Engine (läuft flüssig auch im OBS-/TikTok-Studio-Fenster). Größe pro Ball weiterhin nach Coin-Wert. Gilt für alle Glas-Formen.

## [0.20.0] — 2026-07-21

### Neu: Coin-Glas im TikFinity-Original-Look 🫙 (Umzugs-Welle 1)
Erste Welle „gleiche Optik wie bei TikFinity": Das **Coin-Glas** hat jetzt die Form **„Mason-Glas (TikFinity-Original)"** — originalgetreu nachgezeichnet (nicht ihre Grafik kopiert): breite Gewinde-Mündung, gerade Glaswände, gerundeter Boden, klares neutrales Glas und ihr Marken-Grau `rgba(40,40,40,.8)` als Badge/Toast-Pillen. Umsteiger finden ihr vertrautes Glas wieder — als Vektor sogar schärfer als das Original-PNG.

- Wählbar bei jedem Coin-Glas über **Form → „Mason-Glas (TikFinity-Original)"**.
- Der **TikFinity-Import** setzt diese Form automatisch aufs übernommene Coin-Glas → das importierte Overlay sieht sofort aus wie gewohnt.

Weitere Widgets (Goal-Bar, Chat, Top-Liste, Rad …) folgen Welle für Welle.

## [0.19.0] — 2026-07-21

### TikFinity-Import runderneuert — jetzt mit v4-Dateien & vollem Widget-Design
Der Import war seit TikFinitys neuem Dateiformat (`encVersion 4`) komplett kaputt — **jede aktuell exportierte `.tfc` wurde abgewiesen**. Jetzt geht sie wieder auf, und der Import holt deutlich mehr rüber:

- **v4-Entschlüsselung** ergänzt (v2/v3 laufen weiter). Aktuelle TikFinity-Exports importieren wieder.
- **Volle Widget-Designs statt nur Glücksrad+Social:** TikFinity v4 exportiert die kompletten Widget-Einstellungen — wir übernehmen jetzt **Coin-Glas, Chat-Box (mit deinen Farben & Schrift), angepasste Ziel-Balken (Titel, Ziel, Farben, Theme, Font), Top-Gifter-Liste** und mehr, in einem aufgeräumten Standard-Layout.
- **Gift-Trigger matchen jetzt zuverlässig:** über die stabile Gift-ID statt des lokalisierten Namens („Goldenes Gamepad" hätte nie ausgelöst).
- **Like-Schwellen bleiben erhalten** (TikFinitys „ab X Likes" → unsere `like_count_gte`), ebenso der **Cooldown pro Zuschauer** (`userCooldown`).
- **Eigene Sounds kommen mit:** neben myinstants.com jetzt auch deine auf TikFinitys CDN hochgeladenen Sounds.
- **Ergebnis-Dialog statt flüchtigem Toast:** zeigt übersichtlich, was übernommen wurde und was du manuell nachbauen musst (Lottie-Animationen, Videos) — plus **„Profil jetzt aktivieren"**.
- **Auffindbar gemacht:** eigene „Von TikFinity umziehen"-Karte in den Einstellungen samt Anleitung, wo du die `.tfc`-Datei exportierst.

### Trigger-Engine
- Neue Bedingung **`gift_id_is`** (Gift über die stabile TikTok-ID) und **`userCooldownMs`** (Cooldown pro Zuschauer, drosselt Spam einzelner Nutzer ohne die Regel global zu bremsen).

## [0.18.0] — 2026-07-21

### Neu: ✅ Startklar-Check — die Einrichtung hakt sich selbst ab
Auf der Live-Seite ersetzt eine **echte Checkliste** den alten Hinweis-Text: Key gespeichert? Widgets im Overlay? Browser-Quelle in OBS/Live Studio verbunden? Mit TikTok verbunden? Jeder Schritt **prüft sich alle paar Sekunden selbst** und hakt sich automatisch ab — und jeder offene Schritt hat genau den einen Knopf, der ihn löst (Key-Assistent, Zum Overlay, Link kopieren). Bei 4/4 steht da „✓ Alles startklar!".

### Neu: 🚨 Live-Wächter — „Dein Overlay ist im Stream nicht sichtbar!"
Der häufigste stille Fehler: verbunden und am Streamen, aber **keine Browser-Quelle offen** (z.B. nach PC-Neustart) — Zuschauer sehen keine Alerts, und man merkt es nicht. Jetzt schlägt die Live-Seite rot Alarm, mit „Link kopieren" und „Diagnose öffnen" direkt daneben.

### Neu: 🎮 Spiel-Wächter mit Ein-Klick-Einbau
Quiz, Galgenmännchen, Tic Tac Toe, 4 Gewinnt oder Stream-Boss gestartet, aber das **Widget liegt gar nicht im Overlay**? Warn-Toast mit **„Jetzt einbauen"** — ein Klick legt das passende Widget automatisch ins Overlay (das Spiel läuft dabei weiter).

### Kleinere Schutznetze
- **OBS-/TikTok-Studio-Link kopiert, Overlay aber leer** → Hinweis, dass die Quelle bis zum ersten Widget unsichtbar bleibt (sonst wirkt der Link „kaputt").
- Diagnose kennt jetzt auch die Widgets im aktiven Layout (`activeLayers`/`activeWidgetTypes`) — Grundlage für die Wächter.

## [0.17.0] — 2026-07-21

### Neu: ✨ KI-Trigger — Regeln in normalem Deutsch
Auf der Trigger-Seite: *„wenn jemand eine Rose schickt, spiel den Airhorn-Sound und bedank dich per Ansage"* → **die KI baut die fertige Regel** (nutzt nur deine echten Sounds & Widgets — sie erfindet nichts). Mit „Rückgängig" im Toast.

### Neu: 🎨 Design-Galerie
Im Overlay-Editor bei Widgets mit mehreren Grundformen: **„🎨 Design-Galerie"** (über den Widget-Einstellungen) zeigt **alle Looks als Live-Vorschau nebeneinander** — Coin-Glas als Glas/Herz/Pokal/Truhe, das Glücksrad als Bunt/Casino/Neon … Klick = sofort angewendet, durchprobieren erwünscht.

### Trigger-Feinschliff
- **Der „Test"-Knopf testet jetzt ECHT**: Er schickt ein passendes Test-Event durch die komplette Kette (inklusive Bedingung & Cooldown) — passiert nichts, greift die Regel wirklich nicht. Vorher wurden die Aktionen blind gefeuert.
- **Konflikt-Warnung**: Feuern zwei aktive Regeln aufs selbe Gift, warnt die Karte („⚠ … doppelte Alerts möglich") — die klassische Galerie+Trigger-Doppel-Falle.
- „Vorlagen"-Knopf oben — die 8 Ein-Klick-Vorlagen sind jederzeit erreichbar.

---

## [0.16.0] — 2026-07-21

### Neu: Das Einstellungs-Paket ⚙️
- **Gift-Sound-Bremse** 🌹 (Einstellungen → Gift-Sound-Bremse): Bestimme, wie oft Geschenke denselben Sound auslösen dürfen — 0 = jedes Geschenk (wie bisher), z.B. 10 = höchstens alle 10 Sekunden. Rettet dich beim Rosen-Regen! Zusätzlich in der **Geschenke-Galerie pro Gift** einstellbar („Höchstens alle X Sek.").
- **TTS-Tempo & Tonhöhe** 🗣️ (Stimme-Seite): Sprechgeschwindigkeit (−50%…+50%) und Tonhöhe der Standard-Stimmen regeln.
- **Punkte für Zuschauzeit** ⏱️ (Einstellungen → Loyalty-Punkte → „pro Minute dabei"): belohnt alle, die gerade aktiv im Stream sind, jede Minute automatisch.
- **Tägliches Auto-Backup** 💾 (standardmäßig AN): sichert die Konfiguration 1×/Tag automatisch in den Datenordner (die letzten 7 bleiben) — schützt Punkte, Overlays & Trigger vor Crash/PC-Wechsel.

---

## [0.15.0] — 2026-07-21

### Trigger sind jetzt VIEL einfacher 🪄 (aus Voll-Audit mit 3 Agenten-Teams)
- **8 Ein-Klick-Vorlagen** („Großes Gift feiern", „Rose → Sound", „Erster Follow", „!hype", „Neue begrüßen", „Like-Meilenstein", „Erinnerung alle 10 Min" …) — Klick, fertig eingerichtet, danach anpassbar.
- **Jede Regel zeigt sich als deutscher Satz**: „WENN Gift im Wert von mind. 100 Coins → DANN spiele ‚airhorn' + sage ‚{user} danke'". Auch Fallen werden sichtbar („WENN IRGENDEIN Gift…", „⚠ noch KEINE Aktion").
- **Neu: Like-Meilenstein-Trigger** ❤️ — feuert genau beim Erreichen von z.B. 1000 Likes (nicht bei jedem Like danach).
- Zahlen-Bedingungen starten mit sinnvollen Werten (100 Coins statt 0 = „feuert immer"-Falle).

### Behoben (Audit-Funde)
- **Stream-Boss hatte seine neuen Looks (Arcade/Düster) verloren** — die Stil-Auswahl war versehentlich beim Gift-Alert gelandet (der doppelt eine hatte). Beides korrigiert.
- **Ranglisten-Podium** wurde bei mehr als 3 Plätzen gestaucht.
- **Key-Assistent**: Zwischenablage überschreibt keine manuelle Eingabe mehr.
- **Neon-Glücksrad** hängt nicht mehr oben im Bild (zentriert + größer).
- Update-Banner „Jetzt neu starten" kann nicht mehr von einem späteren Fehl-Check verdrängt werden.
- Standard-Blockliste: „kys" entfernt (traf harmlose Wörter wie „monkys").

### Klarer benannt & besser erklärt
- ✨-Zeile heißt jetzt sichtbar **„KI-Assistent"**; ohne eingerichtete KI führt ein Knopf direkt zur Gratis-Einrichtung.
- **„Grundform / Stil"** vs. **„Farb-Design (Theme)"** — die zwei Design-Ebenen sind jetzt unterscheidbar benannt.
- Onboarding-Tour zeigt jetzt auch KI-Assistent, Design-Vielfalt, Mixer, Vorlagen & Diagnose.

---

## [0.14.0] — 2026-07-21

### Neu: Design-Schwung 3 — 16 radikale Widget-Varianten 🎰🚀💥
Wie beim Coin-Glas: nicht nur andere Farben, sondern **ganz andere Objekte**:
- **Glücksrad** 🎡: **Casino** (Gold-Rand, geriffelte Gold-Nabe, Rot-Schwarz) · **Neon-Arcade** (freistehend, leuchtende Trennlinien, kein Standfuß)
- **Hype-Train** 🚂 → **Rakete** 🚀 (mit Flammen-Schweif und Schub-Balken) oder **LED-Anzeigetafel**
- **Feuerwerk** 🎆 explodiert jetzt wahlweise als **Herz** 💜 oder **Stern** ⭐ am Himmel
- **Meilenstein-Feier**: **Funken steigen auf** (statt Konfetti-Regen) oder **Comic-POW** (Sticker-Explosion mit Zacken)
- **Stream-Boss**: **Arcade** (segmentierter LED-Lebensbalken) · **Düster** (Dark-Fantasy, blutrotes Glühen)
- **Subathon-Timer** → **Zeitbombe** 🧨 (mit Zündschnur!) oder **LED-Tafel**
- **Geschenkzähler**: **Neon** · **Gold-Medaille** 🥇
- **Counter**: **LED-Score** (grüne Arcade-Ziffern) · **Comic-Sticker**

---

## [0.13.1] — 2026-07-21

### Behoben
- **„Nach Updates suchen" wirft keinen Fehler mehr** — der Knopf kollidierte mit dem automatischen Hintergrund-Check bzw. einem bereits fertig geladenen Update (dann meckerte der Updater „läuft schon"). Jetzt: Läuft schon ein Check → einfach Status zeigen; Update schon bereit → direkt „installieren & neu starten" anbieten. Echte Fehler werden freundlich erklärt („die App prüft stündlich automatisch weiter").

---

## [0.13.0] — 2026-07-21

### Neu: ✨ KI-Overlay-Assistent — „Wünsch dir was"
Im Overlay-Editor gibt es jetzt eine ✨-Zeile: Beschreib in normalem Deutsch, was du willst („Goal-Bar oben, Chat unten links, alles in Pink mit dem Herz-Glas") → **die KI baut dein Overlay um.** Mit „Rückgängig", falls es nicht gefällt.
- Die KI nutzt ausschließlich die vorhandenen ~45 Widgets und deren Einstellungen; jedes Ergebnis läuft durch dieselbe Prüfung wie handgebaute Layouts.
- **KI-Anbindung** (Einstellungen → KI-Assistent): **Google Gemini** (kostenloser API-Key, Link in den Einstellungen) oder **Ollama** (läuft komplett lokal). Der Key bleibt auf deinem PC und wandert nie ins Backup.

### Behoben: Updates kamen „nie an"
- Update-Check jetzt **stündlich** statt alle 6 Stunden. Wichtig zu wissen: Ein fertig geladenes Update wird **beim nächsten App-Neustart** installiert (Banner „Jetzt neu starten" erscheint) — durch den Autostart lief die App oft tagelang durch, dadurch wirkte es wie „kein Update". Zusätzlich wird der Download jetzt im Log vermerkt.

---

## [0.12.0] — 2026-07-21

### Neu: Coin-Glas in 4 Formen + 6 neue Design-Themes 🫙💜🏆🪙
- **Coin-Glas**: Die Geschenke fallen jetzt wahlweise ins **Bonbon-Glas**, **Herz** (rosa getönt), einen **Gold-Pokal** (mit Henkeln, Stiel & Fuß) oder eine **Schatztruhe** (Holz, Golddeckel & Schloss). Eigenschaften → „Form".
- **6 neue Themes für ALLE Widgets** (jetzt 23): **Frost** (helles Milchglas ☀️), **Carbon** (Kohlefaser, kantig), **Outline** (nur Kontur — ultraleicht überm Gameplay), **Chrome** (poliertes Metall ☀️), **Sticker** (Comic-Look, weiß mit Kontur ☀️), **Sunset** (warmer Abendhimmel-Verlauf).

---

## [0.11.0] — 2026-07-21

### Neu: Ranglisten-Design-Kollektion 🏆
Die Bestenlisten (das Herzstück vieler Overlays!) haben jetzt deutlich mehr Auswahl:
- **Top Gifter / Like-Liste**: 3 neue Stile — **Podium** (Siegertreppchen: Platz 2·1·3 auf Sockeln mit Avataren obenauf!), **Bunte Pillen** und **Royal** (Gold & Samt, VIP-Lounge-Look). Insgesamt jetzt 7 Stile.
- **Punkte-Bestenliste**: erstmals wählbare Stile — Glas · **Neon** (freistehend) · **Bunte Pillen**.
- **Bestenliste (Wechsel)** (die kombinierte Liker/Coins-Liste): erstmals wählbare Stile — Glas · **Neon** · **Bunte Pillen**.

---

## [0.10.0] — 2026-07-21

### Neu: 12 neue Widget-Designs 🎨
Die sechs sichtbarsten Widgets haben jetzt je **drei wählbare Looks** (Eigenschaften → „Stil"; kombinierbar mit allen 17 Farb-Themes):
- **Gift-Alert**: Glas-Karte · **Neon** (freistehend, riesiger Kontur-Name mit Glow) · **Banner** (schmale Lower-Third-Leiste, slidet von links — für alle, denen der Vollformat-Alert zu viel ist)
- **Chat-Box**: Glas-Bubbles · **Clean** (nur Text mit Schattenkante, klassischer Gamer-Chat) · **Sticker** (helle Comic-Bubbles mit dunkler Schrift, verspielt)
- **Gift-Feed**: Glas-Zeilen · **Neon** (freistehend) · **Bunte Pillen** (satte Akzent-Pillen)
- **Goal-Bar**: Glas · **Arcade** (LED-Segmentblöcke, Retro) · **Slim** (hauchdünne Linie, edel-minimal)
- **Live-Zähler**: Glas-Chips · **Badges** (schräge Esports-Plaketten) · **Minimal** (frei, ohne Hintergrund)
- **Countdown**: Glas-Kapsel · **Neon** (Riesen-Ziffern mit Glow) · **LED-Anzeigetafel** (Stadion-Board mit Scanlines)

---

## [0.9.0] — 2026-07-21

### Widget-Großputz 🧹 (3 Agenten-Audits über alle ~45 Widgets)
**Behoben:**
- **Spiele-Tab zeigt jetzt ALLE Spiele** — Quiz, Galgenmännchen, Tic Tac Toe, 4 Gewinnt und Stream-Boss steckten fälschlich in „Ambient & Deko" (die halbe Spiele-Sammlung war unauffindbar!).
- **Keine Geister-Alerts mehr nach Verbindungs-Blips** — bei jedem Reconnect wurden die letzten Events erneut zugestellt: alte Gift-/Follow-Alerts blitzten auf, Feuerwerk/Kanone/Herzen feuerten erneut, Feeds bekamen doppelte Zeilen und der **Geschenkzähler zählte doppelt** (persistent!). Jetzt sauber unterschieden zwischen Rehydrieren und echten Events.
- **Bingo überlebt jetzt den Stream-Wechsel** — vorher zielten die Meilenstein-Felder nach „neuer Stream" auf die alten Zahlen und hakten sich nie mehr ab.
- **Hype-Train & Subathon können nicht mehr „einfrieren"** (NaN-Schutz bei Gift-Events ohne Coin-Wert).
- **Glücksrad zeigt auf allen Quellen (OBS + TikTok Studio) denselben Gewinner** — vorher würfelte jede Quelle ihr eigenes Ergebnis!
- **Zahlen-Raten bleibt nach einem Reload synchron** (Rundenstand wird gemerkt).
- **Tic-Tac-Toe-Siegesfeier funktioniert jetzt wirklich** (Aufleuchten beim Gewinn — war vorher ein No-Op).
- Geschenke-Glas verliert seinen Füllstand nach Reconnect nicht mehr; Punkte-Liste schneidet bei kleiner Box keine Ränge mehr ab; Countdown startet nach Reload nicht mehr von vorn; Leaderboard-Platzhalter kehrt zurück; viele Widgets reagieren jetzt sauber auf „neuer Stream" (Galgenmännchen, 4 Gewinnt, Giveaway, Subathon, Action-Screen).

**Übersichtlicher & mehr einstellbar:**
- Beschreibungen der Widgets in **klarem Deutsch** (kein „Twitch-Style"/Insider-Sprech mehr).
- **Neue Regler freigeschaltet**: Rundenpause bei Geschenk-Schlacht & Live-Umfrage, Akzentfarbe bei Like-Herzen & Geschenke-Kanone.
- „Beliebt"-Tab: Like-Herzen (sofort-Effekt, null Konfiguration) statt Stream-Boss.

### Key-Beschaffung weiter verbessert 🔑
- **Key-Gesundheitscheck beim App-Start**: Wird dein gespeicherter Key ungültig (z.B. bei eulerstream gelöscht), warnt die App sofort — nicht erst beim kaputten Verbinden.
- **Diagnose-Seite prüft den Key jetzt LIVE** („Key gültig ✓" statt nur „Key gesetzt").

---

## [0.8.0] — 2026-07-21

### Neu: Key-Assistent 🔑 — die Euler-Hürde geführt statt allein
Die Key-Beschaffung war DIE Stolperstelle für neue Streamer. Jetzt gibt es einen geführten Assistenten (öffnet sich über den „Gratis-Key holen"-Knopf auf der Live-Seite, in der Tour und in den Einstellungen):
- **3 klare Schritte** in einem Fenster: Konto anlegen (mit „Habe schon ein Konto → direkt zur Key-Seite") → Key erstellen & kopieren → fertig.
- **Zwischenablage-Automatik**: Sobald der Key auf der eulerstream-Seite kopiert wird, erscheint er automatisch in der App — kein Fenster-Gewechsel, kein Einfügen. (Die App liest die Zwischenablage NUR, solange der Assistent offen ist, und übernimmt ausschließlich Text im euler_-Format.)
- **Sofort-Prüfung**: Der Key wird live gegen die eulerstream-API getestet — „✓ Key funktioniert & ist gespeichert!" sieht man im Assistenten, nicht erst beim fehlgeschlagenen Verbinden. Auch das manuelle Feld in den Einstellungen prüft jetzt sofort.
- Direktlink zur Key-Seite (`dashboard/api-keys`) statt nur zur Registrierung.

---

## [0.7.0] — 2026-07-21

### Behoben (aus Projekt-Audit mit 3 Agenten-Teams)
- **Follows/Shares werden bei Reconnect nicht mehr doppelt gezählt** — nach kurzem Verbindungsabriss sendete der Server die letzten Events erneut → doppelte Punkte + doppelte TTS-Ansage. Jetzt dedupliziert wie Chat/Gifts.
- **Stammgast-Erkennung läuft auch bei deaktiviertem Punkte-System** — „Punkte aus" schaltete heimlich Besuchs-Zähler, Stammgast-Begrüßung und VIP-Karten-Stats mit ab.
- **Zahlen-Raten funktioniert jetzt auch mit Bereichen über 9999** (Tipps wurden vorher bei mehr als 4 Ziffern verworfen).
- **TTS-Ansagen haben Vorrang** — bei viel Sound-Action (4 parallele Sounds) wurde auch mal eine Follow-/Gift-Ansage verschluckt. Ansagen werden nie mehr verworfen.

### Einfacher bedienbar (Verbinden & Key)
- **Ohne Key zeigt die Live-Seite jetzt „🔑 Zuerst Gratis-Key holen →"** statt eines Verbinden-Buttons, der in einen Fehler läuft — ein Klick führt direkt zur Key-Anleitung.
- **Einstellungen umsortiert: TikTok-Verbindung (Key!) ist jetzt die ERSTE Karte** (war Position 8 von 14).
- **Verbindungsfehler auf Deutsch** — statt „requires a Business plan" steht da jetzt, was zu tun ist.
- **„Warte auf Live" auch am Button** — statt verwirrendem „MIT TIKTOK VERBINDEN" steht dort „WARTE AUF LIVE — ABBRECHEN".
- **Trigger entschlackt**: Statt 11 Dropdowns auf einmal nur noch Alert + Sound + Ansage — der Rest hinter „+ Weitere Aktionen". Regeln mit erweiterten Aktionen bleiben automatisch aufgeklappt.
- Erste-Schritte-Banner nennt jetzt Schritt 1: „Gratis-Key holen".

### TTS-Moderation verstärkt 🛡️
- **Auch nackte Domains werden nicht vorgelesen** („spam-seite.com" — bisher nur http://-Links).
- **Blockliste gilt jetzt überall** — auch bei Follow-Ansagen und Stammgast-Begrüßungen (ein Slur im Nickname wurde bisher laut vorgelesen).
- **„Standard-Blockliste laden"** (Einstellungen → Chat-Moderation): kuratierte Liste gängiger Beleidigungen (DE/EN) per Klick.

---

## [0.6.0] — 2026-07-18

### Behoben
- **Zahlen-Raten & Bingo sind jetzt wirklich zufällig** 🎲 — bisher kamen **jeden Stream dieselben Zahlen/Bretter** (feste Berechnung, damit alle Overlay-Quellen synchron sind). Jetzt würfelt jeder Stream neue Werte, weiterhin synchron über OBS + TikTok Live Studio (Server vergibt pro Session einen Zufalls-Seed). *(Danke an die aufmerksamen Follower! 😄)*

### Neu
- **Follow-Trigger „nur beim ersten Mal"** 👻 — neue Bedingung bei Follow-Triggern: löst nur beim **Erst-Follow** aus, nicht bei Re-Follows. Ideal z.B. für einen Jumpscare-Sound. (Zählt jeden Follower, den die App schon einmal live gesehen hat.)
- **Autostart mit Windows** 🖥️ (Einstellungen → TikTok-Verbindung) — bOtExE Studio läuft dann **schon, bevor** du OBS/TikTok Live Studio öffnest. Behebt „Browser-Quelle nach Neustart leer": Der Overlay-Server ist da, wenn die Quelle lädt → **nie wieder neu einfügen.**

---

## [0.5.3] — 2026-07-11

### Geändert (Log-Aufräumung — aus Live-Logs)
- **Stream-Log ist wieder lesbar** 📖 — das häufige `TTS übersprungen (kein „." davor)` (bei aktivem Prefix-Modus praktisch jede Chat-Nachricht → machte ~70% des Logs aus) wandert auf **Debug** und landet nicht mehr in der Logdatei. „Vorgelesen" und Moderations-Skips (stumm/gesperrt) bleiben sichtbar.
- **Kein Fake-`[ERROR]` am Stream-Ende mehr** — „Streamer ist nicht live" beim automatischen Warten aufs Live ist jetzt eine **INFO** (kein alarmierender Fehler). Echte Verbindungsfehler bleiben `ERROR`.
- `debug`-Logs sind ab jetzt generell ephemer (nur Konsole, nicht in der Datei).

---

## [0.5.2] — 2026-07-09

### Behoben
- **`GET /api/status` liefert die Live-Zahlen wieder korrekt** (Zuschauer/Likes/Gifts/Coins/Follows/Kommentare) — sie wurden intern aus dem falschen Objekt gelesen und kamen als `undefined`. (Kein Crash, nur die API-Werte betroffen.)

---

## [0.5.1] — 2026-07-09

### Geändert
- **Widget-Menü aufgeräumt** 🧹 — statt einer langen Liste aller ~37 Widgets auf einmal jetzt **Kategorie-Tabs** oben (⭐ Beliebt · Alerts · Spiele · Gifts · Chat · Stats · Deko · Media). Es ist immer nur **eine** Kategorie sichtbar. „Beliebt" zeigt die wichtigsten Einsteiger-Widgets. Die Suche durchsucht weiterhin alle Kategorien. Kompakt-Ansicht (Live aus) jetzt 2-spaltig.

---

## [0.5.0] — 2026-07-09

### Neu
- **Lokale Steuer-API** 🤖 (für Skripte, Stream-Deck & KI-Agenten): `http://127.0.0.1:27415`, token-geschützt.
  - `GET /api/status` — Live-Zustand lesen (verbunden?, Zuschauer/Likes/Gifts/Coins, laufendes Spiel, Boss) — **ohne Secrets**.
  - `POST /api/action` — validierte Aktion ausführen: `play_sound`, `speak` (TTS), `start_game`/`stop_game`/`reveal_game`, `start_boss`/`stop_boss`. Nur erlaubte Aktionen; alles andere wird abgelehnt.
  - Doku mit curl-Beispielen: `docs/api.md`. Baut auf der bestehenden Stream-Deck-API (`/api/panel`) auf.

### Intern
- **Headless-Smoke-Test** (`npm run smoke` + CI-Job): klickt die komplette App headless durch (alle Seiten + Mixer + API) und fängt Render-Crashes automatisch — bei jedem Push.

---

## [0.4.0] — 2026-07-09

### Neu
- **Mixer** 🎚️ (Menü → Medien → Mixer): jede Sound-Quelle einzeln regeln — **Lautstärke, Stummschalten und ein eigenes Ausgabegerät** pro Kategorie:
  - **Vorlese-Stimme** (TTS) · **Alerts & Gifts** · **Soundboard** · **Spiele** (Quiz, Glücksrad, Feuerwerk, Gewinner)
  - Plus ein **Master-Regler** über alles und ein **Test-Ton** je Kanal.
  - Der Clou: Du kannst z.B. die Vorlese-Stimme auf ein **anderes Ausgabegerät** legen (eigener Rodecaster-/VoiceMeeter-Kanal) und im Stream getrennt mischen — der Rest bleibt auf dem Standard-Gerät.
  - Ducking (andere Sounds leiser, während vorgelesen wird) und der Probehör-Ton laufen bewusst am Mixer vorbei.

---

## [0.3.33] — 2026-07-09

### Behoben (aus externem Codex-Audit)
- **Spiel-Effekte/Sounds lösen wieder aus** — Quiz-Auflösungs-Sound und die Gewinner-Feier bei Tic Tac Toe & Galgenmännchen kamen bisher nicht (Event wurde anders gesendet als die Widgets ihn lasen).
- **Spiele-/Boss-Karte zeigt den echten Zustand** — nach Seitenwechsel wusste die Karte nicht mehr, dass ein Spiel/Boss läuft; ein Klick auf „Boss starten" konnte den laufenden Boss neu spawnen (HP weg). Jetzt lädt sie den echten Stand + Boss-Start ist idempotent.
- **Diagnose-Seite zeigt die TikTok-Verbindung korrekt**, auch wenn man sie erst nach dem Verbinden öffnet.
- **Galgenmännchen** lehnt ein leeres/ungültiges Wort sauber ab.
- **„Punkte zurücksetzen"** klarer benannt („Nur Loyalty-Punkte") + Hinweis, dass Level & Stats bleiben.

---

## [0.3.32] — 2026-07-07

### Neu
- **Diagnose-Seite** 🩺 (Menü → Mehr → Diagnose): „Warum sehe ich mein Overlay nicht?" — auf einen Blick, ob der Overlay-Server läuft, ob eine **Browser-Quelle verbunden** ist (häufigste Ursache!), ob der Key gesetzt ist, ob TikTok verbunden ist. Plus Overlay-Link zum Kopieren und die letzten Overlay-Meldungen. Aktualisiert sich live.
- **Hinweis bei „Chat senden"-Triggern**, dass das den Direkt-Modus + TikTok-Login braucht (im Cloud-Modus kann die App nur empfangen).

---

## [0.3.31] — 2026-07-07

### Verbessert (Bedienbarkeit — aus UX-Audit)
- **„Warte auf Live" ist kein Fehler mehr** — eigener ruhiger Status oben statt „RECONNECT… #4", das wie eine kaputte Verbindungsschleife aussah. Verbindungs-Hinweise werden jetzt angezeigt (Tooltip).
- **Key-Hinweis direkt auf der Live-Seite** — fehlt der eulerstream-Key, steht die Warnung gleich am „Verbinden"-Knopf (nicht erst nach dem Fehlversuch).
- **Onboarding-Tour erklärt den Key** (Schritt 1) — vorher fehlte der wichtigste Erst-Schritt komplett.
- **Menü-Erklärungen** (Tooltips) — „Trigger vs. Befehle vs. Store vs. Panel" endlich verständlich.
- **Overlay-Editor**: neue Widgets landen versetzt (nicht mehr übereinander) + Hinzufügen-Bestätigung + **Rückgängig** beim Löschen.

### Behoben (aus Codex-Audit)
- Beim Stream-Wechsel/Session-Reset laufen **Spiele/Boss nicht mehr weiter**.
- Session-Statistik wird **absturzsicher** gespeichert.
- OBS meldet nicht mehr fälschlich „verbunden", wenn man es währenddessen abschaltet.

---

## [0.3.30] — 2026-07-07

### Behoben (aus 3. Gesamt-Audit)
- **Spiel-Overlays bleiben nicht mehr hängen**, wenn ein Spiel endet/gestoppt wird — vorher blieb die letzte Frage/HP-Leiste/„!join" für immer stehen (und Zuschauer-„!join" liefen ins Leere).
- **Spielwechsel ohne vorher „Stop"** klappt jetzt sauber — vorher konnte ein noch laufendes Auto-Quiz das neu gestartete Spiel Sekunden später „kapern".
- **Likes pro Zuschauer korrekt** — vorher wurde einem Viewer mit 3 Likes der Raum-Gesamtwert (z.B. 48.000) zugeschrieben; betraf die Zahlen auf den Begrüßungskarten.
- **„Punkte zurücksetzen" aktualisiert das Overlay sofort** (vorher blieb die alte Bestenliste sichtbar).
- **Test-/Replay-Events verändern die echten Punkte/Coins nicht mehr** — Ausprobieren bläht die Bestenliste nicht länger auf.

---

## [0.3.29] — 2026-07-07

### Behoben (aus echten Live-Tests)
- **Chat-Spiele: Tic Tac Toe & 4 Gewinnt öffnen nach jeder Runde automatisch neu** — vorher blieben die 2 Plätze der ersten Runde belegt, alle anderen kamen nie rein. Jetzt: Ergebnis kurz anzeigen → frisches Brett, jeder kann per „!join" mitmachen. Abgelehntes „!join" (Tisch voll) gibt jetzt eine Rückmeldung.
- **Galgenmännchen:** Sieg wird jetzt verbucht (Punkte/Level) — und man kann das **ganze Wort direkt tippen** (nicht mehr nur „!guess wort").
- **Quiz läuft endlos** weiter, bis du „Stop" drückst (zieht automatisch neue Fragen).
- **TTS liest Nachrichten nicht mehr doppelt vor** nach Verbindungsabrissen (Reconnect-Replay wird per Nachrichten-ID erkannt).
- **Größere Schrift** in Quiz, Galgenmännchen, Tic Tac Toe, 4 Gewinnt und Stream-Boss — besser lesbar im Stream.
- **Mehr Spiele-Logging** (Start, Beitritt, Sieg, Rundenende, Boss) — Fehler/Ablauf sind jetzt im Log nachvollziehbar.
- **Euler-Key klarer erklärt:** Live-Check des Formats + Hinweis, dass „warte auf Live" normal ist.

---

## [0.3.28] — 2026-06-26

### Robustheit (aus externem Codex-Audit)
- **Klare Warnung statt stiller Schein-Funktion**, falls der Overlay-Server nicht starten kann (z.B. alle Ports belegt) — vorher sah die App heil aus, aber kein Overlay ging.
- **Sound-/Medien-Import** bricht nicht mehr komplett ab, wenn eine einzelne Datei gesperrt/verschwunden ist — die anderen werden trotzdem importiert.
- **Bestenlisten** bei großem Live spürbar schneller (gecacht statt mehrmals/Sekunde komplett neu zu sortieren).
- **Profile** werden jetzt absturzsicher gespeichert (kein halb-kaputtes Profil bei Crash mitten im Speichern).
- Interner Leak-Fix beim Overlay-Server-Startfehler.

---

## [0.3.27] — 2026-06-26

### Neu
- **Open-Source-Lizenzen in der App** 💜 — unter Einstellungen → „Open-Source-Lizenzen" sind jetzt alle genutzten Bibliotheken aufgeführt (mit Lizenz, Autor und Link zum Projekt). bOtExE Studio nutzt viel Open Source (u.a. TikTok-Live-Connector, Electron, React) — alles permissiv lizenziert, jetzt sauber gecreditet, direkt sichtbar in der App.

---

## [0.3.26] — 2026-06-26

### Behoben (wichtig für neue Nutzer)
- **Klarer Hinweis statt „RECONNECT…"-Sackgasse** — wer die App zum ersten Mal ausprobiert (und gerade nicht live ist), bekommt jetzt sofort den Hinweis, dass der kostenlose eulerstream-Key fehlt (Einstellungen → TikTok-Verbindung). Vorher hing die Verbindung scheinbar endlos, ohne den Grund zu nennen. Sobald der Key gesetzt ist, verbindet sich die App automatisch beim Live-Gehen.

---

## [0.3.25] — 2026-06-26

### Sicherheit (P2)
- **Navigations-Schutz** — die App kann nicht mehr zu fremden Seiten „abdriften" oder fremde Fenster öffnen; externe Links öffnen im normalen Browser. Schutz gegen Navigation-Hijacking bei einem evtl. eingeschleusten Link.
- **Dependabot** — automatischer wöchentlicher Check auf veraltete/unsichere Abhängigkeiten.
- (Die strikte Content-Security-Policy fürs App-Fenster war bereits aktiv.)

_Hinweis: Die Overlay-Token-Trennung (lesen/steuern) wurde bewusst zurückgestellt — der Overlay-Server ist rein lokal (127.0.0.1) und die browserbasierten Angriffswege sind bereits durch WS-Origin-Schutz + CSP abgedeckt; der Nutzen stünde in keinem Verhältnis zum Risiko, bestehende OBS-Links zu brechen._

---

## [0.3.24] — 2026-06-26

### Verbessert
- **Profilbild in den Begrüßungskarten** 🖼️ — das Profilbild des Zuschauers wird jetzt groß und schön eingebunden, mit dem Anlass-Icon (👑 VIP, 🏆 Sieg, 💀 Boss …) als kleinem Badge in der Ecke. Falls kein Bild lädt, erscheint automatisch das Icon.
- **5 ausgebaute Karten-Designs** 🎨 — Premium Gold (mit Schimmer-Titel), Arcade XP (Neon-Retro), Clean Stream (hell/minimal), Cute Pop (rosa/verspielt) und Dark Pro Neon. Pro Action-Screen-Widget wählbar (Feld „Design") — so kann z.B. die VIP-Karte in Gold und der Game-Win in Arcade erscheinen.

---

## [0.3.23] — 2026-06-26

### Verbessert
- **VIP-/Stammgast-Begrüßungskarten jetzt mit allen Stats** 👑 — die Karte zeigt beim ersten Chat einer Person jetzt **Besuche, Coins, Likes, Kommentare (gesamt), Punkte, Gifts und Wins** — vorher fehlten Likes & Kommentare.
- **Hübschere Darstellung** — Stats erscheinen als Chips mit Icons (🪙 Coins, 👍 Likes, 💬 Kommentare …) und kompakten Zahlen (z.B. „13,7k" statt „13700").
- Neuer Kommentar-Zähler pro Zuschauer (Gesamt-Kommentare) — überlebt Neustart.

---

## [0.3.22] — 2026-06-26

### Sicherheit & Robustheit
- **WebSocket-Origin-Schutz (CSWSH)** — Overlay-Verbindungen aus fremden Web-Seiten werden abgewiesen; lokale Hosts + OBS-Quellen bleiben erlaubt. Zusätzliche Schutzschicht zum Token.
- **Eingabe-Validierung** — Trigger-Regeln & Chat-Befehle werden beim Backup-Import UND aus der App jetzt streng geprüft (nur bekannte Felder/Typen, Längen-Limits) — ein manipuliertes Backup kann nichts Ungültiges einschleusen.
- **Inaktivitäts-Timeout** — Tic Tac Toe / 4 Gewinnt / Galgenmännchen beenden sich nach 2 Min ohne Eingabe selbst (kein hängendes Widget im Overlay mehr).
- Lint/CI komplett sauber (0 Warnings).

---

## [0.3.21] — 2026-06-26

### Neu
- **Quiz läuft jetzt VOLLAUTOMATISCH** 🧠 — Thema wählen, Start, fertig: Fragen laufen von selbst durch (Frage → Sammelzeit → automatisch auflösen → nächste). Zuschauer antworten per Chat mit **A/B/C/D**, die richtige Antwort + Gewinner werden automatisch gezeigt. Kein manuelles Eintippen/Auflösen mehr.
- **150 eingebaute Quizfragen** in 5 Themen (Fortnite, Gaming, Allgemeinwissen, Musik, Film & Serien) + „Bunt gemischt". Einstellbar: Anzahl Fragen + Sekunden pro Frage.
- **Stream-Boss** 💀 — Boss-Modus an: jedes Gift macht Schaden (nach Coins), HP-Leiste + Top-Schadensliste im Overlay, bei Kill ein Moment + ein stärkerer Boss. Neues „Stream-Boss"-Widget.

---

## [0.3.20] — 2026-06-26

### Behoben (aus adversarialer Code-Review)
- **Quiz:** Doppelklick auf „Auflösen" zählte den Sieg doppelt (doppelte Punkte/Level) — behoben.
- **VIP-/Stammgast-Momente:** Besuchszähler wurde falsch gelesen → Stammgast-Einblender löste nie aus und VIP-Karten zeigten „0 Besuche". Jetzt korrekt.
- **Action-Screen:** drei Robustheits-Fixes (Timer-Leak im Editor, unbegrenzt wachsende Dedupe-Liste, verschluckte Momente nach Verdrängung).

---

## [0.3.19] — 2026-06-26

### Neu (großes Feature-Paket aus dem Gesamtplan)
- **Action-Screen** 🎬 — ein unsichtbares Widget, das kurze Premium-Momente einblendet (VIP-Welcome, Level-Up, …) und danach wieder verschwindet. Mehrere Instanzen per Kanal filterbar, 5 Designs, Prioritäts-Queue. Fundament für viele Features.
- **Spiele-Meister** 🏆 — Level-System (Rookie → Spiele-Meister) aus Game-Siegen; bei Level-Up erscheint ein Moment.
- **VIP-Welcome / Stammgast-Momente** 👑 — beim ersten Chat eines VIPs/Stammgasts (mit Cooldowns).
- **4 Chat-Spiele** 🎮 — **Quiz** (A/B/C/D-Voting + Auflösung), **Galgenmännchen**, **Tic Tac Toe** und **4 Gewinnt** (Zuschauer-Duell per „!join"). Steuerung auf der Live-Seite, eigene Overlay-Widgets, Sieg zählt aufs Level-System.

*Gebaut mit einem Agenten-Team (7 Logik-Module + 4 Widgets, 81 neue Tests). Stream-Boss, Loot & weitere Phasen folgen.*

---

## [0.3.18] — 2026-06-26

### Neu
- **Widget-Übernahme im TikFinity-Import**: dein **Glücksrad** (mit allen Preisen/Segmenten) und der **Social-Media-Rotator** (deine Kanäle) werden jetzt als Overlay mit übernommen. Andere Widget-Typen exportiert TikFinity ohne Ziel-/Bindungsdaten — die legst du bei Bedarf neu an (geht dank Gift-Auswahl jetzt schnell).

---

## [0.3.17] — 2026-06-26

### Neu
- **Profile** 🗂️ — umschaltbare Konfigurations-Sets (Trigger, Befehle, Einlösungen,
  Panel, TTS, Punkte, Overlays). Umschalter oben in der Leiste: Profil anlegen
  (Snapshot des aktuellen Stands), wechseln (sichert immer vorher → kein
  Datenverlust), umbenennen, löschen.
- **TikFinity-Import** 📥 — eine TikFinity-`.tfc`-Profildatei einlesen: wird
  entschlüsselt, übersetzt und als eigenes „TikFinity-Import"-Profil abgelegt
  (dein aktuelles Setup bleibt unangetastet). Übernommen werden Trigger
  (Gift/Coins-Schwelle/Like/Follow/Join/Share/Chat), Chat-Befehle, TTS-Ansagen,
  Chat-Nachrichten und myinstants-Sounds. Nicht unterstützte TikFinity-Eigenheiten
  (Overlay-Animationen, Tastendruck-Aktionen, Punkte-Aktionen) werden im
  Import-Bericht aufgeführt.

---

## [0.3.16] — 2026-06-26

### Verbessert
- **Gift-Auswahl jetzt mit Bildern, echten Coins & deutschen Namen für ALLE
  ~5700 Gifts** — nicht nur die erhaltenen. Quelle ist eine öffentliche,
  vollständige Gift-Liste (echte TikTok-giftIds + Coins + Bild-URLs + offizielle
  deutsche Namen). Damit zeigt der Gift-Auswähler ab sofort für jedes Gift ein
  echtes Vorschaubild und den korrekten Coin-Preis, auch für nie-erhaltene.
- Bilder werden direkt von TikToks CDN geladen (keine Vergrößerung des Downloads).
- Neues Script `scripts/build-gift-master.mjs` aktualisiert die Liste bei Bedarf.

---

## [0.3.15] — 2026-06-25

### Neu
- **Komplette Gift-Auswahl — alle ~5000 aktuellen TikTok-Gifts wählbar**, nicht
  mehr nur die schon erhaltenen. Damit lassen sich auch neue Event-Gifts vorab
  für Zähler/Trigger einstellen, bevor sie zum ersten Mal reinkommen. Bild,
  Coins und echte ID werden beim ersten Empfang automatisch ergänzt.
- **Deutsche Gift-Namen** in der Auswahl (wo bekannt), englischer Name als Fallback.

### Verbessert
- **Tippfehler-tolerante Gift-Suche**: „jolly" findet jetzt „Jollie's Community"
  (vorher 0 Treffer); Coins sichtbar; schon erhaltene Gifts mit Stern markiert.
- **Apostroph-/Schreibweise-tolerantes Matching** in Geschenkzähler UND Triggern
  (`gift_slug_is`): ein vorab gewähltes „Jollie's Community" findet sich beim
  Empfang zuverlässig zusammen, egal wie Apostroph/Leerzeichen geschrieben sind.

---

## [0.3.14] — 2026-06-25

### Neu / Diagnose
- **Jedes Geschenk wird jetzt geloggt** (Name × Anzahl · Coins · Sender). Bisher
  gab es nur die 5-Minuten-Summe — dadurch war nicht nachvollziehbar, ob ein
  bestimmtes Gift (z.B. „Jolly") überhaupt ankommt und unter welchem Namen. Ein
  „⚠ ohne Namen"-Hinweis erscheint, falls nur die Gift-ID ohne Namen geliefert
  wird (dann greifen Zähler/Trigger, die auf den Namen matchen, nicht).

### Behoben
- **Geschenkzähler-Matching robuster**: vergleicht den Gift-Namen jetzt ohne
  unsichtbare Leerzeichen (war eine mögliche Ursache, warum ein Zähler ein Gift
  nicht erkannte).

---

## [0.3.13] — 2026-06-25

### Behoben / Geklärt
- **Vorlese-„Flackern" aufgeklärt — es war kein Bug, sondern das Vorlese-Präfix.**
  Mit gesetztem Präfix (z.B. „.") liest bOtExE nur Nachrichten vor, die mit dem
  Zeichen beginnen — das gilt **auch für Mods/Follower**. Wer ohne Präfix schrieb,
  wurde übersprungen; das sah aus wie zufälliges Flackern. Das Log nannte als Grund
  stur „nicht in gewählter Gruppe", selbst wenn in Wahrheit nur der Punkt fehlte.
- **Log nennt jetzt den echten Grund** beim Überspringen: „kein „." davor" vs.
  „nicht in gewählter Gruppe" — damit führt das Log nie wieder auf die falsche Fährte.
- **Klarere Beschriftung** beim Präfix-Feld (TTS-Einstellungen): weist ausdrücklich
  darauf hin, dass der Präfix auch Mods/Follower betrifft.

### Neu
- **Update-Banner.** Wenn ein Update im Hintergrund geladen wurde, erscheint unten
  rechts ein Banner mit **„Jetzt neu starten"** (installiert sofort & öffnet wieder)
  und **„Später"** — kein manuelles Schließen/Neuöffnen mehr nötig.

### Entfernt
- Das temporäre Diagnose-Logging (Diag-Roles / Filter-Flags) aus v0.3.11/0.3.12 —
  hat seinen Zweck erfüllt.

---

## [0.3.12] — 2026-06-25

### Diagnose
- **Diagnose-Build Runde 2** fürs Vorlese-Flackern. Runde 1 hat bereits viel
  ausgeschlossen (IDs konsistent, Filter-Auswahl unverändert, detectRoles-Logik
  korrekt, Bus klont nicht). Jetzt zeigt das Log die komplette Kette: was
  detectRoles aus den Rohdaten berechnet (`→ detect[...]`) UND die Rollen-Flags
  direkt am TTS-Filter inkl. Gruppen- und Präfix-Status (`[m=.. f=..] grp=.. pfx=..`).
  Damit ist eindeutig sichtbar, an welcher Stelle eine Rolle verloren geht.

---

## [0.3.11] — 2026-06-24

### Diagnose
- **Temporärer Diagnose-Build** fürs verbleibende Vorlese-Flackern (manche
  Follower/Mods werden trotz Rollen-Gedächtnis noch vereinzelt übersprungen).
  Die ersten 80 Chat-Nachrichten eines Streams schreiben ihre rohen TikTok-
  Rollen-/ID-Felder ins Log (`Diag-Roles`) — danach wieder still. Damit lässt
  sich die Ursache eindeutig bestimmen; der eigentliche Fix folgt. Sonst keine
  Änderungen.

---

## [0.3.10] — 2026-06-23

### Fixed
- **Vorlesen endgültig ohne Flackern.** Trotz Rollen-Gedächtnis (v0.3.9) wurde
  dieselbe Person noch vereinzelt übersprungen — weil TikTok für einen Zuschauer
  mal die `uniqueId`, mal nur die `userId` mitschickt und die App ihn dann als
  zwei verschiedene Leute sah. Jetzt werden beide IDs geführt → ein Mod/Follower
  wird unter jeder ID-Variante wiedererkannt und durchgehend korrekt vorgelesen.
- **Freundlicherer Hinweis zur Gift-Liste.** Der Vorab-Abruf der kompletten
  Geschenk-Liste braucht einen kostenpflichtigen Euler-Plan; mit Gratis-Key kam
  bei jedem Verbinden eine alarmierende Warnung. Jetzt nur noch ein dezenter
  Einmal-Hinweis — gesendete Gifts werden ohnehin lokal gespeichert.

---

## [0.3.9] — 2026-06-22

### Fixed
- **Follower/Mods werden beim Vorlesen nicht mehr „flackern".** Vorher wurde ein
  und dieselbe Person mal vorgelesen, mal übersprungen — weil TikTok den Rollen-
  Status nicht in jeder Nachricht mitschickt. Jetzt merkt sich die App: wer einmal
  als Mod/Teamherz/Follower erkannt wurde, gilt für den ganzen Stream als solcher.
- **Geschenk-Bilder vollständig auch im Cloud-Modus.** Die komplette Geschenk-Liste
  des Streams (mit Bildern) wird jetzt auch im Cloud-Modus geladen — vorher fehlten
  seltene/Event-Gifts (z.B. Community-Fest) im Auswahl-Katalog, bis sie mal geschickt
  wurden. (Eine garantiert vollständige Liste *aller* Event-Gifts gibt es technisch
  nirgends — aber jedes real gesendete Gift wird ohnehin lokal gespeichert.)

---

## [0.3.8] — 2026-06-22

### Added
- **„Gesamt dabei" — wie viele verschiedene Leute im Stream waren.** Zählt alle
  unterschiedlichen Zuschauer pro Stream (inkl. derer, die nur beitreten ohne was
  zu tun) — die beste Annäherung an TikToks „Views". Sichtbar bei den Live-Stats
  und als Overlay-Widget nutzbar (Live-Zähler & Ziel-Countdown, Metrik „Zuschauer
  gesamt"). Überlebt Neustart/Update.
- **Mehr Einblick im Log** (alles dezent/gedrosselt): erkannte Mods/Teamherz,
  wer vorgelesen oder übersprungen wird (mit Grund), ausgelöste Ansagen, und alle
  5 Min eine Stream-Zusammenfassung. Hilft beim Nachvollziehen, was live passiert
  — z.B. ob im Cloud-Modus Mods erkannt werden.

### Fixed
- **Geschenk-Auswahl verzieht nicht mehr das Eigenschaften-Panel.** Das Auswahl-
  Menü war zu breit fürs schmale rechte Panel und lief über → Panel „verbugt".
  Jetzt passt es sauber ins Panel (volle Breite, 3 Spalten).
- Log-Zeile beim Verbinden zeigt jetzt „Verbunden mit @name" statt „Room: ?".
- Klarere Hinweise zur Hochformat-Browserquelle in TTLS (benutzerdefinierte
  Auflösung 1080×1920 + Workaround, falls TTLS die Größe nach Neustart vergisst —
  das ist ein TTLS-Verhalten, kein App-Fehler).

---

## [0.3.7] — 2026-06-21

**TTS-Update** — Vorlesen funktioniert jetzt richtig und ist viel feiner einstellbar.

### Fixed
- **Mods, Teamherz & Follower werden jetzt zuverlässig erkannt.** Vorher wurde
  z.B. ein Moderator beim Filter „nur Mods/Follower" übersprungen, weil TikTok
  die Rolle nicht immer mitschickt. Jetzt mehrgleisig erkannt — plus ein
  **Live-Follower-Gedächtnis**: Wer während des Streams folgt, gilt ab dann als
  Follower (auch wenn seine Chat-Nachrichten das nicht verraten).

### Added
- **Mehrere Gruppen gleichzeitig ankreuzen**, wer vorgelesen wird (Mods + Teamherz
  + Follower + VIP …) statt nur einer Stufe. Deine alte Einstellung wird übernommen.
- **Ansagen** (neuer Bereich, unabhängig vom Chat-Vorlesen):
  - **Neue Follower ansagen** — eigener Text + eigene Stimme.
  - **Große Gifts ansagen** — ab einstellbarer Coin-Schwelle, eigener Text + Stimme.

---

## [0.3.6] — 2026-06-20

Großes **Performance-Update** — die App läuft jetzt deutlich sparsamer, gerade
wenn du nebenbei zockst und streamst. Optik bleibt gleich. (Nach gründlichem
Mehr-Agenten-Audit + Recherche zu Electron/Overlay-Best-Practices.)

### Changed
- **Overlay auf 60 fps gedeckelt.** Das Overlay lief auf schnellen Monitoren mit
  ~174 fps und hat unnötig CPU/GPU gefressen — für ein Overlay sind 60 fps
  verlustfrei (Animationen sehen identisch aus). Spart spürbar Leistung fürs Spiel.
- **Editor-Vorschau-fps-Bug behoben:** lief seit v0.3.5 bei ~30 statt 60 fps.
- **Glas-Blur im echten Overlay aus** (optisch neutral): Der Weichzeichner hat
  über dem transparenten Hintergrund nichts gebracht, kostete aber pro Bild
  GPU. Das Glas-Aussehen bleibt unverändert.
- **Like-Fontäne & Effekte laufen GPU-schonender** (Compositing statt teurem
  Neu-Berechnen): Herzen, Spotify-Equalizer, Glanz-Effekte, Konfetti, Emojis.
- **Spotify fragt nur noch nach Songs, wenn nötig** (Overlay offen + Widget
  vorhanden) statt dauerhaft alle 4 Sekunden im Hintergrund.
- **Editor reagiert flüssiger:** Tippen in Feldern lädt das Overlay nicht mehr
  bei jedem Buchstaben neu (kein Flackern); Verschieben/Größe-Ändern ruckelt
  weniger; Widget-Vorschauen in der Liste laufen nur noch sichtbar.

### Fixed
- **Weniger Last bei Geschenk-/Like-Flut:** Nachrichten ans Overlay werden nur
  noch einmal statt pro Fenster aufbereitet; Statistiken & Layouts werden
  zwischengespeichert statt bei jedem Event neu berechnet/von der Platte gelesen.
- **Geschenk-Bilder laden gedrosselt** (max. 5 gleichzeitig) statt alle auf
  einmal beim Verbinden.
- **App bricht nicht mehr ein, wenn ein Spiel im Vollbild sie verdeckt.**
- Timer-/Subathon-/Hype-Train-Widgets laufen im Leerlauf nicht mehr unnötig.
- Die `~60 fps`-Logmeldung steht jetzt als Info da, nicht mehr als Warnung.

### Sicherheit
Nach einem zweiten Audit (Codex GPT, gegengeprüft):
- **TikTok-Bibliothek auf stabile Version aktualisiert** (raus aus der Beta) —
  behebt eine kritische + zwei hohe DoS-Lücken in einer Unter-Abhängigkeit.
  Produkt-Audit jetzt: **0 Schwachstellen**.
- **Sound-Import (MyInstants) gegen SSRF abgesichert** — lädt nur noch echte
  myinstants.com-MP3s über HTTPS, folgt keinen Weiterleitungen mehr.
- CI baut jetzt reproduzierbar (`npm ci`).

---

## [0.3.5] — 2026-06-19

### Added
- **🎵 Spotify-Integration (komplett).** Verbinde dein Spotify (Einstellungen → Spotify, Login per Browser).
  - **Now-Playing-Widget:** zeigt live Cover, Titel, Künstler und Fortschrittsbalken im Overlay.
  - **Steuerung:** Play/Pause/Weiter/Zurück direkt aus der App.
  - **Zuschauer-Song-Requests:** per Chat-Befehl oder Geschenk einen Song in deine Warteschlange (Trigger-Aktion „Spotify Song-Request"). Mit Drossel gegen Spam und klaren Hinweisen (Spotify Premium + aktives Gerät nötig).
- **✍️ Neues Widget „Schrift / Text".** Einfacher Standtext (z.B. „Folge für mehr!") mit schönen Schriftarten, Farben, Umrandung und optionaler Animation (Puls, Hüpfen, Schweben, Glühen, Regenbogen, Schimmer).
- **Schriftart & Größe jetzt ÜBERALL einstellbar** — bei jedem Widget kannst du Schriftart, Größe und Textfarbe anpassen.
- **10 neue gebündelte Schriftarten** zur Auswahl (Bebas Neue, Anton, Bungee, Luckiest Guy, Fredoka, Permanent Marker, Pacifico, Russo One, Press Start 2P, Righteous) — funktionieren offline, keine externen Schriften nötig.
- **🔴 Auto-Live-Erkennung (wie TikFinity):** Die App merkt von selbst, wenn du auf TikTok live gehst, und verbindet sich automatisch — kein manuelles „Verbinden" mehr nötig. Abschaltbar in den Einstellungen.

### Changed
- **Like-Fontäne steigt höher & über die volle Widget-Höhe** (vorher nur 1–2 cm) — mehr Herzen, schönerer Effekt.
- **Editor-Vorschau auf ~60 fps gedeckelt** — spart Strom/CPU, das echte Overlay (OBS/TTLS) bleibt unverändert flüssig.

### Fixed
- **Sicherheits-Härtung (Mehr-Agenten-Audit):** Backups können keine fremden Geheimnisse mehr unterschieben (Spotify-/TikTok-Tokens, Steuer-Token, OBS-Passwort werden beim Import hart entfernt). Spotify-Login-Seite HTML-escaped. Live-Check mit Timeout, damit ein Hänger die Auto-Erkennung nicht einschläfert.

---

## [0.3.4] — 2026-06-18

### Added
- **Neues Widget „Ziel-Countdown (Text)"** im TikFinity-Stil: cooler Text-Countdown wie „Noch 50.000 Likes bis zum Ziel!" — pro Metrik (Likes/Follower/Shares/Geschenke/Coins/Zuschauer), auf Deutsch, frei betextbar. Zählt das nächste Ziel automatisch hoch oder bleibt bei „erreicht".
- **Gift-Bilder werden lokal gespeichert.** Beim Verbinden lädt die App jedes Gift-Bild einmalig herunter → überlebt ablaufende TikTok-CDN-Links, Bilder laden auch **offline** (Editor-Vorschau, Test ohne Live), und es ist schneller. Neuer Button **Einstellungen → „Geschenk-Bilder öffnen"**.

### Fixed
- **Gift-Zähler zeigt das gewählte Gift sofort** (Bild aus dem Katalog vorgeladen) — auch bei seltenen/teuren Gifts wie Galaxy, statt erst nach dem ersten Eingang ein generisches Icon.

---

## [0.3.3] — 2026-06-17

Stabilitäts-Build nach gründlichem Mehr-Agenten-Audit — behebt mehrere echte Fehler aus v0.3.2.

### Fixed
- **Follower-Zahl + Gift-Summen bleiben jetzt wirklich erhalten** nach Update/Neustart — der Wiederherstell-Mechanismus wurde vorher beim ersten erneuten Verbinden sofort wieder gelöscht.
- **Galerie „Letztes Live"** verliert nicht mehr bei jedem kurzen Verbindungsabriss die bereits erhaltenen Geschenke.
- **„Rahmen ausblenden" behält die Profilbild- und Ranglisten-Ringe** (Gold/Silber/Bronze im Arcade-Leaderboard) — die waren vorher fälschlich mit verschwunden. Gift-Alert-Restrahmen und Sport-„Mein Team"-Markierung im Frameless ebenfalls korrigiert.
- **Gift-Feed-Text** ist auf hellen Designs wieder lesbar.
- **Cloud-Verbindung robuster:** keine Geister-Trennungen mehr, sauberes Schließen alter Verbindungen, schonenderer Umgang mit dem Gratis-Kontingent, und Likes/Viewer-Zahlen fallen nicht mehr auf 0, falls der Cloud-Dienst Felder anders benennt. Klare Meldung, dass Chat-Senden im Cloud-Modus nicht geht.
- **Befehl-Karussell-Editor** verträgt jetzt Sonderzeichen im Text ohne die Liste zu zerschießen; die Editor-Vorschau lädt nicht mehr mitten im Bearbeiten neu.
- Sicherheits-Härtung des internen Sound-Vorhör-Proxys (SSRF/Redirect-Schutz, Größenlimit, Timeout).

### Added
- **Empfohlene Browserquellen-Größe** (z.B. 1080×1920) wird jetzt am Profil angezeigt und beim Link-Kopieren mitgesagt — inkl. kurzer Schritt-Anleitung für TikTok Live Studio.

---

## [0.3.2] — 2026-06-17

### Added
- **Auto-Reload der Overlay-Browser-Quelle bei Updates:** Nach einem App-Update lädt sich das Overlay in TikTok Live Studio / OBS künftig **von selbst neu** und holt den frischen Code — kein manuelles Neu-Einfügen der Quelle mehr nötig.
- **Like-Fontäne im TikFinity-Stil** 💖: Herzen steigen jetzt **über die ganze Breite verteilt** auf, **bunt**, höher & länger, sanft schwingend — und ab und zu mit dem **echten Profilbild** des Likers.
- **Sound-Vorhören ohne Download:** In der MyInstants-Suche spielt **„Anhören"** einen Treffer kurz vor, ohne ihn in die Bibliothek zu importieren.
- **Befehl-Karussell mit Geschenken:** zeigt jetzt, welches **Geschenk** welche Aktion auslöst — mit echtem Gift-Bild + Text, statt Emojis.
- **Durchsuchbare Gift-Auswahl** beim Gift-Zähler und Gift-Battle (kein Namen-Auswendiglernen mehr).

### Fixed
- **„Rahmen ausblenden" entfernt jetzt wirklich alles** — auch den Milchglas-Blur, die Gradient-Randlinie und feine Eigen-Ränder einzelner Widgets. Nur noch der Inhalt.
- **Galerie „Letztes Live"** zeigt nur noch die **tatsächlich erhaltenen** Geschenke, nicht den ganzen Room-Katalog.
- **Follower-Zahl + Gift-Summen überleben App-Neustart/Update** — die Goal-Bars fallen nicht mehr auf 0 zurück (laufende Session-Stats werden persistiert).
- **Widgets skalieren sauber beim Verkleinern** (Leaderboard, Goal-Bar, Gift-Feed, Chat-Box) — Inhalt wird nicht mehr abgeschnitten, sondern schrumpft mit (Container-Queries).

---

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
