import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioEvent } from '@botexe/trigger-engine';
import { EventRecorder, parseReplay, playReplay } from './replay';

const chat = (text: string, ts: number): StudioEvent => ({ type: 'chat', ts, text });

test('recorder → jsonl → parse roundtrip erhält events und offsets', () => {
  const rec = new EventRecorder();
  rec.record(chat('eins', 1_000));
  rec.record(chat('zwei', 1_500));
  rec.record({ type: 'gift', ts: 2_000, gift: { slug: 'rose', count: 1, coinsPerUnit: 1, totalCoins: 1 } });

  const entries = parseReplay(rec.toJsonl());

  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((e) => e.offsetMs), [0, 500, 1_000]);
  assert.equal(entries[0]?.event.text, 'eins');
  assert.equal(entries[2]?.event.gift?.slug, 'rose');
});

test('parse: kaputte zeilen werden übersprungen statt alles zu verwerfen', () => {
  const jsonl = [
    JSON.stringify({ offsetMs: 0, event: chat('ok', 1) }),
    '{kaputt',
    JSON.stringify({ offsetMs: 10, event: chat('auch ok', 2) }),
    JSON.stringify({ nichtDasFormat: true }),
  ].join('\n');

  const entries = parseReplay(jsonl);
  assert.equal(entries.length, 2);
});

test('playReplay: publiziert alle events in reihenfolge (speed 0 = sofort)', async () => {
  const rec = new EventRecorder();
  rec.record(chat('a', 1_000));
  rec.record(chat('b', 5_000));
  rec.record(chat('c', 9_000));

  const got: StudioEvent[] = [];
  const count = await playReplay(parseReplay(rec.toJsonl()), (e) => got.push(e), { speed: 0 });

  assert.equal(count, 3);
  assert.deepEqual(got.map((e) => e.text), ['a', 'b', 'c']);
  assert.equal(got[0]?.ts, 1_000, 'original-ts bleibt erhalten (cooldowns deterministisch)');
});

test('playReplay: abort-signal stoppt die wiedergabe', async () => {
  const rec = new EventRecorder();
  rec.record(chat('a', 0));
  rec.record(chat('b', 60_000)); // käme erst nach 60s

  const ac = new AbortController();
  const got: StudioEvent[] = [];
  const playing = playReplay(parseReplay(rec.toJsonl()), (e) => got.push(e), {
    speed: 1,
    signal: ac.signal,
  });
  setTimeout(() => ac.abort(), 20);
  const count = await playing;

  assert.equal(count, 1, 'nur das erste event kam durch');
});
