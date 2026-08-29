// Wächter: Jede benutzte Animation muss es auch geben.
//
// `animation: bx-xyz 2s ...` auf einen Namen, den kein `@keyframes` definiert,
// ist im CSS KEIN Fehler — der Browser tut einfach nichts. Das Widget sieht
// dann still aus, als sei die Bewegung nie gebaut worden.
//
// Genau das passiert beim AUFRÄUMEN: Beim Entfernen von Stilen wanderte ein
// `@keyframes` mit, das ein anderer Stil noch benutzte (die Folie der
// Vollbild-Karte). Kein Test schlug an, kein Log, nur eine Karte ohne Glanz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const BASIS = readFileSync(join(HIER, 'widget-base.css'), 'utf-8');

/** Von der Laufzeit oder vom Browser gestellte Namen. */
const VON_AUSSEN = new Set(['none', 'inherit', 'initial', 'unset', 'revert']);

test('jede benutzte Animation hat auch ihre @keyframes', () => {
  const fehlend: string[] = [];
  const basisNamen = new Set([...BASIS.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string));

  for (const datei of readdirSync(HIER).filter((f) => f.endsWith('.js'))) {
    const quelle = readFileSync(join(HIER, datei), 'utf-8');
    const eigene = new Set([...quelle.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string));

    // `animation:` und `animation-name:` — der erste Wert einer Kurzschreibweise
    // ist in diesem Paket durchgehend der Name.
    for (const m of quelle.matchAll(/animation(?:-name)?\s*:\s*([^;}\n]+)/g)) {
      // Klammerausdrücke ZUERST entfernen: „cubic-bezier(.2, 1, .3, 1)" enthält
      // Kommas, an denen die Aufteilung sonst mitten im Wert schneidet — der
      // Rest „1)" sähe dann wie ein Animationsname aus.
      const ohneKlammern = (m[1] as string).replace(/\([^()]*\)/g, '');
      for (const teil of ohneKlammern.split(',')) {
        const name = teil.trim().split(/\s+/)[0] ?? '';
        if (!name || VON_AUSSEN.has(name) || !/^[a-zA-Z-]/.test(name)) continue;
        // Reste von entfernten Klammerausdrücken und CSS-Variablen sind keine Namen.
        if (name.includes('(') || name.includes(')') || name.startsWith('var')) continue;
        // Werte wie „2s" oder „ease-in-out" an erster Stelle: keine Namen.
        if (/^(ease|linear|steps|cubic-bezier|alternate|infinite|forwards|backwards|both|paused|running)/.test(name)) continue;
        if (eigene.has(name) || basisNamen.has(name)) continue;
        fehlend.push(`${datei}: „${name}"`);
      }
    }
  }
  assert.deepEqual(
    [...new Set(fehlend)],
    [],
    `Diese Animationen werden benutzt, aber nirgends definiert — der Browser tut still nichts:\n  ${[...new Set(fehlend)].join('\n  ')}`,
  );
});
