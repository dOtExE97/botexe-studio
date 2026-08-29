// Wächter: kein Backtick in einem Block-Kommentar.
//
// Jedes Widget hält sein CSS in einem Template-Literal (`const CSS = ` … `).
// Schreibt jemand im Kommentar darin eine Klasse oder Eigenschaft in Backticks
// — was in Markdown und in Chat-Nachrichten völlig normal ist —, beendet das
// die Zeichenkette mitten im CSS. Der Rest wird als JavaScript gelesen.
//
// Das Tückische: Das ist oft SYNTAKTISCH GÜLTIG und `node --check` bleibt still.
// Ein Punkt nach der geschlossenen Zeichenkette ist ein Eigenschaftszugriff, ein
// Stern eine Multiplikation — die Datei lädt und das Widget bleibt einfach leer.
// Genau das ist beim Geschenkzähler dreimal passiert, zweimal davon still.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));

test('kein Backtick im CSS-Literal eines Widgets', () => {
  const treffer: string[] = [];
  for (const datei of readdirSync(HIER).filter((f) => f.endsWith('.js'))) {
    const quelle = readFileSync(join(HIER, datei), 'utf-8');
    // Muster im ganzen Paket: `const CSS = \`` … Zeilenumbruch, Backtick,
    // Semikolon. Geprüft wird nur DIESER Bereich — in gewöhnlichem
    // JS-Code sind Backticks natürlich in Ordnung.
    for (const m of quelle.matchAll(/const\s+\w+\s*=\s*`\n/g)) {
      const start = (m.index ?? 0) + m[0].length;
      const ende = quelle.indexOf('\n`;', start);
      if (ende < 0) continue;
      const block = quelle.slice(start, ende);
      const pos = block.indexOf('`');
      if (pos < 0) continue;
      const zeile = quelle.slice(0, start + pos).split('\n').length;
      treffer.push(`${datei}:${zeile}`);
    }
  }
  assert.deepEqual(
    treffer,
    [],
    `Backtick im CSS-Literal — der beendet die Zeichenkette mitten im CSS:\n  ${treffer.join('\n  ')}`,
  );
});
