import test from 'node:test';
import assert from 'node:assert/strict';
import { normText, passt, bewerte } from './suche';

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

// ── Relevanz: das Gesuchte muss OBEN stehen ────────────────────────────────
// Der eigentliche Fehler war nie „findet nichts", sondern „findet zu viel und
// das Richtige geht unter". Gemessen am echten Katalog (5034 Geschenke):
// „rose" → 49 Treffer, die Rose auf Platz 22. „löwe" → 126 Treffer, der Löwe
// auf Platz 125. Genau das meldete Nervie als „findet nichts".

test('bewerte: exakter Name schlaegt alles andere', () => {
  assert.ok(bewerte('rose', 'Rose') > bewerte('rose', 'Anhelex Rosa'));
  assert.ok(bewerte('rose', 'Rose') > bewerte('rose', 'Bless Pose'));
});

test('bewerte: Wortanfang schlaegt „steht irgendwo drin"', () => {
  assert.ok(bewerte('gift', 'Gift-Alert') > bewerte('gift', 'Top Gifter'));
});

test('bewerte: Treffer im NAMEN schlaegt Treffer in der Beschreibung', () => {
  const imNamen = bewerte('geschenk', 'Geschenk-Menue', 'zeigt eine Liste');
  const inDerBeschreibung = bewerte('geschenk', 'Hype-Train', 'faellt bei jedem Geschenk voller');
  assert.ok(imNamen > inDerBeschreibung, `Name (${imNamen}) muss Beschreibung (${inDerBeschreibung}) schlagen`);
});

test('bewerte: Tippfehler-Treffer landen ganz unten', () => {
  assert.ok(bewerte('rose', 'Rose') > bewerte('rose', 'Pose'));
  assert.ok(bewerte('rose', 'Pose') > 0, 'aber sie zaehlen noch als Treffer');
});

test('bewerte: kein Treffer ergibt 0', () => {
  assert.equal(bewerte('rose', 'Dog', 'ein Hund'), 0);
});

test('bewerte: leere Suche ergibt fuer alle dasselbe', () => {
  assert.equal(bewerte('', 'Rose'), bewerte('', 'Dog'));
});

test('bewerte: deckt sich mit passt() — was punktet, passt auch', () => {
  // Sonst zeigt die Liste etwas anderes an, als sie sortiert.
  const proben: [string, string, string][] = [
    ['rose', 'Rose', ''], ['gift', 'Top Gifter', ''], ['rose', 'Pose', ''],
    ['rose', 'Dog', 'ein Hund'], ['geschenk', 'Hype-Train', 'bei jedem Geschenk'],
  ];
  for (const [q, name, desc] of proben) {
    assert.equal(bewerte(q, name, desc) > 0, passt(q, name, desc), `${q} / ${name}`);
  }
});

test('bewerte: mehrere Namen sind gleichwertig (englisch UND deutsch)', () => {
  // „Lion" heisst deutsch „Loewe". Zaehlt der deutsche Name nur als Beiwerk,
  // landet der Loewe hinter jedem „Love"-Geschenk — gemessen: Platz 16 statt 1.
  const lion = bewerte('löwe', ['Lion', 'Löwe']);
  const love = bewerte('löwe', ['Bunz Love', undefined]);
  assert.ok(lion > love, `Lion/Löwe (${lion}) muss Bunz Love (${love}) schlagen`);
});

test('bewerte: einzelner Name und Ein-Element-Liste sind gleich', () => {
  assert.equal(bewerte('rose', 'Rose'), bewerte('rose', ['Rose']));
});

// ── Sinnverwandte Begriffe (deutsch ↔ englisch) ────────────────────────────
// Der Anlass: Eine Zuschauerin suchte in der Widget-Palette „geschenk" und
// bekam nichts Brauchbares — die Haelfte der Geschenk-Widgets heisst englisch
// („Gift-Alert", „Gift-Feed", „Coin-Glas").

test('passt: deutsch findet englisch und umgekehrt', () => {
  assert.ok(passt('geschenk', 'Gift-Alert'), 'geschenk muss Gift-Alert finden');
  assert.ok(passt('gift', 'Geschenk-Menü'), 'gift muss Geschenk-Menü finden');
  assert.ok(passt('musik', 'Spotify — Läuft gerade'));
  assert.ok(passt('uhr', 'Countdown'));
  assert.ok(passt('alarm', 'Gift-Alert'));
  assert.ok(passt('herz', 'Like-Liste'));
});

test('bewerte: der woertliche Treffer steht immer vor dem sinnverwandten', () => {
  // Wer „gift" tippt, will „Gift-Alert" oben sehen, nicht „Geschenk-Menü".
  assert.ok(bewerte('gift', 'Gift-Alert') > bewerte('gift', 'Geschenk-Menü'));
  // Und andersherum genauso.
  assert.ok(bewerte('geschenk', 'Geschenk-Menü') > bewerte('geschenk', 'Gift-Alert'));
});

test('sinnverwandte Woerter erweitern nur die GANZE Eingabe', () => {
  // „gift" holt „geschenk" dazu …
  assert.ok(passt('gift', 'Geschenk-Menü'));
  // … „gift-alert" bleibt woertlich, sonst zoege jede laengere Eingabe die
  // halbe Gruppe mit und die Trefferliste wuerde beliebig.
  assert.ok(!passt('gift-alert', 'Geschenk-Menü'));
});

test('Tippfehler-Toleranz gilt nur fuer die woertliche Eingabe', () => {
  // „rose" darf ueber KEIN sinnverwandtes Wort ploetzlich „Ziel" finden.
  assert.ok(!passt('geschenk', 'Gilt'), 'Tippfehler-Naehe zu „gift" darf nicht zaehlen');
});

test('Geschenke-Suche bleibt unberuehrt: „rose" findet nicht die halbe Liste', () => {
  assert.ok(passt('rose', 'Rose'));
  assert.ok(!passt('rose', 'Galaxy'));
  assert.ok(!passt('rose', 'Lion'));
});

test('der Merker liefert bei wechselnden Eingaben trotzdem richtig', () => {
  // Die Zerlegung der Eingabe wird gemerkt, weil sie sonst je Katalogeintrag
  // neu berechnet würde (5726-mal pro Tastendruck). Der Merker darf aber nie
  // ein Ergebnis von der VORIGEN Eingabe zurückgeben.
  assert.ok(passt('gift', 'Geschenk-Menü'));
  assert.ok(!passt('rose', 'Geschenk-Menü'));
  assert.ok(passt('gift', 'Geschenk-Menü'), 'nach einer anderen Suche wieder korrekt');
  assert.equal(bewerte('rose', 'Rose'), 100);
  assert.equal(bewerte('gift', 'Rose'), 0);
  assert.equal(bewerte('rose', 'Rose'), 100, 'unverändert nach Zwischensuche');
});
