// epoch-guard.test.ts — reine Logik der "nur die neueste Anfrage gewinnt"-
// Wächter-Klasse, DOM-frei getestet (siehe OverlayHealthBanner.test.ts für
// dasselbe Muster: keine React-Render-Tests im Repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EpochGuard } from './epoch-guard';

test('EpochGuard: eine einzelne Runde ist bei Abschluss noch aktuell', () => {
  const g = new EpochGuard();
  const id = g.start();
  assert.equal(g.isCurrent(id), true);
});

test('EpochGuard: zwei überlappende Runden — die ÄLTERE gilt nicht mehr, sobald die JÜNGERE begonnen hat (P1-4 Regression)', () => {
  // Simuliert: manuelle Eingabe startet Prüfung A (langsam), danach erkennt
  // der Clipboard-Poll einen neuen Wert und startet Prüfung B. Ohne Wächter
  // könnte A — obwohl älter — NACH B fertig werden und deren (neueres,
  // korrektes) Ergebnis überschreiben.
  const g = new EpochGuard();
  const idA = g.start();
  const idB = g.start();
  assert.equal(g.isCurrent(idA), false, 'A ist durch B überholt — darf kein Ergebnis mehr anwenden');
  assert.equal(g.isCurrent(idB), true, 'B ist die aktuellste Runde');
});

test('EpochGuard: invalidate() entwertet auch die zuletzt gestartete Runde', () => {
  const g = new EpochGuard();
  const id = g.start();
  g.invalidate(); // z.B. Dialog wurde geschlossen/neu geöffnet
  assert.equal(g.isCurrent(id), false);
});

test('EpochGuard: nach invalidate() gestartete neue Runde ist wieder aktuell', () => {
  const g = new EpochGuard();
  const stale = g.start();
  g.invalidate();
  const fresh = g.start();
  assert.equal(g.isCurrent(stale), false);
  assert.equal(g.isCurrent(fresh), true);
});
