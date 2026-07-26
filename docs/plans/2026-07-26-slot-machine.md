# Gambling-Automat / Slot Machine — Umsetzungsplan (Stück 3)

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development
> oder superpowers:executing-plans, Task für Task. Checkbox-Syntax.

**Ziel:** Ein Slot-Machine-Widget: ein Geschenk löst es aus, die Walzen drehen zufällig
(mit einstellbarer Gewinnchance), bei Gewinn wird ein Geschenk aus der Liste gezogen und
dessen eingestelltes Ding (Trigger-Aktionen + evtl. Challenge-Timer) ausgelöst.

**Architektur:** Neues Widget `slot-machine.js` (+ `WIDGET_TYPES`-Eintrag). Spin kommt als
`spin_slot`-Action vom Server (zentraler `Math.random`, wie `spin_wheel`). Server-Bindung
`spinGift` spiegelt `wheel-gift.ts`. Gewinner + Aktions-Feuern nutzen `orderedGiftKeys`
(wie Rad-Auto-Feuern); gewonnene Challenge zeigt der Slot selbst via `gift-countdown.js`.
Kein Fake-Gift-Event → keine Zähler/Coin-Nebenwirkung, kein Re-Trigger-Loop.

**Tech Stack:** Vanilla-ES-Widget, TS-Server (`studio.ts`), `@botexe/trigger-engine`,
React (`widget-types.ts`), Tests unter `node:test`.

