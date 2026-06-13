// sport-service.test.ts — Selbst-Drosselung: bei leerem Rate-Limit-Kontingent
// bzw. HTTP 429 macht der Service eine Pause und behält den letzten Stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SportService } from './sport-service';

function makeRes(body: unknown, opts: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = opts.status ?? 200;
  const headers = opts.headers ?? {};
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  } as unknown as Response;
}

test('leeres Minuten-Kontingent → Pause bis Reset, kein weiterer Fetch', async () => {
  let calls = 0;
  let t = 1000;
  const fetchFn = (async () => {
    calls++;
    return makeRes({ matches: [] }, { headers: { 'X-Requests-Available-Minute': '0', 'X-RequestCounter-Reset': '30' } });
  }) as unknown as typeof fetch;
  const svc = new SportService(() => 'key', () => t, fetchFn);

  await svc.getMatches('football-data', '2000'); // 1. Anfrage → Kontingent leer
  assert.equal(calls, 1);
  t += 25_000; // Cache (20s) abgelaufen, aber Backoff (30s) noch aktiv
  await svc.getMatches('football-data', '2000');
  assert.equal(calls, 1, 'während der Pause kein zweiter Fetch');
  t += 10_000; // Backoff vorbei
  await svc.getMatches('football-data', '2000');
  assert.equal(calls, 2, 'nach der Pause wieder abgefragt');
});

test('HTTP 429 → letzter Stand bleibt erhalten', async () => {
  let t = 1000;
  let mode: 'ok' | '429' = 'ok';
  const fetchFn = (async () => {
    if (mode === 'ok') {
      return makeRes({ matches: [{ id: '1', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, status: 'IN_PLAY', score: { fullTime: { home: 1, away: 0 } } }] });
    }
    return makeRes(null, { status: 429, headers: { 'X-RequestCounter-Reset': '60' } });
  }) as unknown as typeof fetch;
  const svc = new SportService(() => 'key', () => t, fetchFn);

  const first = await svc.getMatches('football-data', '2000');
  assert.equal(first.length, 1);
  mode = '429';
  t += 25_000; // Cache abgelaufen → erneuter Versuch → 429
  const second = await svc.getMatches('football-data', '2000');
  assert.deepEqual(second, first, 'bei 429 bleibt der letzte gültige Stand');
});
