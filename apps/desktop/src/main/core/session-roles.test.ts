// session-roles.test.ts — Rollen-Gedächtnis pro Stream.
// TikTok liefert Mod/Teamherz/Follower-Status NICHT in jeder Nachricht. Wer
// einmal als X erkannt wurde, gilt für den Rest des Streams als X — sonst
// flackert das Vorlesen (mal erkannt, mal nicht) für ein und dieselbe Person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRoles } from './session-roles';

test('einmal als Follower erkannt → bleibt Follower (auch wenn nächste Nachricht es nicht trägt)', () => {
  const r = new SessionRoles();
  r.remember({ id: 'lili', isFollower: true });
  const later = { id: 'lili', isFollower: undefined as boolean | undefined };
  r.apply(later);
  assert.equal(later.isFollower, true);
});

test('merkt sich Mod- und Teamherz-Status getrennt pro User', () => {
  const r = new SessionRoles();
  r.remember({ id: 'mod1', isMod: true });
  r.remember({ id: 'sub1', isSub: true });
  const a = { id: 'mod1' } as { id: string; isMod?: boolean; isSub?: boolean };
  const b = { id: 'sub1' } as { id: string; isMod?: boolean; isSub?: boolean };
  r.apply(a); r.apply(b);
  assert.equal(a.isMod, true);
  assert.ok(!a.isSub);
  assert.equal(b.isSub, true);
  assert.ok(!b.isMod);
});

test('Rollen akkumulieren (erst Follower, später auch Mod erkannt)', () => {
  const r = new SessionRoles();
  r.remember({ id: 'x', isFollower: true });
  r.remember({ id: 'x', isMod: true });
  const u = { id: 'x' } as { id: string; isMod?: boolean; isFollower?: boolean };
  r.apply(u);
  assert.equal(u.isFollower, true);
  assert.equal(u.isMod, true);
});

test('User ohne je erkannte Rolle wird nicht verändert', () => {
  const r = new SessionRoles();
  const u = { id: 'fremder', isFollower: undefined as boolean | undefined };
  r.apply(u);
  assert.ok(!u.isFollower);
});

test('remember ignoriert User ohne Rolle und ohne id', () => {
  const r = new SessionRoles();
  r.remember({ id: 'a' }); // keine Rolle → nichts merken
  r.remember(undefined);
  r.remember({ id: '', isMod: true });
  assert.equal(r.size, 0);
});

test('clear() vergisst alles (neuer Stream)', () => {
  const r = new SessionRoles();
  r.remember({ id: 'x', isMod: true });
  r.clear();
  const u = { id: 'x', isMod: undefined as boolean | undefined };
  r.apply(u);
  assert.ok(!u.isMod);
});
