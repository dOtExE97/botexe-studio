// emojify.test.ts — Emojis aus Chat-Text ziehen (DOM-frei).
// Grapheme-korrekt: zusammengesetzte Emojis (Hautton, ZWJ, Flaggen) bleiben eins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEmojis } from './emojify.js';

test('zieht einzelne Emojis aus Text', () => {
  assert.deepEqual(extractEmojis('Hey 🔥 cool 😂!'), ['🔥', '😂']);
});

test('Text ohne Emoji ergibt leere Liste', () => {
  assert.deepEqual(extractEmojis('nur text 123'), []);
});

test('Hautton-Modifier bleibt am Emoji (ein Grapheme)', () => {
  assert.deepEqual(extractEmojis('👍🏽'), ['👍🏽']);
});

test('ZWJ-Sequenz bleibt ein Emoji', () => {
  // Familie 👨‍👩‍👧 ist EIN sichtbares Emoji
  assert.deepEqual(extractEmojis('👨‍👩‍👧 hi'), ['👨‍👩‍👧']);
});

test('begrenzt auf max', () => {
  assert.equal(extractEmojis('🔥🔥🔥🔥🔥', 3).length, 3);
});

test('leere/undefined Eingabe ergibt leere Liste', () => {
  assert.deepEqual(extractEmojis(''), []);
  assert.deepEqual(extractEmojis(undefined), []);
});
