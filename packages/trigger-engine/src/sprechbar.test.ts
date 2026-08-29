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
  assert.equal(sprechbar('Alex️'), 'Alex', 'Darstellungswahl');
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
