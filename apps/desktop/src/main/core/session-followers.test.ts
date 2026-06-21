// session-followers.test.ts — Live-Follow-Gedächtnis pro Stream.
// TikTok liefert den Follow-Status in Chat-Events unzuverlässig. Wer aber
// WÄHREND des Streams folgt (Follow-Event), gilt ab dann als Follower —
// damit der TTS-Filter "nur Follower" diese Leute auch vorliest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionFollowers } from './session-followers';

test('merkt Live-Follower und reichert spätere Chat-User an', () => {
  const f = new SessionFollowers();
  f.add('anna_99');
  const user = { id: 'anna_99', isFollower: undefined as boolean | undefined };
  f.enrich(user);
  assert.equal(user.isFollower, true);
});

test('reichert NICHT an, wenn der User nicht live gefolgt ist', () => {
  const f = new SessionFollowers();
  const user = { id: 'fremder', isFollower: undefined as boolean | undefined };
  f.enrich(user);
  assert.ok(!user.isFollower);
});

test('lässt bereits gesetzten Follower-Status unangetastet', () => {
  const f = new SessionFollowers();
  const user = { id: 'x', isFollower: true };
  f.enrich(user); // kein Eintrag, aber schon true → bleibt true
  assert.equal(user.isFollower, true);
});

test('clear() vergisst alle Follower (neuer Stream)', () => {
  const f = new SessionFollowers();
  f.add('anna_99');
  f.clear();
  const user = { id: 'anna_99', isFollower: undefined as boolean | undefined };
  f.enrich(user);
  assert.ok(!user.isFollower);
});

test('ignoriert leere/fehlende IDs', () => {
  const f = new SessionFollowers();
  f.add('');
  f.add(undefined);
  assert.equal(f.size, 0);
  f.enrich(undefined); // kein Crash
});
