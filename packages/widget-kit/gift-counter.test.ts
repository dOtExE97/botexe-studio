// gift-counter.test.ts — Ziel-Logik bei Erreichen (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onGiftGoalReached, findGiftIcon } from './gift-counter.js';

test('findGiftIcon: Icon per lowercase-Slug (Katalog-Key ODER entry.slug), sonst leer', () => {
  const cat = {
    galaxy: { slug: 'Galaxy', icon: 'galaxy.png', coins: 1000 },
    rose: { slug: 'Rose', icon: 'rose.png' },
  };
  assert.equal(findGiftIcon(cat, 'galaxy'), 'galaxy.png');
  assert.equal(findGiftIcon(cat, 'Galaxy'), 'galaxy.png', 'case-insensitiv');
  assert.equal(findGiftIcon(cat, 'rose'), 'rose.png');
  assert.equal(findGiftIcon(cat, 'unbekannt'), '');
  assert.equal(findGiftIcon(cat, ''), '');
  // Fallback: Key passt nicht, aber entry.slug schon.
  assert.equal(findGiftIcon({ 'k1': { slug: 'Galaxy', icon: 'g.png' } }, 'galaxy'), 'g.png');
});

test('raise: Ziel um die Schrittweite erhöhen, Zähler läuft weiter', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'raise'), { count: 15, target: 30 });
  assert.deepEqual(onGiftGoalReached(32, 30, 15, 'raise'), { count: 32, target: 45 });
});

test('reset: Zähler auf 0, Ziel bleibt', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'reset'), { count: 0, target: 15 });
});

test('keep (Default): nichts ändern', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'keep'), { count: 15, target: 15 });
  assert.deepEqual(onGiftGoalReached(15, 15, 15, 'irgendwas'), { count: 15, target: 15 });
});

test('Schrittweite ungültig/0 → Ziel bleibt auch bei raise (kein Stillstand-Bug)', () => {
  assert.deepEqual(onGiftGoalReached(15, 15, 0, 'raise'), { count: 15, target: 15 });
});
