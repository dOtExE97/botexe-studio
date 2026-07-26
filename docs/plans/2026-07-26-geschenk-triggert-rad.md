# Geschenk triggert Glücksrad — Umsetzungsplan (Stück 1 der Gambling-Familie)

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development
> oder superpowers:executing-plans, Task für Task. Schritte nutzen Checkbox-Syntax.

**Ziel:** Ein gewähltes Geschenk lässt das Glücksrad drehen und lost aus den
Geschenk-Triggern eins aus; optional feuert die zugehörige Aktion automatisch.

**Architektur:** Kein Engine-Umbau — das Rad dreht über die bestehende `spin_wheel`-
Action, der `roll` wird schon zentral am Server gewürfelt. Wir (1) geben dem Rad eine
Quelle `liste|trigger` (Segmente aus den Gift-Triggern via `itemsFromRules`), (2) legen
per Gift-Picker + Button eine Trigger-Regel `gift → spin_wheel(dieses Rad)` an, (3)
feuern bei aktivem Häkchen die Aktion des gezogenen Feldes **serverseitig** beim Roll
(zeitversetzt um `spinMs`), weil der Server den Gewinner deterministisch kennt.

**Tech Stack:** Vanilla-ES-Widget (`wheel.js`), TS-Engine (`@botexe/trigger-engine`),
TS-Server (`studio.ts`, `overlay-server.ts`), React-Renderer (`OverlayPage.tsx`,
`widget-types.ts`), Vitest.

## Global Constraints
- Verifikation nur per Exit-Code: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run widget-check` — alle **0**. Nach jeder `.js`-Änderung in `packages/widget-kit/`:
  `node --check <datei>`.
- Sprache im Code/UI: Deutsch. UI-Descriptions in Erzähler-Form.
- Kein TikTok-Gift-Bild ins Repo (`find . -name "*.webp"` bleibt 0).
- Auto-Feuern NUR im echten Overlay (nicht Preview/Single), einmalig (kein Doppelfeuer).
- Nichts läuft aus der Widget-Box; `widget-check` bleibt grün.
- Nichts releasen ohne ausdrückliche Freigabe.

---

### Task 1: Rad-Quelle `liste | trigger` — Segmente aus Geschenk-Triggern

**Files:**
- Modify: `packages/widget-kit/wheel.js` (Konstruktor + neue `loadRules()`)
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (wheel-Felder + Default-Props)
- Test: `packages/widget-kit/wheel.test.ts` (neu oder erweitern)

**Interfaces:**
- Consumes: `itemsFromRules(rules)` aus `gift-menu.js` (exportiert dort bereits) →
  `Array<{slug:string, giftId:number, text:string}>`. Fetch-Route
  `${ctx.baseUrl}/trigger-rules?token=${ctx.token}` (Muster: `gift-menu.js` `loadRules()`).
- Produces: `wheel` liest bei `props.source==='trigger'` die Segmente aus den Regeln;
  `this.segmentRules: Array<{slug,giftId,text}>` (Index = Segment-Index) für Task 3.

- [ ] **Schritt 1: Failing test — Segment-Texte aus Regeln ableiten**

`itemsFromRules` liefert die Grundlage; teste, dass die Rad-Segmente daraus die
`text`-Felder werden. Neuen reinen Helper `segmentsFromRules(rules)` in `wheel.js`
exportieren, damit testbar ohne DOM.

```ts
// packages/widget-kit/wheel.test.ts
import { segmentsFromRules } from './wheel.js';
test('segmentsFromRules nimmt die Trigger-Texte als Radfelder', () => {
  const rules = [
    { enabled: true, event: 'gift', name: 'Songwunsch',
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [] },
    { enabled: true, event: 'gift', name: 'Konfetti',
      conditions: [{ kind: 'gift_slug_is', value: 'rose' }], actions: [] },
  ];
  expect(segmentsFromRules(rules)).toEqual(['Songwunsch', 'Konfetti']);
});
```

- [ ] **Schritt 2: Test rot laufen lassen**

Run: `npx vitest run packages/widget-kit/wheel.test.ts`
Erwartet: FAIL („segmentsFromRules is not a function").

- [ ] **Schritt 3: Helper implementieren (auf `itemsFromRules` aufsetzen)**

```js
// wheel.js — oben importieren:
import { itemsFromRules } from './gift-menu.js';
// exportierter Helper:
export function segmentsFromRules(rules) {
  return itemsFromRules(rules).map((it) => it.text).filter(Boolean);
}
```

- [ ] **Schritt 4: Test grün**

Run: `npx vitest run packages/widget-kit/wheel.test.ts` → PASS.
Dann: `node --check packages/widget-kit/wheel.js` → Exit 0.

- [ ] **Schritt 5: `loadRules()` im Widget verdrahten**

Im Konstruktor nach dem Setzen von `this.segments` (aus `props.segments`):

```js
// wheel.js Konstruktor, am Ende:
this.source = props.source === 'trigger' ? 'trigger' : 'liste';
this.segmentRules = [];
if (this.source === 'trigger' && ctx && ctx.baseUrl && !ctx.preview) void this.loadRules();
```

Neue Methode (Muster: `gift-menu.js` `loadRules`):

```js
async loadRules() {
  try {
    const res = await fetch(`${this.ctx.baseUrl}/trigger-rules?token=${this.ctx.token}`);
    if (!res.ok) return;
    const data = await res.json();
    const rules = Array.isArray(data) ? data : (data && Array.isArray(data.rules) ? data.rules : []);
    const items = itemsFromRules(rules);
    if (!items.length) return;
    this.segmentRules = items;
    this.segments = items.map((it) => it.text).filter(Boolean);
    this.draw();
  } catch { /* Route (noch) nicht da — manuelle Liste bleibt */ }
}
```

Hinweis: `this.ctx = ctx || {}` sicherstellen (falls nicht vorhanden). `escapeHtml`
bleibt unverändert; Segment-Texte laufen wie bisher durch `this.segments`.

- [ ] **Schritt 6: Feld-Definitionen (Renderer)**

In `widget-types.ts` beim wheel-Eintrag Default-Prop `source: 'liste'` ergänzen und
Felder erweitern (das `segments`-Listen-Feld nur zeigen, wenn Quelle = Liste):

```ts
// Default-Props des wheel:
props: { segments: '100 Coins|Nichts|VIP-Tag|Shoutout|50 Punkte|Joker|Doppelt|Pech',
         source: 'liste', /* …bestehende… */ },
