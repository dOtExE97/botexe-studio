// logger.test.ts — Zeitstempel in LOKALER Zeit (statt UTC), damit die Logs zur
// Uhr/TikTok des jeweiligen Nutzers passen (Zeitzonen-Verwirrung vermeiden).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalStamp } from './logger';

test('formatiert lokale Zeit ISO-ähnlich, OHNE Z (kein UTC)', () => {
  // Der Date-Konstruktor nimmt lokale Komponenten → getHours() etc. sind
  // unabhängig von der Test-Zeitzone deterministisch.
  const d = new Date(2026, 5, 14, 18, 13, 11, 883); // 14.06.2026 18:13:11.883 lokal
  assert.equal(formatLocalStamp(d), '2026-06-14T18:13:11.883');
});

test('füllt einstellige Werte mit Nullen auf', () => {
  const d = new Date(2026, 0, 3, 4, 5, 6, 7); // 03.01.2026 04:05:06.007
  assert.equal(formatLocalStamp(d), '2026-01-03T04:05:06.007');
});

test('endet nicht auf Z', () => {
  assert.equal(formatLocalStamp(new Date(2026, 5, 1, 0, 0, 0, 0)).endsWith('Z'), false);
});
