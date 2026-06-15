// social-rotator.test.ts — Parsing der Kanal-Konfiguration (DOM-frei).
// Format pro Eintrag: "plattform:Anzeigetext", mit | getrennt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChannels } from './social-rotator.js';

test('parst Plattform + Anzeigetext je Eintrag', () => {
  const r = parseChannels('tiktok:dotexe_97 | instagram:@exe');
  assert.deepEqual(r, [
    { platform: 'tiktok', text: 'dotexe_97' },
    { platform: 'instagram', text: '@exe' },
  ]);
});

test('unbekannte Plattform fällt auf generischen Link zurück', () => {
  const r = parseChannels('whatsapp:Gruppe');
  assert.equal(r[0].platform, 'link');
  assert.equal(r[0].text, 'Gruppe');
});

test('Eintrag ohne Doppelpunkt = generischer Link mit ganzem Text', () => {
  const r = parseChannels('Link in Bio!');
  assert.deepEqual(r, [{ platform: 'link', text: 'Link in Bio!' }]);
});

test('leere/whitespace Einträge werden verworfen', () => {
  const r = parseChannels('tiktok:exe |  | | youtube:exe ');
  assert.equal(r.length, 2);
  assert.equal(r[0].platform, 'tiktok');
  assert.equal(r[1].platform, 'youtube');
});

test('Plattform case-insensitiv, Doppelpunkt im Text bleibt erhalten', () => {
  const r = parseChannels('YouTube:youtube.com/@exe');
  assert.deepEqual(r, [{ platform: 'youtube', text: 'youtube.com/@exe' }]);
});

test('leere Eingabe ergibt leere Liste', () => {
  assert.deepEqual(parseChannels(''), []);
  assert.deepEqual(parseChannels('   '), []);
});