// Felder — VOR dem segments-Feld:
{ key: 'source', label: 'Woher kommen die Felder', type: 'select', options: [
  { value: 'liste', label: 'Meine Liste unten' },
  { value: 'trigger', label: 'Automatisch aus meinen Geschenk-Triggern' },
], hint: 'Automatisch: das Rad nimmt deine Geschenk-Trigger als Felder und bleibt von allein aktuell.' },
// bestehendes segments-Listenfeld:
{ key: 'segments', /* …type:'list'… */ showIf: (p) => (p.source ?? 'liste') === 'liste' },
```

- [ ] **Schritt 7: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → alle 0.

```bash
git add packages/widget-kit/wheel.js packages/widget-kit/wheel.test.ts apps/desktop/src/renderer/pages/widget-types.ts
git commit -m "feat(wheel): Quelle 'trigger' — Radfelder aus Geschenk-Triggern"
```

---

### Task 2: „Bei welchem Geschenk drehen?" — serverseitige Bindung (Prop, KEINE Regel)

> **Geändert ggü. urspr. Plan:** `OverlayPage` hat KEINEN Zugriff auf die Regel-Liste
> (keine Renderer↔Rules-Plumbing vorhanden), und eine automatisch angelegte Regel würde
> in der Trigger-Liste des Nutzers als „Fremdkörper" auftauchen. Sauberer und mit
> vorhandenen Mustern belegt: Die Bindung lebt als Widget-Prop `spinGift` und wird
> **serverseitig** im Gift-Handler ausgewertet. Verhalten identisch (Geschenk → Rad dreht).

**Files:**
- Create: `apps/desktop/src/main/services/wheel-gift.ts` (reiner Matcher)
- Test: `apps/desktop/src/main/services/wheel-gift.test.ts`
- Modify: `apps/desktop/src/main/services/studio.ts` (Gift-Handler ~Zeile 410–438)
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (Feld `spinGift` + Default-Prop)

**Interfaces:**
- Consumes: Gift-Event `e.gift.slug` / `e.gift.giftId`, Layout-Layer
  (`this.layouts.list()` bzw. das aktive Layout — Muster wie `studio.ts:1683`
  `layout?.layers.find(l => l.widgetType==='media' && l.visible && …)`),
  `this.dispatchAction(ruleId, action, event)` (`studio.ts:446`). Feldtyp `'gift'`
  existiert bereits und rendert `GiftPicker` (`OverlayPage.tsx:1230`).
- Produces: `matchingWheelSpins(layers, giftSlug): string[]` (Layer-IDs sichtbarer
  Räder mit passendem `spinGift`) — von Task 3 als Ansatzpunkt fürs Auto-Feuern genutzt.

- [ ] **Schritt 1: Failing test — welche Räder soll dieses Gift drehen?**

Reiner Matcher (kein I/O). `node:test`/`node:assert` (Server-Tests laufen mit Vitest —
Muster der bestehenden `apps/desktop/src/main/services/*.test.ts` übernehmen, das dort
verwendete Runner-Idiom prüfen und 1:1 spiegeln).

```ts
import { matchingWheelSpins } from './wheel-gift';
test('matchingWheelSpins liefert IDs sichtbarer Räder mit passendem spinGift', () => {
  const layers = [
    { id: 'w1', widgetType: 'wheel', visible: true,  props: { spinGift: 'galaxy' } },
    { id: 'w2', widgetType: 'wheel', visible: true,  props: { spinGift: 'rose' } },
    { id: 'w3', widgetType: 'wheel', visible: false, props: { spinGift: 'galaxy' } }, // unsichtbar
    { id: 'w4', widgetType: 'wheel', visible: true,  props: { spinGift: '' } },       // leer = nie
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { spinGift: 'galaxy' } }, // kein Rad
  ];
  expect(matchingWheelSpins(layers, 'galaxy')).toEqual(['w1']);
  expect(matchingWheelSpins(layers, 'rose')).toEqual(['w2']);
  expect(matchingWheelSpins(layers, 'diamond')).toEqual([]);
});
```

- [ ] **Schritt 2: Test rot** — Run: `npx vitest run apps/desktop/src/main/services/wheel-gift.test.ts` → FAIL.

- [ ] **Schritt 3: Matcher implementieren**

```ts
// apps/desktop/src/main/services/wheel-gift.ts
type WheelLayer = { id: string; widgetType: string; visible: boolean; props?: Record<string, unknown> };
/** IDs sichtbarer Rad-Widgets, deren spinGift auf diesen Gift-Slug passt. */
export function matchingWheelSpins(layers: WheelLayer[], giftSlug: string): string[] {
  const slug = String(giftSlug || '');
  if (!slug) return [];
  return layers
    .filter((l) => l.widgetType === 'wheel' && l.visible && String(l.props?.spinGift || '') === slug)
    .map((l) => l.id);
}
```

- [ ] **Schritt 4: Test grün** — Run: `npx vitest run …wheel-gift.test.ts` → PASS.

- [ ] **Schritt 5: Im Gift-Handler von `studio.ts` verdrahten**

Im `if (e.type === 'gift' && e.gift)`-Block (nach dem bestehenden Gift-Sound-Teil,
vor `this.maybeAnnounceGift(e)`): die aktiven Layer holen (gleiche Quelle wie der
Sound-Teil dort nutzt — `this.layouts.list()` / aktives Layout), dann

```ts
for (const layerId of matchingWheelSpins(activeLayers, e.gift.slug)) {
  this.dispatchAction('wheel-gift', { kind: 'spin_wheel', targetId: layerId }, e);
}
```

Prüfen, wie der bestehende `spin_wheel`-Pfad in `runAction` `params` (Name/Gift fürs
Banner) füllt bzw. den `roll` ergänzt — falls `params` unterstützt wird, `params:
{ name: e.user?.nickname, gift: e.gift.slug }` mitgeben; falls nicht (Typ
`TriggerAction` kennt kein `params`), das Feld weglassen (Rad dreht ohne Banner — kein
Blocker). Kein Typfehler erzwingen.

- [ ] **Schritt 6: UI-Feld**

`widget-types.ts` wheel: Default-Prop `spinGift: ''` ergänzen; Feld (Feldtyp `'gift'`
existiert und rendert den GiftPicker):
```ts
{ key: 'spinGift', label: 'Bei welchem Geschenk drehen?', type: 'gift',
  hint: 'Wähle ein Geschenk — schickt das jemand, dreht das Rad automatisch. Leer = nur manuell/über eigene Trigger.' },
