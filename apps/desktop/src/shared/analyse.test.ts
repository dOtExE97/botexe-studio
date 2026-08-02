import test from 'node:test';
import assert from 'node:assert/strict';
import { kennzahl, imZeitraum, trend, besteWochentage, besterStream, urteil, coinsProStunde, besteSendezeiten, type StreamEintrag } from './analyse';

const TAG = 86_400_000;
const stream = (at: number, coins: number): StreamEintrag => ({
  at, coins, gifts: 0, likes: 0, chats: 0, follows: 0, shares: 0, peakViewers: 0,
});

test('kennzahl: Abweichung vom Schnitt', () => {
  const k = kennzahl(1500, [1000, 1000, 1000]);
  assert.equal(k.schnitt, 1000);
  assert.equal(k.abweichung, 50, '50 % über dem Schnitt');

  const schlechter = kennzahl(500, [1000, 1000]);
  assert.equal(schlechter.abweichung, -50);
});

test('kennzahl: ohne Vergleichsdaten keine erfundene Aussage', () => {
  // Beim allerersten Stream gibt es keinen Schnitt — dann darf dort auch nicht
  // „100 % besser" stehen.
  const k = kennzahl(800, []);
  assert.equal(k.schnitt, 0);
  assert.equal(k.abweichung, 0);
});

test('imZeitraum: filtert und sortiert älteste zuerst', () => {
  const jetzt = 100 * TAG;
  const alle = [stream(jetzt - 40 * TAG, 1), stream(jetzt - 2 * TAG, 2), stream(jetzt - 5 * TAG, 3)];
  const woche = imZeitraum(alle, 7, jetzt);
  assert.equal(woche.length, 2);
  assert.equal(woche[0]?.coins, 3, 'ältester zuerst');
  assert.equal(woche[1]?.coins, 2);
});

test('trend: erkennt Aufwärts und Abwärts, ignoriert Rauschen', () => {
  assert.equal(trend([100, 100, 200, 200]).richtung, 'hoch');
  assert.equal(trend([200, 200, 100, 100]).richtung, 'runter');
  // Kleine Schwankung ist keine Entwicklung — sonst zeigt die Anzeige bei
  // jedem Stream eine „Tendenz", die keine ist.
  assert.equal(trend([100, 100, 104, 103]).richtung, 'gleich');
});

test('trend: zu wenige Streams ergeben keine Aussage', () => {
  assert.equal(trend([100, 300]).richtung, 'gleich');
  assert.equal(trend([]).richtung, 'gleich');
});

test('besteWochentage: braucht mindestens zwei Streams pro Tag', () => {
  // Ein einzelner guter Abend ist Zufall, kein Muster — er darf nicht als
  // „bester Wochentag" verkauft werden.
  const montag = new Date('2026-07-06T20:00:00Z').getTime();  // Montag
  const dienstag = new Date('2026-07-07T20:00:00Z').getTime();
  const eintraege = [
    stream(montag, 1000),
    stream(montag + 7 * TAG, 2000),   // zweiter Montag
    stream(dienstag, 9999),           // nur EIN Dienstag
  ];
  const tage = besteWochentage(eintraege);
  assert.equal(tage.length, 1, 'nur der Montag hat genug Daten');
  assert.equal(tage[0]?.tag, 'Montag');
  assert.equal(tage[0]?.schnitt, 1500);
  assert.equal(tage[0]?.anzahl, 2);
});

test('besterStream: der mit den meisten Coins', () => {
  const b = besterStream([stream(1, 100), stream(2, 900), stream(3, 400)]);
  assert.equal(b?.coins, 900);
  assert.equal(besterStream([]), null);
});


// ── Urteil („war das gut?") ────────────────────────────────────────────────

test('urteil: erst ab genug Vergleichs-Streams wird geurteilt', () => {
  const u = urteil(1000, [900, 1100]);
  assert.equal(u.art, 'zu-wenig-daten');
  assert.match(u.satz, /braucht es ein paar mehr/);
  assert.equal(u.vonWievielen, 3);
});

