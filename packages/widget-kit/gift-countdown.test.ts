// gift-countdown.test.ts — reiner Kern des Challenge-Countdowns im
// Geschenke-Slider (DOM-frei, node:test-Idiom wie die Sibling-Tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackRemaining, fmtTime, nextCountdownState, tickCountdownState } from './gift-countdown.js';

test('stackRemaining addiert und deckelt bei cap', () => {
  assert.equal(stackRemaining(0, 60, 600), 60);   // Start
  assert.equal(stackRemaining(20, 60, 600), 80);  // drauflegen
  assert.equal(stackRemaining(580, 60, 600), 600); // Cap
});

test('fmtTime formatiert m:ss', () => {
  assert.equal(fmtTime(80), '1:20');
  assert.equal(fmtTime(5), '0:05');
  assert.equal(fmtTime(0), '0:00');
});

test('nextCountdownState startet frisch, wenn kein Vorzustand existiert', () => {
  assert.deepEqual(nextCountdownState(undefined, 60, 600), { remaining: 60, total: 60 });
});

test('nextCountdownState stackt Restzeit UND zieht total mit hoch (Fortschritt bleibt konsistent)', () => {
  const first = nextCountdownState(undefined, 60, 600);
  const second = nextCountdownState(first, 30, 600);
  assert.deepEqual(second, { remaining: 90, total: 90 });
});

test('nextCountdownState deckelt bei cap, total wächst nicht über den gedeckelten Wert', () => {
  const state = { remaining: 580, total: 580 };
  assert.deepEqual(nextCountdownState(state, 60, 600), { remaining: 600, total: 600 });
});

test('tickCountdownState zählt eine Sekunde runter und meldet done bei <=0', () => {
  assert.deepEqual(tickCountdownState({ remaining: 2, total: 60 }), { remaining: 1, total: 60, done: false });
  assert.deepEqual(tickCountdownState({ remaining: 1, total: 60 }), { remaining: 0, total: 60, done: true });
  assert.deepEqual(tickCountdownState({ remaining: 0, total: 60 }), { remaining: -1, total: 60, done: true });
});