```

- [ ] **Schritt 7: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.

```bash
git add apps/desktop/src/main/services/wheel-gift.ts apps/desktop/src/main/services/wheel-gift.test.ts apps/desktop/src/main/services/studio.ts apps/desktop/src/renderer/pages/widget-types.ts
git commit -m "feat(wheel): Geschenk dreht Rad — serverseitige Bindung per spinGift-Prop"
```

---

### Task 3: Auto-Feuern — Aktion des gezogenen Feldes serverseitig ausführen

**Files:**
- Modify: `apps/desktop/src/main/services/studio.ts` (`runAction` Zweig `spin_wheel`)
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (Häkchen `autoFire`)
- Test: `apps/desktop/src/main/services/__tests__/wheel-autofire.test.ts`

**Interfaces:**
- Consumes: `this.dispatchAction(ruleId, action, event)` (`studio.ts:446`), zentraler
  `roll` (`studio.ts` `spin_wheel`-Zweig broadcastet `roll: Math.random()`), Layer-Lookup
  (props `source`, `spinMs`, `autoFire`, `targetId`), `itemsFromRules` bzw. die
  Regel-Liste, aus der Segment-Index → Regel/Aktion abgeleitet wird.
- Produces: keine — Endpunkt der Kette.

- [ ] **Schritt 1: Failing test — Gewinner-Index aus roll**

Reiner Helper (kein I/O), damit testbar:

```ts
import { winnerIndex } from '../wheel-autofire';
test('winnerIndex bildet roll auf Segment ab', () => {
  expect(winnerIndex(0.0, 8)).toBe(0);
  expect(winnerIndex(0.99, 8)).toBe(7);
  expect(winnerIndex(0.5, 4)).toBe(2);
});
```

- [ ] **Schritt 2: Test rot** — Run: `npx vitest run …wheel-autofire.test.ts` → FAIL.

- [ ] **Schritt 3: Helper (identisch zur Widget-Formel in `wheel.js` onAction)**

```ts
// apps/desktop/src/main/services/wheel-autofire.ts
export function winnerIndex(roll: number, n: number): number {
  if (n <= 0) return 0;
  return Math.floor(Math.min(0.999999, Math.max(0, roll)) * n);
}
```

- [ ] **Schritt 4: Test grün** — Run: `npx vitest run …` → PASS.

- [ ] **Schritt 5: Serverseitig feuern beim Roll**

Im `spin_wheel`-Zweig von `runAction` (`studio.ts`), nach dem Broadcast mit `roll`:
Layer über `action.targetId` finden. Wenn `layer.props.source === 'trigger'` **und**
`layer.props.autoFire === true` **und** echter Betrieb (kein Preview/Single):
- Regeln der `gift`-Trigger via `itemsFromRules(this.getRules())` in Reihenfolge holen
  (gleiche Ordnung wie das Widget → gleicher Index),
- `idx = winnerIndex(roll, list.length)`,
- die zu `list[idx].slug` gehörige Regel finden und ihre Aktionen **verzögert** um
  `layer.props.spinMs ?? 5000` dispatchen:
  `this.dispatchAction(rule.id, { ...act, delayMs: (act.delayMs ?? 0) + spinMs }, event)`
  — so feuert es genau, wenn das Rad optisch steht. Nur EINMAL (eine zentrale Roll-Stelle,
  kein Widget-Rückkanal → kein Doppelfeuer bei mehreren Overlays).

Test dazu: Fake-Studio mit einer gift-Regel (`galaxy` → `play_sound`), `autoFire=true`,
festem `roll` → erwartet genau ein `dispatchAction` mit `play_sound` und `delayMs>=spinMs`.

- [ ] **Schritt 6: UI-Häkchen**

`widget-types.ts` wheel: Default `autoFire: false`; Feld
```ts
{ key: 'autoFire', label: 'Aktion automatisch ausführen', type: 'boolean',
  showIf: (p) => (p.source ?? 'liste') === 'trigger',
  hint: 'An: das ausgeloste Geschenk feuert seine Aktion von selbst (Sound/Effekt). Aus: nur anzeigen.' },
