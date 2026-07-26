// gift-menu.test.ts — Parsing der Eintragsliste inkl. optionaler Challenge-Dauer
// sowie die reine Shuffle-Fahrplan-Logik der Lucky-Card (beides DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItems, shuffleSchedule } from './gift-menu.js';

test('parseItems: 3. Feld = Sekunden, 2-Feld unverändert, :: im Text bleibt', () => {
  assert.deepEqual(parseItems('galaxy::still sein::60'), [{ slug: 'galaxy', text: 'still sein', secs: 60 }]);
  assert.deepEqual(parseItems('rose::Konfetti'), [{ slug: 'rose', text: 'Konfetti', secs: 0 }]);
  assert.deepEqual(parseItems('x::a::b::90'), [{ slug: 'x', text: 'a::b', secs: 90 }]); // :: im Text
  assert.deepEqual(parseItems('y::42'), [{ slug: 'y', text: '42', secs: 0 }]); // reine Zahl = Text, kein Timer
});

test('shuffleSchedule: aufsteigende Zeitpunkte, letzter ~= totalMs, ease-out', () => {
  const s = shuffleSchedule(10, 2000);
  assert.equal(s.length, 10);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1]); // monoton
  assert.ok(s[s.length - 1] <= 2000);
  assert.ok(s[1] - s[0] < s[s.length - 1] - s[s.length - 2]); // wird langsamer
});
