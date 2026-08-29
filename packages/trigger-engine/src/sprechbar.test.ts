import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sprechbar, sprechbarerName, istSprechbar } from './sprechbar';

test('Schmuckschriften werden zu normalen Buchstaben', () => {
  assert.equal(sprechbar('𝓐𝓵𝓮𝔁'), 'Alex', 'Schreibschrift');
  assert.equal(sprechbar('𝔸𝕝𝕖𝕩'), 'Alex', 'Doppelstrich');
  assert.equal(sprechbar('𝐀𝐥𝐞𝐱'), 'Alex', 'fett');
  assert.equal(sprechbar('𝘈𝘭𝘦𝘹'), 'Alex', 'kursiv');
  assert.equal(sprechbar('𝔄𝔩𝔢𝔵'), 'Alex', 'Fraktur');
  assert.equal(sprechbar('𝙰𝚕𝚎𝚡'), 'Alex', 'Schreibmaschine');
  assert.equal(sprechbar('Ａｌｅｘ'), 'Alex', 'Breitschrift');
  assert.equal(sprechbar('ᴀʟᴇx'), 'ALEx', 'Kapitälchen');
  assert.equal(sprechbar('🅰🅻🅴🆇'), 'ALEX', 'umrahmt');
  assert.equal(sprechbar('🅐🅛🅔🅧'), 'ALEX', 'ausgefüllte Kreise');
});

test('Deutsch bleibt Deutsch — Umlaute überleben', () => {
  // Die naheliegende Lösung (NFKD + Akzente entfernen) macht daraus „Fur
  // Grosse Massnahmen" ohne Umlaute. Deshalb NFKC.
  assert.equal(sprechbar('Müller Käse Öl'), 'Müller Käse Öl');
  assert.equal(sprechbar('Straße'), 'Straße');
  assert.equal(sprechbar('José Renée'), 'José Renée');
});

test('echte fremde Schriften bleiben stehen', () => {
  // Wer kyrillisch oder japanisch heißt, soll auch so vorgelesen werden.
  assert.equal(sprechbar('Дмитрий'), 'Дмитрий');
  assert.equal(sprechbar('さくら'), 'さくら');
});

test('unsichtbarer Ballast fliegt raus', () => {
  assert.equal(sprechbar('Al​ex'), 'Alex', 'Nullbreiten-Zeichen');
  // Die Darstellungswahl BLEIBT — siehe den Test zu zusammengesetzten Emojis.
  assert.equal(sprechbar('  Alex   B  '), 'Alex B', 'Leerraum');
});

test('Zalgo wird entstapelt, normale Akzente nicht', () => {
  // Vier gestapelte Akzente auf einem A. NFKC zieht den ERSTEN mit dem A zu
  // einem fertigen „À" zusammen — das ist ein ganz normaler Buchstabe und darf
  // bleiben. Weg müssen nur die drei, die noch obendrauf liegen.
  const zalgo = `A${'\u0300\u0301\u0302\u0303'}lex`;
  assert.equal(sprechbar(zalgo), 'Àlex');
  assert.equal([...sprechbar(zalgo)].filter((z) => /\p{Mn}/u.test(z)).length, 0, 'keine losen Akzente mehr');
  // Ein einzelner Akzent ist eine echte Schreibweise und bleibt.
  assert.equal(sprechbar('é'), 'é'.normalize('NFKC'));
});

test('Namen aus reinen Zierzeichen bekommen einen Ersatz', () => {
  // Sonst verstummt die Stimme mitten im Satz oder liest Zeichennamen vor.
  assert.equal(sprechbarerName('🌸🌸🌸'), 'Jemand');
  assert.equal(sprechbarerName(''), 'Jemand');
  assert.equal(sprechbarerName(undefined), 'Jemand');
  assert.equal(sprechbarerName('★☆✦'), 'Jemand', 'reine Symbole');
  // GEGENPROBE: „彡" sieht aus wie Zierrat, ist aber ein echtes Schriftzeichen —
  // es bleibt stehen. Der Ersatz greift nur, wenn WIRKLICH kein Buchstabe und
  // keine Ziffer übrig ist.
  assert.equal(sprechbarerName('★彡'), '★彡');
  assert.equal(sprechbarerName('🌸 Mia 🌸'), '🌸 Mia 🌸', 'Emojis neben echtem Text bleiben');
  assert.equal(sprechbarerName('𝓜𝓲𝓪'), 'Mia');
  assert.equal(sprechbarerName('🌸', 'Ein Zuschauer'), 'Ein Zuschauer', 'eigener Ersatz');
});

test('istSprechbar erkennt leere Hüllen', () => {
  assert.equal(istSprechbar('🌸🌸'), false);
  assert.equal(istSprechbar('𝓐'), true);
  assert.equal(istSprechbar('7'), true);
});

test('renderSpeakTemplate lässt den Namen in Ruhe', async () => {
  // WICHTIG: Dieselbe Vorlage füllt Ansagen UND Chat-Antworten. Würde der Name
  // hier schon geglättet, schriebe die App „Danke Mia!" an eine Zuschauerin,
  // die 𝓜𝓲𝓪 heißt — und bei einem Namen aus reinen Emojis stünde im Chat
  // „Danke Jemand!". Sprechbar gemacht wird erst im Sprechweg
  // (fuerAnsageAufbereiten in studio.ts).
  const { renderSpeakTemplate } = await import('./index');
  const ev = { type: 'chat', ts: 1, user: { id: 'u', nickname: '𝓜𝓲𝓪' }, text: 'hi' } as Parameters<typeof renderSpeakTemplate>[1];
  assert.equal(renderSpeakTemplate('Danke {user}!', ev), 'Danke 𝓜𝓲𝓪!');
});

test('zusammengesetzte Emojis bleiben heil', () => {
  // AN ECHTEN LIVE-DATEN GEFUNDEN: Eine Zuschauerin heißt „Miri1997🎮❤️🐈‍⬛".
  // Der erste Wurf entfernte pauschal alle unsichtbaren Zeichen — darunter den
  // Verbinder, der die schwarze Katze zusammenhält. Aus 🐈‍⬛ wurde 🐈 ⬛.
  const name = 'Miri1997\u{1F3AE}❤️\u{1F408}‍⬛';
  assert.equal(sprechbar(name), name, 'Verbinder und Darstellungswahl müssen bleiben');
  assert.equal(sprechbar('\u{1F3F3}️‍\u{1F308}'), '\u{1F3F3}️‍\u{1F308}', 'Regenbogenflagge');
  assert.equal(sprechbar('\u{1F468}‍\u{1F469}‍\u{1F467}'), '\u{1F468}‍\u{1F469}‍\u{1F467}', 'Familie');
});

test('wirklich bedeutungsloses Unsichtbares fliegt weiter raus', () => {
  assert.equal(sprechbar('Al​ex'), 'Alex', 'Nullbreiten-Leerzeichen');
  assert.equal(sprechbar('Al­ex'), 'Alex', 'weiches Trennzeichen');
  assert.equal(sprechbar('‮Alex'), 'Alex', 'Schreibrichtungs-Umkehr');
  assert.equal(sprechbar('Al﻿ex'), 'Alex', 'Byte-Reihenfolge-Marke');
});
