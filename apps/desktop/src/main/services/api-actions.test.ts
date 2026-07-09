import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseApiAction } from './api-actions';

function ok(raw: unknown) {
  const r = parseApiAction(raw);
  assert.ok('action' in r, `erwartet gültig, war: ${JSON.stringify(r)}`);
  return r.action;
}
function err(raw: unknown) {
  const r = parseApiAction(raw);
  assert.ok('error' in r, `erwartet Fehler, war: ${JSON.stringify(r)}`);
  return r.error;
}

test('play_sound: soundId nötig, volume geklemmt', () => {
  assert.deepEqual(ok({ kind: 'play_sound', soundId: 'boom' }), { kind: 'play_sound', soundId: 'boom' });
  assert.deepEqual(ok({ kind: 'play_sound', soundId: 'boom', volume: 5 }), { kind: 'play_sound', soundId: 'boom', volume: 1 });
  err({ kind: 'play_sound' });
  err({ kind: 'play_sound', soundId: '   ' });
});

test('speak: text nötig, Länge begrenzt, voice optional', () => {
  assert.deepEqual(ok({ kind: 'speak', text: 'Hallo' }), { kind: 'speak', text: 'Hallo' });
  assert.deepEqual(ok({ kind: 'speak', text: 'Hi', voice: 'de-DE' }), { kind: 'speak', text: 'Hi', voice: 'de-DE' });
  err({ kind: 'speak', text: '' });
  err({ kind: 'speak', text: 'x'.repeat(501) });
});

test('start_game: nur bekannte Spiele, config durchgereicht', () => {
  assert.deepEqual(ok({ kind: 'start_game', game: 'hangman', config: { word: 'APFEL' } }), {
    kind: 'start_game', game: 'hangman', config: { word: 'APFEL' },
  });
  assert.deepEqual(ok({ kind: 'start_game', game: 'quiz' }), { kind: 'start_game', game: 'quiz' });
  err({ kind: 'start_game', game: 'schach' });
  err({ kind: 'start_game' });
});

test('parameterlose Aktionen', () => {
  for (const kind of ['stop_game', 'reveal_game', 'start_boss', 'stop_boss']) {
    assert.deepEqual(ok({ kind }), { kind });
  }
});

test('Müll/unbekannt wird abgelehnt', () => {
  err(null);
  err('kaputt');
  err({});
  err({ kind: 'rm_rf' });
  err({ kind: 42 });
});
