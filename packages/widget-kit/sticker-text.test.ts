import test from 'node:test';
import assert from 'node:assert/strict';
import { textMitStickern, hatInhalt } from './sticker-text.js';

const s = (id, index) => ({ id, bild: 'https://x/' + id + '.webp', index });
/** Nur die Form vergleichen: Text-Stücke als Text, Sticker als <S>. */
const form = (teile) => teile.map((t) => (t.art === 'text' ? t.wert : '<S>'));

test('reine Sticker-Nachricht (Text ist nur ein Leerzeichen)', () => {
  const teile = textMitStickern(' ', [s('1', 0)]);
  assert.equal(teile.filter((t) => t.art === 'sticker').length, 1);
  assert.deepEqual(form(teile), ['<S>', ' '], 'das Leerzeichen bleibt, der Sticker steht davor');
});

test('Sticker mitten im Text landet an der richtigen Stelle', () => {
  assert.deepEqual(form(textMitStickern('hallo welt', [s('1', 5)])), ['hallo', '<S>', ' welt']);
});

test('Position außerhalb des Textes hängt den Sticker hinten an, statt zu zerreißen', () => {
  const teile = textMitStickern('hi', [s('1', 99)]);
  assert.deepEqual(form(teile), ['hi', '<S>']);
});

test('mehrere Sticker bleiben in aufsteigender Reihenfolge', () => {
  const teile = textMitStickern('abcd', [s('2', 3), s('1', 1)]);
  assert.deepEqual(teile.filter((t) => t.art === 'sticker').map((t) => t.wert.id), ['1', '2']);
  assert.deepEqual(form(teile), ['a', '<S>', 'bc', '<S>', 'd']);
});

test('zwei Sticker an derselben Stelle erzeugen kein leeres Text-Stück', () => {
  const teile = textMitStickern('ab', [s('1', 1), s('2', 1)]);
  assert.deepEqual(form(teile), ['a', '<S>', '<S>', 'b']);
});

test('ohne Sticker kommt genau ein Text-Teil zurück', () => {
  assert.deepEqual(textMitStickern('nur text', []), [{ art: 'text', wert: 'nur text' }]);
});

test('Sticker ohne id werden ignoriert', () => {
  assert.deepEqual(textMitStickern('hi', [{ bild: 'x', index: 0 }]), [{ art: 'text', wert: 'hi' }]);
});

test('leerer Text mit Sticker liefert trotzdem den Sticker', () => {
  // Der Kern des ganzen Fehlers: leerer Text heißt NICHT „nichts anzuzeigen".
  assert.deepEqual(form(textMitStickern('', [s('1', 0)])), ['<S>']);
});

// ── Waechter gegen den urspruenglichen Fehler ──────────────────────────────
// Frueher stand in chat-box.js `if (!event.text) return;` — damit verschwand
// jede reine Sticker-Nachricht spurlos. Diese Tests werden rot, falls jemand
// die Entscheidung wieder auf „nur Text zaehlt" zurueckdreht.

test('hatInhalt: reine Sticker-Nachricht wird ANGEZEIGT', () => {
  assert.equal(hatInhalt({ text: ' ', sticker: [s('1', 0)] }), true);
  assert.equal(hatInhalt({ text: '', sticker: [s('1', 0)] }), true);
});

test('hatInhalt: normaler Text wird angezeigt', () => {
  assert.equal(hatInhalt({ text: 'hallo' }), true);
});

test('hatInhalt: wirklich leere Nachricht wird verworfen', () => {
  assert.equal(hatInhalt({ text: '' }), false);
  assert.equal(hatInhalt({ text: ' ', sticker: [] }), true, 'ein Leerzeichen ist Text — nur ohne alles wird verworfen');
});

test('hatInhalt: Sticker ohne id zaehlt nicht als Inhalt', () => {
  assert.equal(hatInhalt({ text: '', sticker: [{ bild: 'x' }] }), false);
});
