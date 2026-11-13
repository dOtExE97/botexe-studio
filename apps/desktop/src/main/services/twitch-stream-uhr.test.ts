// twitch-stream-uhr.test.ts — Review Runde 3, I1: Ein neuer Stream muss als
// neu erkannt werden, auch wenn das stream.offline davor nie ankam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchStreamUhr } from './twitch-stream-uhr';

const STD = 3_600_000;

test('neue Stream-ID ohne stream.offline dazwischen = neuer Stream (Kisten neu, Uhr neu)', () => {
  const u = new TwitchStreamUhr();
  assert.equal(u.melde({ status: 'verbunden', live: true, streamId: 'A', startedAt: 1_000 }, 2_000), true);
  assert.equal(u.liveSeit, 1_000);
  // Leitung am Streamende tot → kein stream.offline. Reconnect meldet weiter live:true mit alter ID.
  assert.equal(u.melde({ status: 'getrennt', live: true, streamId: 'A', startedAt: 1_000 }, 5_000), false);
  assert.equal(u.melde({ status: 'verbunden', live: true, streamId: 'A', startedAt: 1_000 }, 6_000), false);
  // Nächster Tag: stream.online mit neuer ID.
  const morgen = 26 * STD;
  assert.equal(u.melde({ status: 'verbunden', live: true, streamId: 'B', startedAt: morgen - 60_000 }, morgen), true);
  assert.equal(u.liveSeit, morgen - 60_000, '{uptime} zählt ab dem neuen Stream, nicht seit gestern');
});

test('von Hand getrennt (aus, live bleibt stehen) und neuer Stream → neu', () => {
  const u = new TwitchStreamUhr();
  u.melde({ status: 'verbunden', live: true, streamId: 'A' }, 100);
  u.melde({ status: 'aus', live: true, streamId: 'A' }, 200);
  assert.equal(u.verbundenSeit, 0);
  assert.equal(u.melde({ status: 'verbunden', live: true, streamId: 'B' }, 300), true);
  assert.equal(u.liveSeit, 300, 'ohne started_at zählt „jetzt"');
});

test('stream.offline → stream.online: wie bisher neu; Startzeit aus der Zukunft wird ignoriert', () => {
  const u = new TwitchStreamUhr();
  u.melde({ status: 'verbunden', live: true, streamId: 'A' }, 100);
  assert.equal(u.melde({ status: 'verbunden', live: false, streamId: 'A' }, 200), false);
  assert.equal(u.liveSeit, 0);
  assert.equal(u.melde({ status: 'verbunden', live: true, streamId: 'B', startedAt: 9_999 }, 300), true);
  assert.equal(u.liveSeit, 300);
});

test('studio.ts: twitchUhr nutzt die Stream-Uhr und setzt dann die Orakel-Kisten zurück', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const src = existsSync(join(process.cwd(), 'src', 'main.ts')) ? join(process.cwd(), 'src') : join(process.cwd(), 'apps', 'desktop', 'src');
  const studio = readFileSync(join(src, 'main', 'services', 'studio.ts'), 'utf8');
  const uhr = studio.slice(studio.indexOf('private twitchUhr('), studio.indexOf('private twitchUhr(') + 600);
  assert.match(uhr, /if \(!this\.twitchStream\.melde\(info, Date\.now\(\)\)\) return;/);
  assert.match(uhr, /this\.orakelKisten\.reset\(\)/);
});
