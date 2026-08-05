// listen-schreibweise.test.ts — eulerstream hängt an Listen ein „List" an.
//
// DER FUND
// Im Diagnose-Log eines echten Cloud-Streams standen diese Feldnamen:
//   WebcastRoomUserSeqMessage → common{…}, viewerCount, ranksList[4], …
//   superFan                  → …, content{displayType,…,piecesList}, …
//
// Die App las `ranks` und `pieces`. Beide Auswertungen liefen deshalb im
// Cloud-Modus — dem Standard — dauerhaft ins Leere, ohne eine einzige
// Fehlermeldung:
//   • TikToks Raum-Bestenliste blieb immer leer, obwohl vier bis fünf Plätze
//     mitgeliefert wurden.
//   • Superfan-Ereignisse kamen ohne Absender an: keine Punkte, kein Eintrag in
//     der Bestenliste, kein Name in der Ansage. Im Log stand dazu nur die
//     allgemeine Warnung „Ereignisse ohne erkennbaren Absender".
//
// Das ist die Hausfehlerklasse dieses Projekts in Reinform: Die Funktion
// existiert, ist vollständig, wird aufgerufen — und findet nichts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeViewerCount, normalizeSuperfan, liste } from './tiktok-normalize';

test('liste(): kurze Form gewinnt, lange springt ein', () => {
  assert.deepEqual(liste([1, 2], undefined), [1, 2], 'Direkt-Modus: kurze Form');
  assert.deepEqual(liste(undefined, [3, 4]), [3, 4], 'Cloud-Modus: lange Form');
  assert.deepEqual(liste([], [3, 4]), [3, 4], 'leere kurze Form zählt nicht als Treffer');
  assert.deepEqual(liste(undefined, undefined), []);
  assert.deepEqual(liste(null as never, 'kaputt' as never), [], 'Unfug ergibt eine leere Liste');
});

test('Raum-Bestenliste: BEIDE Schreibweisen füllen sie', () => {
  const platz = (n: number) => ({ rank: n, score: 100 - n, user: { uniqueId: `u${n}`, nickname: `Nutzer ${n}` } });

  const direkt = normalizeViewerCount({ viewerCount: 9, ranks: [platz(1), platz(2)] }, 1);
  assert.equal(direkt.raumBeste?.length, 2, 'Direkt-Modus (ranks)');

  const cloud = normalizeViewerCount({ viewerCount: 9, ranksList: [platz(1), platz(2), platz(3)] }, 1);
  assert.equal(cloud.raumBeste?.length, 3, 'Cloud-Modus (ranksList) — das war der blinde Fleck');
  assert.equal(cloud.raumBeste?.[0]?.user.nickname, 'Nutzer 1');
});

test('Superfan: Absender wird auch aus piecesList gefunden', () => {
  const baustein = { userValue: { user: { uniqueId: 'isa', nickname: 'Isa🦋' } } };

  const direkt = normalizeSuperfan({ content: { pieces: [baustein] } }, true, 1);
  assert.equal(direkt.user?.nickname, 'Isa🦋', 'Direkt-Modus (pieces)');

  const cloud = normalizeSuperfan({ content: { piecesList: [baustein] } }, true, 1);
  assert.equal(cloud.user?.nickname, 'Isa🦋', 'Cloud-Modus (piecesList) — das war der blinde Fleck');

  const banner = normalizeSuperfan({ commonBarrageContent: { piecesList: [baustein] } }, false, 1);
  assert.equal(banner.user?.nickname, 'Isa🦋', 'auch im Banner-Inhalt');
});

test('Superfan: fansLevelParam liefert Absender UND Teamherz-Stufe', () => {
  // Genau diese Form kam im echten Stream an: content und commonBarrageContent
  // waren zwar da, aber ohne Nutzer — der steckte allein in fansLevelParam.
  // Und dort steht auch die Stufe, die im Log jedes Mal als „nicht mitgeliefert"
  // gemeldet wurde.
  const e = normalizeSuperfan({
    fansLevelParam: { currentGrade: 7, user: { uniqueId: 'melli', nickname: '🔱Melli🐁' } },
  }, false, 1);
  assert.equal(e.user?.nickname, '🔱Melli🐁');
  assert.equal(e.user?.teamLevel, 7, 'die Stufe landet beim Nutzer, wo sie hingehört');
});

test('Superfan ohne jede Nutzerangabe bleibt ohne Absender — und ohne erfundene Stufe', () => {
  const e = normalizeSuperfan({ content: { piecesList: [] } }, true, 1);
  assert.equal(e.user, undefined, 'nichts erfinden');
  // Und mit Nutzer, aber ohne brauchbare Stufe: kein erfundenes teamLevel 0.
  const ohneStufe = normalizeSuperfan({
    fansLevelParam: { currentGrade: 0, user: { uniqueId: 'x', nickname: 'X' } },
  }, false, 1);
  assert.equal(ohneStufe.user?.teamLevel, undefined, 'Stufe 0 ist keine Stufe');
});

test('SELBSTTEST: die alte Fassung wäre hier durchgefallen', () => {
  // Nachgebaut: nur die kurze Schreibweise lesen. Genau so lief es in v0.49.0.
  const nurKurz = (d: { ranks?: unknown[]; ranksList?: unknown[] }) => (Array.isArray(d.ranks) ? d.ranks : []);
  const cloudNachricht = { ranksList: [{ rank: 1, user: { uniqueId: 'a' } }] };
  assert.equal(nurKurz(cloudNachricht).length, 0, 'die alte Fassung fand nichts …');
  assert.equal(normalizeViewerCount({ viewerCount: 1, ...cloudNachricht }, 1).raumBeste?.length, 1,
    '… die neue findet den Platz');
});
