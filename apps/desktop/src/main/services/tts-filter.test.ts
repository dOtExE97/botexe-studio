import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldReadChat, containsBlockedWord } from './tts-filter';
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

test('readWho all: jeder wird vorgelesen', () => {
  assert.deepEqual(shouldReadChat(chat('hi'), 'all', '', false), { read: true, text: 'hi' });
});

test('readWho subs (Teamherz): nur Subs/Mods/VIPs', () => {
  assert.equal(shouldReadChat(chat('hi'), 'subs', '', false).read, false);
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), 'subs', '', false).read, true);
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), 'subs', '', false).read, true);
  assert.equal(shouldReadChat(chat('hi'), 'subs', '', true).read, true); // App-VIP zählt immer
});

test('readWho followers: Follower und höher', () => {
  assert.equal(shouldReadChat(chat('hi'), 'followers', '', false).read, false);
  assert.equal(shouldReadChat(chat('hi', { isFollower: true }), 'followers', '', false).read, true);
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), 'followers', '', false).read, true);
});

test('readWho mods: nur Mods/VIPs', () => {
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), 'mods', '', false).read, false);
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), 'mods', '', false).read, true);
});

test('readWho vips: nur in der App markierte VIPs', () => {
  assert.equal(shouldReadChat(chat('hi', { isMod: true, isSub: true }), 'vips', '', false).read, false);
  assert.equal(shouldReadChat(chat('hi'), 'vips', '', true).read, true);
});

test('prefix: nur Nachrichten mit Start-Zeichen, Prefix wird entfernt', () => {
  assert.equal(shouldReadChat(chat('hallo'), 'all', '.', false).read, false);
  const r = shouldReadChat(chat('.hallo zusammen'), 'all', '.', false);
  assert.equal(r.read, true);
  assert.equal(r.text, 'hallo zusammen');
});

test('prefix kombiniert mit Gruppe: beides muss passen', () => {
  assert.equal(shouldReadChat(chat('.hi'), 'subs', '.', false).read, false);
  assert.equal(shouldReadChat(chat('.hi', { isSub: true }), 'subs', '.', false).read, true);
});
