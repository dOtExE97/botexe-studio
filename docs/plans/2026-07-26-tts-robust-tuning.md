# TTS zuverlässig + pro Anbieter einstellbar — Umsetzungsplan

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development
> oder superpowers:executing-plans, Task für Task. Checkbox-Syntax.

**Ziel:** (A) TTS bleibt nie mehr stumm, wenn der Online-Dienst hängt, und (B) jeder Anbieter
bekommt die Regler, die er wirklich unterstützt.

**Architektur:** Reine Entscheidungs-/Auflösungs-Logik in testbaren Funktionen; die Engines
bekommen ein anbieter-spezifisches Tuning-Objekt durchgereicht. Gespeichert wird pro Anbieter
(`tts.tuning.<provider>`), damit ein Regler nie „ins Leere" wirkt.

**Tech Stack:** TS (main-Prozess: `tts-service.ts`, `tts-providers.ts`, `tts-byok.ts`,
`settings-store.ts`, `main.ts`), React (`TtsPage.tsx`), Tests unter `node:test`.

## Global Constraints
- Verifikation nur per Exit-Code: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run widget-check` — alle **0**.
- Tests unter **`node:test`** (Sibling-Idiom spiegeln, NICHT Vitest). **Keine echten Netzwerk-
  Calls in Tests** — Engines mocken bzw. nur pure Funktionen testen.
- Deutsch in Code/UI, UI-Texte in Erzähler-Form.
- **Rückwärtskompatibel**: bestehende `tts.rate`/`tts.pitch` dürfen NICHT verloren gehen
  (Migration nach `tuning.edge`). Bestehende Stimmen-IDs bleiben gültig.
- **Allowlist-Pflicht**: jedes neue Einstellungs-Feld muss im `SETTINGS_UPDATE`-Handler
  (`main.ts`) freigeschaltet werden — sonst wird es still verworfen (schon 3× passiert).
  Der Wächter-Test `settings-allowlist.test.ts` deckt bisher nur die oberste Ebene ab.
- Nichts releasen ohne Freigabe.

---

### Task 1: Zuverlässigkeit — kürzere Timeouts + Ausweichen auf die lokale Stimme

**Files:**
- Modify: `apps/desktop/src/main/services/tts-service.ts` (Timeout, Versuche, Fallback)
- Modify: `apps/desktop/src/main/services/tts-providers.ts` (Edge-`timeout` explizit setzen)
- Test: `apps/desktop/src/main/services/tts-service.test.ts` (erweitern)

**Interfaces:**
- Consumes: `PiperRuntime` (`hasBinary()`, `voiceReady(id)`), `PIPER_VOICES`, `normalizeVoiceId`,
  `isTransientTtsError`, `this.onError`.
- Produces: pure `pickLocalFallbackVoice(piper, currentVoice)` → `string | null` (ID einer
  einsatzbereiten Piper-Stimme, oder null) — von Task 3/4 nicht weiter benötigt.

- [ ] **Schritt 1: Failing test — Fallback-Auswahl (rein, ohne DOM/Netz)**

```ts
import { pickLocalFallbackVoice } from './tts-service';
const piperFake = (readyIds: string[]) => ({
  hasBinary: () => readyIds.length > 0,
  voiceReady: (id: string) => readyIds.includes(id),
});
test('pickLocalFallbackVoice: nimmt eine bereite Piper-Stimme, wenn online scheitert', () => {
  expect(pickLocalFallbackVoice(piperFake(['de-karlsson']) as never, 'edge:de-DE-KatjaNeural'))
    .toBe('piper:de-karlsson');
});
test('pickLocalFallbackVoice: nichts bereit ⇒ null', () => {
  expect(pickLocalFallbackVoice(piperFake([]) as never, 'edge:de-DE-KatjaNeural')).toBe(null);
});
test('pickLocalFallbackVoice: schon lokal ⇒ null (kein Ringelreihen)', () => {
  expect(pickLocalFallbackVoice(piperFake(['de-karlsson']) as never, 'piper:de-karlsson')).toBe(null);
});
```
(Genaue Piper-IDs aus `PIPER_VOICES` in `tts-providers.ts` übernehmen — die Test-IDs oben ggf.
an die echten anpassen.)

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: Helfer implementieren** (in `tts-service.ts`, exportiert)

```ts
/** Einsatzbereite lokale Stimme als Notnagel, wenn die Online-Stimme streikt.
 *  Gibt null zurück, wenn die aktuelle Stimme schon lokal ist (kein Kreisverkehr)
 *  oder nichts vorbereitet wurde. */
