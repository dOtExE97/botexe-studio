import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from './game-service';

function svc(): { s: GameService; wins: () => number } {
  let wins = 0;
  const s = new GameService(() => { /* broadcast egal */ }, () => { wins += 1; });
  return { s, wins: () => wins };
}

test('Quiz-Sieg wird bei doppeltem reveal() nur EINMAL gemeldet (kein Doppel-Punkt)', () => {
  const { s, wins } = svc();
  s.start('quiz', { question: 'Q?', options: ['A', 'B'], correctIndex: 0, winnerMode: 'first' });
  s.handleChat({ type: 'chat', ts: 1, user: { id: 'u1', nickname: 'Anna' }, text: 'A' });
  s.reveal();
  s.reveal(); // Doppelklick auf „Auflösen"
  assert.equal(wins(), 1, 'Sieg nur einmal trotz wiederholtem reveal');
});

test('Duell-Sieg wird bei weiteren Chats nach Spielende nicht erneut gemeldet', () => {
  const { s, wins } = svc();
  s.start('tic-tac-toe');
  s.handleChat({ type: 'chat', ts: 1, user: { id: 'x', nickname: 'X' }, text: '!join' });
  s.handleChat({ type: 'chat', ts: 2, user: { id: 'o', nickname: 'O' }, text: '!join' });
  // X: 1,2,3 (obere Reihe) — O dazwischen woanders
  s.handleChat({ type: 'chat', ts: 3, user: { id: 'x', nickname: 'X' }, text: '1' });
  s.handleChat({ type: 'chat', ts: 4, user: { id: 'o', nickname: 'O' }, text: '4' });
  s.handleChat({ type: 'chat', ts: 5, user: { id: 'x', nickname: 'X' }, text: '2' });
  s.handleChat({ type: 'chat', ts: 6, user: { id: 'o', nickname: 'O' }, text: '5' });
  s.handleChat({ type: 'chat', ts: 7, user: { id: 'x', nickname: 'X' }, text: '3' }); // X gewinnt
  assert.equal(wins(), 1, 'genau ein Sieg nach Gewinnzug');
  s.handleChat({ type: 'chat', ts: 8, user: { id: 'o', nickname: 'O' }, text: '6' }); // Chat nach Spielende
  assert.equal(wins(), 1, 'kein weiterer Sieg nach Spielende');
});

test('Neues Spiel setzt den Sieg-Guard zurück', () => {
  const { s, wins } = svc();
  s.start('quiz', { question: 'Q1', options: ['A', 'B'], correctIndex: 0, winnerMode: 'first' });
  s.handleChat({ type: 'chat', ts: 1, user: { id: 'a', nickname: 'A' }, text: 'A' });
  s.reveal();
  s.start('quiz', { question: 'Q2', options: ['A', 'B'], correctIndex: 1, winnerMode: 'first' });
  s.handleChat({ type: 'chat', ts: 2, user: { id: 'b', nickname: 'B' }, text: 'B' });
  s.reveal();
  assert.equal(wins(), 2, 'zwei Spiele → zwei Siege');
});
