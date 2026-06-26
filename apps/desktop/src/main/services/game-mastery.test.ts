import test from 'node:test';
import assert from 'node:assert/strict';
import {
  levelForWins,
  nextLevelForWins,
  didLevelUp,
  progressForWins,
  masteryMoment,
} from './game-mastery';

const USER = { id: 'u1', nickname: 'ExE', profilePic: 'pic.png' };

test('levelForWins: Grenzen exakt (0,1,3,7,15,30,31)', () => {
  assert.equal(levelForWins(0).value, 0); // unter Rookie → Neuling
  assert.equal(levelForWins(0).title, 'Neuling');
  assert.equal(levelForWins(1).value, 1);
  assert.equal(levelForWins(1).title, 'Rookie');
  assert.equal(levelForWins(2).value, 1); // knapp unter Taktiker
  assert.equal(levelForWins(3).value, 2);
  assert.equal(levelForWins(3).title, 'Taktiker');
  assert.equal(levelForWins(6).value, 2);
  assert.equal(levelForWins(7).value, 3);
  assert.equal(levelForWins(7).title, 'Champion');
  assert.equal(levelForWins(15).value, 4);
  assert.equal(levelForWins(15).title, 'Legende');
  assert.equal(levelForWins(29).value, 4);
  assert.equal(levelForWins(30).value, 5);
  assert.equal(levelForWins(30).title, 'Spiele-Meister');
  assert.equal(levelForWins(31).value, 5); // bleibt Max
  assert.equal(levelForWins(9999).value, 5);
});

test('nextLevelForWins: nächstes Level bzw. null am Max', () => {
  assert.equal(nextLevelForWins(0)?.value, 1);
  assert.equal(nextLevelForWins(0)?.wins, 1);
  assert.equal(nextLevelForWins(1)?.value, 2);
  assert.equal(nextLevelForWins(3)?.value, 3);
  assert.equal(nextLevelForWins(7)?.value, 4);
  assert.equal(nextLevelForWins(15)?.value, 5);
  assert.equal(nextLevelForWins(15)?.wins, 30);
  assert.equal(nextLevelForWins(29)?.value, 5);
  assert.equal(nextLevelForWins(30), null); // Max erreicht
  assert.equal(nextLevelForWins(31), null);
});

test('didLevelUp: true/false exakt an Grenzen', () => {
  assert.equal(didLevelUp(0, 1), true); // → Rookie
  assert.equal(didLevelUp(2, 3), true); // → Taktiker
  assert.equal(didLevelUp(6, 7), true); // → Champion
  assert.equal(didLevelUp(14, 15), true); // → Legende
  assert.equal(didLevelUp(29, 30), true); // → Spiele-Meister
  // kein Level-Up
  assert.equal(didLevelUp(1, 2), false); // beide Rookie
  assert.equal(didLevelUp(0, 0), false);
  assert.equal(didLevelUp(30, 31), false); // beide Max
  assert.equal(didLevelUp(3, 6), false); // beide Taktiker
  // mehrere Level auf einmal
  assert.equal(didLevelUp(0, 7), true);
  // Rückschritt zählt nie als Level-Up
  assert.equal(didLevelUp(15, 1), false);
});

test('progressForWins: Fortschritt zum nächsten Level', () => {
  // 0 Siege: aktuelles Level Neuling (wins 0), nächstes Rookie (wins 1)
  assert.deepEqual(progressForWins(0), { current: 0, next: 1, pct: 0 });
  // Rookie (1) → Taktiker (3): Spanne 2, 1 Sieg gemacht → 50%
  assert.deepEqual(progressForWins(2), { current: 2, next: 3, pct: 50 });
  // genau auf Taktiker (3): 0 von Spanne 4 (3→7) → 0%
  assert.deepEqual(progressForWins(3), { current: 3, next: 7, pct: 0 });
  // Max-Level: kein nächstes, immer 100%
  assert.deepEqual(progressForWins(30), { current: 30, next: null, pct: 100 });
  assert.deepEqual(progressForWins(45), { current: 45, next: null, pct: 100 });
});

test('masteryMoment: Felder korrekt (Standard-Level)', () => {
  const m = masteryMoment(USER, 7); // Champion
  assert.equal(m.channel, 'mastery');
  assert.equal(m.type, 'game-level-up');
  assert.equal(m.priority, 80);
  assert.equal(m.durationMs, 5000);
  assert.equal(m.title, 'ExE → Champion!');
  assert.equal(typeof m.id, 'string');
  assert.ok(m.id.length > 0);
  assert.deepEqual(m.user, { id: 'u1', nickname: 'ExE', profilePic: 'pic.png' });
  assert.deepEqual(m.level, { value: 3, title: 'Champion', currentWins: 7, nextWins: 15 });
});

test('masteryMoment: Top-Level hat priority 95 und keinen nextWins', () => {
  const m = masteryMoment(USER, 30); // Spiele-Meister
  assert.equal(m.priority, 95);
  assert.equal(m.title, 'ExE → Spiele-Meister!');
  assert.deepEqual(m.level, { value: 5, title: 'Spiele-Meister', currentWins: 30 });
  assert.equal(m.level?.nextWins, undefined);
});

test('masteryMoment: ohne profilePic bleibt das Feld weg', () => {
  const m = masteryMoment({ id: 'u2', nickname: 'Bob' }, 3);
  assert.deepEqual(m.user, { id: 'u2', nickname: 'Bob' });
  assert.equal(m.user?.profilePic, undefined);
});
