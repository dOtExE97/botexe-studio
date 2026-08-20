# Zuschauer-Daten nutzen — Umsetzungsplan

> **Für agentische Arbeiter:** Diesen Plan Aufgabe für Aufgabe abarbeiten. Schritte sind Checkboxen (`- [ ]`).

**Ziel:** Die Angaben, die TikTok an jeder Nachricht mitliefert — wie lange jemand folgt, im Fanclub ist, Superfan ist, woher er kam, wie groß er selbst ist — auslesen, merken, anzeigen, auswerten und als Trigger-Bedingung nutzbar machen.

**Aufbau:** Eine gemeinsame Auslese-Funktion in der Normalisierung (nicht je Ereignisart einzeln), von dort ins `StudioEvent`, ins Zuschauer-Gedächtnis (`points-store`), in die Zuschauer-Seite, in die Auswertung und in die Trigger-Bedingungen.

**Technik:** TypeScript, Electron, React, `node --test` + `tsx`.

Entwurf: `docs/specs/2026-08-20-zuschauer-daten-design.md`

## Übergreifende Vorgaben

- Sprache im Code und in der Oberfläche: **Deutsch**. Kommentare erklären das *Warum*.
- Prüfen **nur per Exit-Code**: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run widget-check` — alle 0.
- **Nichts releasen.**
- **Höchstwert-Regel:** Angaben zur Beziehung werden als Höchstwert gespeichert, nie überschrieben. Grund steht schon im Code bei `teamLevel` (`points-store.ts`): Nicht jede Nachricht trägt die Angaben, ein Ereignis ohne sie würde den Wert sonst auf 0 setzen. **Ausnahme:** `followerCount` — der ändert sich echt, dort gilt der letzte Wert.
- **Fehlt eine Angabe, gilt eine Bedingung als NICHT erfüllt.** Nie als erfüllt — sonst feuert die Treue-Begrüßung bei Fremden.
- `userMetrics` wird **nicht** ausgewertet (fünf Zahlen ohne bekannte Bedeutung). Nicht raten.
- Neue Einstellungsfelder müssen in die Allowlist von `SETTINGS_UPDATE` (`apps/desktop/src/main.ts`) — hat schon dreimal zugeschlagen, es gibt dafür den Wächter `settings-allowlist.test.ts`.

---

### Task 1: Beziehungs-Angaben auslesen

**Dateien:**
- Ändern: `packages/trigger-engine/src/index.ts` (`StudioEvent`, `StudioUser`)
- Ändern: `apps/desktop/src/main/adapters/tiktok-normalize.ts` (neue Funktion + Aufruf in `normalizeChat`, `normalizeSocial`, `normalizeGift`, `normalizeLike`)
- Test: `apps/desktop/src/main/adapters/tiktok-normalize.test.ts`

**Schnittstellen:**
- Liefert: `beziehungAuslesen(data: unknown): StudioBeziehung | undefined`, `StudioEvent.beziehung`, `StudioEvent.herkunft`, `StudioUser.followerCount`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Werte aus dem echten Mitschnitt vom 20.08.2026:

```ts
const ECHTE_TAGS = {
  publicAreaMessageCommon: { portraitInfo: { portraitTag: [
    { tagId: '7399855526094195474', priority: '2', showValue: 'ttlive_ls_msgGroups_viewerLabel_followedDays', showArgs: '{"s_num":"437","num":"437"}' },
    { tagId: '7399855526094359314', priority: '5', showValue: 'ttlive_ls_msgGroups_viewerLabel_memberDays', showArgs: '{"s_num":"424","num":"424"}' },
    { tagId: '7399855526094261010', priority: '7', showValue: 'ttlive_ls_msgGroups_viewerLabel_subForMo', showArgs: '{"s_num":"2"}' },
  ] } },
};

test('beziehungAuslesen: Tage und Monate aus den echten Etiketten', () => {
  const b = beziehungAuslesen(ECHTE_TAGS);
  assert.equal(b?.folgtSeitTagen, 437);
  assert.equal(b?.fanclubSeitTagen, 424);
  assert.equal(b?.superfanSeitMonaten, 2);
});

