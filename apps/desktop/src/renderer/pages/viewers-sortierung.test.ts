import test from 'node:test';
import assert from 'node:assert/strict';
import { sortiereZuschauer, treueZeile, jahreOderTage } from './viewers-sortierung';

const v = (nickname: string, extra: Record<string, unknown> = {}) =>
  ({ nickname, points: 0, ...extra }) as Parameters<typeof sortiereZuschauer>[0][number];

test('sortiereZuschauer: nach Treue, ohne Angabe ganz hinten', () => {
  const liste = [v('A'), v('B', { folgtSeitTagen: 437 }), v('C', { folgtSeitTagen: 12 })];
  assert.deepEqual(sortiereZuschauer(liste, 'treue').map((e) => e.nickname), ['B', 'C', 'A'],
    'wer keine Angabe hat, steht hinten — nicht bei 0 Tagen einsortiert');
});

test('sortiereZuschauer: zwei ohne Angabe bleiben nach Namen sortiert', () => {
  const liste = [v('Zoe'), v('Anna')];
  assert.deepEqual(sortiereZuschauer(liste, 'treue').map((e) => e.nickname), ['Anna', 'Zoe']);
});

test('sortiereZuschauer: nach eigener Kanalgroesse', () => {
  const liste = [v('klein', { followerCount: 21 }), v('gross', { followerCount: 5_650 }), v('unbekannt')];
  assert.deepEqual(sortiereZuschauer(liste, 'groesse').map((e) => e.nickname), ['gross', 'klein', 'unbekannt']);
});

test('sortiereZuschauer: Name sortiert deutsch (Umlaute)', () => {
  const liste = [v('Zoe'), v('Ärger'), v('Anna')];
  assert.deepEqual(sortiereZuschauer(liste, 'name').map((e) => e.nickname), ['Anna', 'Ärger', 'Zoe']);
});

test('sortiereZuschauer: aendert die Vorlage nicht', () => {
  const liste = [v('B', { points: 1 }), v('A', { points: 9 })];
  sortiereZuschauer(liste, 'punkte');
  assert.equal(liste[0]?.nickname, 'B', 'die uebergebene Liste bleibt unberuehrt');
});

test('treueZeile: echte Werte aus dem Mitschnitt', () => {
  // J.Ezra, 20.08.2026: folgt 874 Tage, Fanclub 841 Tage, Superfan 27 Monate.
  assert.equal(
    treueZeile({ folgtSeitTagen: 874, fanclubSeitTagen: 841, superfanSeitMonaten: 27, followerCount: 678 }),
    'folgt seit 2,4 Jahren · Teamherz 2,3 Jahren · Superfan 27 Mon. · 678 Follower',
  );
});

test('treueZeile: ohne Angaben bleibt sie LEER', () => {
  assert.equal(treueZeile({}), '', 'lieber nichts zeigen als „0 Tage" behaupten');
});

test('treueZeile: Top-Schenker', () => {
  assert.equal(treueZeile({ istTopGifter: true }), 'Top-Schenker');
});

test('jahreOderTage: unter einem Jahr bleiben es Tage', () => {
  assert.equal(jahreOderTage(364), '364 Tagen');
  assert.equal(jahreOderTage(365), '1,0 Jahren');
  assert.equal(jahreOderTage(437), '1,2 Jahren');
});
