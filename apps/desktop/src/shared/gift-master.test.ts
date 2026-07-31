// Auflösung Gift-ID → Anzeigename. Gebraucht von der Trigger-Seite für aus
// TikFinity importierte Regeln, die das Geschenk als Zahl speichern
// (gift_id_is: 16369) statt als Namen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MASTER, masterKey, masterNameById } from './gift-master';

test('masterNameById: bekannte ID → Name, unbekannte → undefined', () => {
  const rose = MASTER.find((m) => masterKey(m.name) === 'rose');
  assert.ok(rose, 'Rose muss in der eingebauten Liste stehen');
  assert.equal(masterNameById(rose.id), rose.de ?? rose.name);
  assert.equal(masterNameById(-1), undefined);
});

test('masterNameById: jede ID der Liste ist auflösbar (keine Lücke)', () => {
  const ohneNamen = MASTER.filter((m) => m.id && !masterNameById(m.id));
  assert.equal(ohneNamen.length, 0, `IDs ohne Namen: ${ohneNamen.slice(0, 5).map((m) => m.id).join(', ')}`);
});
