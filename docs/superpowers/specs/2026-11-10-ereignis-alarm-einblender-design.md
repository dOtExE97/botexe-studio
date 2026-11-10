# Ereignis-Alarm + Einblender — Design

Stand: 10.11.2026 · Auftraggeber: Alex (Streamer, Maintainer) · Status: **freigegeben von Alex am 10.11.2026** (großes Update, alles auf einmal)

## Worum es geht und warum

Im Live vom 08.11. wurde jemand Superfan — und **nichts passierte**. Belegt aus den Logs des
Stream-PCs: Die App hat das Superfan-Ereignis erkannt (3× am 08.11.), aber es gab keine einzige
Superfan-Regel, und der Herz-Alarm lässt sich nur auf Teamherz/Gift/Follow/Sub stellen.
Genauso gehen drei weitere Momente verloren, die für Alex' Community wichtig sind:

- **Teamherz-Level-Up**: TikTok meldet ihn als Banner (`WebcastBarrageMessage`). Diese Nachricht
  wirft die App bewusst weg (`tiktok-cloud.ts` ~191–197 und `default`-Zweig ~265–292) — 15–48×
  pro Stream.
- **Schatztruhe** (TikToks Coin-Truhe, intern „Envelope"): kam zwischen 03. und 06.11. 11× an,
  wird aber nur gezählt. Was drinstand (Absender, Coins, Art), weiß niemand.
- **Geschenke-Stufe-Level-Up** (Gifter-Level): steckt im selben Banner.

Dazu kommt ein zweiter Wunsch: kurze, **professionell wirkende Werbe-Spots** („Ihr wollt
supporten? Tippen, Teilen, Folgen"), die reinswooshen und wieder weg sind — zeitgesteuert und
**automatisch, wenn kaum jemand liked, obwohl genug Leute zuschauen**.

Erfolg heißt für Alex: Im nächsten Live bekommt jeder Level-Up, jeder neue Superfan und jede
Truhe einen eigenen, hochwertigen Moment auf dem Bildschirm — ohne dass er Regeln basteln muss —
und die Like-Werbung läuft von allein.

## Ziele

1. **Banner nutzen** statt wegwerfen: Teamherz-Level-Up und Gifter-Level-Up werden zu echten
   App-Ereignissen (Overlay, Trigger-Seite, Log).
2. **Herz-Alarm wird zum Ereignis-Alarm**: Ein Vollbild-Widget, pro Ereignis einstellbar
   (an/aus, Animation, Sound). Ereignisse: Teamherz (wie bisher), Teamherz-Level-Up,
   Gifter-Level-Up, Superfan, Schatztruhe.
3. **Neue Animationen**, live gerendert mit den echten Daten (Name, Profilbild, Level, Coins):
   - Level-Up: fünf Stile zur Auswahl — Herzschlag, Goldherz mit Flügeln, Neon, TikTok-Stil,
     **TikTok-Neon (Standard)**.
   - Superfan: „Premium" (Implosion → Knall → Gold-Medaillon mit Diamant, Goldflügel, Krone,
     Chrom-Schrift „SUPERFAN").
   - Schatztruhe: „Premium" (Holztruhe mit Goldbeschlägen, Deckel springt auf, Münz- und
     Edelstein-Fontäne, Coin-Zähler).
4. **Eigene Animationen**: Pro Ereignis kann Alex statt einer eingebauten Animation eine eigene
   Datei wählen (Video mit Transparenz, GIF), Name/Profilbild optional darüber.
5. **Warteschlange**: Kommen mehrere Ereignisse gleichzeitig, laufen sie nacheinander.
6. **Einblender** (neues Widget): Werbe-Spot im Motion-Design-Stil, Looks Neon und Gold,
   Szenen Tippen/Teilen/Folgen wählbar, zeitgesteuert, per Trigger-Regel auslösbar, und mit
   **Auto-Modus „Like-Flaute"**.
7. **Truhen-Log**: Jede Truhe bekommt eine lesbare Logzeile mit Art-Nummer (`businessType`),
   Coins, Absender — damit die Geschenktüte später zugeordnet werden kann.

## Nicht-Ziele (diesmal)

- **Geschenktüte** als eigenes Ereignis. Alex: „tüte nicht so wichtig erst mal". Es bleibt beim
  Truhen-Log (Ziel 7); die Tüte ist laut Alex etwas, das nur der Streamer selbst schickt
  (Teilnahme durch Teilen) — wird nach einem Live mit Log zugeordnet.
- Neue, „echte" Sounds produzieren. Es gibt eingebaute Standard-Sounds (die synthetisierten aus
  den Proben); eigene Sounds wählt Alex aus seiner Sound-Bibliothek.