## Global Constraints
- Verifikation nur per Exit-Code: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run widget-check` — alle **0**. Nach jeder `.js`-Änderung in `packages/widget-kit/`:
  `node --check <datei>`. CSS-in-JS-Bruch zeigt sich nur in `npm test` → immer voll testen.
- Tests unter **`node:test`** (Idiom bestehender Sibling-Tests spiegeln, NICHT Vitest).
- Deutsch in Code/UI, UI-Descriptions in Erzähler-Form. Profi-Optik, animiert.
- Echter Zufall zentral am Server; Auto-Aktivierung nur echtes Overlay (nicht Preview/Single),
  einmal pro Spin, kein Doppelfeuer, kein Re-Trigger-Loop.
- Nichts läuft aus der Box; `widget-check` bleibt grün. Kein TikTok-Gift-Bild ins Repo.
- Nichts releasen ohne Freigabe.

---

### Task 1: Slot-Widget `slot-machine.js` + Registrierung + Walzen + `spin_slot`

**Files:**
- Create: `packages/widget-kit/slot-machine.js`
- Create: `packages/widget-kit/slot-machine.test.ts`
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (`WIDGET_TYPES`-Eintrag)

**Interfaces:**
- Consumes: `itemsFromRules`/`giftKey` aus `./gift-rules.js` (Symbole aus Gift-Liste, wie
  `wheel.js` `loadRules`), `ctx.baseUrl`/`ctx.token`/`ctx.preview`.
- Produces: reiner Helfer `slotReels(win, winnerIndex, n, roll)` → `[i,i,i]` (Gewinn) bzw.
  drei nicht-gleiche Indizes (Niete). Widget-`onAction({kind:'spin_slot', win, winnerIndex, roll})`.

- [ ] **Schritt 1: Failing test — Lande-Logik der Walzen (rein)**

```ts
import { slotReels } from './slot-machine.js';
test('slotReels: Gewinn = 3 Gleiche auf winnerIndex', () => {
  expect(slotReels(true, 2, 5, 0.4)).toEqual([2, 2, 2]);
});
test('slotReels: Niete = nicht drei gleiche', () => {
  const r = slotReels(false, 0, 5, 0.4);
  expect(r).toHaveLength(3);
  expect(new Set(r).size).toBeGreaterThan(1); // nie 3 identisch
});
test('slotReels: n<=1 degeneriert sauber (kein Absturz)', () => {
  expect(slotReels(true, 0, 1, 0).every((x) => x === 0)).toBe(true);
});
```

- [ ] **Schritt 2: Test rot** (node:test-Idiom) → FAIL.

- [ ] **Schritt 3: `slotReels` implementieren**

```js
// packages/widget-kit/slot-machine.js — reiner Helfer + Widget-Klasse.
export function slotReels(win, winnerIndex, n, roll) {
  if (n <= 0) return [0, 0, 0];
  const w = ((Math.round(winnerIndex) % n) + n) % n;
  if (win || n === 1) return [w, w, w];
  // Niete: drei Indizes, garantiert nicht alle gleich. roll streut die Optik.
  const a = Math.floor(Math.min(0.999999, Math.max(0, roll)) * n);
  const b = (a + 1) % n;
  const c = (a + 2) % n; // bei n>=2 ist [a,b,..] nie 3-gleich (a!=b)
  return [a, b, n > 2 ? c : a === 0 ? 1 : 0];
}
```
(Kommentar: bei n===2 sind [a,b] verschieden → nie 3-gleich; der 3. Wert egal, nur nicht so,
dass alle gleich werden. Testfall oben deckt das ab — ggf. Formel an den Test anpassen.)

- [ ] **Schritt 4: Test grün** → PASS. `node --check packages/widget-kit/slot-machine.js` → 0.

- [ ] **Schritt 5: Widget-Klasse (Walzen, Quelle, onAction, Optik)**

`slot-machine.js` Default-Export-Klasse `SlotMachine(root, props, ctx)` — Muster aus
`wheel.js`/`gift-menu.js`:
- Quelle: `this.source = props.source === 'trigger' ? 'trigger' : 'liste'`; bei `trigger`
  (und `ctx.baseUrl && !ctx.preview`) `loadRules()` wie `wheel.js` (fetch `/trigger-rules`
  → `itemsFromRules` → `this.items`), sonst aus `props.items` (Format `slug::text` via
  `parseItems`? — für Stück 3 reicht die trigger-Quelle + eine simple Liste; die Symbole
  brauchen Icon (giftKey→Bild wie gift-menu) + Kurzlabel).
- DOM: 3 Walzen (`.bx-sm-reel`) mit vertikal scrollenden Symbolen; ein Rahmen/Gehäuse,
  Gewinnlinie, Hebel/LED-Optik. CSS mit `cqi/cqh`-Einheiten (skaliert, läuft nicht raus),
  `@keyframes` fürs Walzen-Drehen.
- `onAction(action)`: `if (action.kind !== 'spin_slot' || this.spinning) return;` — dann
  `const [r0,r1,r2] = slotReels(!!action.win, action.winnerIndex ?? 0, this.items.length, action.roll ?? 0);`
  Walzen animiert auf r0/r1/r2 auslaufen lassen; bei Gewinn Jackpot-Feier, bei Niete „knapp
  daneben". (Gewinn-Aktivierung/Countdown kommt in Task 3 — hier nur Optik.)
- Editor-Vorschau (`ctx.preview`): periodisch Demo-Spins (mal Gewinn, mal Niete), damit man
  die Optik beurteilen kann (analog `wheel.js` Demo).
- `destroy()`: Timer/Frames aufräumen (Muster wie andere Widgets).

- [ ] **Schritt 6: `WIDGET_TYPES`-Eintrag (`widget-types.ts`)**

Neuer Eintrag (Muster wie `wheel`/`gift-menu`):
```ts
{ type: 'slot-machine', label: 'Gambling-Automat', desc: 'Spielautomat: ein Geschenk lässt die Walzen drehen — mit einstellbarer Gewinnchance wird zufällig eins deiner Geschenke gezogen und ausgelöst.',
  w: 640, h: 480, props: { source: 'trigger', items: '', style: 'neon', accent: '#ff5e8a' },
  fields: [
    { key: 'source', label: 'Woher kommen die Symbole', type: 'select', options: [
      { value: 'trigger', label: 'Automatisch aus meinen Geschenk-Triggern' },
      { value: 'liste', label: 'Meine Liste unten' },
    ], hint: 'Die Walzen zeigen deine Geschenke/Challenges.' },
    // items (gift-command-list) nur bei source==='liste' (showIf), ACCENT_FIELD, styleField(...)
  ] },
