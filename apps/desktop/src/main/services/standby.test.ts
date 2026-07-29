import test from 'node:test';
import assert from 'node:assert/strict';
import { nachDemAufwachen } from './standby';

const lage = (p: Partial<Parameters<typeof nachDemAufwachen>[0]> = {}) =>
  ({ warVerbunden: true, username: 'dotexe_97', jetztVerbunden: false, ...p });

test('war verbunden, ist es nicht mehr → wieder verbinden', () => {
  assert.deepEqual(nachDemAufwachen(lage()), { tu: 'wiederverbinden', username: 'dotexe_97' });
});

test('war gar nicht verbunden → nichts tun', () => {
  // Wer die App nur offen hatte, ohne zu streamen, soll nach dem Aufwachen
  // nicht plötzlich verbunden werden.
  assert.equal(nachDemAufwachen(lage({ warVerbunden: false })).tu, 'nichts');
});

test('von selbst wieder verbunden → nicht dazwischenfunken', () => {
  // Der Adapter hat einen eigenen Reconnect. War der schneller, würde ein
  // zweiter Verbindungsaufbau die frische Verbindung wieder abreißen.
  assert.equal(nachDemAufwachen(lage({ jetztVerbunden: true })).tu, 'nichts');
});

test('kein Nutzername gemerkt → nichts tun', () => {
  assert.equal(nachDemAufwachen(lage({ username: '   ' })).tu, 'nichts');
});

test('Leerzeichen am Namen werden abgeschnitten', () => {
  const e = nachDemAufwachen(lage({ username: '  dotexe_97 ' }));
  assert.deepEqual(e, { tu: 'wiederverbinden', username: 'dotexe_97' });
});
