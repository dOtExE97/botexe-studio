// heart-rain.test.ts — wie viele Herzen pro Like-Event (reine Logik).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heartsForLike } from './heart-rain.js';

test('Fontäne: deutlich mehr Herzen, mit großzügiger Untergrenze', () => {
  // Selbst ein einzelner Like wirft einen sichtbaren Schwung (nicht nur 1 Herz).
  assert.equal(heartsForLike(1, 'fountain', 14), 4);
  // Skaliert mit der Like-Zahl …
  assert.equal(heartsForLike(9, 'fountain', 14), 6);
  // … aber nie über maxPerBurst.
  assert.equal(heartsForLike(500, 'fountain', 14), 14);
});

test('Regen: etwas weniger dicht, eigene Untergrenze', () => {
  assert.equal(heartsForLike(1, 'rain', 14), 3);
  assert.equal(heartsForLike(20, 'rain', 14), 8);
  assert.equal(heartsForLike(999, 'rain', 10), 10);
});

test('robust gegen fehlende/0 Like-Zahl', () => {
  assert.equal(heartsForLike(0, 'fountain', 14), 4);
  assert.equal(heartsForLike(undefined, 'fountain', 14), 4);
});
