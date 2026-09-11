import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyRotator, naechsteMitternacht } from './key-rotator';

const T = 1_700_000_000_000; // fester „jetzt"-Zeitpunkt fürs Testen

test('leere/doppelte Keys werden bereinigt, Reihenfolge bleibt', () => {
  const r = new KeyRotator(['  a ', 'b', 'a', '', '  ']);
  assert.equal(r.anzahl(), 2);
  assert.equal(r.aktiv(T), 'a');
});

test('4401/4403: sofort zum nächsten Key', () => {
  for (const code of [4401, 4403]) {
    const r = new KeyRotator(['a', 'b']);
    const e = r.meldeFehler(code, T);
    assert.equal(e.wechsel, true, `Code ${code}`);
    assert.equal(e.aktiv, 'b');
    // 'a' ist jetzt für heute gesperrt.
    assert.equal(r.aktiv(T), 'b');
  }
});

test('1011: erst am selben Key wiederholen, dann wechseln', () => {
  const r = new KeyRotator(['a', 'b']);
  const e1 = r.meldeFehler(1011, T);
  assert.equal(e1.wechsel, false, 'erster 1011 → derselbe Key nochmal');
  assert.equal(e1.aktiv, 'a');
  const e2 = r.meldeFehler(1011, T);
  assert.equal(e2.wechsel, true, 'zweiter 1011 → wechseln');
  assert.equal(e2.aktiv, 'b');
});

test('Erfolg setzt den 1011-Zähler zurück (kein vorzeitiger Wechsel)', () => {
  const r = new KeyRotator(['a', 'b']);
  r.meldeFehler(1011, T);       // 1/2
  r.meldeErfolg(T);             // Verbindung kam doch zustande
  const e = r.meldeFehler(1011, T); // wieder 1/2, NICHT 2/2
  assert.equal(e.wechsel, false);
  assert.equal(e.aktiv, 'a');
});

test('1006/4404/4005 lösen NIE einen Wechsel aus', () => {
  for (const code of [1006, 4404, 4005, 1000]) {
    const r = new KeyRotator(['a', 'b']);
    const e = r.meldeFehler(code, T);
    assert.equal(e.wechsel, false, `Code ${code}`);
    assert.equal(e.aktiv, 'a');
  }
});

test('alle Keys erschöpft → aktiv() ist null', () => {
  const r = new KeyRotator(['a', 'b']);
  r.meldeFehler(4401, T); // a gesperrt → b
  r.meldeFehler(4401, T); // b gesperrt → keiner
  assert.equal(r.aktiv(T), null);
});

test('nach Mitternacht ist ein gesperrter Key wieder frei', () => {
  const r = new KeyRotator(['a', 'b']);
  r.meldeFehler(4401, T);           // a bis Mitternacht gesperrt
  assert.equal(r.aktiv(T), 'b');
  const morgen = naechsteMitternacht(T) + 1000;
  assert.equal(r.aktiv(morgen), 'a', 'a ist wieder der bevorzugte erste Key');
});

test('naechsteMitternacht liegt in der Zukunft und ≤ 24h entfernt', () => {
  const m = naechsteMitternacht(T);
  assert.ok(m > T);
  assert.ok(m - T <= 24 * 3600 * 1000);
});

test('ein einzelner Key: kein Wechsel möglich, aber Logik bricht nicht', () => {
  const r = new KeyRotator(['nur-einer']);
  const e = r.meldeFehler(4401, T);
  assert.equal(e.wechsel, false, 'kein anderer Key da');
  assert.equal(e.aktiv, null, 'der eine ist jetzt gesperrt');
});
