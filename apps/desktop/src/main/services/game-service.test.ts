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
  s.stop();
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
  s.stop(); // Auto-Reset-Timer aufräumen
});

test('Galgenmännchen-Sieg wird jetzt verbucht (winner-Feld)', () => {
  const { s, wins } = svc();
  s.start('hangman', { word: 'AB' });
  s.handleChat({ type: 'chat', ts: 1, user: { id: 'u', nickname: 'Mia' }, text: 'A' });
  s.handleChat({ type: 'chat', ts: 2, user: { id: 'u', nickname: 'Mia' }, text: 'B' }); // Wort komplett → won
  assert.equal(wins(), 1, 'Löser bekommt den Sieg (vorher 0 — winner fehlte)');
  s.stop();
});

test('Duell öffnet nach Sieg automatisch eine neue Runde (kein Freeze)', () => {
  const states: Array<{ status?: string }> = [];
  const s = new GameService((m) => { if (m.kind === 'game-state' && m.state) states.push(m.state as { status?: string }); }, () => { /* egal */ });
  // Zeit im Test raffen: resultMs kurz setzen (privates Feld via Zugriff).
  (s as unknown as { resultMs: number }).resultMs = 5;
  s.start('tic-tac-toe');
  for (const [ts, id, nick, txt] of [[1, 'x', 'X', '!join'], [2, 'o', 'O', '!join'], [3, 'x', 'X', '1'], [4, 'o', 'O', '4'], [5, 'x', 'X', '2'], [6, 'o', 'O', '5'], [7, 'x', 'X', '3']] as const) {
    s.handleChat({ type: 'chat', ts, user: { id, nickname: nick }, text: txt });
  }
  return new Promise<void>((resolve) => setTimeout(() => {
    assert.equal(states.at(-1)?.status, 'waiting', 'nach dem Sieg steht wieder ein leeres Brett (waiting) bereit');
    s.stop();
    resolve();
  }, 25));
});

test('start() räumt ein laufendes Auto-Quiz auf (altes Spiel kapert das neue nicht)', () => {
  const s = new GameService(() => { /* egal */ }, () => { /* egal */ });
  s.startQuizAuto([{ q: '?', options: ['A', 'B', 'C', 'D'], correct: 0 }], { questionMs: 5, pauseMs: 5 });
  s.start('hangman', { word: 'AB' }); // manuelles Spiel OHNE vorher Stop
  return new Promise<void>((resolve) => setTimeout(() => {
    assert.equal(s.getState()?.kind, 'hangman', 'nach den alten Quiz-Timern läuft immer noch Hangman, nicht das gekaperte Quiz');
    s.stop();
    resolve();
  }, 30));
});

test('Hangman mit leerem/buchstabenlosem Wort startet nicht (validiert)', () => {
  const { s } = svc();
  assert.equal(s.start('hangman', { word: '   ' }).ok, false, 'leeres Wort abgelehnt');
  assert.equal(s.start('hangman', { word: '123!' }).ok, false, 'ohne Buchstabe abgelehnt');
  assert.equal(s.start('hangman', { word: 'Apfel' }).ok, true, 'gültiges Wort ok');
  s.stop();
});

test('startQuizAuto: leere Frageliste startet nicht', () => {
  const { s } = svc();
  assert.equal(s.startQuizAuto([]).ok, false);
});

test('startQuizAuto: erste Frage wird sofort als game-state gesendet', () => {
  const states: Array<{ question?: string }> = [];
  const s = new GameService((msg) => { if (msg.kind === 'game-state' && msg.state) states.push(msg.state as { question?: string }); }, () => { /* win egal */ });
  const r = s.startQuizAuto([{ q: 'Hauptstadt?', options: ['Berlin', 'Bonn', 'Köln', 'Hamburg'], correct: 0 }], { questionMs: 60000 });
  assert.equal(r.ok, true);
  assert.equal(states.at(-1)?.question, 'Hauptstadt?', 'erste Frage sofort gebroadcastet');
  s.stop(); // Timer aufräumen, sonst hängt der Test-Prozess
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
  s.stop();
});
