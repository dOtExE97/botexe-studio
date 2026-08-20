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
  coins, gifts: 1, follows: 0, likes: 10, shares: 0, chats, viewers: 0, peakViewers: 5, uniqueViewers: 0,
});
const EMPTY = { coins: 0, gifts: 0, follows: 0, likes: 0, shares: 0, chats: 0, viewers: 0, peakViewers: 0, uniqueViewers: 0 };

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

// ── Herkunft der Zuschauer ─────────────────────────────────────────────────
// TikToks clientEnterSource, roh. Weder TikFinity noch andere Tools werten das
// aus — im entpackten TikFinity-Bundle kommt der Feldname 0x vor.

test('Herkunft wird ueber die Sessions zusammengezaehlt', () => {
  const h = new StatsHistory(tmpDir());
  const now = 1_000 * DAY;
  h.record({ ...totals(10, 1), herkunft: { 'homepage_hot-live_cell': 3 } }, now - DAY);
  h.record({ ...totals(10, 1), herkunft: { 'homepage_hot-live_cell': 2, 'message-live_cover': 1 } }, now - 2 * DAY);
  const s = h.summary('week', now);
  assert.deepEqual(s.herkunft, { 'homepage_hot-live_cell': 5, 'message-live_cover': 1 });
});

test('Alte Eintraege ohne Herkunft ergeben „unbekannt", nicht leer', () => {
  // Ein leeres {} saehe in der Auswertung aus wie „0 aus jeder Quelle" —
  // dabei hat der Stream die Angabe nur nie erfasst.
  const now = 1_000 * DAY;
  const h = new StatsHistory(tmpDir());
  h.record(totals(10, 1), now - DAY);
  assert.equal(h.summary('week', now).herkunft, undefined);
});
