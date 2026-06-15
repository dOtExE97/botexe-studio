// command-carousel.test.ts — Parsing der Eintragsliste (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItems } from './command-carousel.js';

test('trennt führendes Emoji vom Label', () => {
  assert.deepEqual(parseItems('🔥 !feuer | 🎵 Musik'), [
    { emoji: '🔥', label: '!feuer' },
    { emoji: '🎵', label: 'Musik' },
  ]);
});

test('Emoji mit Variation-Selector (❤️) wird erkannt', () => {
  assert.deepEqual(parseItems('❤️ Liebe'), [{ emoji: '❤️', label: 'Liebe' }]);
});

test('Eintrag ohne Emoji = nur Label', () => {
  assert.deepEqual(parseItems('!nurtext'), [{ emoji: '', label: '!nurtext' }]);
});

test('leere Einträge werden verworfen, leere Eingabe = []', () => {
  assert.equal(parseItems('🔥 a | | b').length, 2);
  assert.deepEqual(parseItems(''), []);
});
