import test from 'node:test';
import assert from 'node:assert/strict';
import { normText, passt } from './suche';

test('normText: Umlaute, Akzente und Trennzeichen fallen weg', () => {
  // Umlaut wird zum Grundbuchstaben — dadurch ergeben beide Schreibweisen
  // denselben Kern, und genau das macht die Suche tolerant.
  assert.equal(normText('Glücksrad'), 'glucksrad');
  assert.equal(normText('Glucksrad'), 'glucksrad');
  assert.equal(normText('gift-jar'), 'giftjar');
  assert.equal(normText('Gift Jar'), 'giftjar');
  assert.equal(normText("Jollie's Community"), 'jolliescommunity');
});

test('passt: findet trotz fehlendem Umlaut', () => {
  // Der Grund für diese Datei: „Glucksrad" fand vorher nichts.
  assert.equal(passt('Glucksrad', 'Glücksrad'), true);
  assert.equal(passt('gluck', 'Glücksrad'), true);
  assert.equal(passt('GLÜCK', 'Glücksrad'), true);
});

test('passt: findet trotz Bindestrich/Leerzeichen', () => {
  assert.equal(passt('giftjar', 'Coin-Glas', 'gift-jar'), true);
  assert.equal(passt('gift jar', 'Coin-Glas', 'gift-jar'), true);
});

test('passt: verzeiht Tippfehler ab vier Zeichen', () => {
  assert.equal(passt('Glucksrat', 'Glücksrad'), true, 'ein Dreher darf sein');
  assert.equal(passt('Feuerwerck', 'Gift-Feuerwerk'), true);
  // Kurze Eingaben NICHT verzeihen — sonst passt „rad" auf halb alles.
  assert.equal(passt('rat', 'Glücksrad'), false);
});

test('passt: leere Suche zeigt alles, Unsinn nichts', () => {
  assert.equal(passt('', 'Irgendwas'), true);
  assert.equal(passt('   ', 'Irgendwas'), true);
  assert.equal(passt('xyzabc123', 'Glücksrad', 'Dreht sich'), false);
});

test('passt: durchsucht mehrere Felder (Name UND Beschreibung)', () => {
  assert.equal(passt('Walzen', 'Gambling-Automat', 'Spielautomat: ein Geschenk lässt die Walzen drehen'), true);
});
