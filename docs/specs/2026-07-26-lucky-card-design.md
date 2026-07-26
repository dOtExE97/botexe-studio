# Lucky-Card / Karten-Ziehung im Geschenke-Slider (Stück 4 der Gambling-Familie)

Datum: 2026-07-26 · Status: Design abgesegnet, in Umsetzung

## Idee (von Alex)
Im Geschenke-Slider (`gift-menu`) selbst läuft eine coole animierte **Karten-Ziehung**:
der Slider mischt/blinkt durch seine Karten und landet zufällig auf einer — die dann
ausgelöst wird. Cool animiert mit Effekten.

## Abgesegnete Design-Entscheidungen
1. **Neuer Modus im Slider**, kein neues Widget.
2. **Auslöser: BEIDES** — ein gewähltes Geschenk (`luckyGift`) UND ein Chat-Befehl
   (`luckyCommand`, z.B. `!lucky`). Beide als Widget-Prop, serverseitig ausgewertet
   (kein Regel-Editieren nötig).
3. **Mit Gewinnchance** (`luckyChance` 0–100 %), echter zentraler Zufall (`Math.random`
   am Server, wie Rad/Automat): Gewinn → landet auf zufälliger Karte + löst sie aus;
   Niete → landet auf „nix", nichts wird ausgelöst.
4. **Aktivierung IM Slider** (kein Cross-Widget-Signal): bei Gewinn `celebrate(winnerIndex)`
   im selben Widget → startet die Challenge des Geschenks (Stück 2). Zusätzlich feuert der
   Server (nur bei `source==='trigger'`, parity-sicher) die Trigger-Aktion des Gewinner-
   Geschenks (wie Automat).
5. **Optik:** animierter Karten-Shuffle (rasch `show(zufällig)` → Auslauf auf winnerIndex),
   Glow/Partikel, Gewinn-Feier vs. „daneben". Nichts läuft aus der Box, Profi-Niveau.

## Befund (echter Code — Wiederverwendung)
- `gift-menu.js`: `show(i)` schaltet in der Rotation auf Karte i (Basis der Shuffle-Optik);
  `celebrate(i, who)` hebt hervor + startet Challenge (`secs>0`); `onAction` existiert schon
  (Stück 3: `start_gift_challenge`) → um `lucky_draw` erweitern. `matchIndex`, `this.list`.
- Zufall/Gewinnchance: `slot-gift.ts` `planSlotOutcome(rollWin, rollPick, winChance, n)` +
  zentraler `Math.random` — 1:1 als Vorlage. Aktions-Feuern: `orderedGiftKeys` (Automat/Rad).
- Symbol-/Karten-Quelle: `source` (`liste`→`parseItems(props.items)` · `trigger`→
  `itemsFromRules(rules).filter(it=>it.text)` = `orderedGiftKeys`). `n` für winnerIndex:
  bei `trigger` = `orderedGiftKeys.length`, bei `liste` = `parseItems(props.items).length`
  (Server kennt beide über die Layer-Props) → winnerIndex passt zur sichtbaren Kartenzahl.
- Chat: `studio.ts` verarbeitet Chat-Events (`maybeRunCommand`); die Lucky-Command-Prüfung
  kommt daneben (einfacher Textabgleich gegen `luckyCommand`, führendes `!` egal).
- Neue Action-Kind `lucky_draw { targetId; win?; winnerIndex?; roll? }` in
  `trigger-engine/src/index.ts`.

## Umfang (Reihenfolge)
1. **Widget:** `lucky_draw` in `gift-menu.onAction` → Shuffle-Animation (`show` rasch
   zufällig, dann Auslauf auf `winnerIndex`), bei Gewinn `celebrate(winnerIndex)`; Niete
   → „daneben"-Optik, keine Aktivierung. Effekte/Animation. Reine Lande-/Timing-Logik testbar.
2. **Server-Bindung (Geschenk) + Zufall:** `lucky-draw.ts` (mirror `slot-gift.ts`): passende
   sichtbare `gift-menu`-Layer mit `luckyGift===slug`; `n` je Quelle bestimmen; zentral
   würfeln (`planSlotOutcome` wiederverwenden); `lucky_draw` dispatchen; bei Gewinn +
   `source==='trigger'` die Aktion via `orderedGiftKeys` feuern (verzögert um Draw-Dauer).
   Felder `luckyMode`/`luckyGift`/`luckyChance`. `studio.ts` im Gift-Handler.
3. **Chat-Befehl-Auslöser:** Feld `luckyCommand`; im Chat-Handler von `studio.ts` Text gegen
   `luckyCommand` sichtbarer Slider prüfen → gleiche Ziehung auslösen (Cooldown sinnvoll).

## Verifikation
Pro Task: `lint`/`typecheck`/`test`/`widget-check` == 0, `node --check` je Widget-`.js`,
Screenshots angeschaut (nichts läuft aus der Box). Kein TikTok-Gift-Bild ins Repo.
