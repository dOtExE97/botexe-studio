// verlauf.test.ts — der Verlauf eines Abends, und vor allem seine Obergrenze.
//
// Bis v0.50.0 speicherte die App nur Endstände: 4.200 Coins an einem Abend —
// aber nicht, ob sie gleichmäßig kamen oder in einer einzigen Minute. Für den
// Streamer ist genau das die interessantere Hälfte.
//
// Der heikle Teil ist nicht das Messen, sondern das AUFHÖREN: Ein Nutzer
// streamt auf einem Laptop, dem regelmäßig der Arbeitsspeicher ausgeht. Eine
// Liste, die pro Minute wächst und nie gedeckelt wird, ist dort kein Schönheits-
// fehler, sondern ein Absturz nach zwölf Stunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStats, VERLAUF_MAX_PUNKTE } from './session-stats';

const T0 = 1_700_000_000_000;
const min = (n: number) => T0 + n * 60_000;

test('misst höchstens einen Punkt je Minute', () => {
  const s = new SessionStats();
  s.messeVerlauf(T0);
  s.messeVerlauf(T0 + 5_000);   // 5 s später — zu früh
  s.messeVerlauf(T0 + 30_000);  // 30 s später — immer noch zu früh
  s.messeVerlauf(min(1));       // jetzt
  assert.equal(s.snapshot().verlauf?.length, 2);
});

test('hält den Stand fest, nicht den Zuwachs', () => {
  const s = new SessionStats();
  s.apply({ type: 'chat', ts: T0, user: { id: 'a', nickname: 'A' }, text: 'hi' });
  s.messeVerlauf(T0);
  s.apply({ type: 'chat', ts: T0, user: { id: 'b', nickname: 'B' }, text: 'hi' });
  s.apply({ type: 'chat', ts: T0, user: { id: 'c', nickname: 'C' }, text: 'hi' });
  s.messeVerlauf(min(1));
  const v = s.snapshot().verlauf ?? [];
  assert.equal(v[0]?.chats, 1, 'erster Punkt: Stand nach einem Kommentar');
  assert.equal(v[1]?.chats, 3, 'zweiter Punkt: der Gesamtstand, nicht die Differenz');
});

test('OBERGRENZE: die Liste wächst nicht unbegrenzt', () => {
  const s = new SessionStats();
  // Ein 30-Stunden-Dauerstream. Ohne Deckel wären das 1800 Punkte.
  for (let i = 0; i < 1800; i++) s.messeVerlauf(min(i));
  const v = s.snapshot().verlauf ?? [];
  assert.ok(v.length <= VERLAUF_MAX_PUNKTE,
    `höchstens ${VERLAUF_MAX_PUNKTE} Punkte, waren ${v.length}`);
  // Und die Form bleibt: Anfang und Ende sind noch da, gleichmäßig ausgedünnt.
  assert.equal(v[0]?.m, 0, 'der Anfang bleibt erhalten');
  assert.ok((v[v.length - 1]?.m ?? 0) > 1500, 'das Ende auch');
  const abstaende = v.slice(1).map((p, i) => p.m - (v[i]?.m ?? 0));
  const gleich = abstaende.every((a) => a === abstaende[0]);
  assert.ok(gleich, 'gleichmäßig ausgedünnt — sonst verzerrt die Kurve');
});

test('unter zwei Punkten gibt es keinen Verlauf', () => {
  // Ein einzelner Punkt ist keine Kurve. Ihn trotzdem zu liefern würde die
  // Anzeige zwingen, den Sonderfall zu behandeln — besser gar nichts.
  const s = new SessionStats();
  assert.equal(s.snapshot().verlauf, undefined, 'ohne Messung: nichts');
  s.messeVerlauf(T0);
  assert.equal(s.snapshot().verlauf, undefined, 'ein Punkt: immer noch nichts');
  s.messeVerlauf(min(1));
  assert.equal(s.snapshot().verlauf?.length, 2, 'ab zwei Punkten: ein Verlauf');
});

test('reset() räumt den Verlauf mit weg', () => {
  // Sonst zeigt der nächste Stream die Kurve des vorherigen.
  const s = new SessionStats();
  s.messeVerlauf(T0);
  s.messeVerlauf(min(1));
  s.reset();
  assert.equal(s.snapshot().verlauf, undefined);
  // Und die Zeitrechnung beginnt neu, statt bei Minute 500 weiterzulaufen.
  s.messeVerlauf(min(500));
  s.messeVerlauf(min(501));
  assert.equal(s.snapshot().verlauf?.[0]?.m, 0, 'der neue Abend fängt bei Minute 0 an');
});

test('eine springende Uhr wirft die Kurve nicht um', () => {
  // Zeitumstellung, NTP-Korrektur, Standby: Die Systemuhr kann rückwärts gehen.
  const s = new SessionStats();
  s.messeVerlauf(T0);
  s.messeVerlauf(min(5));
  s.messeVerlauf(T0 - 60_000); // Uhr springt zurück
  const v = s.snapshot().verlauf ?? [];
  assert.ok(v.every((p) => Number.isFinite(p.m)), 'keine kaputten Werte');
  assert.ok(v.length >= 2);
});
