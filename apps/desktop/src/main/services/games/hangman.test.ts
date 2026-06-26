import test from 'node:test';
import assert from 'node:assert/strict';
import { HangmanGame } from './hangman';

function neu(word: string, maxWrong?: number): HangmanGame {
  const g = new HangmanGame();
  g.start(maxWrong === undefined ? { word } : { word, maxWrong });
  return g;
}

test('start: Wort wird maskiert, Default maxWrong = 6', () => {
  const g = neu('Apfel');
  const s = g.getState();
  assert.equal(s.masked, '_ _ _ _ _');
  assert.equal(s.wrong, 0);
  assert.equal(s.maxWrong, 6);
  assert.deepEqual(s.guessed, []);
  assert.equal(s.status, 'playing');
  assert.equal(s.lastGuesser, undefined);
});

test('Treffer deckt ALLE Vorkommen auf', () => {
  const g = neu('BANANA');
  const r = g.handleChat('u1', 'Mia', 'a');
  assert.deepEqual(r, { accepted: true, hit: true });
  const s = g.getState();
  assert.equal(s.masked, '_ A _ A _ A');
  assert.equal(s.wrong, 0);
  assert.deepEqual(s.guessed, ['A']);
  assert.deepEqual(s.lastGuesser, { userId: 'u1', nickname: 'Mia' });
});

test('Buchstabe ist case-insensitiv (Kleinbuchstabe trifft Großbuchstabe)', () => {
  const g = neu('apfel');
  const r = g.handleChat('u1', 'Mia', 'A');
  assert.deepEqual(r, { accepted: true, hit: true });
  assert.equal(g.getState().masked, 'A _ _ _ _');
});

test('Fehlversuch zählt wrong hoch und wird in guessed gemerkt', () => {
  const g = neu('APFEL');
  const r = g.handleChat('u1', 'Mia', 'Z');
  assert.deepEqual(r, { accepted: true, hit: false });
  const s = g.getState();
  assert.equal(s.wrong, 1);
  assert.deepEqual(s.guessed, ['Z']);
  assert.equal(s.masked, '_ _ _ _ _');
});

test('doppelter Buchstabe wird ignoriert (accepted=false), kein erneutes Hochzählen', () => {
  const g = neu('APFEL');
  g.handleChat('u1', 'Mia', 'Z'); // wrong=1
  const r2 = g.handleChat('u2', 'Bob', 'z'); // schon geraten
  assert.deepEqual(r2, { accepted: false });
  const s = g.getState();
  assert.equal(s.wrong, 1);
  assert.deepEqual(s.guessed, ['Z']);
  // lastGuesser bleibt beim ersten gültigen Tipp
  assert.deepEqual(s.lastGuesser, { userId: 'u1', nickname: 'Mia' });
});

test('Nicht-Buchstaben-Input (Zahl/Mehrzeichen/leer) wird abgelehnt', () => {
  const g = neu('APFEL');
  assert.deepEqual(g.handleChat('u1', 'Mia', '1'), { accepted: false });
  assert.deepEqual(g.handleChat('u1', 'Mia', 'AB'), { accepted: false });
  assert.deepEqual(g.handleChat('u1', 'Mia', '   '), { accepted: false });
  assert.equal(g.getState().wrong, 0);
});

test('!guess korrekt → won, volles Wort sichtbar', () => {
  const g = neu('APFEL');
  const r = g.handleChat('u1', 'Mia', '!guess apfel');
  assert.deepEqual(r, { accepted: true, hit: true });
  const s = g.getState();
  assert.equal(s.status, 'won');
  assert.equal(s.masked, 'A P F E L');
  assert.deepEqual(s.lastGuesser, { userId: 'u1', nickname: 'Mia' });
});

test('!guess falsch → wrong++, Spiel läuft weiter', () => {
  const g = neu('APFEL');
  const r = g.handleChat('u1', 'Mia', '!guess birne');
  assert.deepEqual(r, { accepted: true, hit: false });
  const s = g.getState();
  assert.equal(s.status, 'playing');
  assert.equal(s.wrong, 1);
});

test('won-Übergang durch Aufdecken aller Buchstaben', () => {
  const g = neu('ABA');
  assert.equal(g.handleChat('u1', 'Mia', 'A').hit, true);
  assert.equal(g.getState().status, 'playing');
  assert.equal(g.handleChat('u2', 'Bob', 'B').hit, true);
  const s = g.getState();
  assert.equal(s.status, 'won');
  assert.equal(s.masked, 'A B A');
});

test('lost-Übergang bei wrong >= maxWrong', () => {
  const g = neu('AB', 2);
  g.handleChat('u1', 'Mia', 'X'); // wrong=1
  assert.equal(g.getState().status, 'playing');
  g.handleChat('u1', 'Mia', 'Y'); // wrong=2 -> lost
  assert.equal(g.getState().status, 'lost');
});

test('nach Spielende werden weitere Inputs nicht mehr akzeptiert', () => {
  const g = neu('AB', 1);
  g.handleChat('u1', 'Mia', 'X'); // wrong=1 -> lost
  assert.equal(g.getState().status, 'lost');
  const r = g.handleChat('u1', 'Mia', 'A');
  assert.deepEqual(r, { accepted: false });
  // Zustand unverändert
  assert.equal(g.getState().wrong, 1);
});

test('Nicht-Buchstaben im Wort (Bindestrich/Leerzeichen) bleiben sichtbar', () => {
  const g = neu('AB-CD');
  const s = g.getState();
  assert.equal(s.masked, '_ _ - _ _');
  g.handleChat('u1', 'Mia', 'A');
  g.handleChat('u1', 'Mia', 'B');
  g.handleChat('u1', 'Mia', 'C');
  const r = g.handleChat('u1', 'Mia', 'D');
  assert.equal(r.hit, true);
  const fin = g.getState();
  assert.equal(fin.status, 'won');
  assert.equal(fin.masked, 'A B - C D');
});

test('start setzt eine laufende Runde vollständig zurück', () => {
  const g = neu('APFEL');
  g.handleChat('u1', 'Mia', 'Z');
  g.start({ word: 'BIRNE', maxWrong: 4 });
  const s = g.getState();
  assert.equal(s.masked, '_ _ _ _ _');
  assert.equal(s.wrong, 0);
  assert.equal(s.maxWrong, 4);
  assert.deepEqual(s.guessed, []);
  assert.equal(s.lastGuesser, undefined);
  assert.equal(s.status, 'playing');
});
