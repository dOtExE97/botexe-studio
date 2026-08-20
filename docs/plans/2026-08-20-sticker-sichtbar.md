# Sticker sichtbar machen — Umsetzungsplan

> **Für agentische Arbeiter:** Diesen Plan Aufgabe für Aufgabe abarbeiten. Schritte sind Checkboxen (`- [ ]`).

**Ziel:** TikTok-Sticker erscheinen im Chat-Widget der App, werden in einem Katalog gemerkt und können einen Sound (oder jede andere Aktion) auslösen.

**Aufbau:** Die Sticker-Daten liegen bereits an jeder Chat-Nachricht (`emotes`) und werden heute verworfen. Wir reichen sie durch (`StudioEvent.sticker`), merken sie in einem Katalog mit lokal abgelegten Bildern, zeigen sie im Widget an und binden Aktionen über eine neue Trigger-Bedingung — **ohne zweiten Regelspeicher**.

**Technik:** TypeScript, Electron, `node --test` + `tsx`, Vanilla-JS-Widgets.

Entwurf: `docs/specs/2026-08-20-sticker-sichtbar-design.md`

## Übergreifende Vorgaben

- Sprache im Code und in der Oberfläche: **Deutsch**. Kommentare erklären das *Warum*.
- Prüfen **nur per Exit-Code**: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run widget-check` — alle müssen 0 sein. Nie am getailten Text.
- Nach **jeder** Änderung an einer `.js` in `packages/widget-kit/`: `node --check <datei>` (ESLint erfasst diese Dateien nicht).
- **Nichts releasen.** Keine Version hochzählen, keinen Tag setzen.
- **Namenskollision beachten:** `chat-box.js` hat bereits einen Optik-Stil `'sticker'` (Bubble-Look, Zeile 161). Das ist **nicht** unser TikTok-Sticker. Neue Bezeichner heißen `stickerBild`, `bx-cb-sticker`, `sticker-catalog` — der bestehende Stil-Wert bleibt unangetastet.
- Bestehende Overlays dürfen sich nicht verändern: Wer heute keine Sticker bekommt, sieht exakt dasselbe wie vorher.
- Bilder von TikTok werden **nie** ins Repo committet. Nach Arbeit an Bildern prüfen: `find . -name "*.webp" -not -path "./node_modules/*"` == 0.

---

### Task 1: Sticker durch die Normalisierung reichen

**Dateien:**
- Ändern: `packages/trigger-engine/src/index.ts` (Typ `StudioEvent`, ~Zeile 126-165)
- Ändern: `apps/desktop/src/main/adapters/tiktok-normalize.ts:191-214` (`normalizeChat`) und `:447-452` (`normalizeEmote`)
- Test: `apps/desktop/src/main/adapters/tiktok-normalize.test.ts`

**Schnittstellen:**
- Liefert: `StudioSticker`, `StudioEvent.sticker?: StudioSticker[]`, `stickerAusListe(rohe: unknown[]): StudioSticker[]`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `tiktok-normalize.test.ts` ergänzen (Werte stammen aus einem echten Mitschnitt vom 20.08.2026):

```ts
test('normalizeChat: Sticker aus emotes werden übernommen', () => {
  const e = normalizeChat({
    user: { userId: '1', nickname: 'Solo Leveling' },
    content: ' ',
    emotes: [{
      index: 0,
      emote: {
        emoteId: '7444741533452225312',
        image: { urlList: ['https://p16-webcast.tiktokcdn.com/img/x.webp'], avgColor: '#DCDCFA', isAnimated: false },
        packageId: 'fansclub',
      },
    }],
  }, 1000);
  assert.equal(e.sticker?.length, 1);
  assert.equal(e.sticker?.[0].id, '7444741533452225312');
  assert.equal(e.sticker?.[0].bild, 'https://p16-webcast.tiktokcdn.com/img/x.webp');
  assert.equal(e.sticker?.[0].index, 0);
  assert.equal(e.sticker?.[0].paket, 'fansclub');
  assert.equal(e.text, ' ', 'Text bleibt unverändert');
});

test('normalizeChat: ohne emotes bleibt sticker undefined', () => {
  const e = normalizeChat({ user: { userId: '1' }, content: 'hallo' }, 1000);
  assert.equal(e.sticker, undefined, 'kein leeres Array — sonst denkt jeder Leser, da wären Sticker');
});