test('beziehungAuslesen: notFollower und topGifter', () => {
  const b = beziehungAuslesen({ publicAreaMessageCommon: { portraitInfo: { portraitTag: [
    { showValue: 'ttlive_ls_msgGroups_viewerLabel_notFollower', showArgs: '' },
    { showValue: 'ttlive_ls_msgGroups_viewerLabel_topGifter', showArgs: '' },
  ] } } });
  assert.equal(b?.folgtNicht, true);
  assert.equal(b?.istTopGifter, true);
});

test('beziehungAuslesen: kaputtes showArgs wirft nicht, Etikett überlebt ohne Zahl', () => {
  const b = beziehungAuslesen({ publicAreaMessageCommon: { portraitInfo: { portraitTag: [
    { showValue: 'ttlive_ls_msgGroups_viewerLabel_followedDays', showArgs: '{kaputt' },
  ] } } });
  assert.equal(b?.folgtSeitTagen, undefined, 'keine erfundene Zahl');
});

test('beziehungAuslesen: unbekannte Endung wird ignoriert, nicht geraten', () => {
  const b = beziehungAuslesen({ publicAreaMessageCommon: { portraitInfo: { portraitTag: [
    { showValue: 'ttlive_ls_msgGroups_viewerLabel_waskomplettneues', showArgs: '{"num":"5"}' },
  ] } } });
  assert.equal(b, undefined, 'nichts Bekanntes dabei → gar keine Angabe');
});

test('beziehungAuslesen: ohne portraitTag undefined', () => {
  assert.equal(beziehungAuslesen({}), undefined);
});

test('normalizeChat: Beziehung landet am Ereignis', () => {
  const e = normalizeChat({ user: { userId: '1' }, content: 'hi', ...ECHTE_TAGS }, 1000);
  assert.equal(e.beziehung?.folgtSeitTagen, 437);
});

test('normalizeSocial: clientEnterSource landet als herkunft am join', () => {
  const e = normalizeSocial({ user: { userId: '1' }, clientEnterSource: 'live_merge-live_cover' }, 'join', 1000);
  assert.equal(e.herkunft, 'live_merge-live_cover');
});

