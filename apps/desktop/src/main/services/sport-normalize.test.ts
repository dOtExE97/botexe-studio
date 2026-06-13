// sport-normalize.test.ts — die Provider-Antworten (football-data.org /
// OpenLigaDB) in ein gemeinsames Match-Modell überführen. Pure Logik.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatches } from './sport-normalize';

test('football-data: mapped Live-/Geplant-/Beendet-Status + Score + Wappen', () => {
  const raw = {
    matches: [
      {
        id: 1, utcDate: '2026-06-13T18:00:00Z', status: 'IN_PLAY', minute: 37,
        homeTeam: { name: 'Deutschland', crest: 'https://x/de.png' },
        awayTeam: { name: 'Brasilien', crest: 'https://x/br.png' },
        score: { fullTime: { home: 2, away: 1 } },
        competition: { name: 'WM' },
      },
      {
        id: 2, utcDate: '2026-06-13T21:00:00Z', status: 'TIMED',
        homeTeam: { name: 'Spanien' }, awayTeam: { name: 'Frankreich' },
        score: { fullTime: { home: null, away: null } },
      },
      {
        id: 3, utcDate: '2026-06-12T18:00:00Z', status: 'FINISHED',
        homeTeam: { name: 'England' }, awayTeam: { name: 'Italien' },
        score: { fullTime: { home: 0, away: 0 } },
      },
    ],
  };
  const m = normalizeMatches('football-data', raw);
  assert.equal(m.length, 3);
  assert.equal(m[0]?.home, 'Deutschland');
  assert.equal(m[0]?.homeScore, 2);
  assert.equal(m[0]?.awayScore, 1);
  assert.equal(m[0]?.status, 'live');
  assert.equal(m[0]?.minute, 37);
  assert.equal(m[0]?.homeCrest, 'https://x/de.png');
  assert.equal(m[1]?.status, 'scheduled');
  assert.equal(m[1]?.homeScore, null);
  assert.equal(m[2]?.status, 'finished');
});

test('openligadb: Array → Matches, Endergebnis aus höchstem resultTypeID', () => {
  const raw = [
    {
      matchID: 10, matchDateTime: '2026-06-13T15:30:00', matchIsFinished: false,
      team1: { teamName: 'Bayern', teamIconUrl: 'https://x/fcb.png' },
      team2: { teamName: 'Dortmund', teamIconUrl: 'https://x/bvb.png' },
      matchResults: [
        { resultTypeID: 1, pointsTeam1: 1, pointsTeam2: 0, resultName: 'Halbzeit' },
        { resultTypeID: 2, pointsTeam1: 3, pointsTeam2: 1, resultName: 'Endergebnis' },
      ],
    },
  ];
  const m = normalizeMatches('openligadb', raw);
  assert.equal(m.length, 1);
  assert.equal(m[0]?.home, 'Bayern');
  assert.equal(m[0]?.homeScore, 3);
  assert.equal(m[0]?.awayScore, 1);
  assert.equal(m[0]?.homeCrest, 'https://x/fcb.png');
});

test('robust: leere/kaputte Eingabe → leeres Array', () => {
  assert.deepEqual(normalizeMatches('football-data', null), []);
  assert.deepEqual(normalizeMatches('football-data', { matches: 'nope' }), []);
  assert.deepEqual(normalizeMatches('openligadb', {}), []);
  assert.deepEqual(normalizeMatches('openligadb', undefined), []);
});
