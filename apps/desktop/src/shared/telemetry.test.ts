import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubEvent } from './telemetry';

test('scrubEvent: entfernt Nutzer-Identität und Request-Daten', () => {
  const out = scrubEvent({
    user: { id: 'u1', ip_address: '1.2.3.4' },
    server_name: 'Alex-PC',
    request: { cookies: { a: 1 }, headers: { Authorization: 'Bearer x' }, data: { pw: 'geheim' } },
  }) as Record<string, unknown>;
  assert.equal(out.user, undefined);
  assert.equal(out.server_name, undefined);
  const req = out.request as Record<string, unknown>;
  assert.equal(req.cookies, undefined);
  assert.equal(req.headers, undefined);
  assert.equal(req.data, undefined);
});

test('scrubEvent: maskiert alle Anbieter-Key-Formate in freiem Text', () => {
  const keys = {
    gemini: 'AIzaSyD-1234567890abcdefghijklmnop_XYZ',
    openai: 'sk-proj-abcdefghij1234567890ABCDEFGHIJ',
    euler: 'euler_abc123DEF456',
    sentryHex: '179d04d510025e330092ff0496d9ee10',
    jwt: 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4',
  };
  for (const [name, k] of Object.entries(keys)) {
    const out = scrubEvent({ message: `Fehler mit ${k} hier` }) as { message: string };
    assert.ok(!out.message.includes(k.slice(0, 12)), `${name}-Key blieb im Text: ${out.message}`);
  }
});

test('scrubEvent: Werte unter geheim-klingenden Feldern werden entfernt', () => {
  const out = scrubEvent({
    extra: { apiKey: 'irgendwas', harmlos: 'hallo welt' },
    tags: { sessionId: 'sess_abc', version: '0.34.0' },
    contexts: { auth: { token: 'x' } },
  });
  const extra = out.extra as Record<string, unknown>;
  const tags = out.tags as Record<string, unknown>;
  const auth = (out.contexts as Record<string, unknown>).auth as Record<string, unknown>;
  assert.equal(extra.apiKey, '[entfernt]');
  assert.equal(extra.harmlos, 'hallo welt'); // harmlos bleibt
  assert.equal(tags.sessionId, '[entfernt]');
  assert.equal(tags.version, '0.34.0'); // Version bleibt (wichtig fürs Dashboard)
  assert.equal(auth.token, '[entfernt]');
});

test('scrubEvent: harmloser Text bleibt unverändert', () => {
  const out = scrubEvent({ message: 'Overlay Rose Konfetti 8.4K Coins v0.34.0' }) as { message: string };
  assert.equal(out.message, 'Overlay Rose Konfetti 8.4K Coins v0.34.0');
});
