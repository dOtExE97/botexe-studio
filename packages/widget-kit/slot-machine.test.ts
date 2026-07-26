// slot-machine.test.ts — Lande-Logik der Walzen (rein, DOM-frei), node:test-Idiom
// wie die Sibling-Tests (siehe wheel.test.ts, gift-countdown.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotReels } from './slot-machine.js';

test('slotReels: Gewinn = 3 Gleiche auf winnerIndex', () => {
  assert.deepEqual(slotReels(true, 2, 5, 0.4), [2, 2, 2]);
});

test('slotReels: Niete = nicht drei gleiche', () => {
  const r = slotReels(false, 0, 5, 0.4);
  assert.equal(r.length, 3);
  assert.ok(new Set(r).size > 1); // nie 3 identisch
});

test('slotReels: n<=1 degeneriert sauber (kein Absturz)', () => {
  assert.ok(slotReels(true, 0, 1, 0).every((x) => x === 0));
});

// Zusätzliche Streuung: für alle n von 2..8 und viele roll-Werte darf die
// Niete NIE drei gleiche Walzen liefern (Invariante aus dem Task-Brief).
test('slotReels: Niete ist für n=2..8 über viele rolls nie 3 gleich', () => {
  for (let n = 2; n <= 8; n++) {
    for (let i = 0; i <= 20; i++) {
      const roll = i / 20;
      const r = slotReels(false, 0, n, roll);
      assert.equal(r.length, 3);
      assert.ok(new Set(r).size > 1, `n=${n} roll=${roll} → ${JSON.stringify(r)}`);
    }
  }
});

test('slotReels: winnerIndex wird modulo n normalisiert (auch negativ)', () => {
  assert.deepEqual(slotReels(true, -1, 5, 0), [4, 4, 4]);
  assert.deepEqual(slotReels(true, 7, 5, 0), [2, 2, 2]);
});
