import test from 'node:test';
import assert from 'node:assert/strict';
import { kannFortsetzung, istFortsetzung, SESSION_CONTINUE_MAX_MS } from './session-continuity';

const MIN = 60_000;

test('kannFortsetzung: frisch ja, alt nein', () => {
  assert.equal(kannFortsetzung(0), true);
  assert.equal(kannFortsetzung(5 * MIN), true);
  assert.equal(kannFortsetzung(SESSION_CONTINUE_MAX_MS - 1), true);
  assert.equal(kannFortsetzung(SESSION_CONTINUE_MAX_MS), false);
  assert.equal(kannFortsetzung(2 * 60 * MIN), false);
});

test('verstellte Uhr: negatives Alter gilt als frisch, nicht als uralt', () => {
  // Sonst würde ein laufender Stream beim Start als beendet abgeräumt.
  assert.equal(kannFortsetzung(-2000), true);
  assert.equal(kannFortsetzung(-99 * 60 * MIN), true);
  // Unsinn bleibt Unsinn.
  assert.equal(kannFortsetzung(Number.NaN), false);
});

test('Update-Neustart mitten im Stream ist eine Fortsetzung', () => {
  assert.equal(istFortsetzung(3_000), true);
  assert.equal(istFortsetzung(SESSION_CONTINUE_MAX_MS - 1), true);
});

test('Neuer Stream Stunden später ist KEINE Fortsetzung (der eigentliche Fehler)', () => {
  // 19:05 App zu, 21:00 neuer Stream: Zahlen dürfen nicht weiterlaufen.
  assert.equal(istFortsetzung(2 * 60 * MIN), false);
  assert.equal(istFortsetzung(SESSION_CONTINUE_MAX_MS), false);
});

test('Room-ID ist ein Veto, kein Ersatz für die Zeit', () => {
  // Gleicher Raum + frisch → Fortsetzung.
  assert.equal(istFortsetzung(3_000, 'room-1', 'room-1'), true);
  // Anderer Raum, obwohl frisch → neuer Stream.
  assert.equal(istFortsetzung(3_000, 'room-2', 'room-1'), false);
  // Cloud-Modus: keine Room-ID bekannt → allein die Zeit entscheidet.
  assert.equal(istFortsetzung(3_000, undefined, 'room-1'), true);
  assert.equal(istFortsetzung(3_000, 'room-2', undefined), true);
  // Gleicher Raum, aber zu alt → trotzdem keine Fortsetzung.
  assert.equal(istFortsetzung(3 * 60 * MIN, 'room-1', 'room-1'), false);
});
