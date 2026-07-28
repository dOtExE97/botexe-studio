import test from 'node:test';
import assert from 'node:assert/strict';
import { leseRangUpdate, besterRang } from './tiktok-rank';

test('liest Platz, Art und Restzeit — auch wenn TikTok sie als Text schickt', () => {
  // TikTok liefert ownRank und countdown als Zeichenkette, rankType als Zahl.
  const r = leseRangUpdate({ updates: [{ rankType: 0, ownRank: '12', countdown: '1800' }] }, 1000);
  assert.equal(r.length, 1);
  assert.equal(r[0]?.platz, 12);
  assert.equal(r[0]?.art, 'Stunden-Rangliste');
  assert.equal(r[0]?.restSek, 1800);
  assert.equal(r[0]?.at, 1000);
});

test('Einträge ohne Platzierung fallen weg', () => {
  // TikTok schickt auch Ranglisten mit, in denen man gar nicht auftaucht.
  const r = leseRangUpdate({ updates: [
    { rankType: 0, ownRank: '0' },
    { rankType: 1, ownRank: '' },
    { rankType: 8, ownRank: '5' },
  ] }, 0);
  assert.equal(r.length, 1);
  assert.equal(r[0]?.art, 'Tages-Rangliste');
});

test('unbekannte Ranglisten-Art bekommt trotzdem einen lesbaren Namen', () => {
  const r = leseRangUpdate({ updates: [{ rankType: 99, ownRank: '3' }] }, 0);
  assert.equal(r[0]?.art, 'Rangliste 99');
});

test('kaputte oder leere Daten ergeben eine leere Liste, keinen Fehler', () => {
  for (const müll of [undefined, null, {}, { updates: null }, { updates: [] }, { updates: [null] }, 'quatsch']) {
    assert.deepEqual(leseRangUpdate(müll, 0), [], JSON.stringify(müll));
  }
});

test('besterRang nimmt den kleinsten Platz', () => {
  // Platz 3 in der Stundenliste ist die Nachricht, nicht Platz 240 in der Woche.
  const staende = leseRangUpdate({ updates: [
    { rankType: 1, ownRank: '240' },
    { rankType: 0, ownRank: '3' },
    { rankType: 8, ownRank: '57' },
  ] }, 0);
  assert.equal(besterRang(staende)?.platz, 3);
  assert.equal(besterRang(staende)?.art, 'Stunden-Rangliste');
  assert.equal(besterRang([]), null);
});
