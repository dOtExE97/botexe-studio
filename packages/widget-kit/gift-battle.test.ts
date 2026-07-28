// gift-battle.test.ts — reine Kampf-Logik (DOM-frei): Team-Zuordnung,
// Balken-Position, Gewinner-Bestimmung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTeam, battlePosition, battleWinner } from './gift-battle.js';

test('matchTeam: Slug der jeweiligen Liste zuordnen (case-insensitiv)', () => {
  assert.equal(matchTeam('Rose', ['rose', 'heart'], ['galaxy']), 'a');
  assert.equal(matchTeam('GALAXY', ['rose'], ['galaxy', 'lion']), 'b');
  assert.equal(matchTeam('Rocket', ['rose'], ['galaxy']), null);
});

test('matchTeam: Schreibweise/Trennzeichen egal (giftKey wie ueberall sonst)', () => {
  // Die Liste kommt aus einem Textfeld, der Name aus dem TikTok-Ereignis —
  // beide sind selten zeichengleich. Vorher normalisierte matchTeam nur mit
  // trim().toLowerCase(), wodurch das Geschenk still keinem Team zufiel.
  const a = ['hatandmustache'];   // so sieht die Liste nach tokens() aus
  assert.equal(matchTeam('Hat and Mustache', a, []), 'a');
  assert.equal(matchTeam('hat-and-mustache', a, []), 'a');
  assert.equal(matchTeam('HAT  AND  MUSTACHE', a, []), 'a');
  assert.equal(matchTeam("Jollie's Community", ['jolliescommunity'], []), 'a');
  // Fremdes Geschenk faellt weiterhin durch.
  assert.equal(matchTeam('Rose', a, []), null);
});

test('matchTeam: leere Listen → alles zählt fürs jeweils andere Team (Auto-Split)', () => {
  // Beide leer: jedes Gift zählt für A (Single-Team-Fallback wäre sinnlos) → null,
  // der Aufrufer behandelt das. Hier nur: leere Liste matcht nie.
  assert.equal(matchTeam('Rose', [], []), null);
});

test('battlePosition: Anteil von Team A in Prozent, 50 bei Gleichstand/leer', () => {
  assert.equal(battlePosition(0, 0), 50);
  assert.equal(battlePosition(30, 10), 75);
  assert.equal(battlePosition(10, 30), 25);
});

test('battlePosition: clamped auf 2..98 damit nie ein Team komplett verschwindet', () => {
  assert.equal(battlePosition(1000, 0), 98);
  assert.equal(battlePosition(0, 1000), 2);
});

test('battleWinner: höhere Punktzahl gewinnt, sonst Unentschieden', () => {
  assert.equal(battleWinner(30, 10), 'a');
  assert.equal(battleWinner(10, 30), 'b');
  assert.equal(battleWinner(20, 20), 'tie');
  assert.equal(battleWinner(0, 0), 'tie');
});
