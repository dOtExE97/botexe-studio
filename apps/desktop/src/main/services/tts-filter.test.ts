import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldReadChat, containsBlockedWord, migrateReadWho } from './tts-filter';
import type { StudioEvent } from '@botexe/trigger-engine';

function chat(text: string, user: Partial<NonNullable<StudioEvent['user']>> = {}): StudioEvent {
  return { type: 'chat', ts: 1, text, user: { id: 'u1', nickname: 'Mia', ...user } };
}

test('containsBlockedWord: case-insensitiv, Teilwort, Leerliste = nie blockiert', () => {
  const words = ['Idiot', 'spam'];
  assert.equal(containsBlockedWord('du IDIOT!', words), true);
  assert.equal(containsBlockedWord('keine spammerei', words), true);
  assert.equal(containsBlockedWord('alles gut', words), false);
  assert.equal(containsBlockedWord('idiot', []), false);
  assert.equal(containsBlockedWord('', words), false);
});

test('Gruppen all: jeder wird vorgelesen', () => {
  assert.deepEqual(shouldReadChat(chat('hi'), ['all'], '', false), { read: true, text: 'hi' });
});

test('Multi-Select: liest, wer in MIND. EINER angekreuzten Gruppe ist (OR)', () => {
  const groups = ['mods', 'followers'] as const;
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), [...groups], '', false).read, true);
  assert.equal(shouldReadChat(chat('hi', { isFollower: true }), [...groups], '', false).read, true);
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), [...groups], '', false).read, false); // Sub nicht angekreuzt
  assert.equal(shouldReadChat(chat('hi'), [...groups], '', false).read, false); // niemand
});

test('einzelne Gruppe trifft NUR diese Gruppe (keine Hierarchie mehr)', () => {
  // Teamherz angekreuzt → ein Mod (ohne Sub-Flag) wird NICHT automatisch mitgelesen
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), ['subs'], '', false).read, false);
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), ['subs'], '', false).read, true);
});

test('App-VIP wird immer vorgelesen, egal welche Gruppen', () => {
  assert.equal(shouldReadChat(chat('hi'), ['mods'], '', true).read, true);
  assert.equal(shouldReadChat(chat('hi'), [], '', true).read, true);
});

test('leere Gruppenliste → niemand (außer App-VIP)', () => {
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), [], '', false).read, false);
});

test('prefix: nur Nachrichten mit Start-Zeichen, Prefix wird entfernt', () => {
  assert.equal(shouldReadChat(chat('hallo'), ['all'], '.', false).read, false);
  const r = shouldReadChat(chat('.hallo zusammen'), ['all'], '.', false);
  assert.equal(r.read, true);
  assert.equal(r.text, 'hallo zusammen');
});

test('prefix kombiniert mit Gruppe: beides muss passen', () => {
  assert.equal(shouldReadChat(chat('.hi'), ['subs'], '.', false).read, false);
  assert.equal(shouldReadChat(chat('.hi', { isSub: true }), ['subs'], '.', false).read, true);
});

test('migrateReadWho: alte Einstellung → Gruppen-Array (altes Verhalten erhalten)', () => {
  assert.deepEqual(migrateReadWho('all'), ['all']);
  assert.deepEqual(migrateReadWho('followers'), ['followers', 'subs', 'mods']); // war hierarchisch
  assert.deepEqual(migrateReadWho('subs'), ['subs', 'mods']);
  assert.deepEqual(migrateReadWho('mods'), ['mods']);
  assert.deepEqual(migrateReadWho('vips'), ['vips']);
  assert.deepEqual(migrateReadWho('quatsch'), ['all']); // Fallback
});
