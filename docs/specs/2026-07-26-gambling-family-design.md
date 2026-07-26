# Glücks-/Gambling-Familie (Rad-Trigger, Slider-Timer, Automat, Lucky-Card)

Datum: 2026-07-26 · Status: Stück 1 in Umsetzung, 2–4 skizziert

## Problem / Wunsch
Ein Geschenk soll ein Zufalls-Ergebnis auslösen: ein gewähltes Geschenk lässt das
Glücksrad drehen und lost aus den eingestellten Geschenken/Aktionen eines aus.
Darüber hinaus wünscht sich Alex eine ganze „Glücks"-Familie: ein Slot-Machine-
Widget, eine im Geschenke-Slider gezogene Lucky-Card und einen Timer/Countdown
direkt im Slider. Anspruch: Profi-Niveau, animiert, nichts läuft aus der Box.

## Befund (aus dem echten Code)
- Das Rad dreht bereits über die fertige Action `spin_wheel`
  (`{ kind:'spin_wheel'; targetId; cost?; segmentIndex?; roll? }`), das Widget
  reagiert per `onAction({kind:'spin_wheel', params:{name,gift}})` (`wheel.js`).
- Die Trigger-Engine kann ein Geschenk schon auf eine Aktion mappen:
  Bedingung `gift_slug_is` / `gift_id_is` → Aktionen `spin_wheel`, `play_sound`,
  `fire_alert`, `play_media`, `giveaway_draw`, … (`trigger-engine/src/index.ts`).
  Modell einer Regel: `Ereignis → Bedingungen[] → Aktionen[]`.
- Das Geschenk-Menü liest Gift-Trigger automatisch aus (`source:'liste'|'trigger'`,
  `itemsFromRules(rules)` via `/trigger-rules`) — dieselbe Mechanik nutzen wir fürs Rad.
- Rückkanal Widget→Host existiert: `ctx.reportWin(winId,user)` schickt per WebSocket
  `{kind:'gamewin',...}` an den Server (`runtime.js`). Analog bauen wir das Auto-Feuern.
- Der Listen-Editor (`StringListEditor`, `type:'list'`) ist seit v0.36.0 für die
  Rad-Felder aktiv → manuelles Befüllen ist schon gelöst.
- Geschenke-Slider (`gift-menu` Laufband) ist bereits reich animiert (Scroll, Glanz,
  Aurora, Holo, Neon-Flacker) und feiert bei passendem Gift (`onEvent`→`celebrate`).
  Es fehlt: echte Aktion feuern + Timer/Countdown-Anzeige.
- MyInstants existiert schon als Service (`main/services/myinstants.ts`) — für die
  spätere Sound-Vorschau im Trigger wiederverwendbar.

## Umfang — Reihenfolge: 1 → 2 → 3 → 4, jedes komplett fertig

### Stück 1 — Geschenk triggert Glücksrad  (DESIGN ABGESEGNET)
Mechanik: Zuschauer schickt das gewählte Geschenk → Trigger-Regel feuert
`spin_wheel` aufs Rad → Rad dreht → lost ein Feld aus. Optional feuert die zum
Feld gehörende Aktion automatisch.

1. **Felder-Quelle** — neues Rad-Feld `source: 'liste' | 'trigger'`
   (analog Geschenk-Menü): „Meine Liste" (StringListEditor) oder „Automatisch aus
   meinen Geschenk-Triggern" (vorbefüllt via `itemsFromRules`, **trotzdem editierbar**).
2. **Einstellung direkt am Rad** (das „easy intuitiv"):
   - Feld **„Bei welchem Geschenk drehen?"** — Geschenk-Picker in den Rad-Einstellungen.
     Legt/pflegt im Hintergrund die Trigger-Regel (`gift_*_is` → `spin_wheel targetId`),
     kein Gang in die Trigger-Seite nötig. Leer = kein Auto-Dreh.
   - Häkchen **„Aktion automatisch ausführen"** (Standard AUS) → „Beides per Schalter".
3. **Auto-Feuern (sicher)**: Feld trägt eine Aktion. Beim Stopp meldet das Rad über
   neuen Rückkanal `ctx.fireDrawn(drawId, action)` (analog `reportWin`) → Server führt
   die Aktion **einmal** über die Engine aus (Dedup per `drawId`). Nur im echten
   Overlay (nicht Preview/Single), damit keine Demo-/Punkte-Verfälschung.
4. **Grenzen/Qualität**: Canvas-Rad skaliert schon per `cqi`; nichts läuft aus der
   Box; Vorschau-Demo bleibt; `widget-check`/`node --check`/Tests grün.

Offene Detailfrage für die Umsetzung (im Plan klären): wie eine Feld↔Aktion-Zuordnung
gespeichert wird, wenn `source:'liste'` (Freitext-Felder ohne Aktion) — dann greift
Auto-Feuern nur bei `source:'trigger'` (Feld = echte Gift-Aktion); bei reiner Liste
bleibt es „nur anzeigen". Das ist die saubere, ehrliche Grenze.

### Stück 2 — Timer/Countdown im Geschenke-Slider
Im `gift-menu` ein optionaler Timer/Countdown, der im Widget zeigt, was gerade läuft
(z.B. „Doppelte Punkte noch 0:42"). Speist sich aus einem laufenden Effekt/Trigger.
Details eigenes Spec, wenn Stück 1 steht.

### Stück 3 — Gambling-Automat (neues Widget)
Slot-Machine: 3 Walzen, Symbole aus der Gift-/Aktions-Liste, Jackpot-Logik, per Gift
getriggert (gleiche `source`- und Auto-Feuer-Mechanik wie das Rad). Neues Widget von
Grund auf, animiert. Eigenes Spec.

### Stück 4 — Lucky-Card im Slider
Beim passenden Geschenk wird im Slider direkt eine „Glücks-Karte" gezogen und
aufgedeckt (Aktion optional auto-gefeuert). Verzahnt Slider + Zufalls-Zug. Eigenes Spec.

## Danach (eigene Runde, NICHT Teil dieser Familie)
- Trigger-Logik + UI prüfen, Verbesserungen **ohne großen Umbau**.
- Sound-Vorschau direkt im Trigger-Bereich (MyInstants-Service wiederverwenden):
  anhören + auswählen statt blinde Sound-ID.
- Node-/Flow-Canvas-Editor (Mockup „Botexe Studio Redesign"): richtige Fernrichtung,
  weil Engine schon `Ereignis→Bedingungen→Aktionen` ist (Editor = neue Ansicht).
  Große Einzel-UI → eigenes phasiges Spec (A rendern, B verbinden, C JA/SONST +
  Live-Zähler + Simulation). Bewusst zurückgestellt.

## Verifikation
Pro Stück: `lint`/`typecheck`/`test`/`widget-check` == 0, `node --check` je geänderter
Widget-`.js`, Screenshot der Box angeschaut. Kein TikTok-Gift-Bild ins Repo.
