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

// Praxis-Proben mit echten Geschenknamen — so sucht die Geschenke-Galerie
// wirklich (Originalname + deutscher Name + eigener Name).
//
// Der Anlass: „Rose" fand das Geschenk „Lion". Grund war die Tippfehler-
// Toleranz — der deutsche Name ist „Löwe", und „rose" zu „lowe" sind nur zwei
// Buchstaben. Bei vier Zeichen ist das die halbe Länge. Seitdem hängt die
// erlaubte Fehlerzahl an der Wortlänge.
import { giftNameDe as _de } from './gift-names-de';
const galerie = (suche: string, slug: string, eigener?: string) =>
  passt(suche, slug, _de(slug) ?? undefined, eigener);

test('Geschenke: deutscher Name wird gefunden, in jeder Schreibweise', () => {
  for (const eingabe of ['Löwe', 'löwe', 'Lowe', 'Loewe', 'Löw', 'Lion', 'LION', 'Löwr']) {
    assert.equal(galerie(eingabe, 'Lion'), true, `„${eingabe}" muss Lion finden`);
  }
  assert.equal(galerie('Handherz', 'Hand Heart'), true);
  assert.equal(galerie('Schnurrbart', 'Hat and Mustache'), true);
  assert.equal(galerie('Geldpistole', 'Money Gun'), true);
  assert.equal(galerie('fette Rakete', 'Rocket', 'fette Rakete'), true, 'eigener Name');
});

test('Geschenke: keine Fehlalarme bei kurzen, ähnlichen Wörtern', () => {
  // Diese Paare sind sich zufällig ähnlich — sie dürfen sich NICHT finden.
  assert.equal(galerie('Rose', 'Lion'), false, '„Rose" darf nicht Lion (Löwe) finden');
  assert.equal(galerie('Rose', 'Rocket'), false);
  assert.equal(galerie('Katze', 'Dog'), false);
  assert.equal(galerie('Bier', 'Pizza'), false);
  assert.equal(galerie('Hase', 'Whale'), false);
});

test('Tippfehler-Toleranz haengt an der Wortlaenge', () => {
  // Lange Wörter dürfen zwei Fehler haben, kurze nur einen — sonst trifft
  // bei vier Buchstaben plötzlich alles auf alles.
  assert.equal(passt('Feuerwerck', 'Gift-Feuerwerk'), true, 'lang: zwei Fehler ok');
  assert.equal(passt('Kase', 'Hase'), true, 'kurz: EIN Fehler ok');
  assert.equal(passt('Kise', 'Hase'), false, 'kurz: zwei Fehler zu viel');
});
