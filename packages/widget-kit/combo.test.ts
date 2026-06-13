// combo.test.ts — die reine Combo-Mathematik (DOM-frei) absichern.
// Hintergrund: Im ersten Live-Stream kam bei „10x Rose" nur EINE kleine
// Rakete. Ursache: nur totalCoins skalierte die Show, count wurde ignoriert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboPlan } from './combo.js';

test('10x Rose ergibt mehrere Raketen, nicht eine', () => {
  const plan = comboPlan({ count: 10, coinsPerUnit: 1 }, 12);
  assert.equal(plan.rockets, 10);
});

test('Anzahl Raketen wird durch maxRockets gedeckelt', () => {
  const plan = comboPlan({ count: 50, coinsPerUnit: 1 }, 12);
  assert.equal(plan.rockets, 12);
});

test('Einzelnes Gift = genau eine Rakete', () => {
  const plan = comboPlan({ count: 1, coinsPerUnit: 1 }, 12);
  assert.equal(plan.rockets, 1);
});

test('Wertvolles Einzel-Gift → eine Rakete mit hoher Power', () => {
  const small = comboPlan({ count: 1, coinsPerUnit: 1 }, 12);
  const huge = comboPlan({ count: 1, coinsPerUnit: 1000 }, 12);
  assert.equal(huge.rockets, 1);
  assert.ok(huge.power > small.power, 'teureres Gift = größerer Burst');
  assert.ok(huge.power <= 1);
});

test('Combo über dem Cap bekommt Power-Bonus zur Kompensation', () => {
  const capped = comboPlan({ count: 60, coinsPerUnit: 1 }, 12);
  const exact = comboPlan({ count: 12, coinsPerUnit: 1 }, 12);
  assert.equal(capped.rockets, 12);
  assert.ok(capped.power > exact.power, 'mehr als das Cap → stärkere Raketen');
});

test('Fehlende Felder fallen sauber auf 1 Rakete zurück', () => {
  const plan = comboPlan({}, 12);
  assert.equal(plan.rockets, 1);
  assert.ok(plan.power >= 0 && plan.power <= 1);
});

test('totalCoins dient als Coin-Fallback wenn coinsPerUnit fehlt', () => {
  const plan = comboPlan({ count: 1, totalCoins: 500 }, 12);
  assert.ok(plan.power > comboPlan({ count: 1, coinsPerUnit: 1 }, 12).power);
});

test('Combo ohne coinsPerUnit: Einzelstärke aus totalCoins/count, NICHT totalCoins', () => {
  // 10x Rose, totalCoins=10, kein coinsPerUnit → Einzelwert 1 (nicht 10).
  const derived = comboPlan({ count: 10, totalCoins: 10 }, 12);
  const explicit = comboPlan({ count: 10, coinsPerUnit: 1, totalCoins: 10 }, 12);
  assert.deepEqual(derived, explicit);
});

test('Modus „single": immer genau eine Rakete, Stärke aus den Gesamt-Coins', () => {
  // 150x Rose (je 1 Coin) → EIN großer Burst statt Volley.
  const plan = comboPlan({ count: 150, coinsPerUnit: 1, totalCoins: 150 }, 12, { mode: 'single' });
  assert.equal(plan.rockets, 1);
  // Power kommt aus 150 Gesamt-Coins, nicht aus 1 Einzel-Coin.
  assert.ok(plan.power > comboPlan({ count: 1, coinsPerUnit: 1 }, 12, { mode: 'single' }).power);
});

test('burstScale skaliert die Power (kleiner/größer), gedeckelt auf 1', () => {
  const base = comboPlan({ count: 1, coinsPerUnit: 100 }, 12);
  const half = comboPlan({ count: 1, coinsPerUnit: 100 }, 12, { burstScale: 0.5 });
  const huge = comboPlan({ count: 1, coinsPerUnit: 100 }, 12, { burstScale: 5 });
  assert.ok(half.power < base.power, 'kleinerer Scale = schwächer');
  assert.ok(huge.power <= 1, 'Power bleibt gedeckelt');
  assert.ok(huge.power >= base.power);
});

test('Default-Optionen verhalten sich wie ohne Optionen (Fächer-Modus)', () => {
  const a = comboPlan({ count: 10, coinsPerUnit: 1 }, 12);
  const b = comboPlan({ count: 10, coinsPerUnit: 1 }, 12, {});
  assert.deepEqual(a, b);
});
