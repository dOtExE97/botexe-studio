import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChat,
  normalizeGift,
  normalizeLike,
  normalizeSocial,
  normalizeViewerCount,
} from './tiktok-normalize';

// Fixtures entsprechen den v2-Shapes aus tiktok-live-connector@2.1.1-beta1
// (dist/types/tiktok-schema.d.ts: WebcastChatMessage, WebcastGiftMessage, …).

const user = {
  userId: '123',
  uniqueId: 'anna_99',
  nickname: 'Anna',
  profilePicture: { url: ['https://cdn.example/anna.jpg'] },
};

test('chat: comment + user werden normalisiert', () => {
  const e = normalizeChat({ user, comment: 'hallo stream!' }, 5_000);

  assert.equal(e.type, 'chat');
  assert.equal(e.ts, 5_000);
  assert.equal(e.text, 'hallo stream!');
  assert.equal(e.user?.id, 'anna_99');
  assert.equal(e.user?.nickname, 'Anna');
  assert.equal(e.user?.profilePic, 'https://cdn.example/anna.jpg');
});

test('chat: fehlender user wird zu undefined statt crash', () => {
  const e = normalizeChat({ comment: 'anon' }, 1);
  assert.equal(e.user, undefined);
  assert.equal(e.text, 'anon');
});

test('gift: finalisierter streak (giftType 1, repeatEnd 1) liefert event mit total-coins', () => {
  const e = normalizeGift(
    {
      user,
      giftId: 5655,
      repeatCount: 12,
      repeatEnd: 1,
      giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 },
    },
    2_000,
  );

  assert.ok(e, 'finalisierter streak erzeugt event');
  assert.equal(e?.type, 'gift');
  assert.equal(e?.gift?.slug, 'Rose');
  assert.equal(e?.gift?.giftId, 5655);
  assert.equal(e?.gift?.count, 12);
  assert.equal(e?.gift?.coinsPerUnit, 1);
  assert.equal(e?.gift?.totalCoins, 12);
});

test('gift: laufender streak (giftType 1, repeatEnd 0) wird unterdrückt', () => {
  const e = normalizeGift(
    {
      user,
      giftId: 5655,
      repeatCount: 3,
      repeatEnd: 0,
      giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 },
    },
    2_000,
  );
  assert.equal(e, null);
});

test('gift: nicht-streakbares gift (giftType != 1) kommt sofort durch', () => {
  const e = normalizeGift(
    {
      user,
      giftId: 7777,
      repeatCount: 1,
      repeatEnd: 0,
      giftDetails: { giftName: 'Lion', giftType: 2, diamondCount: 2999 },
    },
    3_000,
  );

  assert.equal(e?.gift?.totalCoins, 2999);
});

test('like: count + total werden übernommen', () => {
  const e = normalizeLike({ user, likeCount: 15, totalLikeCount: 1234 }, 1);
  assert.equal(e.type, 'like');
  assert.equal(e.likeCount, 15);
  assert.equal(e.totalLikes, 1234);
});

test('social: follow und share werden unterschieden', () => {
  const follow = normalizeSocial({ user }, 'follow', 1);
  const share = normalizeSocial({ user }, 'share', 1);
  assert.equal(follow.type, 'follow');
  assert.equal(share.type, 'share');
  assert.equal(follow.user?.nickname, 'Anna');
});

test('viewer_count aus roomUser-message', () => {
  const e = normalizeViewerCount({ viewerCount: 256 }, 1);
  assert.equal(e.type, 'viewer_count');
  assert.equal(e.viewerCount, 256);
});

test('user-fallbacks: uniqueId fehlt → userId, nickname fehlt → uniqueId', () => {
  const e = normalizeChat(
    { user: { userId: '42', nickname: '', uniqueId: '' }, comment: 'x' },
    1,
  );
  assert.equal(e.user?.id, '42');
  assert.equal(e.user?.nickname, '42');
});
