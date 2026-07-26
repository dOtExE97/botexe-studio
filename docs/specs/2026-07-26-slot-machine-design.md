# Gambling-Automat / Slot Machine (Stück 3 der Gambling-Familie)

Datum: 2026-07-26 · Status: Design abgesegnet, in Umsetzung

## Idee (von Alex)
Ein neues Slot-Machine-Widget mit 3 Walzen. Die Symbole sind **die Geschenke/Challenges
aus der Liste**. Ein gewähltes Geschenk löst den Automaten aus, die Walzen drehen, und
**zufällig gewinnt eines deiner Geschenke** — dessen eingestelltes Ding wird ausgelöst
(z.B. „1 Min still" startet den Challenge-Countdown, Trigger-Aktionen feuern). Es gibt
einen **einstellbaren Gewinnchance-Regler** (man kann auch verlieren).

## Abgesegnete Design-Entscheidungen
1. **Walzen zeigen deine Geschenke/Challenges** (Quelle wie Geschenk-Menü/Rad: manuelle
   Liste oder automatisch aus Gift-Triggern).
2. **Ausgelöst per Geschenk** — Feld „Bei welchem Geschenk drehen?" wie beim Rad (`spinGift`).
3. **Echter Zufall, zentral am Server** (`Math.random`, wie beim Rad — gleich auf allen
   Overlay-Quellen, nicht manipuliert). Ablauf: (a) Gewinn oder Niete nach eingestellter
   **Gewinnchance** (0–100 %); (b) bei Gewinn zufällig ein Geschenk ziehen.
4. **Gewinn = 3 Gleiche** auf der Gewinnlinie; **Niete = ungleiche Symbole** (knapp daneben),
   nichts wird ausgelöst.
5. **Gewinn aktiviert das Geschenk „als wäre es gesendet worden" — aber kontrolliert und
   selbstständig** (KEIN Fake-Gift-Event → keine falschen Coins/Zähler, kein Endlos-Kreis):
   - Der Server feuert die **Trigger-Aktionen** des Gewinner-Geschenks (dieselbe Mechanik
     wie Auto-Feuern beim Rad: `orderedGiftKeys` → volle Regel → `dispatchAction`).
   - Hat das gewonnene Geschenk eine **Challenge-Dauer** (Stück-2-`secs`), zeigt und zählt
     der **Automat selbst** die Challenge runter (Kern `gift-countdown.js` wiederverwenden)
     — als Teil der Gewinn-Feier.
   - Loop-Schutz: Der Slot wird durch das ANKOMMENDE Geschenk ausgelöst; der Gewinn feuert
     nur Trigger-Aktionen + zeigt Anzeige — kein neues „Geschenk kam an", also kein Re-Trigger.

## Befund (echter Code — Wiederverwendung)
- Widget-Registrierung: neue `packages/widget-kit/slot-machine.js` (Default-Export-Klasse) +
  Eintrag in `WIDGET_TYPES` (`widget-types.ts`). Runtime lädt `/widgets/slot-machine.js` per
  Typname; `widget-overflow-check` entdeckt es automatisch über `WIDGET_TYPES`.
- Actions erreichen Widgets: Server broadcastet `{kind:'action', ruleId, action}` →
  `runtime.js dispatchAction` → `widget.onAction(action)` (Ziel per `targetId`). Vorbild:
  `spin_wheel` (`wheel.js onAction`, zentraler `roll` in `studio.ts runAction`).
- Gift→Widget-Bindung: `spinGift`-Prop + `matchingWheelLayers`/`planWheelSpins`
  (`wheel-gift.ts`) im Gift-Handler von `studio.ts` — 1:1 als Vorlage für den Slot.
- Gewinner aus Gift-Liste + Aktion feuern: `orderedGiftKeys` (`trigger-engine/gift-mapping.ts`)
  + `winnerIndex` — bereits fürs Rad-Auto-Feuern gebaut, hier wiederverwenden.
- Challenge-Countdown-Kern: `gift-countdown.js` (`stackRemaining`, `fmtTime`, …).
- Gift-Symbol-Bilder/Namen: `itemsFromRules`/`giftKey` aus `gift-rules.js`.

## Umfang (Reihenfolge)
1. **Slot-Widget** `slot-machine.js` + `WIDGET_TYPES`-Eintrag: 3 Walzen, Symbole aus der
   Gift-Liste (Quelle `liste|trigger`), `onAction({kind:'spin_slot', win, winnerIndex})` →
   Walzen drehen + landen (Gewinn = 3 Gleiche auf winnerIndex, Niete = ungleich). Editor-
   Vorschau-Demo. Reine Lande-Logik testbar. Screenshots.
2. **Server-Bindung + Zufall**: `spinGift`-Feld, `slot-gift.ts` (mirror `wheel-gift.ts`):
   passende sichtbare Slots finden; bei Gift-Event zentral würfeln — Gewinn/Niete nach
   `winChance`, bei Gewinn `winnerIndex` via `orderedGiftKeys`+`winnerIndex`; `spin_slot`
   mit Ergebnis broadcasten. `winChance`-Feld (0–100 %). `studio.ts` verdrahten. Pure
   Entscheidungs-Helfer getestet.
3. **Gewinn-Aktivierung**: Trigger-Aktionen des Gewinner-Geschenks serverseitig feuern
   (verzögert um die Dreh-Dauer, wie Rad-Auto-Feuern); + Slot zeigt/zählt die gewonnene
   Challenge (`gift-countdown.js`), falls `secs>0`. Jackpot-Feier / Niete-Optik, animiert.

## Verifikation
Pro Task: `lint`/`typecheck`/`test`/`widget-check` == 0, `node --check` je Widget-`.js`,
Screenshots angeschaut (nichts läuft aus der Box). Kein TikTok-Gift-Bild ins Repo.
