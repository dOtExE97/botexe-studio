import test from 'node:test';
import assert from 'node:assert/strict';
import { kennzahl, imZeitraum, trend, besteWochentage, besterStream, type StreamEintrag } from './analyse';

const TAG = 86_400_000;
const stream = (at: number, coins: number): StreamEintrag => ({
  at, coins, gifts: 0, likes: 0, chats: 0, follows: 0, shares: 0, peakViewers: 0,
});

test('kennzahl: Abweichung vom Schnitt', () => {
  const k = kennzahl(1500, [1000, 1000, 1000]);
  assert.equal(k.schnitt, 1000);
  assert.equal(k.abweichung, 50, '50 % über dem Schnitt');

  const schlechter = kennzahl(500, [1000, 1000]);
  assert.equal(schlechter.abweichung, -50);
});

test('kennzahl: ohne Vergleichsdaten keine erfundene Aussage', () => {
  // Beim allerersten Stream gibt es keinen Schnitt — dann darf dort auch nicht
  // „100 % besser" stehen.
  const k = kennzahl(800, []);
  assert.equal(k.schnitt, 0);
  assert.equal(k.abweichung, 0);
});

test('imZeitraum: filtert und sortiert älteste zuerst', () => {
  const jetzt = 100 * TAG;
  const alle = [stream(jetzt - 40 * TAG, 1), stream(jetzt - 2 * TAG, 2), stream(jetzt - 5 * TAG, 3)];
  const woche = imZeitraum(alle, 7, jetzt);
  assert.equal(woche.length, 2);
  assert.equal(woche[0]?.coins, 3, 'ältester zuerst');
  assert.equal(woche[1]?.coins, 2);
});

test('trend: erkennt Aufwärts und Abwärts, ignoriert Rauschen', () => {
  assert.equal(trend([100, 100, 200, 200]).richtung, 'hoch');
  assert.equal(trend([200, 200, 100, 100]).richtung, 'runter');
  // Kleine Schwankung ist keine Entwicklung — sonst zeigt die Anzeige bei
  // jedem Stream eine „Tendenz", die keine ist.
  assert.equal(trend([100, 100, 104, 103]).richtung, 'gleich');
});

test('trend: zu wenige Streams ergeben keine Aussage', () => {
  assert.equal(trend([100, 300]).richtung, 'gleich');
  assert.equal(trend([]).richtung, 'gleich');
});

test('besteWochentage: braucht mindestens zwei Streams pro Tag', () => {
  // Ein einzelner guter Abend ist Zufall, kein Muster — er darf nicht als
  // „bester Wochentag" verkauft werden.
  const montag = new Date('2026-07-06T20:00:00Z').getTime();  // Montag
  const dienstag = new Date('2026-07-07T20:00:00Z').getTime();
  const eintraege = [
    stream(montag, 1000),
    stream(montag + 7 * TAG, 2000),   // zweiter Montag
    stream(dienstag, 9999),           // nur EIN Dienstag
  ];
  const tage = besteWochentage(eintraege);
  assert.equal(tage.length, 1, 'nur der Montag hat genug Daten');
  assert.equal(tage[0]?.tag, 'Montag');
  assert.equal(tage[0]?.schnitt, 1500);
  assert.equal(tage[0]?.anzahl, 2);
});

test('besterStream: der mit den meisten Coins', () => {
  const b = besterStream([stream(1, 100), stream(2, 900), stream(3, 400)]);
  assert.equal(b?.coins, 900);
  assert.equal(besterStream([]), null);
});
