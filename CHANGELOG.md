# Changelog

Alle nennenswerten Änderungen. Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

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
