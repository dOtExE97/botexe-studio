// command-carousel.test.ts — Parsing der Eintragsliste (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItems } from './command-carousel.js';

test('neues Format: "slug::Text" → Gift + Label', () => {
  assert.deepEqual(parseItems('rose::!feuer | heart::Liebe'), [
    { slug: 'rose', emoji: '', label: '!feuer' },
    { slug: 'heart', emoji: '', label: 'Liebe' },
  ]);
});

test('"slug::" ohne Text = nur Gift (Label leer)', () => {
  assert.deepEqual(parseItems('galaxy::'), [{ slug: 'galaxy', emoji: '', label: '' }]);
});

test('Legacy: führendes Emoji wird abgetrennt (slug leer)', () => {
  assert.deepEqual(parseItems('🔥 !feuer | 🎵 Musik'), [
    { slug: '', emoji: '🔥', label: '!feuer' },
    { slug: '', emoji: '🎵', label: 'Musik' },
  ]);
});

test('Legacy: Emoji mit Variation-Selector (❤️)', () => {
  assert.deepEqual(parseItems('❤️ Liebe'), [{ slug: '', emoji: '❤️', label: 'Liebe' }]);
});

test('Eintrag ohne alles = nur Label', () => {
  assert.deepEqual(parseItems('!nurtext'), [{ slug: '', emoji: '', label: '!nurtext' }]);
});

test('leere Einträge werden verworfen, leere Eingabe = []', () => {
  assert.equal(parseItems('rose::a | | b').length, 2);
  assert.deepEqual(parseItems(''), []);
});
