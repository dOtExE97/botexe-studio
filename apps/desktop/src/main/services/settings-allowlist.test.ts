// Wächter gegen eine Fehlerklasse, die schon DREIMAL zugeschlagen hat:
// Der IPC-Handler `SETTINGS_UPDATE` (main.ts) lässt nur Felder aus einer
// Allowlist durch. Schickt die Oberfläche ein Feld, das dort fehlt, wird es
// STILL verworfen — die Einstellung sieht gespeichert aus, ist nach dem
// Neustart aber wieder weg. So passiert bei `audioOutputId` (Audio-Ausgabe),
// `telemetry` (Zustimmung → Banner kam immer wieder, Sentry nie aktiv) und
// `mixer` (alle Lautstärke-Regler fielen zurück).
//
// Der Test vergleicht beide Seiten direkt an der Quelle: jedes Feld, das der
// Renderer per `updateSettings({ feld: … })` schickt, MUSS im Handler als
// `p.feld` geprüft werden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Tests laufen per npm-Script aus apps/desktop; aus dem Repo-Wurzelverzeichnis
// aufgerufen liegt die Quelle unter apps/desktop/src.
const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

/** Alle Feldnamen, die die Oberfläche per updateSettings({ … }) schickt. */
function fieldsSentByRenderer(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) {
        const code = readFileSync(p, 'utf8');
        for (const m of code.matchAll(/updateSettings\(\{\s*([A-Za-z_$][\w$]*)/g)) {
          if (m[1]) out.add(m[1]);
        }
      }
    }
  };
  walk(join(SRC, 'renderer'));
  return out;
}

/** Alle Felder, die der SETTINGS_UPDATE-Handler in main.ts durchlässt. */
function fieldsAllowedByHandler(): Set<string> {
  const code = readFileSync(join(SRC, 'main.ts'), 'utf8');
  const start = code.indexOf('IPC.SETTINGS_UPDATE');
  assert.ok(start > 0, 'SETTINGS_UPDATE-Handler in main.ts nicht gefunden');
  // Bis zum abschließenden settings.update(allowed) des Handlers lesen.
  const end = code.indexOf('settings.update(allowed)', start);
  assert.ok(end > start, 'Ende des SETTINGS_UPDATE-Handlers nicht gefunden');
  const block = code.slice(start, end);
  const out = new Set<string>();
  for (const m of block.matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)) {
    if (m[1]) out.add(m[1]);
  }
  return out;
}

/** Alle tts-Unterfelder, die die TTS-Seite per `update({ … })` schickt
 *  (Renderer-Quelle: TtsPage.tsx — dort geht `update()` NICHT über
 *  updateSettings({ feld }), sondern über updateSettings({ tts: patch }),
 *  darum ein eigener Scan). */
function ttsFieldsSentByRenderer(): Set<string> {
  const code = readFileSync(join(SRC, 'renderer', 'pages', 'TtsPage.tsx'), 'utf8');
  const out = new Set<string>();
  for (const m of code.matchAll(/\bupdate\(\{\s*([A-Za-z_$][\w$]*)/g)) {
    if (m[1]) out.add(m[1]);
  }
  return out;
}

/** Alle tts-Unterfelder, die der `p.tts`-Block im SETTINGS_UPDATE-Handler
 *  als `t.<feld>` prüft. */
function ttsFieldsAllowedByHandler(): Set<string> {
  const code = readFileSync(join(SRC, 'main.ts'), 'utf8');
  const start = code.indexOf('typeof p.tts === ');
  assert.ok(start > 0, 'p.tts-Block in main.ts nicht gefunden');
  // Der Block endet, sobald ein nachfolgendes p.<anderesFeld> außerhalb von
  // t. beginnt — hier reicht das nächste "if (typeof p." nach dem Block-Start.
  const next = code.indexOf('if (typeof p.', start + 'typeof p.tts === '.length);
  const end = next > start ? next : code.length;
  const block = code.slice(start, end);
  const out = new Set<string>();
  for (const m of block.matchAll(/\bt\.([A-Za-z_$][\w$]*)/g)) {
    if (m[1]) out.add(m[1]);
  }
  return out;
}

test('jedes vom Renderer gesendete Einstellungs-Feld steht in der SETTINGS_UPDATE-Allowlist', () => {
  const sent = fieldsSentByRenderer();
  const allowed = fieldsAllowedByHandler();
  assert.ok(sent.size > 0, 'keine updateSettings-Aufrufe gefunden — Test-Regex prüfen');

  const fehlend = [...sent].filter((f) => !allowed.has(f)).sort();
  assert.deepEqual(
    fehlend,
    [],
    `Diese Felder schickt die Oberfläche, der Handler verwirft sie aber still: ${fehlend.join(', ')}. `
      + 'In main.ts (SETTINGS_UPDATE) freischalten — sonst ist die Einstellung nach dem Neustart weg.',
  );
});

test('jedes von der TTS-Seite gesendete tts-Unterfeld steht im p.tts-Block der Allowlist', () => {
  const sent = ttsFieldsSentByRenderer();
  const allowed = ttsFieldsAllowedByHandler();
  assert.ok(sent.size > 0, 'keine update({ … })-Aufrufe in TtsPage.tsx gefunden — Test-Regex prüfen');

  const fehlend = [...sent].filter((f) => !allowed.has(f)).sort();
  assert.deepEqual(
    fehlend,
    [],
    `Diese tts-Unterfelder schickt die TTS-Seite, der p.tts-Block verwirft sie aber still: ${fehlend.join(', ')}. `
      + 'In main.ts (SETTINGS_UPDATE, p.tts-Block) freischalten — sonst ist die Einstellung nach dem Neustart weg.',
  );
});
