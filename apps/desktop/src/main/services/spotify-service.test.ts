import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SpotifyService, pkceChallenge, buildAuthUrl, parseNowPlaying, type SpotifyTokens } from './spotify-service';

test('pkceChallenge = base64url(SHA256(verifier)) — deterministisch', () => {
  const v = 'test-verifier-123';
  const expected = crypto.createHash('sha256').update(v).digest('base64url');
  assert.equal(pkceChallenge(v), expected);
  assert.ok(!pkceChallenge(v).includes('=')); // base64url, kein Padding
});

test('buildAuthUrl: enthält PKCE-S256 + Scopes + redirect', () => {
  const url = buildAuthUrl('cid', 'http://127.0.0.1:27415/spotify/callback', 'chall', 'st8');
  assert.match(url, /^https:\/\/accounts\.spotify\.com\/authorize\?/);
  assert.match(url, /code_challenge_method=S256/);
  assert.match(url, /code_challenge=chall/);
  assert.match(url, /client_id=cid/);
  assert.match(url, /user-modify-playback-state/);
});

test('parseNowPlaying: mappt Titel/Künstler/Cover/Fortschritt; null ohne item', () => {
  const np = parseNowPlaying({
    is_playing: true, progress_ms: 12000,
    item: { name: 'Song', id: 'abc', duration_ms: 200000, artists: [{ name: 'A' }, { name: 'B' }], album: { name: 'Alb', images: [{ url: 'cover.jpg' }] } },
  });
  assert.deepEqual(np, { isPlaying: true, title: 'Song', artist: 'A, B', album: 'Alb', albumArt: 'cover.jpg', durationMs: 200000, progressMs: 12000, trackId: 'abc' });
  assert.equal(parseNowPlaying({ is_playing: false }), null);
  assert.equal(parseNowPlaying(null), null);
});

function makeService(opts: { tokens?: SpotifyTokens | null; t?: number } = {}) {
  let tokens: SpotifyTokens | null = opts.tokens ?? null;
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const states: Array<unknown> = [];
  let t = opts.t ?? 1_000_000;
  const fetchFn = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
    if (String(url).includes('/api/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'AT', refresh_token: 'RT2', expires_in: 3600 }) };
    }
    if (String(url).includes('/currently-playing')) {
      return { ok: true, status: 200, json: async () => ({ is_playing: true, progress_ms: 5, item: { name: 'X', id: 'i', duration_ms: 10, artists: [{ name: 'Q' }], album: { name: 'al', images: [{ url: 'c' }] } } }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }) as unknown as typeof fetch;
  const svc = new SpotifyService({
    getClientId: () => 'cid',
    getTokens: () => tokens,
    saveTokens: (x) => { tokens = x; },
    redirectUri: () => 'http://127.0.0.1:27415/spotify/callback',
    fetchFn,
    now: () => t,
    onState: (np) => states.push(np),
  });
  return { svc, calls, states, getTokens: () => tokens, setT: (x: number) => { t = x; } };
}

test('completeAuth: Code → Tokens gespeichert (nur mit passendem state)', async () => {
  const { svc, getTokens } = makeService();
  const { url } = svc.beginAuth();
  const state = new URL(url).searchParams.get('state') ?? '';
  assert.equal((await svc.completeAuth('code', 'falsch')).ok, false, 'falscher state → abgelehnt');
  const r = await svc.completeAuth('code', state);
  assert.equal(r.ok, true);
  assert.equal(getTokens()?.refreshToken, 'RT2');
  assert.ok(svc.isConnected());
});

test('accessToken: abgelaufenes Token wird per Refresh erneuert', async () => {
  const { svc, calls } = makeService({ tokens: { accessToken: 'OLD', refreshToken: 'RT', expiresAt: 0 } });
  const np = await svc.getNowPlaying(); // löst Refresh aus, dann currently-playing
  assert.ok(calls.some((c) => c.url.includes('/api/token') && c.body?.includes('grant_type=refresh_token')));
  assert.equal(np?.title, 'X');
});

test('Steuerung: play/pause/next/previous treffen die richtigen Endpunkte', async () => {
  const { svc, calls } = makeService({ tokens: { accessToken: 'AT', refreshToken: 'RT', expiresAt: 9_999_999_999 } });
  await svc.play(); await svc.pause(); await svc.next(); await svc.previous();
  assert.ok(calls.some((c) => c.url.endsWith('/me/player/play') && c.method === 'PUT'));
  assert.ok(calls.some((c) => c.url.endsWith('/me/player/pause') && c.method === 'PUT'));
  assert.ok(calls.some((c) => c.url.endsWith('/me/player/next') && c.method === 'POST'));
  assert.ok(calls.some((c) => c.url.endsWith('/me/player/previous') && c.method === 'POST'));
});

test('pollOnce: meldet Now-Playing per onState (nur wenn verbunden)', async () => {
  const off = makeService(); // keine Tokens → nicht verbunden
  await off.svc.pollOnce();
  assert.equal(off.states.length, 0, 'ohne Verbindung kein onState');

  const on = makeService({ tokens: { accessToken: 'AT', refreshToken: 'RT', expiresAt: 9_999_999_999 } });
  await on.svc.pollOnce();
  assert.equal(on.states.length, 1, 'verbunden → genau ein onState-Push');
  assert.equal((on.states[0] as { title?: string })?.title, 'X');
});

test('isPolling: false → startPolling true → stopPolling false', () => {
  const { svc } = makeService({ tokens: { accessToken: 'AT', refreshToken: 'RT', expiresAt: 9_999_999_999 } });
  assert.equal(svc.isPolling(), false);
  svc.startPolling();
  assert.equal(svc.isPolling(), true);
  svc.stopPolling();
  assert.equal(svc.isPolling(), false);
});
