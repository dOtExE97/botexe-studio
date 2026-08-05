// logger.test.ts — Zeitstempel in LOKALER Zeit (statt UTC), damit die Logs zur
// Uhr/TikTok des jeweiligen Nutzers passen (Zeitzonen-Verwirrung vermeiden).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalStamp, darfMelden, merkerLeeren, passtNochInsLog, setzeDiagnoseModus, diagnoseAktiv, diagnoseRestMs } from './logger';

test('formatiert lokale Zeit ISO-ähnlich, OHNE Z (kein UTC)', () => {
  // Der Date-Konstruktor nimmt lokale Komponenten → getHours() etc. sind
  // unabhängig von der Test-Zeitzone deterministisch.
  const d = new Date(2026, 5, 14, 18, 13, 11, 883); // 14.06.2026 18:13:11.883 lokal
  assert.equal(formatLocalStamp(d), '2026-06-14T18:13:11.883');
});

test('füllt einstellige Werte mit Nullen auf', () => {
  const d = new Date(2026, 0, 3, 4, 5, 6, 7); // 03.01.2026 04:05:06.007
  assert.equal(formatLocalStamp(d), '2026-01-03T04:05:06.007');
});

test('endet nicht auf Z', () => {
  assert.equal(formatLocalStamp(new Date(2026, 5, 1, 0, 0, 0, 0)).endsWith('Z'), false);
});

// ── Drosselung ──────────────────────────────────────────────────────────────
// Diese Entscheidung sitzt an den heißesten Stellen der App (jedes Geschenk,
// jeder Chat). Stimmt sie nicht, ist das Log entweder zugemüllt oder dauerhaft
// stumm — beides macht die Fehlersuche im laufenden Stream unmöglich. Deshalb
// wird hier die pure Funktion geprüft und nicht nur „es wirft nicht".

test('einmal (Abstand 0): nur der erste Aufruf darf melden', () => {
  merkerLeeren();
  assert.equal(darfMelden('a', 0, 1000), true);
  assert.equal(darfMelden('a', 0, 1001), false);
  assert.equal(darfMelden('a', 0, 9_999_999), false, 'auch Stunden später nicht');
});

test('verschiedene Schlüssel stören sich nicht', () => {
  merkerLeeren();
  assert.equal(darfMelden('a', 0, 1000), true);
  assert.equal(darfMelden('b', 0, 1000), true, 'anderer Schlüssel = eigene Meldung');
  assert.equal(darfMelden('a', 0, 1000), false);
});

test('gedrosselt: sperrt innerhalb des Fensters, lässt danach wieder durch', () => {
  merkerLeeren();
  assert.equal(darfMelden('c', 60_000, 0), true);
  assert.equal(darfMelden('c', 60_000, 59_999), false, 'kurz vor Ablauf noch gesperrt');
  assert.equal(darfMelden('c', 60_000, 60_000), true, 'genau am Fenster wieder frei');
  assert.equal(darfMelden('c', 60_000, 60_001), false, 'und dann wieder gesperrt');
});

test('merkerLeeren mit Präfix trifft NUR die passenden Schlüssel', () => {
  merkerLeeren();
  darfMelden('tiktok:format', 0, 1000);
  darfMelden('overlay:leer', 0, 1000);
  merkerLeeren('tiktok:');
  assert.equal(darfMelden('tiktok:format', 0, 1000), true, 'zurückgesetzt → darf wieder');
  assert.equal(darfMelden('overlay:leer', 0, 1000), false, 'anderer Bereich bleibt gesperrt');
});

test('nach dem Zurücksetzen meldet dieselbe Ursache wieder — sonst bleibt die App stumm', () => {
  // Der eigentliche Zweck: Nach „neu verbunden" muss ein wiederkehrendes
  // Problem erneut auffallen, statt für den Rest des Abends verschluckt zu werden.
  merkerLeeren();
  assert.equal(darfMelden('tiktok:ohne-absender', 0, 0), true);
  assert.equal(darfMelden('tiktok:ohne-absender', 0, 5000), false);
  merkerLeeren('tiktok:');
  assert.equal(darfMelden('tiktok:ohne-absender', 0, 6000), true);
});

