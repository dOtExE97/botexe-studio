// gift-menu.test.ts — Parsing der Eintragsliste inkl. optionaler Challenge-Dauer (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItems } from './gift-menu.js';

test('parseItems: 3. Feld = Sekunden, 2-Feld unverändert, :: im Text bleibt', () => {
  assert.deepEqual(parseItems('galaxy::still sein::60'), [{ slug: 'galaxy', text: 'still sein', secs: 60 }]);
  assert.deepEqual(parseItems('rose::Konfetti'), [{ slug: 'rose', text: 'Konfetti', secs: 0 }]);
  assert.deepEqual(parseItems('x::a::b::90'), [{ slug: 'x', text: 'a::b', secs: 90 }]); // :: im Text
  assert.deepEqual(parseItems('y::42'), [{ slug: 'y', text: '42', secs: 0 }]); // reine Zahl = Text, kein Timer
});
