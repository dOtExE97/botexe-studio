// milestone-confetti.test.ts — die Schwellen-Mathematik (DOM-frei) absichern.
// Bestimmt verlässlich die nächste noch nicht erreichte Schwelle, damit der
// Konfetti-Burst genau einmal pro Meilenstein feuert und nicht spammt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextMilestone } from './milestone-confetti.js';

test('Schritt-Modus: nächste Schwelle ist das nächste Vielfache', () => {
  assert.equal(nextMilestone(0, 100, null), 100);
  assert.equal(nextMilestone(50, 100, null), 100);
  assert.equal(nextMilestone(99, 100, null), 100);
});

test('Schritt-Modus: genau auf der Schwelle springt zur übernächsten', () => {
  // 100 ist erreicht → nächstes Ziel ist 200, nicht erneut 100
  assert.equal(nextMilestone(100, 100, null), 200);
});

test('Listen-Modus: erste Schwelle größer als der Stand', () => {
  const ms = [1000, 5000, 10000];
  assert.equal(nextMilestone(0, 0, ms), 1000);
  assert.equal(nextMilestone(1000, 0, ms), 5000);
  assert.equal(nextMilestone(4999, 0, ms), 5000);
});

test('Listen-Modus: alle Schwellen erreicht ergibt null', () => {
  assert.equal(nextMilestone(10000, 0, [1000, 5000, 10000]), null);
});

test('Listen schlägt Schritt, wenn beide gesetzt sind', () => {
  // milestones vorhanden → step (100) wird ignoriert
  assert.equal(nextMilestone(0, 100, [1000]), 1000);
});

test('Ohne Schritt und ohne Liste gibt es keine Schwelle', () => {
  assert.equal(nextMilestone(500, 0, null), null);
  assert.equal(nextMilestone(500, 0, []), null);
});

test('Listen-Modus: unsortierte Liste liefert die kleinste Schwelle über cur', () => {
  // Robust gegen unsortierte Eingabe: nicht „erstes > cur", sondern „kleinstes > cur"
  assert.equal(nextMilestone(0, 0, [5000, 1000, 10000]), 1000);
  assert.equal(nextMilestone(1000, 0, [5000, 1000, 10000]), 5000);
});