```
(spinGift + winChance kommen in Task 2, Gewinn-Optik-Feinschliff in Task 3. Prüfen, welche
`NO_*`-Sets/`FULLBLEED_FX` etc. den neuen Typ betreffen — analog zum Rad eintragen wo nötig.)

- [ ] **Schritt 7: Sicht-Prüfung + Checks + Commit**

Screenshot (headless, `--enable-unsafe-swiftshader`, echte setTimeout-Waits) eines Demo-Spins
in mehreren Zuständen ansehen: Walzen sichtbar, nichts läuft aus der Box.
Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
```bash
git add packages/widget-kit/slot-machine.js packages/widget-kit/slot-machine.test.ts apps/desktop/src/renderer/pages/widget-types.ts
git commit -m "feat(slot-machine): neues Widget — 3 Walzen aus Gift-Liste, spin_slot-Action, Optik"
```

---

### Task 2: Server-Bindung (Geschenk → Spin) + Zufall/Gewinnchance

**Files:**
- Create: `apps/desktop/src/main/services/slot-gift.ts`
- Create: `apps/desktop/src/main/services/slot-gift.test.ts`
- Modify: `apps/desktop/src/main/services/studio.ts` (Gift-Handler)
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (`spinGift` + `winChance` Felder)

**Interfaces:**
- Consumes: Gift-Event `e.gift.slug`, `this.layouts.list()` (sichtbare Layer, wie
  `matchingWheelLayers`), `orderedGiftKeys(this.getRules())` + `winnerIndex` (aus Rad),
  `this.dispatchAction`. `spin_slot`-Action-Typ zur `TriggerActionKind`-Union in
  `trigger-engine/src/index.ts` hinzufügen: `{ kind:'spin_slot'; targetId; win?; winnerIndex?; roll? }`.
- Produces: `matchingSlotLayers(layers, giftSlug)` + reiner `planSlotOutcome(rollWin, rollPick, winChance, n)` → `{ win, winnerIndex }`.

- [ ] **Schritt 1: Failing test — Gewinn/Niete + Gewinner nach Chance (rein, RNG injiziert)**

```ts
import { planSlotOutcome } from './slot-gift';
test('planSlotOutcome: rollWin < winChance ⇒ Gewinn, winnerIndex aus rollPick', () => {
  expect(planSlotOutcome(0.2, 0.5, 0.6, 4)).toEqual({ win: true, winnerIndex: 2 });   // 0.5*4=2
  expect(planSlotOutcome(0.8, 0.5, 0.6, 4)).toEqual({ win: false, winnerIndex: 2 });  // Niete
  expect(planSlotOutcome(0.0, 0.99, 1.0, 3)).toEqual({ win: true, winnerIndex: 2 });  // 100%
  expect(planSlotOutcome(0.0, 0.0, 0.0, 3)).toEqual({ win: false, winnerIndex: 0 });  // 0%
});
```

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: Helfer implementieren**

```ts
// apps/desktop/src/main/services/slot-gift.ts
import { winnerIndex } from './wheel-autofire'; // vorhandene Formel wiederverwenden (Rad)
type SlotLayer = { id: string; widgetType: string; visible: boolean; props?: Record<string, unknown> };
export function matchingSlotLayers(layers: SlotLayer[], giftSlug: string): SlotLayer[] {
  const slug = String(giftSlug || '');
  if (!slug) return [];
  return layers.filter((l) => l.widgetType === 'slot-machine' && l.visible && String(l.props?.spinGift || '') === slug);
}
export function planSlotOutcome(rollWin: number, rollPick: number, winChance: number, n: number): { win: boolean; winnerIndex: number } {
  const win = n > 0 && rollWin < Math.max(0, Math.min(1, winChance));
  return { win, winnerIndex: winnerIndex(rollPick, n) };
}
```
(Falls `winnerIndex` nicht aus `wheel-autofire` exportiert ist, dort exportieren/prüfen.)

- [ ] **Schritt 4: Test grün** → PASS.

- [ ] **Schritt 5: `studio.ts` verdrahten (Gift-Handler, neben dem Rad-Zweig)**

Im `if (e.type === 'gift' && e.gift)`-Block: für jeden `matchingSlotLayers(activeLayers, e.gift.slug)`:
- `n` = Anzahl Gift-Symbole (aus `orderedGiftKeys(this.getRules())` bei `source==='trigger'`;
  gleiche Ordnung wie das Widget → gleicher Index),
- `{ win, winnerIndex } = planSlotOutcome(Math.random(), Math.random(), (layer.props.winChance ?? 60)/100, n)`,
- `this.dispatchAction('slot-gift', { kind:'spin_slot', targetId: layer.id, win, winnerIndex, roll: Math.random() }, e);`
(Task 3 hängt die Gewinn-Aktivierung hier dran — hier erstmal nur der Spin mit Ergebnis.)

- [ ] **Schritt 6: Felder `spinGift` + `winChance`**

`widget-types.ts` slot-machine: Default `spinGift: ''`, `winChance: 60`. Felder:
```ts
{ key: 'spinGift', label: 'Bei welchem Geschenk drehen?', type: 'gift', hint: 'Schickt das jemand, drehen die Walzen. Leer = nur manuell.' },
{ key: 'winChance', label: 'Gewinnchance (%)', type: 'number', hint: '0 = nie ein Gewinn, 100 = immer. Bestimmt, wie oft 3 Gleiche fallen.' },
```

- [ ] **Schritt 7: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
```bash
git add apps/desktop/src/main/services/slot-gift.ts apps/desktop/src/main/services/slot-gift.test.ts apps/desktop/src/main/services/studio.ts apps/desktop/src/renderer/pages/widget-types.ts packages/trigger-engine/src/index.ts
git commit -m "feat(slot-machine): Geschenk dreht Automat, zentraler Zufall + Gewinnchance"
```

---

### Task 3: Gewinn-Aktivierung (Trigger-Aktion feuern + Challenge-Countdown am Slot)

**Files:**
- Modify: `apps/desktop/src/main/services/studio.ts` (bei Gewinn Aktion feuern)
- Modify: `packages/widget-kit/slot-machine.js` (Gewinn zeigt/zählt Challenge + Jackpot-Optik)

**Interfaces:**
- Consumes: `orderedGiftKeys(this.getRules())` + Gewinner-`winnerIndex` → volle Regel →
  `dispatchAction` (wie Rad-Auto-Feuern, Task 3 dort); `gift-countdown.js`
  (`stackRemaining`/`fmtTime`) für den Challenge-Countdown am Slot; die Gewinner-Item-Dauer
  (`secs`) aus der Gift-Liste.
- Produces: keine — Endpunkt.

- [ ] **Schritt 1: Server — bei Gewinn die Aktion des Gewinner-Geschenks feuern**

In Task-2-Schleife: wenn `win`, `keys = orderedGiftKeys(this.getRules())`, Regel
`keys[winnerIndex].ruleId` finden, deren Aktionen **verzögert um die Slot-Dreh-Dauer**
(`layer.props.spinMs ?? 4000`) dispatchen — identisches Muster zu Rad-Task-3
(`{ ...act, delayMs: (act.delayMs ?? 0) + spinMs }`). Nur echtes Overlay, genau einmal.
Test (Fake-Studio): gift-Regel `galaxy→play_sound`, sichtbarer Slot `winChance:100,
spinGift:'galaxy'`, `Math.random` gestubbt → genau ein `play_sound` mit `delayMs>=spinMs`;
`winChance:0` → kein `play_sound`.

- [ ] **Schritt 2: Widget — Gewinn zeigt die Challenge + Countdown**

`slot-machine.js`: nach dem Auslaufen bei Gewinn das Gewinner-Item hervorheben und, wenn
`item.secs>0`, mit `gift-countdown.js` einen Countdown am Slot anzeigen (klein wiederverwenden;
Optik/Prominenz wie in Stück 2, hier im Automaten-Kontext). Jackpot-Feier-Animation bei
Gewinn, „knapp daneben" bei Niete. `spin_slot` liefert `win`/`winnerIndex`; das Item kennt
der Slot aus seiner Liste. `node --check` nach Änderung.

- [ ] **Schritt 3: Sicht-Prüfung**

Screenshots: Gewinn (3 Gleiche + Feier + evtl. Countdown) und Niete, in realistischer Größe,
nichts läuft aus der Box.

- [ ] **Schritt 4: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
`node --check packages/widget-kit/slot-machine.js` → 0.
```bash
git add apps/desktop/src/main/services/studio.ts packages/widget-kit/slot-machine.js
git commit -m "feat(slot-machine): Gewinn feuert Geschenk-Aktion + zeigt Challenge-Countdown"
```

---

## Self-Review (gegen das Spec)
- **Neues Slot-Widget, Symbole aus Gift-Liste:** Task 1. ✓
- **Per Geschenk ausgelöst (`spinGift`):** Task 2. ✓
- **Echter zentraler Zufall + Gewinnchance-Regler:** Task 2 (`planSlotOutcome`, `Math.random` im Server). ✓
- **Gewinn = 3 Gleiche / Niete = ungleich:** Task 1 (`slotReels`). ✓
- **Gewinn aktiviert Geschenk (Trigger-Aktion + Challenge-Countdown), kontrolliert, kein Loop:** Task 3. ✓
- **Offen zur Umsetzung:** Index-Parität Slot-Symbole ↔ `orderedGiftKeys` (gleiche `itemsFromRules`-
  Quelle nutzen wie das Widget, wie beim Rad gelöst); genaue Slot-Optik/Animation beim Bauen festlegen;
  ob `source==='liste'` eine eigene Symbol-Liste braucht (sonst nur `trigger`-Quelle + Hinweis).
