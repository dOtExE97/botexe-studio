// quiz.test.ts — State-Automat des Quiz: Vote-Annahme, ein-Vote-pro-User,
// Gewinner-Logik (first deterministisch, random via injiziertem rng) + voteCounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizGame, parseVote, type QuizConfig } from './quiz';

const baseConfig = (overrides: Partial<QuizConfig> = {}): QuizConfig => ({
  question: 'Welche Farbe hat der Himmel?',
  options: ['Blau', 'Grün', 'Rot', 'Lila'],
  correctIndex: 0,
  winnerMode: 'first',
  ...overrides,
});

test('parseVote akzeptiert A-D und !a-!d case-insensitiv, lehnt Rest ab', () => {
  assert.equal(parseVote('A', 4), 0);
  assert.equal(parseVote('b', 4), 1);
  assert.equal(parseVote(' !C ', 4), 2);
  assert.equal(parseVote('!d', 4), 3);
  assert.equal(parseVote('D', 2), null, 'D existiert bei 2 Optionen nicht');
  assert.equal(parseVote('hallo', 4), null);
  assert.equal(parseVote('', 4), null);
  assert.equal(parseVote('ab', 4), null);
});

test('Votes werden nur im question-State angenommen', () => {
  const game = new QuizGame();
  // idle: keine Annahme
  assert.equal(game.handleChat('u1', 'User1', 'A').accepted, false);

  game.start(baseConfig());
  assert.equal(game.handleChat('u1', 'User1', 'A').accepted, true);

  game.reveal();
  // reveal: keine Annahme mehr
  assert.equal(game.handleChat('u2', 'User2', 'A').accepted, false);
});

test('ein Vote pro User — erste Antwort zählt', () => {
  const game = new QuizGame();
  game.start(baseConfig());

  assert.equal(game.handleChat('u1', 'User1', 'A').accepted, true);
  // zweite Antwort desselben Users wird abgelehnt
  assert.equal(game.handleChat('u1', 'User1', 'B').accepted, false);

  const state = game.getState();
  assert.equal(state.totalVotes, 1);
  assert.equal(state.voteCounts[0], 1, 'A (erste Antwort) zählt');
  assert.equal(state.voteCounts[1], 0, 'B (zweite Antwort) zählt nicht');
});

test("winnerMode 'first' liefert deterministisch den ersten richtigen Vote", () => {
  const game = new QuizGame();
  game.start(baseConfig({ correctIndex: 0, winnerMode: 'first' }));

  game.handleChat('u1', 'Falsch', 'B'); // falsch
  game.handleChat('u2', 'ErsterRichtig', 'A'); // erste richtige
  game.handleChat('u3', 'ZweiterRichtig', 'A'); // zweite richtige

  const result = game.reveal();
  assert.equal(result.correctIndex, 0);
  assert.deepEqual(result.winner, { userId: 'u2', nickname: 'ErsterRichtig' });
  assert.equal(result.state, 'reveal');
});

test("winnerMode 'random' wählt deterministisch mit injiziertem rng", () => {
  // rng gibt 0.5 zurück → bei 2 richtigen: floor(0.5*2)=1 → zweiter Richtiger
  const game = new QuizGame(() => 0.5);
  game.start(baseConfig({ correctIndex: 1, winnerMode: 'random' }));

  game.handleChat('u1', 'RichtigEins', 'B'); // correctIndex 1
  game.handleChat('u2', 'Falsch', 'A');
  game.handleChat('u3', 'RichtigZwei', 'B'); // correctIndex 1

  const result = game.reveal();
  assert.deepEqual(result.winner, { userId: 'u3', nickname: 'RichtigZwei' });
});

test("winnerMode 'random' respektiert per-reveal injizierten rng", () => {
  const game = new QuizGame(() => 0.99); // Default würde letzten wählen
  game.start(baseConfig({ correctIndex: 0, winnerMode: 'random' }));
  game.handleChat('u1', 'A1', 'A');
  game.handleChat('u2', 'A2', 'A');
  game.handleChat('u3', 'A3', 'A');

  // rng=0 → floor(0*3)=0 → erster
  const result = game.reveal(() => 0);
  assert.deepEqual(result.winner, { userId: 'u1', nickname: 'A1' });
});

test('reveal ohne richtige Antwort → winner null', () => {
  const game = new QuizGame();
  game.start(baseConfig({ correctIndex: 0 }));
  game.handleChat('u1', 'User1', 'B'); // alle falsch
  const result = game.reveal();
  assert.equal(result.winner, null);
  assert.equal(result.correctIndex, 0);
});

test('voteCounts korrekt und verraten die richtige Option nicht', () => {
  const game = new QuizGame();
  game.start(baseConfig({ correctIndex: 2 }));
  game.handleChat('u1', 'a', 'A');
  game.handleChat('u2', 'b', 'A');
  game.handleChat('u3', 'c', 'C');
  game.handleChat('u4', 'd', 'D');

  const state = game.getState();
  assert.deepEqual(state.voteCounts, [2, 0, 1, 1]);
  assert.equal(state.totalVotes, 4);
  // getState liefert keinen correctIndex — nicht verraten
  assert.equal('correctIndex' in state, false);
});

test('reset/stop führen zurück nach idle und löschen Votes', () => {
  const game = new QuizGame();
  game.start(baseConfig());
  game.handleChat('u1', 'User1', 'A');

  game.reset();
  let s = game.getState();
  assert.equal(s.state, 'idle');
  assert.equal(s.totalVotes, 0);
  assert.equal(s.question, '');

  game.start(baseConfig());
  game.handleChat('u1', 'User1', 'A');
  game.stop();
  s = game.getState();
  assert.equal(s.state, 'idle');
  assert.equal(s.totalVotes, 0);
});

test('cooldown nur aus reveal heraus erreichbar', () => {
  const game = new QuizGame();
  game.start(baseConfig());
  game.cooldown(); // aus question → bleibt question
  assert.equal(game.getState().state, 'question');

  game.reveal();
  game.cooldown();
  assert.equal(game.getState().state, 'cooldown');
});

test('start validiert Optionen-Anzahl und correctIndex', () => {
  const game = new QuizGame();
  assert.throws(() => game.start(baseConfig({ options: ['nur eins'] })), /2–4/);
  assert.throws(
    () => game.start(baseConfig({ options: ['a', 'b'], correctIndex: 5 })),
    /correctIndex/,
  );
});
