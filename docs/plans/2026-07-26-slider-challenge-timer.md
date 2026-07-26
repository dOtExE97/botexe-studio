# Challenge-Timer im Geschenke-Slider — Umsetzungsplan (Stück 2)

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development
> oder superpowers:executing-plans, Task für Task. Checkbox-Syntax.

**Ziel:** Ein Geschenk trägt eine Challenge mit Dauer (z.B. „1 Min still sein"); kommt es
rein, läuft auf genau diesem Eintrag im Geschenke-Slider ein animierter Countdown.

**Architektur:** Kein neues Widget. Das Item-Format `slug::text` wird um eine optionale
Dauer erweitert (`slug::text::sekunden`). Das Widget `gift-menu` startet in `celebrate(i)`
einen Countdown auf dem getroffenen Eintrag; ein reiner Kern (`gift-countdown.js`) rechnet
Stacking/Cap/Format, das Widget tickt und rendert. Mehrere Optiken über `timerStyle`.

**Tech Stack:** Vanilla-ES-Widget (`gift-menu.js`, neues `gift-countdown.js`), React-Editor
(`GiftCommandListEditor.tsx`), `widget-types.ts`, Tests unter `node:test`.

## Global Constraints
- Verifikation nur per Exit-Code: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run widget-check` — alle **0**. Nach jeder `.js`-Änderung in `packages/widget-kit/`:
  `node --check <datei>`.
- Tests in `packages/widget-kit/*.test.ts` laufen unter **`node:test`** (NICHT Vitest —
  Idiom eines bestehenden Sibling-Tests spiegeln). Renderer-Tests analog zum dortigen Idiom.
- Deutsch in Code/UI, UI-Descriptions in Erzähler-Form.
- Rückwärtskompatibel: bestehende `slug::text`-Listen ohne Dauer verhalten sich UNVERÄNDERT.
- Cap Stacking: **600 s**. Reine Anzeige, kein Firing.
- Nichts läuft aus der Box; `widget-check` bleibt grün. Kein TikTok-Gift-Bild ins Repo.
- Nichts releasen ohne Freigabe.

---

### Task 1: Item-Format `slug::text::sekunden` + Editor-Minutenfeld

**Files:**
- Modify: `packages/widget-kit/gift-menu.js` (`parseItems`)
- Test: `packages/widget-kit/gift-menu.test.ts` (neu oder erweitern)
- Modify: `apps/desktop/src/renderer/components/GiftCommandListEditor.tsx` (Row `secs` + Minutenfeld)
- Test: `apps/desktop/src/renderer/components/GiftCommandListEditor.test.ts(x)` (parse/serialize)

**Interfaces:**
- Produces: `parseItems(raw)` liefert Items mit optionalem `secs: number` (0 = kein Timer).
  Editor serialisiert `slug::text::<secs>` nur wenn `secs>0`, sonst `slug::text` wie bisher.

- [ ] **Schritt 1: Failing test — parseItems mit/ohne Dauer, rückwärtskompatibel**

```ts
import { parseItems } from './gift-menu.js';
test('parseItems: 3. Feld = Sekunden, 2-Feld unverändert, :: im Text bleibt', () => {
  expect(parseItems('galaxy::still sein::60')).toEqual([{ slug: 'galaxy', text: 'still sein', secs: 60 }]);
  expect(parseItems('rose::Konfetti')).toEqual([{ slug: 'rose', text: 'Konfetti', secs: 0 }]);
  expect(parseItems('x::a::b::90')).toEqual([{ slug: 'x', text: 'a::b', secs: 90 }]); // :: im Text
  expect(parseItems('y::42')).toEqual([{ slug: 'y', text: '42', secs: 0 }]);          // reine Zahl = Text, kein Timer
});
```

- [ ] **Schritt 2: Test rot** — Run (node:test-Idiom des Sibling nutzen) → FAIL.

- [ ] **Schritt 3: `parseItems` erweitern (rückwärtskompatibel)**

```js
export function parseItems(raw) {
  return String(raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split('::');
      const slug = (parts[0] ?? '').trim();
      const rest = parts.slice(1).map((p) => p.trim());
      let secs = 0;
      // Dauer nur, wenn NEBEN dem Text ein reines Zahlen-Feld am Ende steht
      // (mind. 2 Felder nach dem slug) — „slug::42" bleibt Text, kein Timer.
      if (rest.length >= 2 && /^\d+$/.test(rest[rest.length - 1])) {
        secs = Number(rest.pop());
      }
      const text = rest.join('::').trim();
      return { slug, text, secs };
    })
    .filter((it) => it.slug || it.text);
}
```
(Alle bestehenden `parseItems`-Aufrufer prüfen: keiner darf am fehlenden `secs` scheitern —
`secs` ist additiv, Default 0. `itemsFromRules`/andere Item-Quellen liefern kein `secs` →
das ist ok, kein Timer.)

- [ ] **Schritt 4: Test grün** → PASS. `node --check packages/widget-kit/gift-menu.js` → 0.

- [ ] **Schritt 5: Editor — `secs` pro Zeile (in MINUTEN eingeben)**

`GiftCommandListEditor.tsx`: `interface Row { slug; text; secs?: number }`. `parse` liest
das 3. `::`-Feld analog (reine Zahl am Ende = Sekunden). `serialize` hängt `::<secs>` an,
wenn `secs && secs>0`. Pro Zeile ein schmales Minuten-Input (Schritt 0.5), das
`Math.round(min*60)` in `secs` schreibt und `secs/60` anzeigt. Label/Platzhalter „Min".
Leeres/0 Minutenfeld ⇒ kein 3. Feld (unverändertes Format).

- [ ] **Schritt 6: Editor-Test (parse/serialize roundtrip inkl. secs)**

```ts
test('GiftCommandListEditor serialize: secs nur wenn gesetzt', () => {
  expect(serialize([{ slug: 'galaxy', text: 'still sein', secs: 60 }])).toBe('galaxy::still sein::60');
  expect(serialize([{ slug: 'rose', text: 'Konfetti' }])).toBe('rose::Konfetti');
});
```
(parse/serialize ggf. exportieren, damit testbar — dem Muster bestehender Komponenten-Tests folgen.)

- [ ] **Schritt 7: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
```bash
git add packages/widget-kit/gift-menu.js packages/widget-kit/gift-menu.test.ts apps/desktop/src/renderer/components/GiftCommandListEditor.tsx apps/desktop/src/renderer/components/GiftCommandListEditor.test.tsx
git commit -m "feat(gift-menu): Item-Format um optionale Dauer (slug::text::sekunden) + Editor-Minutenfeld"
```

---

### Task 2: Countdown-Engine im Widget (Stacking, Cap, Tick, Ablauf)

**Files:**
- Create: `packages/widget-kit/gift-countdown.js` (reiner Kern)
- Test: `packages/widget-kit/gift-countdown.test.ts`
- Modify: `packages/widget-kit/gift-menu.js` (`celebrate` startet/verlängert Countdown; ein
  Sekunden-Ticker aktualisiert Anzeige; `destroy` räumt auf)

**Interfaces:**
- Consumes: `parseItems`-Item mit `secs` (Task 1), `celebrate(i)`-Anker (`gift-menu.js:1285`),
  `giftKey` (Eintrag-Identität), vorhandenes `this.timers`-Cleanup-Set.
- Produces: `stackRemaining(prev, addSecs, cap)`, `fmtTime(secs)` — von Task 3 fürs Rendern genutzt.

- [ ] **Schritt 1: Failing test — Kern (Stacking + Cap + Format)**

```ts
import { stackRemaining, fmtTime } from './gift-countdown.js';
test('stackRemaining addiert und deckelt bei cap', () => {
  expect(stackRemaining(0, 60, 600)).toBe(60);   // Start
  expect(stackRemaining(20, 60, 600)).toBe(80);  // drauflegen
  expect(stackRemaining(580, 60, 600)).toBe(600);// Cap
});
test('fmtTime formatiert m:ss', () => {
  expect(fmtTime(80)).toBe('1:20');
  expect(fmtTime(5)).toBe('0:05');
  expect(fmtTime(0)).toBe('0:00');
});
```

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: Kern implementieren**

```js
// packages/widget-kit/gift-countdown.js — reiner, DOM-freier Kern.
export function stackRemaining(prev, addSecs, cap = 600) {
  const base = prev > 0 ? prev : 0;
  return Math.min(cap, base + Math.max(0, addSecs));
}
export function fmtTime(secs) {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
```

- [ ] **Schritt 4: Test grün** → PASS. `node --check gift-countdown.js` → 0.

- [ ] **Schritt 5: Im Widget verdrahten (`gift-menu.js`)**

- `import { stackRemaining, fmtTime } from './gift-countdown.js';`
- Zustand: `this.activeTimers = new Map();` (Key = `giftKey(item.slug)||'#'+giftId`, Wert
  `{ remaining, total, el }`).
- In `celebrate(i)`: das getroffene Item bestimmen (aus der Liste per Index i). Wenn
  `item.secs > 0`: `remaining = stackRemaining(prev?.remaining ?? 0, item.secs, 600)`,
  `total = remaining` bei Neustart bzw. hochgezogen beim Stacken; Eintrag-Element markieren
  (`el.classList.add('bx-gm-timing')`) und Countdown-Knoten sicherstellen; Map-Eintrag setzen.
- **Ein** Sekunden-Ticker (nur laufen lassen, wenn `activeTimers` nicht leer; via
  `setInterval` 1000ms, ins `this.timers`-Set): jede Sekunde alle `remaining--`, Anzeige über
  `fmtTime` + Fortschritt (`remaining/total`) aktualisieren, bei `<=0` Eintrag zurücksetzen
  (`classList.remove`, Map-Eintrag löschen); Ticker stoppen, wenn Map leer.
- `destroy()`: Ticker/Intervalle clearen, `activeTimers` leeren (Muster wie bestehende `destroy`).
- Preview: im Editor optional einen Demo-Countdown zeigen, damit man die Optik beurteilen
  kann (analog zu bestehenden Preview-Demos), aber ohne echte Events.

Test (headless-fähig, ohne Zeitablauf): Kern ist in Schritt 1 getestet; für die Widget-
Integration einen kleinen Test, dass `celebrate` bei `secs>0` einen `activeTimers`-Eintrag
mit `remaining===secs` anlegt und bei erneutem `celebrate` stackt (Ticker/Intervall dabei
nicht real ablaufen lassen — Map-Zustand prüfen). Falls DOM/Timer schwer testbar: den
Zustandsübergang in eine kleine reine Funktion ziehen und DIE testen.

- [ ] **Schritt 6: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
`node --check packages/widget-kit/gift-menu.js packages/widget-kit/gift-countdown.js` → 0.
```bash
git add packages/widget-kit/gift-countdown.js packages/widget-kit/gift-countdown.test.ts packages/widget-kit/gift-menu.js
git commit -m "feat(gift-menu): Challenge-Countdown pro Eintrag (Stacking, Cap 600s, Tick, Ablauf)"
```

---

### Task 3: Timer-Optiken (Einfach / Balken / Ring) + Feld `timerStyle`

**Files:**
- Modify: `packages/widget-kit/gift-menu.js` (CSS + Render der 3 Countdown-Varianten)
- Modify: `apps/desktop/src/renderer/pages/widget-types.ts` (Feld `timerStyle` + Default)

**Interfaces:**
- Consumes: `this.timerStyle` aus `props.timerStyle`, `fmtTime`/`remaining`/`total` (Task 2).

- [ ] **Schritt 1: Feld + Default**

`widget-types.ts` gift-menu: Default `timerStyle: 'balken'`. Feld:
```ts
{ key: 'timerStyle', label: 'Timer-Optik', type: 'select', options: [
  { value: 'einfach', label: 'Einfach — nur die Restzeit' },
  { value: 'balken', label: 'Balken — schrumpfender Streifen + Zeit' },
  { value: 'ring', label: 'Ring — Kreis, der sich leert' },
], hint: 'Wie der Countdown auf einem Geschenk mit Dauer angezeigt wird.' },
```
Hinweis am Minuten-Feld/`items`-Hint ergänzen: „Trag Minuten ein, dann läuft bei diesem
Geschenk ein Countdown im Overlay."

- [ ] **Schritt 2: Render-Varianten in `gift-menu.js`**

`this.timerStyle = ['einfach','balken','ring'].includes(props.timerStyle) ? props.timerStyle : 'balken';`
Countdown-Knoten je Stil aufbauen/aktualisieren:
- **einfach:** nur `fmtTime(remaining)` (Text, animiert eingeblendet).
- **balken:** Text + Balken, Breite `= remaining/total` (CSS-Transition je Sekunde).
- **ring:** SVG/conic-gradient-Ring, gefüllt `= remaining/total`, Zeit in der Mitte.
Alle mit `cqi/cqh`-Einheiten (skaliert mit der Box, läuft NICHT raus). In Rotation groß,
im Laufband kompakt (kleinere Variante im Chip). `@keyframes` für sanftes Erscheinen/Pulsen.

- [ ] **Schritt 3: Sicht-Prüfung (headless Screenshot)**

Widget mit `items: 'galaxy::still sein::60'` und je `timerStyle` rendern, Screenshot ansehen:
Countdown sichtbar, nichts läuft aus der Box, in Rotation UND Laufband. (Screenshot-Fallen
beachten: `--enable-unsafe-swiftshader`, kein virtual-time für CSS-Animationen.)

- [ ] **Schritt 4: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
`node --check packages/widget-kit/gift-menu.js` → 0.
```bash
git add packages/widget-kit/gift-menu.js apps/desktop/src/renderer/pages/widget-types.ts
git commit -m "feat(gift-menu): Timer-Optiken einfach/balken/ring + Feld timerStyle"
```

---

## Self-Review (gegen das Spec)
- **Dauer im Slider-Eintrag einstellbar (Minuten), rückwärtskompatibel:** Task 1. ✓
- **Countdown startet auf dem Eintrag bei dem Geschenk:** Task 2 (`celebrate`). ✓
- **Zeit drauflegen + Cap 600s:** Task 2 (`stackRemaining`). ✓
- **Mehrere gleichzeitig:** Task 2 (`activeTimers`-Map je Eintrag). ✓
- **Reine Anzeige, kein Firing:** keine `dispatchAction` im Umfang. ✓
- **Mehrere Optiken:** Task 3 (`timerStyle` einfach/balken/ring). ✓
- **Rotation + Laufband:** Task 3 (kompakte Variante im Chip). ✓
- **Offen zur Umsetzung:** Genauer Anker-Knoten in `celebrate` (Rotation-Card vs Laufband-Chip)
  beim Bauen festlegen; Widget-Integrationstest ggf. über reine Zustandsfunktion (Timer real
  nicht ablaufen lassen).
