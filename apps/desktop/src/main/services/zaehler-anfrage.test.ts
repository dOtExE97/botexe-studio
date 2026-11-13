// zaehler-anfrage.test.ts — Parameter von POST /api/zaehler (Piraten-Zähler).
import test from 'node:test';
import assert from 'node:assert/strict';
import { zaehlerAnfrage } from './zaehler-anfrage';

const mit = (p: Record<string, string>) => zaehlerAnfrage((n) => p[n]);

test('zaehlerAnfrage: plus ist Standard, Namen mit Aliasen', () => {
  assert.deepEqual(mit({ zaehler: 'kills' }), { zaehler: 'kills', delta: 1 });
  assert.deepEqual(mit({ zaehler: 'Kill', aktion: 'plus', anzahl: '3' }), { zaehler: 'kills', delta: 3 });
  for (const n of ['siege', 'vr', 'VR', 'wins', 'win', 'victory', 'sieg']) {
    assert.deepEqual(mit({ zaehler: n }), { zaehler: 'siege', delta: 1 }, n);
  }
  // `wert` als Name (Schreibweise aus der Absprache) geht auch.
  assert.deepEqual(mit({ wert: 'wins', aktion: 'minus' }), { zaehler: 'siege', delta: -1 });
});

test('zaehlerAnfrage: reset und setzen', () => {
  assert.deepEqual(mit({ zaehler: 'kills', aktion: 'reset' }), { zaehler: 'kills', wert: 0 });
  assert.deepEqual(mit({ zaehler: 'siege', aktion: 'setzen', auf: '12' }), { zaehler: 'siege', wert: 12 });
  assert.deepEqual(mit({ zaehler: 'siege', aktion: 'setzen', auf: '0' }), { zaehler: 'siege', wert: 0 });
});

test('zaehlerAnfrage: Unsinn wird mit klarer Meldung abgelehnt', () => {
  for (const p of [
    {}, { zaehler: 'tore' }, { zaehler: 'kills', aktion: 'mal2' },
    { zaehler: 'kills', anzahl: '0' }, { zaehler: 'kills', anzahl: '101' }, { zaehler: 'kills', anzahl: '-2' }, { zaehler: 'kills', anzahl: 'x' },
    { zaehler: 'kills', aktion: 'setzen' }, { zaehler: 'kills', aktion: 'setzen', auf: '100000' }, { zaehler: 'kills', aktion: 'setzen', auf: '1.5' },
  ]) {
    const r = mit(p as Record<string, string>);
    assert.ok('fehler' in r, JSON.stringify(p));
  }
});
