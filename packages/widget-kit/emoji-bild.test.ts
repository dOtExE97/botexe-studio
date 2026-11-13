// emoji-bild.test.ts — Emoji-Folgen → Twemoji-Dateinamen (offizielle Regel)
// und der DOM-Teil: Bild mit Zeichen als alt, Fehler → wieder Text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installiereFakeDom, type FakeElement } from './fake-dom.test-helfer.ts';
import { twemojiCode, twemojiUrl, emojiTeile, haengeTextAn, TWEMOJI_BASIS } from './emoji-bild.js';

/** Form der Zerlegung: Text bleibt Text, Emojis als [code]. */
const form = (t: string) => emojiTeile(t).map((x: { art: string; wert: string; code?: string }) => (x.art === 'emoji' ? `[${x.code}]` : x.wert));

test('Twemoji-Namensregel: die vier Pflicht-Beispiele', () => {
  assert.equal(twemojiCode('🏴‍☠️'), '1f3f4-200d-2620-fe0f', 'mit ZWJ bleibt die VS16 stehen');
  assert.equal(twemojiCode('❤️'), '2764', 'ohne ZWJ fällt die VS16 weg');
  assert.equal(twemojiCode('👍🏽'), '1f44d-1f3fd', 'Hautton bleibt Teil des Namens');
  assert.equal(twemojiCode('🇩🇪'), '1f1e9-1f1ea', 'Flagge = zwei Regional-Indikatoren');
});

test('Weitere Folgen: Tastenkappe, Regenbogenflagge, Beruf mit Hautton, Schottland', () => {
  assert.deepEqual(form('1️⃣'), ['[31-20e3]']);
  assert.deepEqual(form('🏳️‍🌈'), ['[1f3f3-fe0f-200d-1f308]']);
  assert.deepEqual(form('👩🏽‍💻'), ['[1f469-1f3fd-200d-1f4bb]']);
  assert.deepEqual(form('🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'), ['[1f3f4-e0067-e0062-e0073-e0063-e0074-e007f]']);
});

test('Zerlegung: Emojis werden zu Teilen, der Text dazwischen bleibt exakt', () => {
  assert.deepEqual(form('Ahoi 🏴‍☠️ und 💰!'), ['Ahoi ', '[1f3f4-200d-2620-fe0f]', ' und ', '[1f4b0]', '!']);
  assert.deepEqual(form('🔥🔥'), ['[1f525]', '[1f525]'], 'zwei gleiche Emojis bleiben zwei');
  assert.deepEqual(form('❤ ohne VS16'), ['[2764]', ' ohne VS16'], 'das nackte Herz ist im Chat ein Herz');
});

test('Reine Text-Zeichen bleiben Text: ©, ™, ↔, ☺, Ziffern, #', () => {
  assert.deepEqual(form('© 2026 Marke™ ↔ ☺ 12 #3'), ['© 2026 Marke™ ↔ ☺ 12 #3']);
  assert.deepEqual(form(''), []);
  assert.deepEqual(emojiTeile(undefined as unknown as string), []);
});

test('Bild-Adresse zeigt auf Twemoji 15.1.0 (jdecked) als SVG', () => {
  assert.equal(twemojiUrl('2764'), 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/2764.svg');
  assert.ok(TWEMOJI_BASIS.endsWith('/assets/svg/'));
});

test('DOM: Text als Textknoten, Emoji als <img class="emoji"> mit dem Zeichen als alt', () => {
  const el = installiereFakeDom();
  haengeTextAn(el, 'Ahoi 🏴‍☠️!');
  assert.deepEqual(el.children.map((k: FakeElement) => k.tagName), ['#TEXT', 'IMG', '#TEXT']);
  const img = el.children[1] as FakeElement & { alt?: string };
  assert.equal(img.className, 'emoji');
  assert.equal(img.alt, '🏴‍☠️');
  assert.equal(img.src, twemojiUrl('1f3f4-200d-2620-fe0f'));
  // Lädt das Bild nicht, steht wieder das Zeichen an derselben Stelle.
  img.feuere('error');
  assert.deepEqual(el.children.map((k: FakeElement) => k.tagName), ['#TEXT', '#TEXT', '#TEXT']);
  assert.equal(el.children.map((k: FakeElement) => k.textContent).join(''), 'Ahoi 🏴‍☠️!');
});

test('DOM: Zuschauertext mit HTML wird nie als HTML gelesen', () => {
  const el = installiereFakeDom();
  haengeTextAn(el, '<img src=x onerror=alert(1)> 🔥');
  assert.equal(el.children[0]!.tagName, '#TEXT');
  assert.equal(el.children[0]!.textContent, '<img src=x onerror=alert(1)> ');
  assert.equal(el.innerHTML, '', 'innerHTML wurde nie beschrieben');
});
