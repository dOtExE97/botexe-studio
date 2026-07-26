// GiftCommandListEditor.test.ts — parse/serialize-Roundtrip inkl. optionaler
// Challenge-Dauer (secs). DOM-frei, testet nur die reine Parsing-Logik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize } from './GiftCommandListEditor';

test('GiftCommandListEditor serialize: secs nur wenn gesetzt', () => {
  assert.equal(serialize([{ slug: 'galaxy', text: 'still sein', secs: 60 }]), 'galaxy::still sein::60');
  assert.equal(serialize([{ slug: 'rose', text: 'Konfetti' }]), 'rose::Konfetti');
});

test('GiftCommandListEditor parse: 3. Feld = Sekunden, 2-Feld unverändert', () => {
  assert.deepEqual(parse('galaxy::still sein::60'), [{ slug: 'galaxy', text: 'still sein', secs: 60 }]);
  assert.deepEqual(parse('rose::Konfetti'), [{ slug: 'rose', text: 'Konfetti' }]);
});

test('GiftCommandListEditor roundtrip: parse(serialize(x)) === x', () => {
  const rows = [{ slug: 'galaxy', text: 'still sein', secs: 60 }, { slug: 'rose', text: 'Konfetti' }];
  assert.deepEqual(parse(serialize(rows)), rows);
});
