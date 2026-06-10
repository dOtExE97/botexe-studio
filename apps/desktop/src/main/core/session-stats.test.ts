import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioEvent } from '@botexe/trigger-engine';
import { SessionStats } from './session-stats';

const gift = (id: string, coins: number, count = 1, ts = 1): StudioEvent => ({
  type: 'gift',
  ts,
  user: { id, nickname: id.toUpperCase() },
  gift: { slug: 'rose', count, coinsPerUnit: coins / count, totalCoins: coins },
});

test('gifts erhöhen totals und gifter-aggregation', () => {
  const s = new SessionStats();
  s.apply(gift('anna', 10));
  s.apply(gift('anna', 5));
  s.apply(gift('ben', 100));

  const snap = s.snapshot();
  assert.equal(snap.totals.coins, 115);
  assert.equal(snap.totals.gifts, 3);
  assert.equal(snap.topGifters[0]?.id, 'ben');
  assert.equal(snap.topGifters[0]?.coins, 100);
  assert.equal(snap.topGifters[1]?.id, 'anna');
  assert.equal(snap.topGifters[1]?.coins, 15);
});

test('topGifters ist auf 10 einträge begrenzt', () => {
  const s = new SessionStats();
  for (let i = 0; i < 15; i++) s.apply(gift(`user${i}`, i + 1));
  assert.equal(s.snapshot().topGifters.length, 10);
  assert.equal(s.snapshot().topGifters[0]?.id, 'user14');
});

test('likes/follows/shares/chats werden gezählt', () => {
  const s = new SessionStats();
  s.apply({ type: 'like', ts: 1, likeCount: 30, totalLikes: 30 });
  s.apply({ type: 'like', ts: 2, likeCount: 12, totalLikes: 42 });
  s.apply({ type: 'follow', ts: 3, user: { id: 'a', nickname: 'A' } });
  s.apply({ type: 'share', ts: 4, user: { id: 'b', nickname: 'B' } });
  s.apply({ type: 'chat', ts: 5, text: 'hi' });

  const t = s.snapshot().totals;
  assert.equal(t.likes, 42, 'totalLikes der plattform hat vorrang');
  assert.equal(t.follows, 1);
  assert.equal(t.shares, 1);
  assert.equal(t.chats, 1);
});

test('viewer_count setzt current und peak', () => {
  const s = new SessionStats();
  s.apply({ type: 'viewer_count', ts: 1, viewerCount: 50 });
  s.apply({ type: 'viewer_count', ts: 2, viewerCount: 200 });
  s.apply({ type: 'viewer_count', ts: 3, viewerCount: 80 });

  assert.equal(s.snapshot().totals.viewers, 80);
  assert.equal(s.snapshot().totals.peakViewers, 200);
});

test('apply meldet ob sich etwas geändert hat (für broadcast-throttling)', () => {
  const s = new SessionStats();
  assert.equal(s.apply(gift('anna', 10)), true);
  assert.equal(s.apply({ type: 'viewer_count', ts: 1, viewerCount: 0 }), false, 'viewer 0→0 ändert nichts');
});

test('serialisierung: toJSON/fromJSON roundtrip mit schemaVersion', () => {
  const s = new SessionStats();
  s.apply(gift('anna', 15));
  s.apply({ type: 'follow', ts: 1, user: { id: 'b', nickname: 'B' } });

  const restored = SessionStats.fromJSON(s.toJSON());
  assert.deepEqual(restored?.snapshot(), s.snapshot());

  assert.equal(SessionStats.fromJSON('{"schemaVersion":99}'), null, 'unbekannte version → null');
  assert.equal(SessionStats.fromJSON('kaputt'), null);
});

test('reset leert alles', () => {
  const s = new SessionStats();
  s.apply(gift('anna', 15));
  s.reset();
  assert.equal(s.snapshot().totals.coins, 0);
  assert.equal(s.snapshot().topGifters.length, 0);
});

// ── Like-Liste (TikFinity-Style): top-liker pro user ─────────────────────

test('likes werden pro user aggregiert und als topLikers geliefert', () => {
  const s = new SessionStats();
  s.apply({ type: 'like', ts: 1, user: { id: 'mia', nickname: 'Mia', profilePic: 'pic.jpg' }, likeCount: 30, totalLikes: 30 });
  s.apply({ type: 'like', ts: 2, user: { id: 'ben', nickname: 'Ben' }, likeCount: 100, totalLikes: 130 });
  s.apply({ type: 'like', ts: 3, user: { id: 'mia', nickname: 'Mia' }, likeCount: 80, totalLikes: 210 });

  const top = s.snapshot().topLikers;
  assert.equal(top[0]?.id, 'mia');
  assert.equal(top[0]?.likes, 110);
  assert.equal(top[0]?.profilePic, 'pic.jpg');
  assert.equal(top[1]?.id, 'ben');
  assert.equal(top[1]?.likes, 100);
});

test('topLikers überlebt toJSON/fromJSON roundtrip', () => {
  const s = new SessionStats();
  s.apply({ type: 'like', ts: 1, user: { id: 'mia', nickname: 'Mia' }, likeCount: 5, totalLikes: 5 });
  const restored = SessionStats.fromJSON(s.toJSON());
  assert.deepEqual(restored?.snapshot().topLikers, s.snapshot().topLikers);
});
