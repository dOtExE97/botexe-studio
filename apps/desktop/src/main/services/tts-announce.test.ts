// tts-announce.test.ts — Entscheidungslogik für Event-Ansagen (Follower/Gifts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAnnounceGift, type GiftAnnounceConfig } from './tts-announce';

const cfg = (over: Partial<GiftAnnounceConfig> = {}): GiftAnnounceConfig => ({
  enabled: true,
  template: '{user} schenkt {gift}!',
  voice: '',
  minCoins: 1000,
  ...over,
});

test('shouldAnnounceGift: nur ab Coin-Schwelle (inklusiv)', () => {
  assert.equal(shouldAnnounceGift(1000, cfg()), true); // genau die Schwelle
  assert.equal(shouldAnnounceGift(5000, cfg()), true);
  assert.equal(shouldAnnounceGift(999, cfg()), false); // knapp drunter
});

test('shouldAnnounceGift: deaktiviert → nie', () => {
  assert.equal(shouldAnnounceGift(999999, cfg({ enabled: false })), false);
});

test('shouldAnnounceGift: minCoins 0 → jedes Gift', () => {
  assert.equal(shouldAnnounceGift(1, cfg({ minCoins: 0 })), true);
  assert.equal(shouldAnnounceGift(0, cfg({ minCoins: 0 })), true);
});

test('shouldAnnounceGift: negativer/kaputter minCoins wird wie 0 behandelt', () => {
  assert.equal(shouldAnnounceGift(5, cfg({ minCoins: -100 })), true);
  assert.equal(shouldAnnounceGift(5, cfg({ minCoins: NaN })), true);
});