export function pickLocalFallbackVoice(piper: PiperRuntime, currentVoice: string): string | null {
  if (normalizeVoiceId(currentVoice).startsWith('piper:')) return null;
  if (!piper.hasBinary?.()) return null;
  const ready = PIPER_VOICES.find((v) => piper.voiceReady(v.id));
  return ready ? `piper:${ready.id}` : null;
}
```

- [ ] **Schritt 4: Test grün** → PASS.

- [ ] **Schritt 5: Timeouts kürzen + Fallback in die Warteschlange einbauen**

In `tts-service.ts`:
- `const SYNTH_TIMEOUT_MS = 7_000;` (war 12_000).
- Versuchsschleife: `attempt <= 2` (war 3) — schnell scheitern, dann ausweichen.
- Nach der Schleife, wenn `!playback`:
```ts
if (!playback) {
  const local = pickLocalFallbackVoice(this.piper, item.voice);
  if (local) {
    log.warn('TTS', `Online-Stimme nicht erreichbar (${lastMsg}) → lokale Stimme ${local}`);
    try { playback = await this.synthesize(item.text, local); } catch (err) {
      lastMsg = (err as Error)?.message || lastMsg;
    }
  }
}
```
Danach wie bisher: `playback` → abspielen, sonst `log.error` + `this.onError?.(…)`.
Die Fehlermeldung an die Oberfläche soll den Klartext-Tipp enthalten, z.B.
`Sprachausgabe fehlgeschlagen: <Grund>. Tipp: unter „Stimme" eine lokale Piper-Stimme vorbereiten — die läuft ohne Internet.`

In `tts-providers.ts` `edgeSynthesize`: der `EdgeTTS`-Konstruktor akzeptiert `timeout` (ms) —
explizit auf denselben Wert wie `SYNTH_TIMEOUT_MS` setzen (Konstante teilen/exportieren), damit
die Bibliothek nicht mit ihrem eigenen (längeren) Default hängt.

