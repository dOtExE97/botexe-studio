// live-poll.test.ts — reine Abstimmungs-Logik (DOM-frei): Optionen parsen,
// Stimme aus Chat-Text erkennen, Prozente + Gewinner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, voteIndex, pollResult } from './live-poll.js';

test('parseOptions: kommagetrennt, getrimmt, leere raus, max 4', () => {
  assert.deepEqual(parseOptions('Ja, Nein'), ['Ja', 'Nein']);
  assert.deepEqual(parseOptions(' A , B , , C '), ['A', 'B', 'C']);
  assert.deepEqual(parseOptions('1,2,3,4,5,6'), ['1', '2', '3', '4']);
  assert.deepEqual(parseOptions(''), []);
});

test('voteIndex: !1 / 1 → 0-basierter Index, nur im gültigen Bereich', () => {
  assert.equal(voteIndex('!1', 3), 0);
  assert.equal(voteIndex('2', 3), 1);
  assert.equal(voteIndex(' !3 ', 3), 2);
  assert.equal(voteIndex('4', 3), -1); // außerhalb (nur 3 Optionen)
  assert.equal(voteIndex('0', 3), -1);
  assert.equal(voteIndex('hallo', 3), -1);
  assert.equal(voteIndex('!1 los gehts', 3), -1); // nur reine Stimme zählt
});

test('pollResult: Prozente (gerundet) + Index des Gewinners', () => {
  assert.deepEqual(pollResult([3, 1]), { percents: [75, 25], winner: 0, total: 4 });
  assert.deepEqual(pollResult([0, 0]), { percents: [0, 0], winner: -1, total: 0 });
  assert.deepEqual(pollResult([1, 1, 2]), { percents: [25, 25, 50], winner: 2, total: 4 });
});