test('passtNochInsLog: Byte-Deckel greift genau an der Grenze', () => {
  assert.equal(passtNochInsLog(0, 100, 1000), true);
  assert.equal(passtNochInsLog(900, 100, 1000), true, 'exakt voll ist noch erlaubt');
  assert.equal(passtNochInsLog(901, 100, 1000), false);
  assert.equal(passtNochInsLog(1000, 1, 1000), false);
});

test('Diagnose-Modus: an, Restlaufzeit, läuft von allein aus', () => {
  const t0 = 1_000_000;
  setzeDiagnoseModus(0, t0); // sauberer Ausgangszustand
  assert.equal(diagnoseAktiv(t0), false);
  setzeDiagnoseModus(30 * 60_000, t0);
  assert.equal(diagnoseAktiv(t0 + 60_000), true);
  assert.equal(diagnoseRestMs(t0 + 60_000), 29 * 60_000);
  // Nach Ablauf ohne weiteres Zutun aus — sonst schriebe er den ganzen Stream mit.
  assert.equal(diagnoseAktiv(t0 + 31 * 60_000), false);
  assert.equal(diagnoseRestMs(t0 + 31 * 60_000), 0);
  setzeDiagnoseModus(0, t0);
});

test('Diagnose-Modus schaltet die ZEIT-Drosselung durch — aber nicht „genau einmal"', () => {
  // Der Unterschied ist der zwischen einem Takt und einer Tatsache.
  //
  // Bei einer GEDROSSELTEN Meldung ist die Wiederholung die eigentliche
  // Information: „kommt das alle zwei Sekunden oder alle zwei Minuten?" Genau
  // dafür schaltet der Diagnose-Modus sie frei.
  //
  // Bei einer EINMAL-Meldung ist sie es nicht. Welche Felder eine
  // Nachrichtenart mitbringt, ändert sich nicht beim 522. Mal — und genau 522
  // Wiederholungen einer einzigen Zeile standen in einem echten Diagnose-Log.
  // Von 1672 Zeilen waren 1512 sieben immer gleiche Feldlisten; der Streamer
  // fand darin nichts mehr. Wie oft eine Art ankommt, beantwortet seit v0.49.0
  // die Bilanz am Stream-Ende, und zwar als Zahl.
  const t0 = 2_000_000;

  // „genau einmal" (abstandMs = 0) bleibt einmal — auch mit Diagnose.
  setzeDiagnoseModus(0, t0);
  assert.equal(darfMelden('diag-einmal', 0, t0), true);
  assert.equal(darfMelden('diag-einmal', 0, t0 + 1), false, 'normal: einmal heißt einmal');
  setzeDiagnoseModus(10 * 60_000, t0);
  assert.equal(darfMelden('diag-einmal', 0, t0 + 2), false,
    'auch im Diagnose-Modus heißt einmal einmal — sonst ersäuft das Log');

  // Zeit-Drosselung (abstandMs > 0) wird dagegen sehr wohl freigeschaltet.
  setzeDiagnoseModus(0, t0);
  assert.equal(darfMelden('diag-takt', 60_000, t0), true);
  assert.equal(darfMelden('diag-takt', 60_000, t0 + 1), false, 'normal: erst nach einer Minute wieder');
  setzeDiagnoseModus(10 * 60_000, t0);
  assert.equal(darfMelden('diag-takt', 60_000, t0 + 2), true,
    'im Diagnose-Modus jede Wiederholung — hier IST der Takt die Information');
  setzeDiagnoseModus(0, t0);
  assert.equal(darfMelden('diag-takt', 60_000, t0 + 3), false, 'danach wieder gedrosselt');
});
