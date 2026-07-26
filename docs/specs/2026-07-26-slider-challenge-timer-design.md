# Challenge-Timer im Geschenke-Slider (Stück 2 der Gambling-Familie)

Datum: 2026-07-26 · Status: Design abgesegnet, in Umsetzung

## Idee (von Alex)
Ein Geschenk bekommt eine **Challenge mit Dauer** — z.B. 🎁 Galaxy = „1 Min still sein",
🎁 Rose = „3 Min only Sniper". Das ist KEIN Code-Effekt, sondern eine Ansage/Challenge,
die der Streamer selbst macht. Schickt jemand das Geschenk, startet auf **genau diesem
Eintrag** im Geschenke-Slider (`gift-menu`) ein **animierter Countdown**. Läuft er ab,
geht der Eintrag zurück in den Normalzustand. Reine Anzeige — es wird nichts gefeuert.

## Abgesegnete Design-Entscheidungen
1. **Einstellen: direkt im Slider-Eintrag.** Die Geschenk-Liste (`items`,
   `gift-command-list`) bekommt pro Zeile ein optionales **Minuten-Feld**. Kein Wert =
   kein Timer (Eintrag läuft wie bisher). Rückwärtskompatibel.
2. **Nachlegen: Zeit drauflegen.** Kommt dasselbe Timer-Geschenk erneut, während der
   Countdown läuft, wird die Dauer **addiert** (0:20 + 1:00 = 1:20). Obergrenze gegen
   Spam: **max. 600 s (10 Min)** pro Eintrag (Alex kann später anders wollen).
3. **Mehrere gleichzeitig:** Einträge zählen unabhängig runter (Galaxy „still sein" UND
   Rose „only Sniper" parallel).
4. **Reine Anzeige**, kein Firing (Challenge macht der Streamer).
5. **Mehrere Timer-Optiken** als Stil-Auswahl (`timerStyle`): mind. „Einfach" (nur Zahl),
   „Balken" (schrumpfender Balken + Zahl), „Ring" (Kreis-Countdown). Weitere möglich.
6. **Anzeige-Grenze (ehrlich):** am prominentesten im **Rotations-Modus** (großer Eintrag);
   im **Laufband** (durchlaufende Chips) ebenfalls eingebaut, aber naturgemäß kleiner.

## Befund (echter Code)
- Item-Format: `slug::text | slug::text` — `parseItems` (`gift-menu.js:1122`) splittet auf
  `|`, erstes `::` trennt slug/text. Editor: `GiftCommandListEditor.tsx` (Row {slug,text},
  `serialize` → `slug::text`).
- Der passende Eintrag reagiert schon auf sein Geschenk: `onEvent` → `celebrate(i)`
  (`gift-menu.js:1285`) hebt den Eintrag hervor + Partikel. Hier hängt der Countdown an.
- Timer-/Cleanup-Muster im Widget vorhanden (`this.timers`-Set, `destroy()`).

## Umfang (Reihenfolge)
1. **Item-Format + Editor:** `slug::text::sekunden` (3. Feld optional). `parseItems` +
   `GiftCommandListEditor` um `secs` erweitern (Minuten-Feld pro Zeile), rückwärtskompatibel.
2. **Countdown-Engine im Widget:** pro Eintrag Restzeit starten/addieren (Cap 600s)/ticken/
   ablaufen + Cleanup. Testbarer reiner Kern (Reducer-Stil) + DOM-Anzeige in `celebrate`.
3. **Timer-Optiken:** Stile „Einfach/Balken/Ring" + Feld `timerStyle`; animiert, in Rotation
   und Laufband.

## Verifikation
Pro Task: `lint`/`typecheck`/`test`/`widget-check` == 0, `node --check` je geänderter
Widget-`.js`, Box angeschaut (nichts läuft raus). Kein TikTok-Gift-Bild ins Repo.