- Eine Trigger-Aktion „spiele Alarm X" an den Ereignis-Alarm. (Trigger-Regeln auf die neuen
  Ereignisse gehen trotzdem — siehe unten.)
- Vorgerenderte WebM-Fassungen der neuen Animationen.

## Anti-Ziele (das wäre ein Fehlschlag, auch wenn es „funktioniert")

- **Ein bestehendes Overlay sieht danach anders aus oder verhält sich anders.** Ein Herz-Alarm,
  den Alex nicht anfasst, spielt exakt wie heute (gleiche Motive, Abbruch-statt-Warteschlange,
  gleiche Felder-Werte). Neue Optik = neuer Wert; Widget-Typen werden nicht gelöscht.
- **Ereignisse verschwinden still**: Eine volle Warteschlange, ein Banner-Typ, den wir nicht
  verstehen, ein Profilbild, das nicht lädt — alles bekommt eine (gedrosselte) Logzeile in
  Alltagssprache (AGENTS.md → Logging).
- **Billig-Look.** Alex hat die Proben mehrfach als „zu billig" zurückgewiesen, bis sie so aussahen
  wie jetzt. Die Umsetzung muss den Proben **gleichwertig** sein (siehe Proben-Ordner) — keine
  vereinfachte Fassung.
- **Ruckeln im Stream**: Der TTLS-Browser ist schwach. Eine Animation, die auf dem Stream-PC unter
  ~30 Bildern/s fällt, ist ein Fehlschlag.