test('normalizeChat: Sticker ohne emoteId wird verworfen, Rest überlebt', () => {
  const e = normalizeChat({
    user: { userId: '1' }, content: '',
    emotes: [
      { index: 0, emote: { image: { urlList: ['https://x/1.webp'] } } },
      { index: 1, emote: { emoteId: '42', image: { urlList: ['https://x/2.webp'] } } },
    ],
  }, 1000);
  assert.equal(e.sticker?.length, 1);
  assert.equal(e.sticker?.[0].id, '42');
});

test('normalizeEmote: emoteList wird nicht mehr weggeworfen', () => {
  const e = normalizeEmote({
    user: { userId: '1' },
    emoteList: [{ emoteId: '99', image: { urlList: ['https://x/9.webp'] } }],
  }, 1000);
  assert.equal(e.sticker?.length, 1);
  assert.equal(e.sticker?.[0].id, '99');
  assert.equal(e.sticker?.[0].index, 0, 'reine Sticker-Nachricht: Position 0');
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace apps/desktop run test`
Erwartet: FAIL — `sticker` existiert nicht.

- [ ] **Schritt 3: Typ ergänzen**

In `packages/trigger-engine/src/index.ts`, bei den anderen `StudioEvent`-Feldern:

```ts
/** Ein Sticker aus einer Chat-Nachricht (TikToks „emote"). */
export interface StudioSticker {
  /** TikToks emoteId — der stabile Anker für Regeln. */
  id: string;
  /** Bild: lokaler Pfad, sobald der Katalog es abgelegt hat, sonst die
   *  CDN-Adresse. TikToks Adressen laufen ab, deshalb wird kopiert. */
  bild: string;
  /** Position im Text (0 = ganz vorne). Ein Sticker kann mitten im Satz stehen. */
  index: number;
  animiert: boolean;
  /** TikToks packageId, z.B. 'fansclub' — welches Set. */
  paket?: string;
  /** Platzhalter-Farbe, solange das Bild lädt (TikToks avgColor). */
  farbe?: string;
}
```

und im `StudioEvent`:

```ts
/** Sticker dieser Nachricht. Lagen bisher an jeder Chat-Nachricht an und wurden
 *  verworfen — wodurch Sticker-Nachrichten spurlos verschwanden, weil ihr Text
 *  leer ist. Im Mitschnitt vom 20.08.2026: 38 % aller Chat-Nachrichten. */
sticker?: StudioSticker[];
```

- [ ] **Schritt 4: Umwandlung schreiben**

In `tiktok-normalize.ts`, neben den anderen Hilfsfunktionen:

```ts
/** Rohe TikTok-Sticker in unsere Form bringen. Nimmt BEIDE Bauarten:
 *  `EmoteWithIndex` aus dem Chat ({index, emote}) und den nackten `EmoteModel`
 *  aus der reinen Sticker-Nachricht. Einträge ohne emoteId fliegen raus —
 *  ohne Anker ist ein Sticker für Regeln wertlos. */
export function stickerAusListe(rohe: unknown[] | undefined): StudioSticker[] | undefined {
  if (!Array.isArray(rohe) || rohe.length === 0) return undefined;
  const raus: StudioSticker[] = [];
  rohe.forEach((eintrag, i) => {
    const e = eintrag as { index?: number; emote?: RawEmote } & RawEmote;
    const emote = e.emote ?? e;
    const id = emote?.emoteId;
    if (!id) return;
    raus.push({
      id: String(id),
      bild: emote.image?.urlList?.[0] ?? '',
      index: typeof e.index === 'number' ? e.index : i,
      animiert: !!emote.image?.isAnimated,
      paket: emote.packageId || undefined,
      farbe: emote.image?.avgColor || undefined,
    });
  });
  return raus.length > 0 ? raus : undefined;
}

interface RawEmote {
  emoteId?: string;
  packageId?: string;
  image?: { urlList?: string[]; avgColor?: string; isAnimated?: boolean };
}
```

`normalizeChat`: Signatur um `emotes?: unknown[]` erweitern, Rückgabe zu

```ts
return { type: 'chat', ts, user, text: data.comment ?? data.content ?? '', sticker: stickerAusListe(data.emotes) };
```

`normalizeEmote`: Rückgabe zu

```ts
return { type: 'emote', ts, user: toUser(data.user), sticker: stickerAusListe(data.emoteList) };
```

- [ ] **Schritt 5: Tests laufen lassen**

`npm --workspace apps/desktop run test` und `npm --workspace packages/trigger-engine run test` → beide Exit-Code 0.
Danach `npm run typecheck` → 0.

- [ ] **Schritt 6: Committen**

```bash
git add packages/trigger-engine/src/index.ts apps/desktop/src/main/adapters/tiktok-normalize.ts apps/desktop/src/main/adapters/tiktok-normalize.test.ts
git commit -m "feat: Sticker aus Chat- und Emote-Nachrichten durchreichen"
```

---

### Task 2: Sticker-Katalog mit lokalen Bildern

**Dateien:**
- Neu: `apps/desktop/src/main/services/sticker-catalog.ts`
- Neu: `apps/desktop/src/main/services/sticker-catalog.test.ts`
- Vorbild (lesen, nicht kopieren): `apps/desktop/src/main/services/gift-catalog.ts`

**Schnittstellen:**
- Verbraucht: `StudioSticker` aus Task 1
- Liefert: `StickerKatalog` mit `merken(sticker: StudioSticker[], ts: number): void`, `alle(): StickerEintrag[]`, `umbenennen(id: string, name: string): void`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { StickerKatalog } from './sticker-catalog';

function k() {
  // Bild-Ablage wird eingespeist, damit der Test nichts herunterlädt.
  const geholt: string[] = [];
  const kat = new StickerKatalog({
    laden: async () => ({ ok: false }),   // Download scheitert absichtlich
    lesen: () => null,
    schreiben: () => {},
  });
  return { kat, geholt };
}

test('merken: neuer Sticker wird angelegt, zweite Sichtung zählt nur hoch', () => {
  const { kat } = k();
  const s = { id: '42', bild: 'https://x/1.webp', index: 0, animiert: false };
  kat.merken([s], 1000);
  kat.merken([s], 2000);
  const alle = kat.alle();
  assert.equal(alle.length, 1, 'kein Doppel-Eintrag');
  assert.equal(alle[0].anzahl, 2);
  assert.equal(alle[0].erstGesehen, 1000);
  assert.equal(alle[0].zuletztGesehen, 2000);
});

test('merken: gescheiterter Download hinterlässt keinen kaputten Eintrag', () => {
  const { kat } = k();
  kat.merken([{ id: '42', bild: 'https://x/1.webp', index: 0, animiert: false }], 1000);
  const e = kat.alle()[0];
  assert.equal(e.bildPfad, undefined, 'kein Pfad, wenn nichts abgelegt wurde');
  assert.equal(e.bildUrl, 'https://x/1.webp', 'Herkunft bleibt — der nächste Versuch braucht sie');
});

test('umbenennen: eigener Name bleibt bei der nächsten Sichtung erhalten', () => {
  const { kat } = k();
  kat.merken([{ id: '42', bild: 'https://x/1.webp', index: 0, animiert: false }], 1000);
  kat.umbenennen('42', 'Mein Lachsticker');
  kat.merken([{ id: '42', bild: 'https://x/2.webp', index: 0, animiert: false }], 2000);
  assert.equal(kat.alle()[0].eigenerName, 'Mein Lachsticker');
});

test('merken: Sticker ohne Bild wird trotzdem gemerkt', () => {
  const { kat } = k();
  kat.merken([{ id: '7', bild: '', index: 0, animiert: false }], 1000);
  assert.equal(kat.alle().length, 1, 'die ID ist der Anker, nicht das Bild');
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace apps/desktop run test` → FAIL, Modul fehlt.

- [ ] **Schritt 3: Katalog schreiben**

`sticker-catalog.ts` mit:

```ts
export interface StickerEintrag {
  id: string;
  /** Lokal abgelegtes Bild. Fehlt, solange kein Download geklappt hat. */
  bildPfad?: string;
  /** Herkunft bei TikTok — für einen erneuten Versuch. Läuft ab. */
  bildUrl: string;
  animiert: boolean;
  paket?: string;
  farbe?: string;
  anzahl: number;
  erstGesehen: number;
  zuletztGesehen: number;
  /** TikTok liefert zu einem Sticker KEINEN Namen (auch TikFinity zeigt nur
   *  die Nummer). Der Streamer darf deshalb selbst einen vergeben. */
  eigenerName?: string;
}

interface Ablage {
  laden(url: string, id: string): Promise<{ ok: boolean; pfad?: string }>;
  lesen(): StickerEintrag[] | null;
  schreiben(eintraege: StickerEintrag[]): void;
}
```

Regeln der Umsetzung:
- `merken()` legt fehlende Einträge an und stößt den Download **einmal** an (nicht bei jeder Sichtung erneut, solange `bildPfad` steht).
- `eigenerName` wird beim Aktualisieren nie überschrieben.
- Fehlgeschlagener Download: Eintrag bleibt ohne `bildPfad`, `bildUrl` wird auf die neueste Adresse aktualisiert (die alte ist abgelaufen).
- Nach jedem `merken()` mit Änderung: `schreiben()`.

- [ ] **Schritt 4: Tests laufen lassen**

`npm --workspace apps/desktop run test` → 0. `npm run typecheck` → 0.

- [ ] **Schritt 5: Katalog an den Ereignis-Bus hängen**

Dort, wo die anderen Dienste auf Ereignisse hören (Vorbild: wie `gift-catalog` gefüttert wird — im Hauptprozess suchen mit `grep -rn "giftCatalog" apps/desktop/src/main/`), bei jedem Ereignis mit `event.sticker` den Katalog füttern. **Nicht bei `event.synthetic`** (Test-/Vorschau-Ereignisse dürfen den Katalog nicht verunreinigen) und nicht bei `event.sticky`.

- [ ] **Schritt 6: Committen**

```bash
git add apps/desktop/src/main/services/sticker-catalog.ts apps/desktop/src/main/services/sticker-catalog.test.ts
git commit -m "feat: Sticker-Katalog merkt gesehene Sticker samt Bild"
```

---

### Task 3: Sticker im Chat-Widget anzeigen

**Dateien:**
- Ändern: `packages/widget-kit/chat-box.js:151-172` (`onEvent`), CSS im selben File
- Ändern: `packages/widget-kit/activity-feed.js` (gleiche Behandlung)
- Test: `packages/widget-kit/sticker-text.test.js` (neu) für die reine Aufteil-Logik

**Schnittstellen:**
- Verbraucht: `StudioEvent.sticker` aus Task 1
- Liefert: `textMitStickern(text: string, sticker: StudioSticker[]): Teil[]` mit `Teil = {art:'text', wert:string} | {art:'sticker', wert:StudioSticker}`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Die Aufteilung ist reine Rechnerei und gehört in einen eigenen, DOM-freien Kern (wie `gift-rules.js`), damit sie prüfbar ist:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { textMitStickern } from './sticker-text.js';

test('Sticker am Anfang, kein Text', () => {
  const teile = textMitStickern(' ', [{ id: '1', bild: 'a', index: 0 }]);
  assert.equal(teile.filter((t) => t.art === 'sticker').length, 1);
});

test('Sticker mitten im Text landet an der richtigen Stelle', () => {
  const teile = textMitStickern('hallo welt', [{ id: '1', bild: 'a', index: 5 }]);
  assert.deepEqual(teile.map((t) => (t.art === 'text' ? t.wert : '<S>')), ['hallo', '<S>', ' welt']);
});

test('Position außerhalb des Textes hängt den Sticker hinten an, statt zu zerreißen', () => {
  const teile = textMitStickern('hi', [{ id: '1', bild: 'a', index: 99 }]);
  assert.equal(teile[teile.length - 1].art, 'sticker');
  assert.equal(teile[0].wert, 'hi');
});

test('mehrere Sticker bleiben in aufsteigender Reihenfolge', () => {
  const teile = textMitStickern('abcd', [{ id: '2', bild: 'b', index: 3 }, { id: '1', bild: 'a', index: 1 }]);
  const ids = teile.filter((t) => t.art === 'sticker').map((t) => t.wert.id);
  assert.deepEqual(ids, ['1', '2']);
});

test('ohne Sticker kommt genau ein Text-Teil zurück', () => {
  assert.deepEqual(textMitStickern('nur text', []), [{ art: 'text', wert: 'nur text' }]);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`node --test packages/widget-kit/sticker-text.test.js` → FAIL.

- [ ] **Schritt 3: Kern schreiben**

`packages/widget-kit/sticker-text.js` — DOM-frei, damit Widget und Tests dieselbe Wahrheit nutzen. Sticker nach `index` sortieren, Text an den Positionen aufteilen, Positionen jenseits der Textlänge ans Ende hängen.

- [ ] **Schritt 4: Test laufen lassen**

`node --test packages/widget-kit/sticker-text.test.js` → Exit-Code 0.
`node --check packages/widget-kit/sticker-text.js` → 0.

- [ ] **Schritt 5: Widget anpassen**

In `chat-box.js`, Zeile 153 ersetzen:

```js
// Sticker-Nachrichten haben als Text nur ein Leerzeichen. Die alte Bedingung
// (!event.text) hat sie deshalb KOMPLETT verworfen — im Mitschnitt vom
// 20.08.2026 waren das 38 % aller Chat-Nachrichten.
if (event.type !== 'chat') return;
const stickerListe = event.sticker || [];
if (!event.text && stickerListe.length === 0) return;
```

und das Füllen des Textfelds ersetzen (Zeile 162). **Kein `innerHTML` mit der Bild-Adresse** — die Datei ist bewusst „textContent-only, kein HTML-Inject" (Kommentar Zeile 3):

```js
const textEl = msg.querySelector('.bx-cb-text');
for (const teil of textMitStickern(event.text || '', stickerListe)) {
  if (teil.art === 'text') {
    if (!teil.wert) continue;
    textEl.appendChild(document.createTextNode(teil.wert));
  } else {
    const img = document.createElement('img');
    img.className = 'bx-cb-sticker';
    img.alt = '';
    if (teil.wert.farbe) img.style.background = teil.wert.farbe;
    img.addEventListener('error', () => { img.classList.add('bx-cb-sticker-leer'); });
    img.src = teil.wert.bild;
    textEl.appendChild(img);
  }
}
```

CSS ergänzen (Höhe an die Zeile gekoppelt, damit der Sticker die Zeile nicht sprengt):

```css
.bx-cb-sticker { height: 1.4em; width: auto; vertical-align: -0.3em; border-radius: 4px; }
.bx-cb-sticker-leer { width: 1.4em; opacity: .6; }
```

- [ ] **Schritt 6: Gegenprobe — die alte Optik darf sich nicht ändern**

`node --check packages/widget-kit/chat-box.js` → 0, dann `npm run widget-check` → 0.
Prüfen, dass der bestehende Optik-Stil `'sticker'` (Zeile 161, Bubble-Look) unangetastet ist: `grep -n "=== 'sticker'" packages/widget-kit/chat-box.js` muss unverändert genau diese eine Zeile zeigen.

- [ ] **Schritt 7: Dasselbe im Aktivitäts-Feed**

`activity-feed.js` gleich behandeln, danach `node --check` auf die Datei.

- [ ] **Schritt 8: Committen**

```bash
git add packages/widget-kit/sticker-text.js packages/widget-kit/sticker-text.test.js packages/widget-kit/chat-box.js packages/widget-kit/activity-feed.js
git commit -m "fix: Sticker-Nachrichten verschwinden nicht mehr aus dem Chat-Widget"
```

---

### Task 4: Trigger-Bedingung „Sticker ist X"

**Dateien:**
- Ändern: `packages/trigger-engine/src/index.ts` (`TriggerCondition` ~171-208, `conditionHolds` ~488)
- Test: `packages/trigger-engine/src/trigger-engine.test.ts` (bestehende Testdatei; mit `ls packages/trigger-engine/src/*.test.ts` die passende wählen)

**Schnittstellen:**
- Verbraucht: `StudioEvent.sticker` aus Task 1
- Liefert: `{ kind: 'sticker_ist'; value: string }`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
test('sticker_ist: trifft, wenn einer der Sticker die ID trägt', () => {
  const ev = { type: 'emote', ts: 1, sticker: [{ id: '42', bild: 'a', index: 0, animiert: false }] } as StudioEvent;
  assert.equal(conditionHoldsFuerTest({ kind: 'sticker_ist', value: '42' }, ev), true);
  assert.equal(conditionHoldsFuerTest({ kind: 'sticker_ist', value: '43' }, ev), false);
});

test('sticker_ist: ohne Sticker im Ereignis NICHT erfüllt', () => {
  const ev = { type: 'chat', ts: 1, text: 'hallo' } as StudioEvent;
  assert.equal(conditionHoldsFuerTest({ kind: 'sticker_ist', value: '42' }, ev), false);
});
```

Ist `conditionHolds` nicht exportiert, den Test über eine Regel und `engine.evaluate(ev)` führen — dann prüft er zusätzlich den echten Weg. Vorhandene Tests in der Datei zeigen das Muster.

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace packages/trigger-engine run test` → FAIL.

- [ ] **Schritt 3: Bedingung ergänzen**

```ts
/** Ein bestimmter Sticker (TikToks emoteId). TikTok liefert zu Stickern keinen
 *  Namen, deshalb ist die Nummer der einzige stabile Anker — die Sticker-Seite
 *  zeigt dazu das Bild. */
| { kind: 'sticker_ist'; value: string }
```

in `conditionHolds`:

```ts
case 'sticker_ist':
  return (event.sticker ?? []).some((s) => s.id === condition.value);
```

- [ ] **Schritt 4: Tests laufen lassen**

`npm --workspace packages/trigger-engine run test` → 0, `npm run typecheck` → 0.

- [ ] **Schritt 5: Committen**

```bash
git add packages/trigger-engine/src/
git commit -m "feat: Trigger-Bedingung 'Sticker ist X'"
```

---

### Task 5: Sticker-Ereignisse aus Chat-Nachrichten erzeugen

**Dateien:**
- Ändern: `apps/desktop/src/main/adapters/tiktok-adapter.ts:838` (Umgebung des `emote`-Abos) bzw. die Stelle, an der `chat` veröffentlicht wird
- Test: `apps/desktop/src/main/adapters/tiktok-adapter.test.ts`

**Schnittstellen:**
- Verbraucht: `StudioEvent.sticker`
- Liefert: zusätzlich zu `chat` je ein `emote`-Ereignis pro Sticker

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
test('Chat mit Sticker veröffentlicht chat UND je ein emote-Ereignis', () => {
  // Aufbau wie in den bestehenden Adapter-Tests (Fake-Verbindung).
  // Eine Chat-Nachricht mit zwei Stickern einspeisen.
  const typen = veroeffentlicht.map((e) => e.type);
  assert.deepEqual(typen, ['chat', 'emote', 'emote']);
  assert.equal(veroeffentlicht[1].sticker?.length, 1, 'je Ereignis GENAU ein Sticker — sonst feuert eine Regel doppelt');
  assert.equal(veroeffentlicht[1].sticker?.[0].id, '42');
});

test('Chat ohne Sticker veröffentlicht nur chat', () => {
  assert.deepEqual(veroeffentlicht.map((e) => e.type), ['chat']);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace apps/desktop run test` → FAIL.

- [ ] **Schritt 3: Umsetzen**

Nach dem Veröffentlichen des `chat`-Ereignisses je Sticker ein `emote`-Ereignis nachschieben — **mit genau einem Sticker in `sticker`**, damit `sticker_ist` nicht mehrfach auf demselben Ereignis trifft. Nutzer und `ts` werden übernommen.

- [ ] **Schritt 4: Tests laufen lassen**

`npm --workspace apps/desktop run test` → 0.

- [ ] **Schritt 5: Den Zähler-Bruch dokumentieren**

`session-stats.ts` zählt `emotes` künftig deutlich höher (bisher nur reine Sticker-Nachrichten — im Mitschnitt: null). In `CHANGELOG.md` unter „Unreleased" einen Satz aufnehmen, der genau das sagt, damit der Sprung in der Auswertung niemanden erschreckt.

- [ ] **Schritt 6: Committen**

```bash
git add apps/desktop/src/main/adapters/ CHANGELOG.md
git commit -m "feat: Sticker im Chat lösen Sticker-Regeln aus"
```

---

### Task 6: Sticker-Seite mit Sound-Zuweisung

**Dateien:**
- Neu: `apps/desktop/src/renderer/pages/StickerPage.tsx`
- Ändern: IPC-Verdrahtung (Vorbild: `grep -rn "gift-catalog" apps/desktop/src/main/ipc*` bzw. `apps/desktop/src/main/main.ts`), Navigation (dort, wo `GalleryPage` eingehängt ist)
- Vorbild (lesen): `apps/desktop/src/renderer/pages/GalleryPage.tsx`
- Test: `apps/desktop/src/renderer/pages/sticker-regel-parity.test.ts` (neu)

**Schnittstellen:**
- Verbraucht: `StickerEintrag[]` (Task 2), `{kind:'sticker_ist'}` (Task 4)
- Liefert: `regelFuerSticker(id: string, soundId: string): TriggerRule`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Der Kern ist, dass die Seite **echte Trigger-Regeln** schreibt und keine Parallelwelt:

```ts
test('regelFuerSticker: erzeugt eine normale Regel, die die Trigger-Seite versteht', () => {
  const r = regelFuerSticker('42', 'sound-7');
  assert.equal(r.event, 'emote');
  assert.deepEqual(r.conditions, [{ kind: 'sticker_ist', value: '42' }]);
  assert.equal(r.actions.length, 1);
  assert.deepEqual(r.actions[0].kind, { kind: 'play_sound', soundId: 'sound-7' });
  assert.equal(r.enabled, true);
  assert.equal(r.cooldownMs, undefined, 'kein Spam-Schutz — ausdrückliche Entscheidung, jeder Sticker feuert');
});

test('regelFuerSticker: zweimal derselbe Sticker ergibt KEINE zweite Regel', () => {
  const bestand = [regelFuerSticker('42', 'sound-7')];
  const neu = regelnMitSticker(bestand, '42', 'sound-9');
  assert.equal(neu.length, 1, 'die bestehende Regel wird geändert, nicht verdoppelt');
  assert.deepEqual(neu[0].actions[0].kind, { kind: 'play_sound', soundId: 'sound-9' });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace apps/desktop run test` → FAIL.

- [ ] **Schritt 3: Regel-Erzeugung schreiben**

In einer eigenen, DOM-freien Datei (`apps/desktop/src/renderer/pages/sticker-regeln.ts`), damit sie prüfbar bleibt und die Seite dünn.

- [ ] **Schritt 4: Tests laufen lassen**

`npm --workspace apps/desktop run test` → 0.

- [ ] **Schritt 5: Seite bauen**

`StickerPage.tsx` nach dem Vorbild von `GalleryPage.tsx`:
- Kachel-Raster mit Bild, „47× gesehen", zuletzt gesehen
- Suche über `passt()` aus `../../shared/suche` (findet eigenen Namen und Nummer)
- Umbenennen je Kachel
- Sound zuweisen über `SoundPlayer` mit Vorhören
- Ein Erklärtext, der sagt: *„Eine Chat-Nachricht mit Sticker löst beides aus — deine Chat-Regeln und deine Sticker-Regeln."*
- Leerer Zustand mit echter Anleitung: *„Noch keine Sticker gesehen. Sie erscheinen hier, sobald jemand im Stream einen schickt — TikTok gibt die Liste vorher nicht heraus. Am schnellsten geht es, wenn du sie einmal selbst per Handy in deinen Live schickst."*

- [ ] **Schritt 6: Prüfen**

`npm run lint`, `npm run typecheck`, `npm run test`, `npm run widget-check` — alle Exit-Code 0.

- [ ] **Schritt 7: Committen**

```bash
git add apps/desktop/src/renderer/ apps/desktop/src/main/
git commit -m "feat: Sticker-Seite mit Sound-Zuweisung"
```

---

## Selbstprüfung nach der Umsetzung

- Wurde ein Wächter-Test gebaut, der **fehlschlägt**, wenn Sticker-Nachrichten wieder verschwinden? (Task 3, Schritt 1) Einmal absichtlich die alte Bedingung wiederherstellen und prüfen, dass der Test rot wird — ein immer-grüner Wächter sieht aus wie ein funktionierender.
- `find . -name "*.webp" -not -path "./node_modules/*"` → keine Treffer.
- Ein bestehendes Overlay ohne Sticker sieht unverändert aus.
