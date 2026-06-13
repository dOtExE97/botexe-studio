// stats-history.test.ts — persistente Stream-Historie für Zeitraum-Ansichten
// (Woche/Monat/Jahr). Pro beendeter Session ein Eintrag; Abfrage summiert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StatsHistory } from './stats-history';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'statshist-'));
}
const DAY = 86_400_000;

const totals = (coins: number, chats: number) => ({
  coins, gifts: 1, follows: 0, likes: 10, shares: 0, chats, viewers: 0, peakViewers: 5,
});
const EMPTY = { coins: 0, gifts: 0, follows: 0, likes: 0, shares: 0, chats: 0, viewers: 0, peakViewers: 0 };

test('record speichert nur Sessions mit Aktivität, summary summiert im Zeitraum', () => {
  const now = 1_000 * DAY; // fixer „Jetzt"-Zeitpunkt
  const h = new StatsHistory(tmpDir());
  h.record(totals(100, 5), now - 2 * DAY);
  h.record(totals(50, 3), now - 10 * DAY);
  h.record(EMPTY, now); // keine Aktivität → ignoriert

  const week = h.summary('week', now);
  assert.equal(week.coins, 100, 'nur die Session der letzten 7 Tage');
  assert.equal(week.sessions, 1);

  const month = h.summary('month', now);
  assert.equal(month.coins, 150, '30 Tage → beide Sessions');
  assert.equal(month.chats, 8);
  assert.equal(month.sessions, 2);
});

test('summary year umfasst beide, älteres fällt raus', () => {
  const now = 1_000 * DAY;
  const h = new StatsHistory(tmpDir());
  h.record(totals(10, 1), now - 100 * DAY);
  h.record(totals(20, 2), now - 400 * DAY); // älter als ein Jahr
  assert.equal(h.summary('year', now).coins, 10);
});

test('persistiert und lädt wieder', () => {
  const dir = tmpDir();
  const now = 1_000 * DAY;
  const a = new StatsHistory(dir);
  a.record(totals(77, 4), now - DAY);
  a.save();
  const b = new StatsHistory(dir);
  assert.equal(b.summary('week', now).coins, 77);
});
