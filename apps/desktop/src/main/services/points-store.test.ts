import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PointsStore, DEFAULT_POINTS_CONFIG } from './points-store';
import type { StudioEvent } from '@botexe/trigger-engine';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'points-'));
}

test('award addiert punkte pro user und merkt nickname/bild', () => {
  const s = new PointsStore(tmpDir());
  s.award('mia', 'Mia', 10, 'pic.jpg');
  s.award('mia', 'Mia', 5);
  const e = s.get('mia');
  assert.equal(e?.points, 15);
  assert.equal(e?.nickname, 'Mia');
  assert.equal(e?.profilePic, 'pic.jpg');
});

test('top liefert die punktreichsten user absteigend, limitiert', () => {
  const s = new PointsStore(tmpDir());
  s.award('a', 'A', 100);
  s.award('b', 'B', 300);
  s.award('c', 'C', 200);
  const top = s.top(2);
  assert.deepEqual(top.map((e) => e.id), ['b', 'c']);
});

test('recordEvent vergibt punkte gemäß config (gift-coins, follow, chat)', () => {
  const s = new PointsStore(tmpDir());
  const cfg = { ...DEFAULT_POINTS_CONFIG, perChat: 1, perFollow: 50, perCoin: 2, perLike: 0 };
  const gift: StudioEvent = { type: 'gift', ts: 1, user: { id: 'mia', nickname: 'Mia' }, gift: { slug: 'rose', count: 1, coinsPerUnit: 10, totalCoins: 10 } };
  assert.equal(s.recordEvent(gift, cfg), 20); // 10 coins * 2
  assert.equal(s.recordEvent({ type: 'follow', ts: 2, user: { id: 'ben', nickname: 'Ben' } }, cfg), 50);
  assert.equal(s.recordEvent({ type: 'chat', ts: 3, user: { id: 'mia', nickname: 'Mia' }, text: 'hi' }, cfg), 1);
  assert.equal(s.get('mia')?.points, 21);
});

test('recordEvent ohne user oder bei deaktiviert vergibt nichts', () => {
  const s = new PointsStore(tmpDir());
  assert.equal(s.recordEvent({ type: 'follow', ts: 1 }, DEFAULT_POINTS_CONFIG), 0);
  assert.equal(
    s.recordEvent({ type: 'follow', ts: 1, user: { id: 'x', nickname: 'X' } }, { ...DEFAULT_POINTS_CONFIG, enabled: false }),
    0,
  );
});

test('persistenz: save + neu laden erhält punkte (atomar)', () => {
  const dir = tmpDir();
  const a = new PointsStore(dir);
  a.award('mia', 'Mia', 42);
  a.save();
  const b = new PointsStore(dir);
  assert.equal(b.get('mia')?.points, 42);
});

test('kaputte points-datei → leerer store, kein crash', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'points.json'), '{kaputt');
  const s = new PointsStore(dir);
  assert.equal(s.top(5).length, 0);
});

test('addPoints/redeem: manuelles abziehen für künftige einlösungen', () => {
  const s = new PointsStore(tmpDir());
  s.award('mia', 'Mia', 100);
  assert.equal(s.spend('mia', 30), true);
  assert.equal(s.get('mia')?.points, 70);
  assert.equal(s.spend('mia', 1000), false, 'nicht genug punkte');
  assert.equal(s.get('mia')?.points, 70);
});