- **Geratene Feldnamen** (Haus-Regel „Nicht raten"): Wie eulerstream die Banner-Felder
  serialisiert, ist NICHT belegt. Siehe „Offene Daten".

## Die Proben — das Aussehen ist abgenommen

Im Ordner `docs/superpowers/specs/2026-11-10-proben/` liegen die von Alex abgenommenen
Wegwerf-Proben (Canvas 2D, deterministisch per Seed, Bild für Bild über headless Chrome
gerendert; `render.mjs` ist der Render-Helfer):

| Datei | Inhalt | Aufruf |
|---|---|---|
| `levelup-v1-v3.html` | Level-Up V1 Herzschlag, V2 Goldherz mit Flügeln, V3 Neon | `?v=1`/`2`/`3` |
| `levelup-v4-v5.html` | V4 TikTok-Stil, **V5 TikTok-Neon** (`?mix=1`) — mit Teamlevel-Zeile + großem Profilbild | `?typ=herz[&mix=1]` (die Typen `superfan`/`kiste` darin sind VERWORFEN) |
| `superfan-truhe.html` | Superfan-Premium, Schatztruhe-Premium | `?typ=superfan` / `?typ=truhe` |
| `einblender-spot.html` | Einblender-Spot V2 (Motion Design) | `?st=neon` / `?st=gold` |

Sie benutzen die Schrift **Inter Black** (`Inter-Black.ttf`, SIL Open Font License). Sie gehört
als `.woff2` in `packages/widget-kit/` und in `THIRD-PARTY-LICENSES.md`.

Die Proben sind Referenz für Aussehen und Ablauf (Timing, Easing, Ebenen), **kein** Produktcode:
Die Platzhalter (Name „Schwester Mary", Initial statt Bild, Level 11→12, 500 Coins,
`@DOTEXE_97`) werden durch echte Daten ersetzt. Abgenommene Fassungen (Videos, nur lokal):
`LevelUp_V5b_TikTok-Neon.mp4`, `Alert_Superfan_v2.mp4`, `Alert_Schatztruhe_v2.mp4`,
`Einblender_V2_neon/gold.mp4`.

## Wie es gebaut wird — was entschieden ist

### 1. Banner → Ereignisse (Main-Prozess)

- `WebcastBarrageMessage` wird in `tiktok-cloud.ts` gemappt statt verworfen. Laut Protokoll-Schema
  (`tiktok-live-proto` `WebcastBarrageMessage`, `msgType`-Enum) sind relevant:
  `USER_UPGRADE = 8` (`userGradeParam{currentGrade,user}` → Gifter-Level-Up) und
  `FANS_LEVEL_UPGRADE = 10` (`fansLevelParam{currentGrade,user}` → Teamherz-Level-Up).
  `SUBSCRIBE = 4` / `SUBSCRIBE_GIFT = 7` werden NICHT doppelt zu Superfan gemacht, solange
  `superFan`/`superFanJoin` sie bereits liefern (Dedup-Frage → Builder, aber keine Doppel-Alarme).
- Neues `StudioEvent`: `type: 'level_up'` mit `levelUp: { art: 'team' | 'gifter', neu: number }`
  und `user`. Der vorige Level ist im Banner nicht garantiert — die Animation rollt von `neu-1`
  auf `neu` (**meine Entscheidung**).
- **Ersatzweg Teamherz** (falls ein Banner nicht kommt): steigt die bekannte `teamLevel` eines
  Nutzers während des Streams (Abzeichen-Erkennung, `studio.ts` ~2866ff.), entsteht ebenfalls ein
  `level_up`. Doppelt (Banner + Abzeichen für denselben Nutzer und dieselbe Stufe innerhalb von
  60 s) feuert nur einmal. Erstsichtung eines Nutzers ist **kein** Level-Up.
- Logzeile je Level-Up in Alltagssprache, z. B. `[TikTok] Teamherz-Level-Up: <Name> → Stufe 12`.
- Banner mit anderem `msgType`: weiterhin verworfen, aber **mit Zählung je msgType** im
  Artenbuch/Log, damit man sieht, was noch kommt.
- Trigger-Engine: neuer Ereignistyp `level_up` mit Bedingungen „Art ist Team/Gifter" und
  „neue Stufe ≥ N" — inklusive aller Stellen, die laut Code-Karte mitziehen müssen
  (`index.ts`-Union, `validators.ts` `EVENT_TYPES`/`CONDITION_KINDS`, `TriggersPage.tsx`,
  `test-event-allowlist`, Tests).

### 2. Truhen-Log

- Jede `envelope`-Nachricht → eine Logzeile mit `businessType`, Coins (`diamondCount`),
  Gewinnerzahl, Absendername. Für unbekannte `businessType`-Werte einmal je Wert und Stream
  zusätzlich die Feldnamen (Diagnose-Muster `felderVon`, nur Namen, keine Werte).
- `businessType` wird am `StudioEvent.envelope` mitgeführt, damit spätere Arten (Tüte) ohne
  Umbau unterscheidbar sind.

### 3. Herz-Alarm wird Ereignis-Alarm (Widget `herz-alarm`, erweitert — kein neuer Typ)

**Meine Entscheidung:** Erweitern statt neuem Widget-Typ, weil Alex ausdrücklich „der eine
Screen" für alles will und zwei Vollbild-Alarme sich überlagern würden.

- Neues Prop `ereignisse` (Feldtyp `checkboxes`): `teamherz`, `level_team`, `level_gifter`,
  `superfan`, `truhe`. **Fehlt das Prop (alle bestehenden Overlays), gilt exakt das alte
  Verhalten** über `event`/`motiv` — inklusive Abbruch statt Warteschlange.
- Ist `ereignisse` gesetzt: pro Ereignis drei Felder (mit `showIf`, getrennt durch `separator`):
  - **Animation** (`select`): je Ereignis die passenden eingebauten Stile + die vorhandenen
    Herz-Motive (WebM) + „Eigene Datei". Standard: Teamherz → bisheriges Motiv-Verhalten,
    Level-Up (beide) → TikTok-Neon, Superfan → Premium, Truhe → Premium.
  - **Eigene Datei** (`media`, nur bei „Eigene Datei").
  - **Sound** (`select`: Standard / Eigener / Aus) + `sound`-Feld bei „Eigener".
  - Dazu je Ereignis für Teamherz die bestehende Mindeststufe; für Level-Up eine
    Mindeststufe (feuert erst ab Stufe N, Standard 0).
- **Warteschlange**: Ereignisse laufen nacheinander, höchstens 10 wartend (Muster
  `follow-alert.js`). Was überläuft, wird verworfen **und geloggt**.
- **Live-Rendering**: Die Canvas-Animationen laufen im Overlay in Echtzeit (rAF), in eigenem
  Modul neben `herz-alarm.js` (z. B. `alarm-anim.js`), Name/Profilbild/Level/Coins aus dem
  Ereignis. Profilbild fehlt (bei der Truhe die Regel, weil TikTok dort nur den Namen schickt) →
  Initiale wie in der Probe. Profilbild lädt nicht → ebenfalls Initiale.
- **Standard-Sounds**: Die synthetisierten Sounds aus den Proben werden als eingebaute
  Standard-Sounds mitgeliefert (**meine Entscheidung**; Alex: „nehmen wir erst mal so").
- **Eigene Datei**: wird formatfüllend gespielt; Name/Profilbild optional per HTML darüber
  (vorhandene `showUser`/`userText`-Mechanik).
- **Vorschau** (`ctx.preview`): zeigt reihum Demo-Abläufe der gewählten Ereignisse mit deutschen
  Demo-Daten — keine leere Box.
- Pflichten aus AGENTS.md gelten: Sperren fallen auch im Fehlerfall, nichts zeichnen ohne
  vermessene Fläche, `destroy()` räumt rAF/Timer/Bilder ab.

### 4. Einblender (neues Widget `einblender`)

- Neuer Widget-Typ, Kategorie wie die anderen Alert-/Text-Widgets (Builder entscheidet anhand
  `palette-gruppen.ts`). Breites Band, Standardgröße an der Probe (Design-Fläche ~1080×560).
- Props: Look (`neon` | `gold`), Szenen (`checkboxes`: Tippen, Teilen, Folgen — Standard alle),
  Intro-Text (Standard „IHR WOLLT SUPPORTEN?"), Abschluss-Text (Standard „DANKE") mit optionalem
  Handle (Standard leer = weglassen), Intervall in Minuten (0 = nur auf Auslöser, Standard 0),
  Sound (Standard / Eigener / Aus).
- **Auslösbar per Trigger-Regel**: `onAction` auf `fire_alert` spielt den Spot (wie
  `follow-alert.js`).
- **Auto-Modus „Like-Flaute"** (Schalter + Felder): mind. Zuschauer (Standard 5), Zeitraum in
  Minuten (Standard 3), weniger als X Likes in diesem Zeitraum (Standard 50), Pause danach in
  Minuten (Standard 10). **Meine Entscheidung:** Die Logik lebt im Widget selbst — es bekommt
  ohnehin alle `like`- (`likeCount`) und `viewer_count`-Ereignisse (`viewerCount`); die
  Trigger-Engine wertet bei Timer-Ticks keine Bedingungen aus und müsste dafür umgebaut werden.
- Skaliert die Design-Fläche in die Box (Seitenverhältnis halten), damit `widget-check` in allen
  sechs Größen grün ist.
- Vorschau: Spot läuft in Schleife.

### 5. Qualität / Prüfungen

- lint, typecheck, test, widget-check = 0 (Exit-Code); `node --check` je geänderter Widget-Datei;
  `widget-belastung` vor Release (auch für `level_up`- und `envelope`-Ereignisse NACKT).
- Neue Tests mindestens: Banner-Mapping (msgType 8/10, Feld fehlt, unbekannter Typ),
  Level-Up-Dedup Banner/Abzeichen, Erstsichtung ≠ Level-Up, Herz-Alarm ohne `ereignisse` =
  altes Verhalten (Wächter), Warteschlange + Überlauf, Like-Flaute-Rechnung (Schwelle, Pause),
  Trigger-Engine `level_up`.
- Echte Bilder ansehen (Screenshot/Video aus der App), bevor „fertig" gemeldet wird —
  Vergleich gegen die Proben-Videos.
- Leistung auf dem Stream-PC (Windows, TTLS) prüfen: ≥30 Bilder/s bei Level-Up, Superfan und
  Truhe.

## Offene Daten (Pflicht, bevor die Banner-Erkennung als „fertig" gilt)

- **Feldform der Banner bei eulerstream ist nicht belegt.** Unbekannt: kommt `msgType` als Zahl
  oder als Text, heißen die Felder `fansLevelParam`/`userGradeParam` so wie im Proto-Schema,
  steckt der Nutzer drin. Vorgehen: defensiv parsen (beide Formen), die ersten Banner je msgType mit Feldnamen loggen
  (auch ohne Diagnose-Modus, einmal je Stream), und **nach dem ersten Live mit dem Update am
  echten Log bestätigen** (Logs per SSH vom Stream-PC, siehe `runbooks/access.md` in der
  Wissensbasis). Der Ersatzweg über Abzeichen (oben) funktioniert unabhängig davon.

## Geklärt nach dem Builder-Check

1. **Modus statt stillem Umkippen** (*meine Entscheidung*): Neues Prop `modus`
   (`klassisch` | `ereignisse`). Fehlt es → `klassisch` = exakt heutiges Verhalten, alle alten
   Felder (`event` inkl. Gift/Follow/Sub, `motiv`, …) gelten unverändert. Erst wer `modus` auf
   „Ereignisse" stellt, bekommt die Häkchen, die Pro-Ereignis-Felder und die Warteschlange. In
   `widget-types.ts` ist der Standard für NEU angelegte Herz-Alarme `ereignisse`; bestehende
   Layer tragen kein `modus` und bleiben klassisch. Gift/Follow/Sub gibt es nur im klassischen
   Modus. Wächter-Test: Layer ohne `modus` verhält sich wie vorher.
2. **Superfan** (*meine Entscheidung*): Neubeitritt (`superfanNeu`) spielt „NEUER SUPERFAN";
   Verlängerung spielt dieselbe Animation mit Unterzeile „SUPERFAN VERLÄNGERT" — abschaltbar
   per Häkchen „auch Verlängerungen" (Standard an). Die **Superfan-Truhe**
   (`envelope.superFan`, businessType 19) läuft als **Truhe** mit Unterzeile „SUPERFAN-TRUHE".
3. **Truhe doppelt?** Ob je Truhe eine oder mehrere `envelope`-Nachrichten kommen, ist nicht
   belegt. Deshalb Doppelt-Sperre über `envelopeId` (sofern vorhanden, sonst Absender+Coins
   innerhalb 30 s) auch für den Alarm; das neue Truhen-Log zeigt im nächsten Live, wie es
   wirklich ist.
4. **Sounds und Schrift sind gesichert** im Proben-Ordner: `sfx1–5.ogg` = Level-Up V1–V5
   (V5/TikTok-Neon = `sfx5.ogg`), `sfx_sf2.ogg` = Superfan, `sfx_tr2.ogg` = Truhe,
   `sfx_spot2.ogg` = Einblender, `Inter-Black.ttf`. Die Sounds sind auf das Timing der Proben
   getaktet — die Live-Renderer halten diese Zeitachsen (T_BURST usw.) exakt ein.
5. **Leistung vs. Aussehen** (*meine Entscheidung*): Aussehen hat Vorrang. Teure Effekte
   (Glow/`shadowBlur`) werden einmalig in Offscreen-Ebenen vorgebacken statt pro Bild
   gerechnet. Reicht das auf dem Stream-PC nicht, gibt es eine Qualitätsstufe „Leicht"
   (weniger Partikel/Glow) als Einstellung — Standard bleibt „Voll". Gemessen wird auf dem
   Stream-PC (per SSH erreichbar) vor dem Release.
6. **Kein Zwischen-Release** (Alex, 10.11.: „Großes Update jetzt… will ja alles testen"). Die
   Banner-Felder werden defensiv geparst (Zahl ODER Text bei `msgType`, beide Feldformen); der
   Abzeichen-Ersatzweg sichert Teamherz-Level-Ups unabhängig davon ab. Das erste Live mit dem
   Update ist der Beleg — vorhandene Logs (31.10.–09.11.) und alte Projekte enthalten keine
   Banner-Inhalte, nur „übersprungen"-Zeilen.
7. **Gifter-Level-Up** (*meine Entscheidung*): derselbe Renderer wie Teamherz-Level-Up mit
   eigenem Farbschema (Gold/Blau statt Pink/Cyan), Unterzeile „GESCHENKE-STUFE {alt} → {neu}"
   und Stufen-Plakette statt Herz-Kachel am Profilbild. Kein eigener Look-Zweig.

## Dem Builder überlassen

Modul-Aufteilung, Namen, wie die Proben-Zeichenfunktionen in wiederverwendbare Renderer
umgebaut werden, Feld-Reihenfolge im Panel, Kategorie des Einblenders, Format/Ort der
Standard-Sounds, Einzelheiten der Warteschlange.

## Reihenfolge (Vorschlag)

1. Truhen-Log + Banner-Logging (klein, sofort nützlich fürs nächste Live).
2. `level_up` im Main-Prozess + Trigger-Engine.
3. Ereignis-Alarm (Herz-Alarm-Erweiterung, Renderer, Warteschlange).
4. Einblender + Like-Flaute.
5. Doku, CHANGELOG, Release **nur nach Alex' Freigabe**.