```

- [ ] **Schritt 7: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
`node --check packages/widget-kit/wheel.js` → 0.

```bash
git add apps/desktop/src/main/services/wheel-autofire.ts apps/desktop/src/main/services/__tests__/wheel-autofire.test.ts apps/desktop/src/main/services/studio.ts apps/desktop/src/renderer/pages/widget-types.ts
git commit -m "feat(wheel): Auto-Feuern der ausgelosten Aktion (serverseitig, verzoegert)"
```

---

## Self-Review (gegen das Spec)
- **Quelle liste|trigger + vorbefüllt/editierbar:** Task 1 (source-Feld, `showIf` lässt
  Liste editierbar). ✓
- **Geschenk-Auswahl am Rad („Bei welchem Geschenk drehen?"):** Task 2 — serverseitige
  Bindung per `spinGift`-Prop (statt auto-angelegter Regel; identisches Verhalten,
  keine Regel-Store-Verdrahtung nötig). ✓
- **„Beides per Schalter" (Auto-Feuern optional, Standard aus):** Task 3 (autoFire,
  Default false, showIf nur bei trigger). ✓
- **Sicher/einmalig/nur echtes Overlay:** Task 3 serverseitig, zentraler Roll. ✓
- **Ehrliche Grenze (Auto-Feuern nur bei source=trigger):** `showIf` + Server-Guard. ✓
- **Offen zur Umsetzung:** Ob Feld-Typ `gift-picker` existiert (Task 2 Schritt 5) — sonst
  Picker aus `gift-command-list` wiederverwenden. `getRules()`-Getter in `studio.ts`
  ggf. ergänzen, falls die Regel-Liste dort nicht direkt greifbar ist (Task 3 Schritt 5).