- [ ] **Schritt 6: Checks + Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run widget-check` → 0.
```bash
git add apps/desktop/src/main/services/tts-service.ts apps/desktop/src/main/services/tts-providers.ts apps/desktop/src/main/services/tts-service.test.ts
git commit -m "fix(tts): kürzere Timeouts + Ausweichen auf die lokale Stimme, wenn online streikt"
```

---

### Task 2: Tuning-Schema pro Anbieter + Speicherung + Allowlist

**Files:**
- Create: `apps/desktop/src/main/services/tts-tuning.ts` (Schema + Auflösung, rein)
- Create: `apps/desktop/src/main/services/tts-tuning.test.ts`
- Modify: `apps/desktop/src/main/services/settings-store.ts` (`tuning` + Migration)
- Modify: `apps/desktop/src/main.ts` (tts-Unterliste um `tuning` erweitern)
- Modify: `apps/desktop/src/main/services/settings-allowlist.test.ts` (auch tts-Unterfelder prüfen)

**Interfaces:**
- Produces:
  - `TUNING_SPECS: Record<string, TuningParam[]>` mit
    `TuningParam = { key; label; hint; min?; max?; step?; default: number|string; options?: {value,label}[] }`
  - `resolveTuning(provider: string, saved?: Record<string, unknown>): Record<string, number|string>`
    — füllt fehlende Werte mit den Vorgaben und klemmt Zahlen in `min..max`.

- [ ] **Schritt 1: Failing tests**

```ts
import { TUNING_SPECS, resolveTuning } from './tts-tuning';
test('jeder Anbieter mit Reglern hat Vorgaben', () => {
  for (const [prov, params] of Object.entries(TUNING_SPECS)) {
    expect(params.length, prov).toBeGreaterThan(0);
    for (const p of params) expect(p.default, `${prov}.${p.key}`).toBeDefined();
  }
});
test('resolveTuning füllt Vorgaben und klemmt Ausreißer', () => {
  const t = resolveTuning('edge', { rate: 999 });
  expect(t.rate).toBe(50);        // auf max geklemmt
  expect(t.pitch).toBe(0);        // Vorgabe ergänzt
});
test('resolveTuning: unbekannter Anbieter ⇒ leeres Objekt', () => {
  expect(resolveTuning('gibtsnicht', {})).toEqual({});
});
```

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: `tts-tuning.ts` implementieren** — Regler je Anbieter (Werte aus der Recherche):

```ts
export interface TuningParam {
  key: string; label: string; hint: string;
  min?: number; max?: number; step?: number;
  default: number | string;
  options?: Array<{ value: string; label: string }>;
}
export const TUNING_SPECS: Record<string, TuningParam[]> = {
  edge: [
    { key: 'rate',   label: 'Tempo',      hint: 'Wie schnell gesprochen wird.',      min: -50, max: 50, step: 5, default: 0 },
    { key: 'pitch',  label: 'Tonhöhe',    hint: 'Höher oder tiefer als normal.',     min: -20, max: 20, step: 2, default: 0 },
    { key: 'volume', label: 'Lautstärke', hint: 'Zusätzlich zur Mixer-Lautstärke.',  min: -50, max: 50, step: 5, default: 0 },
  ],
  piper: [
    { key: 'lengthScale',     label: 'Tempo',              hint: 'Kleiner = schneller gesprochen.',                    min: 0.5, max: 2,   step: 0.05, default: 1 },
    { key: 'noiseScale',      label: 'Ausdruck',           hint: 'Höher = lebendiger, aber unruhiger.',                min: 0,   max: 1,   step: 0.05, default: 0.667 },
    { key: 'noiseW',          label: 'Aussprache-Variation', hint: 'Höher = weniger monoton, kann nuscheln.',          min: 0,   max: 1,   step: 0.05, default: 0.8 },
    { key: 'sentenceSilence', label: 'Pause zwischen Sätzen', hint: 'Sekunden Stille nach jedem Satz.',                min: 0,   max: 2,   step: 0.1,  default: 0.2 },
  ],
  openai: [
    { key: 'speed',   label: 'Tempo',    hint: '1 = normal, 2 = doppelt so schnell.', min: 0.25, max: 4, step: 0.05, default: 1 },
    { key: 'quality', label: 'Qualität', hint: 'HD klingt besser, kostet mehr.', default: 'tts-1',
      options: [{ value: 'tts-1', label: 'Standard' }, { value: 'tts-1-hd', label: 'HD' }] },
  ],
  polly: [
    { key: 'engine', label: 'Qualität', hint: 'Neural klingt deutlich natürlicher.', default: 'neural',
      options: [{ value: 'standard', label: 'Standard' }, { value: 'neural', label: 'Neural' }] },
  ],
  elevenlabs: [
    { key: 'stability',  label: 'Stabilität',  hint: 'Höher = gleichmäßiger, niedriger = ausdrucksstärker.', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'similarity', label: 'Ähnlichkeit', hint: 'Wie nah an der Original-Stimme.',                       min: 0, max: 1, step: 0.05, default: 0.75 },
    { key: 'style',      label: 'Stil',        hint: 'Mehr Betonung — kann instabiler klingen.',              min: 0, max: 1, step: 0.05, default: 0 },
  ],
  gtts: [
    { key: 'slow', label: 'Langsam sprechen', hint: 'Deutlicher, aber schleppend.', default: 0, min: 0, max: 1, step: 1 },
  ],
};
export function resolveTuning(provider: string, saved?: Record<string, unknown>): Record<string, number | string> {
  const spec = TUNING_SPECS[provider];
  if (!spec) return {};
  const out: Record<string, number | string> = {};
  for (const p of spec) {
    const raw = saved?.[p.key];
    if (typeof p.default === 'string') {
      const ok = p.options?.some((o) => o.value === raw);
      out[p.key] = ok ? (raw as string) : p.default;
    } else {
      const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.default as number;
      out[p.key] = Math.min(p.max ?? n, Math.max(p.min ?? n, n));
    }
  }
  return out;
}
```

- [ ] **Schritt 4: Test grün** → PASS.

- [ ] **Schritt 5: Schema + Migration** (`settings-store.ts`)

`TTSSettings` um `tuning: Record<string, Record<string, number | string>>` erweitern (Default `{}`).
Migration beim Laden: sind `rate`/`pitch` gesetzt und `tuning.edge` fehlt, daraus
`tuning.edge = { rate, pitch }` bauen (bestehende Einstellungen gehen nicht verloren). `rate`/`pitch`
bleiben vorerst im Schema (Task 3 liest nur noch `tuning`), damit alte Stände weiterlaufen.

- [ ] **Schritt 6: Allowlist + Wächter-Test erweitern**

`main.ts`, im `p.tts`-Block ergänzen:
```ts
...(typeof t.tuning === 'object' && t.tuning !== null ? { tuning: t.tuning as TTSSettings['tuning'] } : {}),
```
(Werte werden ohnehin beim Anwenden über `resolveTuning` geklemmt.)
`settings-allowlist.test.ts` zusätzlich prüfen: alle im Renderer per `update({ … })` gesetzten
**tts-Unterfelder** kommen im `p.tts`-Block als `t.<feld>` vor. (Renderer-Quelle: `TtsPage.tsx`
`update({...})`-Aufrufe.) Mutations-Gegenprobe wie beim bestehenden Test.

- [ ] **Schritt 7: Checks + Commit**

```bash
git add apps/desktop/src/main/services/tts-tuning.ts apps/desktop/src/main/services/tts-tuning.test.ts apps/desktop/src/main/services/settings-store.ts apps/desktop/src/main.ts apps/desktop/src/main/services/settings-allowlist.test.ts
git commit -m "feat(tts): Tuning-Schema pro Anbieter + Speicherung (inkl. Allowlist & Wächter-Test)"
```

---

### Task 3: Tuning in allen Engines anwenden

**Files:**
- Modify: `apps/desktop/src/main/services/tts-providers.ts` (edge/piper/gtts + `synthesizeWith`)
- Modify: `apps/desktop/src/main/services/tts-byok.ts` (openai/polly/elevenlabs)
- Modify: `apps/desktop/src/main/services/tts-service.ts` + `studio.ts` (Tuning durchreichen)
- Test: `apps/desktop/src/main/services/tts-tuning.test.ts` erweitern (Argument-Bau, ohne Netz)

**Interfaces:**
- Consumes: `resolveTuning(provider, saved)` (Task 2), `settings.peek().tts.tuning`.
- Produces: `piperArgs(tuning)` → `string[]` (CLI-Flags) — testbar ohne Piper-Binary.

- [ ] **Schritt 1: Failing test — Piper-CLI-Argumente**

```ts
import { piperArgs } from './tts-providers';
test('piperArgs setzt Tempo/Ausdruck/Pausen', () => {
  const a = piperArgs({ lengthScale: 1.2, noiseScale: 0.5, noiseW: 0.6, sentenceSilence: 0.3 });
  expect(a).toContain('--length_scale'); expect(a).toContain('1.2');
  expect(a).toContain('--noise_scale'); expect(a).toContain('--noise_w'); expect(a).toContain('--sentence_silence');
});
test('piperArgs ohne Tuning ⇒ keine Flags', () => { expect(piperArgs({})).toEqual([]); });
```

- [ ] **Schritt 2: Test rot** → FAIL.

- [ ] **Schritt 3: Anwenden**

- `piperArgs(tuning)` exportieren und in `PiperRuntime.synthesize(text, voiceId, target, tuning?)`
  an `spawn(this.binPath(), ['--model', model, '--output_file', target, ...piperArgs(tuning)])` hängen.
- `edgeSynthesize`: zusätzlich `volume: fmtSigned(tuning.volume ?? 0, '%')` und `timeout`.
- `gttsSynthesize`: `slow` berücksichtigen (falls die genutzte URL/Lib das unterstützt — sonst
  Parameter weglassen UND den Regler in Task 2 aus `TUNING_SPECS.gtts` entfernen, statt einen
  toten Regler zu zeigen).
- `synthesizeWith(...)`: Signatur auf `tuning?: Record<string, number|string>` umstellen und je
  Zweig durchreichen.
- `tts-byok.ts` `byokSynthesize(..., tuning?)`: elevenlabs → `voice_settings: {stability,
  similarity_boost, style}`; openai → `speed`, `model` aus `quality` (Zugangsdaten-`model`
  gewinnt weiterhin, wenn gesetzt); polly → `Engine`.
- `tts-service.ts`: `getTuning` liefert künftig **pro Anbieter** aufgelöstes Tuning:
  `getTuning?: (provider: string) => Record<string, number|string>`; in `synthesize()` den
  Namespace bestimmen und `this.getTuning?.(ns)` durchreichen (an BYOK **und** `synthesizeWith`).
- `studio.ts` (Zeile ~233): statt `{rate, pitch}` jetzt
  `(provider) => resolveTuning(provider, this.settings.peek().tts.tuning?.[provider])`.

- [ ] **Schritt 4: Test grün + Checks + Commit**

```bash
git add apps/desktop/src/main/services/tts-providers.ts apps/desktop/src/main/services/tts-byok.ts apps/desktop/src/main/services/tts-service.ts apps/desktop/src/main/services/studio.ts apps/desktop/src/main/services/tts-tuning.test.ts
git commit -m "feat(tts): Tuning wirkt in allen Engines (Piper-Flags, Edge-Volume/Timeout, BYOK-Parameter)"
```

---

### Task 4: Oberfläche — nur die Regler der gewählten Stimme

**Files:**
- Modify: `apps/desktop/src/renderer/pages/TtsPage.tsx`
- Modify: ggf. `apps/desktop/src/main.ts` (IPC, falls `TUNING_SPECS` in den Renderer muss)

- [ ] **Schritt 1: Regler datengetrieben rendern**

Die bisherigen festen Regler „Tempo/Tonhöhe" ersetzen durch eine Liste, die aus `TUNING_SPECS`
für den **Namespace der aktuell gewählten Stimme** erzeugt wird (`edge`/`piper`/`openai`/…).
- Zahl-Parameter → Schieberegler mit Wert-Anzeige; `options` → Auswahlfeld.
- Jeder Regler zeigt seinen `hint` als kurze Erklärung (nicht nur als Tooltip).
- Änderung schreibt nach `tuning[provider][key]` und schickt `update({ tuning: … })`.
- Knopf **„Auf Standard zurücksetzen"** je Anbieter (setzt dessen Werte auf die Vorgaben).
- Überschrift nennt den Anbieter, z.B. „Feineinstellung — Lokal (Piper)".
- `TUNING_SPECS` erreicht den Renderer entweder über einen bestehenden Settings-/Voices-IPC oder
  einen kleinen neuen Kanal; **prüfen, was schon da ist** (`getVoiceGroups` wird bereits geliefert)
  und den vorhandenen Weg nutzen, statt einen neuen zu erfinden.
- Lautstärke (`tts.volume`, wirkt global) bleibt separat stehen.

- [ ] **Schritt 2: Sicht-Prüfung**

TTS-Seite mit (a) einer Edge-Stimme und (b) einer Piper-Stimme rendern und anschauen: es
erscheinen jeweils die passenden Regler, mit Erklärung, nichts läuft aus dem Panel.

- [ ] **Schritt 3: Checks + Commit**

```bash
git add apps/desktop/src/renderer/pages/TtsPage.tsx apps/desktop/src/main.ts
git commit -m "feat(tts): Feineinstellung zeigt nur die Regler der gewählten Stimme (je Anbieter)"
```

---

## Self-Review (gegen das Spec)
- **Kürzere Timeouts + weniger Versuche:** Task 1. ✓
- **Ausweichen auf lokale Stimme statt Stille:** Task 1 (`pickLocalFallbackVoice`). ✓
- **Sichtbarer Hinweis statt Stille:** Task 1 (`onError` mit Klartext-Tipp). ✓
- **Regler pro Anbieter als Daten + Speicherung + Allowlist + Wächter:** Task 2. ✓
- **Wirkung in allen Engines (Piper endlich einstellbar):** Task 3. ✓
- **UI zeigt nur passende Regler, erklärt:** Task 4. ✓
- **Offen zur Umsetzung:** ob `gtts` `slow` wirklich unterstützt (sonst Regler streichen);
  welcher IPC-Weg `TUNING_SPECS` in den Renderer bringt; exakte Piper-Stimmen-IDs für den
  Fallback-Test.
