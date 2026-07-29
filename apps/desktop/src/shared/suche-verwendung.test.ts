// Wächter: Suchen sollen ÜBERALL gleich tolerant sein.
//
// Vorher hatte jede Seite ihre eigene Zeile `x.toLowerCase().includes(q)`.
// Ergebnis: „Glucksrad" ohne Umlaut fand nichts, „gift jar" nichts, ein
// Tippfehler nichts — und zwar je nach Seite unterschiedlich. Genau die
// Fehlerklasse, die sich durch dieses Projekt zieht: dieselbe Aufgabe an
// vielen Stellen einzeln gelöst.
//
// Der Test findet neue Alleingänge, bevor sie sich einschleichen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

/** Stellen, an denen `toLowerCase().includes()` NICHT als Suche gemeint ist. */
const ERLAUBT = new Set([
  // Wortfilter der Moderation: bewusst wörtlich, keine Tippfehler-Toleranz —
  // sonst würde ein harmloses Wort fälschlich als gesperrt gelten.
  join('main', 'services', 'tts-filter.ts'),
  join('shared', 'moderation.ts'),
  // Die Suche selbst.
  join('shared', 'suche.ts'),
]);

function dateien(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) dateien(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) out.push(p);
  }
  return out;
}

test('keine Seite baut sich ihre eigene Suche', () => {
  const treffer: string[] = [];
  for (const datei of dateien(SRC)) {
    const rel = datei.slice(SRC.length + 1);
    if ([...ERLAUBT].some((e) => rel.endsWith(e) || rel === e)) continue;
    const inhalt = readFileSync(datei, 'utf-8');
    // Muster: irgendetwas.toLowerCase().includes(...) — der klassische
    // Eigenbau-Filter.
    if (/\.toLowerCase\(\)\s*\.includes\(/.test(inhalt)) treffer.push(rel);
  }
  assert.deepEqual(
    treffer,
    [],
    'Diese Dateien filtern selbst statt passt() aus shared/suche.ts zu nutzen:\n  '
      + `${treffer.join('\n  ')}\n`
      + 'Ist es bewusst wörtlich (z.B. ein Wortfilter), trag die Datei in ERLAUBT ein.',
  );
});
