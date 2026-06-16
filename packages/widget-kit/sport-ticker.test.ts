// sport-ticker.test.ts — Team-Filter (reine Logik).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByTeam } from './sport-ticker.js';

const M = [
  { home: 'Bayern München', away: 'Dortmund' },
  { home: 'Leipzig', away: 'Bayer Leverkusen' },
  { home: 'Union Berlin', away: 'Köln' },
];

test('leeres Team → alle Spiele', () => {
  assert.equal(filterByTeam(M, '').length, 3);
  assert.equal(filterByTeam(M, '  ').length, 3);
});

test('Teilstring, case-insensitiv, Heim ODER Auswärts', () => {
  assert.deepEqual(filterByTeam(M, 'bayern').map((m) => m.home), ['Bayern München']);
  assert.equal(filterByTeam(M, 'bayer').length, 2); // „Bayern München" + „Bayer Leverkusen"
  assert.deepEqual(filterByTeam(M, 'dortmund').map((m) => m.away), ['Dortmund']);
});

test('kein Treffer → leer', () => {
  assert.deepEqual(filterByTeam(M, 'Real Madrid'), []);
});
