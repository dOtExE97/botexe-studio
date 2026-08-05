// analyse-vergleich.test.ts — die zwei Rechnungen, an denen die ganze
// Auswertungsseite hängt.
//
// WARUM GERADE DIESE ZWEI
// Auf der Seite steht neben jeder Zahl ein Satz, der sie einordnet. Ist dieser
// Satz falsch, ist die Seite schlimmer als eine nackte Zahl — sie behauptet
// dann etwas. Zwei Fallen stecken darin:
//
//  1. PROZENTE BEI KLEINEN ZAHLEN. „1 Coin statt 3" sind rechnerisch −67 %.
//     Für einen Streamer mit zehn Zuschauern wäre das eine vernichtende
//     Bewertung von etwas, das gar nichts bedeutet. Unter der Schwelle muss
//     absolut geredet werden.
//  2. MITTELWERT STATT MEDIAN. Ein einziger Abend mit einem großzügigen
//     Zuschauer zieht den Schnitt so hoch, dass danach jeder normale Abend
//     „unterdurchschnittlich" ist — dauerhaft.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vergleichsSatz, median } from './AnalysePage';

test('median: unempfindlich gegen einen einzelnen Ausreißer', () => {
  const normal = [100, 120, 110, 130, 90];
  assert.equal(median(normal), 110);
  // Derselbe Kanal, aber an einem Abend kam ein großzügiger Zuschauer.
  const mitWal = [100, 120, 110, 130, 90, 12000];
  const mittelwert = Math.round(mitWal.reduce((a, b) => a + b, 0) / mitWal.length);
  assert.ok(mittelwert > 2000, `der Mittelwert kippt (${mittelwert})`);
  assert.ok(median(mitWal) < 200, `der Median hält (${median(mitWal)})`);
});

test('median: Randfälle', () => {
  assert.equal(median([]), 0);
  assert.equal(median([42]), 42);
  assert.equal(median([10, 20]), 15, 'gerade Anzahl: Mitte der beiden');
});

test('kleine Zahlen: absolut statt prozentual', () => {
  // Chris' echter Abend: 1 Coin, sonst 3.
  const a = vergleichsSatz(1, 3);
  assert.equal(a.text, '2 weniger als sonst');
  assert.equal(a.richtung, 'runter');
  assert.doesNotMatch(a.text, /%/, 'bei drei Coins darf keine Prozentzahl stehen');

  const b = vergleichsSatz(4, 3);
  assert.equal(b.text, '1 mehr als sonst');
  assert.equal(b.richtung, 'hoch');

  assert.equal(vergleichsSatz(3, 3).text, 'wie sonst');
});

test('große Zahlen: prozentual, aber erst ab einem echten Unterschied', () => {
  assert.equal(vergleichsSatz(4200, 1500).text, '+180 % gegenüber sonst');
  assert.equal(vergleichsSatz(600, 1500).text, '-60 % gegenüber sonst');
  // Innerhalb von ±25 % ist es schlicht ein normaler Abend — eine Zahl wie
  // „+7 %" würde eine Aussage vortäuschen, wo Rauschen ist.
  assert.equal(vergleichsSatz(1600, 1500).text, 'wie immer');
  assert.equal(vergleichsSatz(1300, 1500).text, 'wie immer');
  assert.equal(vergleichsSatz(1600, 1500).richtung, 'gleich');
});

test('ohne Vergleichswert wird nichts behauptet', () => {
  // Erster Abend, oder eine Kennzahl, die es vorher nie gab.
  assert.equal(vergleichsSatz(5, 0).text, 'das erste Mal überhaupt');
  assert.equal(vergleichsSatz(0, 0).text, 'auch sonst keine');
  assert.equal(vergleichsSatz(5, 0).richtung, 'gleich', 'kein Grün für „hatten wir noch nie"');
});

test('die Schwelle liegt genau bei 10', () => {
  // Direkt darunter absolut, ab 10 prozentual — damit die Grenze nicht
  // versehentlich verrutscht.
  assert.doesNotMatch(vergleichsSatz(20, 9).text, /%/, 'Basis 9: absolut');
  assert.match(vergleichsSatz(20, 10).text, /%/, 'Basis 10: prozentual');
});

test('SELBSTTEST: die naive Rechnung würde hier durchfallen', () => {
  // So sähe es aus, wenn jemand später „vereinfacht" und überall Prozente nimmt.
  const naiv = (wert: number, basis: number) => `${Math.round(((wert - basis) / basis) * 100)} %`;
  assert.equal(naiv(1, 3), '-67 %');
  assert.notEqual(vergleichsSatz(1, 3).text, naiv(1, 3),
    'genau diese Zahl soll bei drei Coins NICHT dastehen');
});
