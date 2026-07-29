// Die Kurve zeigt ZUWACHS, nicht Gesamtstand — das ist ihre ganze Aussage.
// Ein Gesamtstand steigt immer und sähe auch bei totem Stream nach Erfolg aus.
// Die Rechenlogik ist hier nachgebaut, damit sie ohne DOM prüfbar ist; ändert
// sie sich in Sparkline.tsx, muss dieser Test mitziehen.
import test from 'node:test';
import assert from 'node:assert/strict';

function zuwaechse(werte: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < werte.length; i++) out.push(Math.max(0, (werte[i] ?? 0) - (werte[i - 1] ?? 0)));
  return out;
}

test('aus Gesamtständen werden Zuwächse', () => {
  assert.deepEqual(zuwaechse([100, 120, 125, 300]), [20, 5, 175]);
});

test('Stillstand ergibt eine flache Null-Linie, kein Anstieg', () => {
  // Der eigentliche Zweck: „seit 20 Minuten passiert nichts" muss sichtbar sein.
  assert.deepEqual(zuwaechse([500, 500, 500, 500]), [0, 0, 0]);
});

test('ein Rücksetzer (neuer Stream) erzeugt keinen negativen Ausschlag', () => {
  // Beim Stream-Wechsel fallen die Zähler auf 0 zurück. Ohne Klemmung würde die
  // Kurve nach unten ausschlagen und die Skala für alles andere ruinieren.
  assert.deepEqual(zuwaechse([900, 0, 30]), [0, 30]);
});
