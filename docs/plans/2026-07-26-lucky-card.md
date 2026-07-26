# Lucky-Card / Karten-Ziehung im Slider — Umsetzungsplan (Stück 4)

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development
> oder superpowers:executing-plans, Task für Task. Checkbox-Syntax.

**Ziel:** Ein neuer Modus im Geschenke-Slider: eine animierte Karten-Ziehung (per Geschenk
ODER Chat-Befehl), die mit einstellbarer Gewinnchance zufällig eine Karte zieht und auslöst.

**Architektur:** Kein neues Widget. `gift-menu` bekommt eine `lucky_draw`-Action (Shuffle
→ landet auf `winnerIndex`; bei Gewinn `celebrate(winnerIndex)` = Challenge startet lokal).
Server entscheidet zentral (`Math.random`, `planSlotOutcome` vom Automaten) Gewinn/Niete +
Gewinner; bei Gewinn & `source==='trigger'` feuert er zusätzlich die Trigger-Aktion
(`orderedGiftKeys`). Ausgelöst per `luckyGift` (Gift) oder `luckyCommand` (Chat).

**Tech Stack:** Vanilla-ES-Widget (`gift-menu.js`), TS-Server (`studio.ts`,
`apps/desktop/src/main/services/lucky-draw.ts`), `@botexe/trigger-engine`, `widget-types.ts`,
Tests unter `node:test`.

## Global Constraints
- Verifikation nur per Exit-Code: `lint`/`typecheck`/`test`/`widget-check` == 0. Nach
  `.js`-Änderung in `packages/widget-kit/`: `node --check`. CSS-Bruch zeigt sich nur in `npm test`.
- Tests unter `node:test` (Sibling-Idiom, NICHT Vitest). Deutsch in Code/UI.
- Rückwärtskompatibel: ohne `luckyMode`/`luckyGift`/`luckyCommand` ändert sich am Slider nichts.
- Echter zentraler Zufall; Auslösung nur echtes Overlay; genau einmal pro Trigger; kein Loop
  (`lucky_draw`/`start_gift_challenge` sind Display-Actions, keine Gift-Events).
- Nichts läuft aus der Box; `widget-check` bleibt grün. Kein TikTok-Gift-Bild ins Repo.
- Nichts releasen ohne Freigabe.

---

### Task 1: Widget — `lucky_draw`-Action + Shuffle-Animation + Auslösen

**Files:**
- Modify: `packages/widget-kit/gift-menu.js` (`onAction` um `lucky_draw` erweitern, Shuffle + CSS)
- Modify: `packages/trigger-engine/src/index.ts` (`lucky_draw` zur `TriggerActionKind`-Union)
- Test: `packages/widget-kit/gift-menu.test.ts` (reine Timing-/Lande-Logik)

**Interfaces:**
- Consumes: bestehendes `gift-menu.onAction` (behandelt schon `start_gift_challenge`),
  `show(i)`, `celebrate(i, who)`, `this.list`, `this.cards`.