test('toUser: followerCount des Zuschauers wird gelesen', () => {
  const e = normalizeChat({ user: { userId: '1', followInfo: { followerCount: '1932', followingCount: '191' } }, content: 'hi' }, 1000);
  assert.equal(e.user?.followerCount, 1932);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace apps/desktop run test` → FAIL.

- [ ] **Schritt 3: Typen ergänzen**

In `packages/trigger-engine/src/index.ts`:

```ts
/** Was TikTok an fast jeder Nachricht über die Beziehung dieses Zuschauers zum
 *  Kanal mitliefert (portraitTag). Lag immer an und wurde immer verworfen. */
export interface StudioBeziehung {
  folgtSeitTagen?: number;
  fanclubSeitTagen?: number;
  superfanSeitMonaten?: number;
  istTopGifter?: boolean;
  folgtNicht?: boolean;
}
```

am `StudioEvent`:

```ts
beziehung?: StudioBeziehung;
/** Nur bei 'join': woher der Zuschauer kam (TikToks clientEnterSource, ROH).
 *  Die möglichen Werte sind nicht dokumentiert — deshalb wird nichts in
 *  erfundene Schubladen einsortiert. */
herkunft?: string;
```

am `StudioUser`: `followerCount?: number;` und `followingCount?: number;`

- [ ] **Schritt 4: Auslesen schreiben**

In `tiktok-normalize.ts` **eine** Funktion, die von allen Normalisierern genutzt wird — nicht je Ereignisart abschreiben (siehe „doppeltes Wissen" in AGENTS.md):

```ts
/** TikToks Etiketten am Zuschauer. `showValue` ist ein Übersetzungsschlüssel;
 *  ausgewertet wird die Endung nach dem letzten `_`. Unbekannte Endungen werden
 *  ignoriert — TikTok erfindet neue, und Raten gehört nicht ins Produkt.
 *  `showArgs` ist ein JSON-STRING, kein Objekt. */
export function beziehungAuslesen(data: unknown): StudioBeziehung | undefined { … }
```

Zahl-Entnahme: `JSON.parse(showArgs)` in `try/catch`, dann `num` (Rückfall `s_num`) über `parseInt`. Ein Fehlschlag darf nur die Zahl kosten, nie das Ereignis.

Aufrufen in `normalizeChat`, `normalizeGift`, `normalizeLike`, `normalizeSocial`.

- [ ] **Schritt 5: Tests laufen lassen**

`npm --workspace apps/desktop run test` und `npm run typecheck` → beide 0.

- [ ] **Schritt 6: Committen**

```bash
git add packages/trigger-engine/src/index.ts apps/desktop/src/main/adapters/
git commit -m "feat: TikToks Zuschauer-Etiketten auslesen (folgt seit, Fanclub, Superfan)"
```

---

### Task 2: Zuschauer-Gedächtnis erweitern

**Dateien:**
- Ändern: `apps/desktop/src/main/services/points-store.ts` (`PointsEntry` ab Zeile 40, Aktualisierungs-Logik)
- Test: `apps/desktop/src/main/services/points-store.test.ts`

**Schnittstellen:**
- Verbraucht: `StudioEvent.beziehung`, `StudioEvent.herkunft`, `StudioUser.followerCount`
- Liefert: `PointsEntry.folgtSeitTagen`, `.fanclubSeitTagen`, `.superfanSeitMonaten`, `.istTopGifter`, `.followerCount`, `.herkunft`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
test('Beziehungs-Angaben werden als HÖCHSTWERT gemerkt', () => {
  const s = neuerStore();
  s.verarbeite({ type: 'chat', ts: 1, user: { id: '1', nickname: 'A' }, beziehung: { folgtSeitTagen: 437 } });
  s.verarbeite({ type: 'chat', ts: 2, user: { id: '1', nickname: 'A' } }); // ohne Etiketten!
  assert.equal(s.eintrag('1')?.folgtSeitTagen, 437, 'Nachricht ohne Etiketten darf nichts zurücksetzen');
});

test('followerCount nimmt den LETZTEN Wert — der ändert sich echt', () => {
  const s = neuerStore();
  s.verarbeite({ type: 'chat', ts: 1, user: { id: '1', nickname: 'A', followerCount: 1932 } });
  s.verarbeite({ type: 'chat', ts: 2, user: { id: '1', nickname: 'A', followerCount: 1800 } });
  assert.equal(s.eintrag('1')?.followerCount, 1800);
});

test('herkunft wird beim Beitritt gemerkt', () => {
  const s = neuerStore();
  s.verarbeite({ type: 'join', ts: 1, user: { id: '1', nickname: 'A' }, herkunft: 'live_merge-live_cover' });
  assert.equal(s.eintrag('1')?.herkunft, 'live_merge-live_cover');
});
```

Den tatsächlichen Aufbau (`neuerStore`, Methodennamen) aus `points-store.test.ts` übernehmen — dort steht das Muster.

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace apps/desktop run test` → FAIL.

- [ ] **Schritt 3: Felder und Höchstwert-Regel einbauen**

Felder wie im Entwurf, mit Kommentar am Höchstwert (Verweis auf denselben Grund wie bei `teamLevel`).

- [ ] **Schritt 4: Tests laufen lassen**

`npm --workspace apps/desktop run test` → 0.

- [ ] **Schritt 5: Committen**

```bash
git add apps/desktop/src/main/services/points-store.ts apps/desktop/src/main/services/points-store.test.ts
git commit -m "feat: Zuschauer-Gedaechtnis merkt Treue-Angaben und Herkunft"
```

---

### Task 3: Trigger-Bedingungen für Treue

**Dateien:**
- Ändern: `packages/trigger-engine/src/index.ts` (`TriggerCondition` ~171-208, `conditionHolds` ~488)
- Ändern: Trigger-Oberfläche (`apps/desktop/src/renderer/pages/TriggersPage.tsx`) — Auswahl der neuen Bedingungen
- Test: Testdatei der Trigger-Engine

**Schnittstellen:**
- Liefert: `{kind:'folgt_seit_tagen_gte'; value:number}`, `{kind:'ist_top_gifter'}`, `{kind:'follower_count_gte'; value:number}`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Ist `conditionHolds` nicht exportiert, den Test über eine Regel und `engine.evaluate(ev)` führen — dann prüft er zusätzlich den echten Weg. `haelt(...)` steht unten stellvertretend für den in der Testdatei üblichen Zugang; die vorhandenen Tests zeigen das Muster.

```ts
test('folgt_seit_tagen_gte: trifft ab der Schwelle', () => {
  const ev = { type: 'chat', ts: 1, beziehung: { folgtSeitTagen: 437 } } as StudioEvent;
  assert.equal(haelt({ kind: 'folgt_seit_tagen_gte', value: 100 }, ev), true);
  assert.equal(haelt({ kind: 'folgt_seit_tagen_gte', value: 500 }, ev), false);
});

test('folgt_seit_tagen_gte: OHNE Angabe nicht erfüllt', () => {
  const ev = { type: 'chat', ts: 1 } as StudioEvent;
  assert.equal(haelt({ kind: 'folgt_seit_tagen_gte', value: 1 }, ev), false,
    'sonst begrüßt die Treue-Regel jeden Fremden');
});

test('ist_top_gifter', () => {
  assert.equal(haelt({ kind: 'ist_top_gifter' }, { type: 'chat', ts: 1, beziehung: { istTopGifter: true } } as StudioEvent), true);
  assert.equal(haelt({ kind: 'ist_top_gifter' }, { type: 'chat', ts: 1 } as StudioEvent), false);
});

test('follower_count_gte: der Zuschauer selbst ist groß', () => {
  const ev = { type: 'chat', ts: 1, user: { id: '1', followerCount: 20000 } } as StudioEvent;
  assert.equal(haelt({ kind: 'follower_count_gte', value: 10000 }, ev), true);
  assert.equal(haelt({ kind: 'follower_count_gte', value: 10000 }, { type: 'chat', ts: 1 } as StudioEvent), false);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace packages/trigger-engine run test` → FAIL.

- [ ] **Schritt 3: Bedingungen ergänzen**

```ts
/** Wie lange dieser Zuschauer dir schon folgt. TikTok liefert es an fast jeder
 *  Nachricht mit — „seit 437 Tagen dabei" ohne eigenes Mitzählen.
 *  FEHLT die Angabe, gilt die Bedingung als NICHT erfüllt. */
| { kind: 'folgt_seit_tagen_gte'; value: number }
/** TikTok markiert diesen Zuschauer als Top-Schenker. */
| { kind: 'ist_top_gifter' }
/** Der Zuschauer hat selbst mindestens so viele Follower. */
| { kind: 'follower_count_gte'; value: number }
```

In `conditionHolds` je einen `case`. Bei fehlender Angabe **immer** `false`.

- [ ] **Schritt 4: Tests laufen lassen**

`npm --workspace packages/trigger-engine run test` → 0.

- [ ] **Schritt 5: In der Trigger-Oberfläche auswählbar machen**

In `TriggersPage.tsx` dem Muster der bestehenden Bedingungen folgen. Beschreibungen in Erzähler-Form, z. B. *„Feuert nur bei Leuten, die dir schon länger als … Tage folgen. Wer neu ist, löst nichts aus."*

- [ ] **Schritt 6: Prüfen und committen**

`npm run lint && npm run typecheck && npm run test` → alle 0.

```bash
git add packages/trigger-engine/src/ apps/desktop/src/renderer/pages/TriggersPage.tsx
git commit -m "feat: Trigger-Bedingungen fuer Treue, Top-Gifter und Kanalgroesse"
```

---

### Task 4: Zuschauer-Seite aufwerten

**Dateien:**
- Ändern: `apps/desktop/src/renderer/pages/ViewersPage.tsx` (heute 234 Zeilen)
- Neu (falls die Seite über ~400 Zeilen wächst): `apps/desktop/src/renderer/pages/viewers-zeile.tsx`
- Test: `apps/desktop/src/renderer/pages/viewers-sortierung.test.ts` (neu)

**Schnittstellen:**
- Verbraucht: `PointsEntry` aus Task 2
- Liefert: `sortiereZuschauer(liste: PointsEntry[], nach: SortSchluessel): PointsEntry[]`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
test('sortiereZuschauer: nach Treue, Unbekanntes ganz hinten', () => {
  const liste = [
    { id: 'a', nickname: 'A', points: 0 },
    { id: 'b', nickname: 'B', points: 0, folgtSeitTagen: 437 },
    { id: 'c', nickname: 'C', points: 0, folgtSeitTagen: 12 },
  ] as PointsEntry[];
  assert.deepEqual(sortiereZuschauer(liste, 'treue').map((e) => e.id), ['b', 'c', 'a'],
    'wer keine Angabe hat, steht hinten — nicht bei 0 Tagen einsortiert');
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npm --workspace apps/desktop run test` → FAIL.

- [ ] **Schritt 3: Sortierung schreiben, Test grün**

- [ ] **Schritt 4: Seite erweitern**

Pro Zuschauer: Profilbild, „folgt seit 437 Tagen", Fanclub-Dauer, Superfan-Monate, Top-Gifter-Abzeichen, eigene Follower-Zahl, Besuche, zuletzt gesehen. Sortier- und filterbar.

**Fehlende Angaben zeigen „—", niemals „0 Tage".** Der Unterschied zwischen „unbekannt" und „null" ist genau der Punkt.

- [ ] **Schritt 5: Prüfen und committen**

`npm run lint && npm run typecheck && npm run test` → 0.

```bash
git add apps/desktop/src/renderer/pages/
git commit -m "feat: Zuschauer-Seite zeigt Treue, Herkunft und Kanalgroesse"
```

---

### Task 5: Auswertung erweitern

**Dateien:**
- Ändern: `apps/desktop/src/main/services/stats-history.ts` (`StatsTotals`, Zusammenzählen ~Zeile 111)
- Ändern: `apps/desktop/src/renderer/pages/AnalysePage.tsx` bzw. `analyse-teile.tsx`
- Test: `apps/desktop/src/main/services/stats-history.test.ts`

**Schnittstellen:**
- Verbraucht: `StudioEvent.herkunft`, `StudioEvent.beziehung`
- Liefert: `StatsTotals.herkunft?: Record<string, number>`, `.treueVerteilung?: {neu:number; wochen:number; monate:number; jahr:number}`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
test('Alte Einträge ohne die neuen Felder ergeben „unbekannt", nicht 0', () => {
  const summe = fasseZusammen([{ /* alter Eintrag ohne herkunft */ } as StatsHistoryEntry]);
  assert.equal(summe.herkunft, undefined, 'nicht {} — sonst zeigt die Seite „0 aus FYP" statt „keine Daten"');
});

test('Herkunft wird über Sitzungen aufsummiert', () => {
  const summe = fasseZusammen([
    { herkunft: { 'live_merge-live_cover': 3 } } as StatsHistoryEntry,
    { herkunft: { 'live_merge-live_cover': 2, unbekannt: 1 } } as StatsHistoryEntry,
  ]);
  assert.deepEqual(summe.herkunft, { 'live_merge-live_cover': 5, unbekannt: 1 });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Schritt 3: Zusammenzählen schreiben, Test grün**

- [ ] **Schritt 4: Drei Abschnitte in der Auswertung ergänzen**

- **Woher kamen sie** — Verteilung über `herkunft`, rohe Werte anzeigen, nichts einsortieren
- **Sichtbar gegen tatsächlich** — `totalUser` gegen Höchststand gegen `anonymous`
- **Treue** — neu / Wochen / Monate / über ein Jahr

Für Zeiträume ohne Daten: „Dafür gibt es noch keine Zahlen" statt einer leeren Null-Grafik.

- [ ] **Schritt 5: Prüfen und committen**

`npm run lint && npm run typecheck && npm run test` → 0.

```bash
git add apps/desktop/src/main/services/stats-history.ts apps/desktop/src/renderer/pages/
git commit -m "feat: Auswertung zeigt Herkunft, echte Reichweite und Treue"
```

---

### Task 6: Inventar nachziehen

**Dateien:**
- Ändern: `docs/tiktok-datenquellen.md` (Abschnitt 1.3)

- [ ] **Schritt 1: Einträge umschreiben**

Die in Abschnitt 1.3 als „ungelesen" vermerkten Felder (`portraitTag`, `clientEnterSource`, `followInfo.followerCount`) sind nach diesem Plan gelesen. Zeilen entsprechend verschieben und mit den Fundstellen versehen, an denen sie jetzt ausgewertet werden.

- [ ] **Schritt 2: Committen**

```bash
git add docs/tiktok-datenquellen.md
git commit -m "docs: Zuschauer-Felder sind nicht mehr ungelesen"
```

---

## Selbstprüfung nach der Umsetzung

- Wächter gegenprobieren: die Höchstwert-Regel absichtlich auf „letzter Wert" umstellen — der Test aus Task 2 muss rot werden.
- Prüfen, dass keine Oberfläche „0 Tage" zeigt, wo „unbekannt" gemeint ist.
- `npm run lint && npm run typecheck && npm run test && npm run widget-check` — alle Exit-Code 0.
