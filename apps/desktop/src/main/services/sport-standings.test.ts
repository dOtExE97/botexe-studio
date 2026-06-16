// sport-standings.test.ts — reine Tabellen-Normalisierung (DOM-/IO-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStandings } from './sport-normalize';

test('football-data: eine Liga-Tabelle (type TOTAL) wird zu Zeilen', () => {
  const raw = {
    standings: [
      {
        type: 'TOTAL',
        table: [
          { position: 1, team: { name: 'Bayern', crest: 'b.png' }, playedGames: 5, won: 5, draw: 0, lost: 0, points: 15, goalDifference: 12 },
          { position: 2, team: { name: 'Leverkusen', crest: 'l.png' }, playedGames: 5, won: 4, draw: 1, lost: 0, points: 13, goalDifference: 8 },
        ],
      },
      { type: 'HOME', table: [{ position: 1, team: { name: 'X' }, points: 9 }] }, // nur TOTAL zählt
    ],
  };
  const rows = normalizeStandings('football-data', raw);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { position: 1, team: 'Bayern', crest: 'b.png', played: 5, won: 5, draw: 0, lost: 0, points: 15, goalDiff: 12 });
  assert.equal(rows[1]?.team, 'Leverkusen');
});

test('football-data: WM-Gruppen → Gruppen-Label gesetzt, alle Zeilen flach', () => {
  const raw = {
    standings: [
      { type: 'TOTAL', group: 'GROUP_A', table: [{ position: 1, team: { name: 'Deutschland' }, playedGames: 3, won: 3, draw: 0, lost: 0, points: 9, goalDifference: 6 }] },
      { type: 'TOTAL', group: 'GROUP_B', table: [{ position: 1, team: { name: 'Brasilien' }, playedGames: 3, won: 2, draw: 1, lost: 0, points: 7, goalDifference: 4 }] },
    ],
  };
  const rows = normalizeStandings('football-data', raw);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.group, 'GROUP_A');
  assert.equal(rows[1]?.group, 'GROUP_B');
});

test('openligadb: Array → Zeilen mit Position aus Reihenfolge', () => {
  const raw = [
    { teamName: 'Bayern', teamIconUrl: 'b.png', points: 15, matches: 5, won: 5, draw: 0, lost: 0, goalDiff: 12 },
    { teamName: 'Dortmund', teamIconUrl: 'd.png', points: 11, matches: 5, won: 3, draw: 2, lost: 0, goalDiff: 5 },
  ];
  const rows = normalizeStandings('openligadb', raw);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { position: 1, team: 'Bayern', crest: 'b.png', played: 5, won: 5, draw: 0, lost: 0, points: 15, goalDiff: 12 });
  assert.equal(rows[1]?.position, 2);
});

test('defensiv: Müll/leer → leere Liste', () => {
  assert.deepEqual(normalizeStandings('football-data', null), []);
  assert.deepEqual(normalizeStandings('football-data', { standings: 'nope' }), []);
  assert.deepEqual(normalizeStandings('openligadb', { not: 'array' }), []);
});