- Produces: reiner Helfer `shuffleSchedule(steps, totalMs)` → Array wachsender Zeitpunkte
  (schnell→langsam, „ease-out"), damit die Shuffle-Frequenz testbar ist. Action
  `lucky_draw { win, winnerIndex, roll }`.

- [ ] **Schritt 1: Failing test — Shuffle-Fahrplan (rein)**

```ts
import { shuffleSchedule } from './gift-menu.js';
test('shuffleSchedule: aufsteigende Zeitpunkte, letzter ~= totalMs, ease-out', () => {
  const s = shuffleSchedule(10, 2000);
  expect(s).toHaveLength(10);
  for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);      // monoton
  expect(s[s.length - 1]).toBeLessThanOrEqual(2000);
  expect(s[1] - s[0]).toBeLessThan(s[s.length - 1] - s[s.length - 2]);             // wird langsamer
});
```

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: `shuffleSchedule` implementieren + exportieren**

```js
// gift-menu.js — reiner Helfer (ease-out: Schritte werden zum Ende langsamer).
export function shuffleSchedule(steps, totalMs) {
  const out = [];
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    out.push(Math.round((1 - Math.pow(1 - t, 2)) * totalMs)); // ease-out quad
  }
  return out;
}
```

- [ ] **Schritt 4: Test grün** → PASS. `node --check packages/widget-kit/gift-menu.js` → 0.

- [ ] **Schritt 5: `lucky_draw` im `onAction` verdrahten (Shuffle + Auslösen)**

Im bestehenden `onAction(action)` (neben `start_gift_challenge`):
```js
if (action.kind === 'lucky_draw') { this.runLuckyDraw(action); return; }
```
`runLuckyDraw(action)`: `if (this.luckyRunning) return;` — dann `n = this.cards?.length || this.list.length`;
mit `shuffleSchedule(~16, this.luckyDrawMs ?? 3000)` per `setTimeout` (in `this.timers`)
nacheinander `show(zufälliger Index)` schalten (Shuffle-Optik, `.bx-gm-lucky`-Klasse für
Glow/Blur-Effekt). Am letzten Zeitpunkt auf `action.winnerIndex` schalten. Danach:
- **Gewinn** (`action.win`): `celebrate(action.winnerIndex, action.who)` (hebt hervor +
  startet Challenge bei `secs>0`) + Gewinn-Feier (Partikel/Glow).
- **Niete**: kurze „daneben"-Optik, KEIN `celebrate`.
Rotation ist der Hauptfall (`show`); im Laufband einen Highlight-Lauf über die Chips (die
`data-idx`-Chips durchblinken, dann `winnerIndex` markieren). `destroy()`/`build()` müssen
`luckyRunning` + Timer aufräumen (bestehendes `this.timers`-Muster).

- [ ] **Schritt 6: CSS (Shuffle-Glow, Gewinn-Feier)**

`@keyframes` + `.bx-gm-lucky`/`.bx-gm-lucky-win`-Klassen, `cqi/cqh`-Einheiten, nichts läuft raus.

- [ ] **Schritt 7: Sicht-Prüfung + Checks + Commit**

Screenshot (headless, `--enable-unsafe-swiftshader`, echte setTimeout-Waits) eines
Draw-Endzustands (Gewinn: Karte hervorgehoben + Feier). Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
```bash
git add packages/widget-kit/gift-menu.js packages/widget-kit/gift-menu.test.ts packages/trigger-engine/src/index.ts
git commit -m "feat(gift-menu): Lucky-Draw — Karten-Shuffle-Animation + Auslösen der gezogenen Karte"
```

---

### Task 2: Server-Bindung (Geschenk) + Zufall/Gewinnchance

**Files:**
- Create: `apps/desktop/src/main/services/lucky-draw.ts`
- Create: `apps/desktop/src/main/services/lucky-draw.test.ts`
- Modify: `apps/desktop/src/main/services/studio.ts` (Gift-Handler)
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (`luckyMode`/`luckyGift`/`luckyChance`)

**Interfaces:**
- Consumes: `planSlotOutcome` (`slot-gift.ts` — exportiert; wiederverwenden), `orderedGiftKeys`
  (`gift-mapping.ts`), `this.dispatchAction`, `this.getRules()`, `this.layouts.list()`.
- Produces: `matchingLuckyLayers(layers, giftSlug)` (gift-menu, `visible`, `luckyMode` an,
  `luckyGift===slug`) + `planLuckyDraws(...)` (mirror `planSlotSpins`) → `lucky_draw`-Dispatch
  (+ bei Gewinn & `source==='trigger'` Aktions-Feuern). `luckyCardCount(layer, rules)` →
  `n` (trigger: `orderedGiftKeys(rules).length`; liste: Items aus `props.items` zählen mit
  DEMSELBEN Filter wie `parseItems` — `split('|')`, trim, `filter(slug||text)`; als kleinen
  reinen Helfer, Kommentar „muss zu parseItems passen").

- [ ] **Schritt 1: Failing tests** — `matchingLuckyLayers` (nur gift-menu/visible/luckyMode/
  luckyGift-Match), `luckyCardCount` (trigger vs liste), `planLuckyDraws` (Gewinn dispatcht
  `lucky_draw` + Aktion; Niete nur `lucky_draw`; nicht-matching Layer ignoriert). Werte wie
  bei `slot-gift.test.ts`. `node:test`-Idiom.

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: `lucky-draw.ts` implementieren** (mirror `slot-gift.ts` `planSlotSpins`:
  je Layer `n=luckyCardCount(...)`, `{win,winnerIndex}=planSlotOutcome(Math.random(),Math.random(),chance,n)`,
  `dispatchAction('lucky-draw',{kind:'lucky_draw',targetId,win,winnerIndex,roll:Math.random()},e)`;
  bei `win && layer.props.source==='trigger'`: Regel `orderedGiftKeys(rules)[winnerIndex].ruleId`
  finden, Aktionen `delayMs += luckyDrawMs` dispatchen. Chance = `Number(props.luckyChance ?? 60)/100`,
  `luckyDrawMs = Number(props.luckyDrawMs ?? 3000)`. `Math.random` bleibt im Server, injiziert.)

- [ ] **Schritt 4: Test grün** → PASS.

- [ ] **Schritt 5: `studio.ts` Gift-Handler** — neben Rad/Automat: `planLuckyDraws(activeLayers,
  this.getRules(), e, () => Math.random())` und die zurückgegebenen Dispatches ausführen.

- [ ] **Schritt 6: Felder** — `widget-types.ts` gift-menu: Default `luckyMode:false`,
  `luckyGift:''`, `luckyChance:60`, `luckyDrawMs` optional. Felder:
  `luckyMode` (boolean „Lucky-Draw aktivieren"), und per `showIf: p=>p.luckyMode`:
  `luckyGift` (type `'gift'`), `luckyChance` (number, Hinweis 0–100). Deutsche Erzähler-Hinweise.

- [ ] **Schritt 7: Checks + Commit**

Run alle Checks → 0.
```bash
git add apps/desktop/src/main/services/lucky-draw.ts apps/desktop/src/main/services/lucky-draw.test.ts apps/desktop/src/main/services/studio.ts apps/desktop/src/renderer/pages/widget-types.ts
git commit -m "feat(gift-menu): Geschenk löst Lucky-Draw aus, zentraler Zufall + Gewinnchance"
```

---

### Task 3: Chat-Befehl als zweiter Auslöser

**Files:**
- Modify: `apps/desktop/src/main/services/studio.ts` (Chat-Handler)
- Modify: `apps/desktop/src/main/services/lucky-draw.ts` (Command-Match-Helfer)
- Test: `apps/desktop/src/main/services/lucky-draw.test.ts`
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (`luckyCommand`-Feld)

**Interfaces:**
- Consumes: Chat-Event (`e.type==='chat'`, `e.text`), `matchingLuckyLayers`-artige Auswahl
  aber per Command statt Slug.
- Produces: `matchLuckyCommand(layers, text)` → Layer, deren `luckyCommand` auf den Text passt
  (führendes `!` egal, case-insensitiv, ganzes Wort — Muster wie `commandMatches`/`matchChatCommand`).

- [ ] **Schritt 1: Failing test** — `matchLuckyCommand`: „!lucky" matcht `luckyCommand:'lucky'`
  und `'!lucky'`; „!luck" / leerer Command / anderer Text matcht nicht; nur `luckyMode`-an & visible.

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: `matchLuckyCommand` implementieren** (Textabgleich wie `matchChatCommand`,
  siehe `trigger-engine`), dann in `studio.ts` Chat-Handler: passende Layer → dieselbe Ziehung
  dispatchen wie Task 2 (gemeinsame Dispatch-Funktion nutzen, damit Gift- und Command-Weg
  identisch ziehen). Sinnvoller Cooldown pro Layer (z.B. `luckyDrawMs`), damit Spam nicht
  mehrere Ziehungen überlagert.

- [ ] **Schritt 4: Test grün** → PASS.

- [ ] **Schritt 5: Feld `luckyCommand`** — `widget-types.ts` gift-menu (per `showIf: p=>p.luckyMode`):
  `{ key:'luckyCommand', label:'Chat-Befehl (optional)', type:'text', hint:'z.B. !lucky — schreibt das jemand, läuft die Ziehung. Leer = nur per Geschenk.' }`. Default `luckyCommand:''`.

- [ ] **Schritt 6: Checks + Commit**

Run alle Checks → 0.
```bash
git add apps/desktop/src/main/services/studio.ts apps/desktop/src/main/services/lucky-draw.ts apps/desktop/src/main/services/lucky-draw.test.ts apps/desktop/src/renderer/pages/widget-types.ts
git commit -m "feat(gift-menu): Lucky-Draw auch per Chat-Befehl auslösbar"
```

---

## Self-Review (gegen das Spec)
- **Karten-Ziehung im Slider, animiert:** Task 1 (`lucky_draw`, Shuffle, celebrate). ✓
- **Auslöser Geschenk:** Task 2 (`luckyGift`). **Auslöser Chat-Befehl:** Task 3 (`luckyCommand`). ✓
- **Gewinnchance + echter Zufall:** Task 2 (`planSlotOutcome`, `Math.random` im Server). ✓
- **Gewinn löst Karte aus (Challenge + Aktion), Niete nicht:** Task 1 (celebrate) + Task 2 (Aktion, trigger). ✓
- **Kein Loop, rückwärtskompatibel:** Display-Actions; ohne `luckyMode` keine Änderung. ✓
- **Offen zur Umsetzung:** genaue Shuffle-/Laufband-Optik beim Bauen; `luckyCardCount`-liste-Filter
  muss zu `parseItems` passen (sonst Index-Drift bei liste-Quelle — Kommentar/Lockstep); ob
  `luckyDrawMs` ein eigenes Feld braucht oder Fixwert reicht.