test('urteil: starker, normaler und ruhiger Abend', () => {
  const schnitt100 = [100, 100, 100, 100];
  assert.equal(urteil(200, schnitt100).art, 'stark');
  assert.equal(urteil(100, schnitt100).art, 'normal');
  assert.equal(urteil(50, schnitt100).art, 'ruhig');
  // Kleine Abweichung bleibt „normal" — sonst suggeriert jedes Rauschen etwas.
  assert.equal(urteil(115, schnitt100).art, 'normal');
});

test('urteil: Platz wird richtig gezählt', () => {
  const u = urteil(500, [900, 700, 300, 100]);
  assert.equal(u.platz, 3, 'zwei Streams waren besser');
  assert.equal(u.vonWievielen, 5);
});

// ── Coins pro Stunde ───────────────────────────────────────────────────────

test('coinsProStunde: rechnet nur mit Streams, deren Dauer bekannt ist', () => {
  const e = (coins: number, durationMin?: number, at = 1): StreamEintrag => ({
    at, coins, gifts: 0, likes: 0, chats: 0, follows: 0, shares: 0, peakViewers: 0,
    ...(durationMin ? { durationMin } : {}),
  });
  // 600 Coins in 60 Min + 600 in 120 Min = 1200 Coins in 180 Min = 400/h
  assert.equal(coinsProStunde([e(600, 60), e(600, 120)]), 400);
  // Ein Stream ohne Dauer wird ignoriert statt die Rechnung zu verfälschen.
  assert.equal(coinsProStunde([e(600, 60), e(99999)]), 600);
  assert.equal(coinsProStunde([e(500)]), null, 'ohne jede Dauer: keine Aussage');
});

// ── Beste Sendezeiten ──────────────────────────────────────────────────────

test('besteSendezeiten: nur Streams mit bekanntem BEGINN, min. zwei je Fenster', () => {
  const t = (h: number, coins: number, tag = 1): StreamEintrag => {
    const d = new Date(2026, 6, tag, h, 0, 0);
    return { at: d.getTime() + 3_600_000, startedAt: d.getTime(), coins, gifts: 0, likes: 0, chats: 0, follows: 0, shares: 0, peakViewers: 0 };
  };
  const liste = besteSendezeiten([t(20, 1000, 1), t(21, 2000, 2), t(9, 50, 3)]);
  assert.equal(liste.length, 1, 'das 09-Uhr-Fenster hat nur einen Stream');
  assert.equal(liste[0]?.label, '20–22 Uhr');
  assert.equal(liste[0]?.schnitt, 1500);
  assert.equal(liste[0]?.anzahl, 2);
});

test('besteSendezeiten: Altdaten ohne Beginn zählen NICHT mit', () => {
  const ohne: StreamEintrag = { at: Date.now(), coins: 9999, gifts: 0, likes: 0, chats: 0, follows: 0, shares: 0, peakViewers: 0 };
  assert.deepEqual(besteSendezeiten([ohne, ohne]), [], 'die Endzeit als Sendezeit auszugeben wäre schlicht falsch');
});

test('urteil: beim normalen Abend KEINE Platzierung im Satz', () => {
  // Liegen alle Streams dicht beieinander, wird man mit einem Coin Vorsprung
  // „Platz 1" — zusammen mit „ganz normaler Abend" ein Widerspruch.
  const u = urteil(101, [100, 100, 100, 100]);
  assert.equal(u.art, 'normal');
  assert.equal(u.platz, 1, 'der Platz wird trotzdem berechnet');
  assert.doesNotMatch(u.satz, /Platz/, 'steht aber nicht im Satz');
  // Bei starkem/ruhigem Abend gehört er hinein.
  assert.match(urteil(200, [100, 100, 100, 100]).satz, /Platz/);
  assert.match(urteil(10, [100, 100, 100, 100]).satz, /Platz/);
});
