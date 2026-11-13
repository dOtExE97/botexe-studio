import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioEvent } from '@botexe/trigger-engine';
import { TwitchAdapter, rateLimitEnde, TWITCH_EVENTSUB_URL, TWITCH_SUBSCRIPTIONS_URL, TWITCH_USERS_URL, TWITCH_FOLLOWERS_URL, FOLLOWER_TAKT_MS, type WebSocketLike, type TwitchStatusInfo, type TwitchLog } from './twitch-adapter';
import { TwitchReloginNoetig, type TwitchTokens } from '../services/twitch-auth';

// ── Fälschungen ─────────────────────────────────────────────────────────────

class FakeSocket implements WebSocketLike {
  private readonly handlers = new Map<string, Array<(...a: unknown[]) => void>>();
  closed = false;
  constructor(readonly url: string) {}
  on(event: string, cb: (...a: never[]) => void): this {
    const l = this.handlers.get(event) ?? [];
    l.push(cb as (...a: unknown[]) => void);
    this.handlers.set(event, l);
    return this;
  }
  close(): void { this.closed = true; }
  emit(event: string, ...args: unknown[]): void { for (const cb of this.handlers.get(event) ?? []) cb(...args); }
  /** Wie `ws`: Nachrichten kommen als Buffer. */
  send(nachricht: unknown): void { this.emit('message', Buffer.from(JSON.stringify(nachricht))); }
  welcome(sessionId: string, keepalive = 10): void {
    this.send({ metadata: { message_id: `w-${sessionId}`, message_type: 'session_welcome' },
      payload: { session: { id: sessionId, status: 'connected', keepalive_timeout_seconds: keepalive, reconnect_url: null } } });
  }
  keepalive(id: string): void { this.send({ metadata: { message_id: id, message_type: 'session_keepalive' }, payload: {} }); }
  notify(id: string, type: string, event: unknown): void {
    this.send({ metadata: { message_id: id, message_type: 'notification', subscription_type: type, subscription_version: '1' },
      payload: { subscription: { id: 's', status: 'enabled', type, version: '1' }, event } });
  }
}

class FakeUhr {
  jetzt = 1_000_000;
  private naechste = 1;
  readonly timer = new Map<number, { fn: () => void; at: number }>();
  setTimeout = (fn: () => void, ms: number): number => { const id = this.naechste++; this.timer.set(id, { fn, at: this.jetzt + ms }); return id; };
  clearTimeout = (h: unknown): void => { this.timer.delete(h as number); };
  /** Zeit vorspulen und fällige Timer der Reihe nach auslösen. */
  vor(ms: number): void {
    const ziel = this.jetzt + ms;
    for (;;) {
      let fruehester: [number, { fn: () => void; at: number }] | undefined;
      for (const e of this.timer) if (e[1].at <= ziel && (!fruehester || e[1].at < fruehester[1].at)) fruehester = e;
      if (!fruehester) break;
      this.timer.delete(fruehester[0]);
      this.jetzt = fruehester[1].at;
      fruehester[1].fn();
    }
    this.jetzt = ziel;
  }
}

const TOKENS: TwitchTokens = { accessToken: 'tok-1', refreshToken: 'r', expiresAt: 9e15, scopes: [], userId: '1337', login: 'kanal' };

async function warte(): Promise<void> {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
}

function antwort(status: number, body: unknown = {}, headers?: Record<string, string>): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, ...(headers ? { headers } : {}) });
}

function wechselAuf(s: FakeSocket, url: string): void {
  s.send({ metadata: { message_id: `r-${url}`, message_type: 'session_reconnect' },
    payload: { session: { id: 'S1', status: 'reconnecting', keepalive_timeout_seconds: null, reconnect_url: url } } });
}

interface Aufbau {
  adapter: TwitchAdapter;
  sockets: FakeSocket[];
  events: StudioEvent[];
  status: TwitchStatusInfo[];
  fetches: Array<{ url: string; init: RequestInit }>;
  tokenAufrufe: Array<{ abgelehntesToken?: string } | undefined>;
  validateAufrufe: () => number;
  einmal: string[];
  uhr: FakeUhr;
}

function aufbau(opts: {
  abo?: (body: { type: string }, auth: string) => number;
  users?: (url: string) => Response | Promise<Response>;
  followers?: (url: string) => Response | Promise<Response>;
  getValidToken?: (o?: { abgelehntesToken?: string }) => Promise<TwitchTokens>;
  validate?: () => Promise<boolean>;
} = {}): Aufbau {
  const uhr = new FakeUhr();
  const sockets: FakeSocket[] = [];
  const events: StudioEvent[] = [];
  const status: TwitchStatusInfo[] = [];
  const fetches: Array<{ url: string; init: RequestInit }> = [];
  const tokenAufrufe: Array<{ abgelehntesToken?: string } | undefined> = [];
  const einmal: string[] = [];
  let validates = 0;
  const still = () => undefined;
  const log: TwitchLog = {
    debug: still, info: still, warn: still, error: still,
    einmal: (k: string) => { einmal.push(k); },
    merkerZuruecksetzen: still,
  };
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    fetches.push({ url, init: init ?? {} });
    if (url === TWITCH_SUBSCRIPTIONS_URL) {
      const body = JSON.parse(String(init?.body)) as { type: string };
      const auth = String((init?.headers as Record<string, string>).Authorization);
      return antwort(opts.abo?.(body, auth) ?? 202, { data: [{ id: 'x', status: 'enabled', type: body.type }] });
    }
    if (url.startsWith(TWITCH_USERS_URL)) return opts.users ? opts.users(url) : antwort(200, { data: [] });
    if (url.startsWith(TWITCH_FOLLOWERS_URL) && opts.followers) return opts.followers(url);
    return antwort(404);
  }) as typeof fetch;
  const adapter = new TwitchAdapter({
    auth: {
      getValidToken: async (o?: { abgelehntesToken?: string }) => {
        tokenAufrufe.push(o);
        return opts.getValidToken ? opts.getValidToken(o) : TOKENS;
      },
      validate: async () => { validates++; return opts.validate ? opts.validate() : true; },
    },
    bus: { publish: (e) => { events.push(e); } },
    fetch: fakeFetch,
    openSocket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    getClientId: () => 'abc123',
    now: () => uhr.jetzt,
    log,
    onStatus: (i) => { status.push(i); },
    setTimeout: uhr.setTimeout,
    clearTimeout: uhr.clearTimeout,
  });
  return { adapter, sockets, events, status, fetches, tokenAufrufe, validateAufrufe: () => validates, einmal, uhr };
}

const aboPosts = (a: Aufbau) => a.fetches.filter((f) => f.url === TWITCH_SUBSCRIPTIONS_URL);

async function verbunden(a: Aufbau, sessionId = 'S1'): Promise<FakeSocket> {
  await a.adapter.start();
  const s = a.sockets.at(-1)!;
  s.emit('open');
  s.welcome(sessionId);
  await warte();
  return s;
}

const FOLLOW = { user_id: '42', user_login: 'fan', user_name: 'Fan', broadcaster_user_id: '1337' };

// ── Tests ───────────────────────────────────────────────────────────────────

test('Start: validiert, öffnet die EventSub-Adresse; Welcome → genau 10 Abo-POSTs mit session_id', async () => {
  const a = aufbau();
  await verbunden(a);
  assert.equal(a.validateAufrufe(), 1);
  assert.equal(a.sockets.length, 1);
  assert.equal(a.sockets[0]!.url, TWITCH_EVENTSUB_URL);
  const posts = aboPosts(a);
  assert.equal(posts.length, 10);
  const bodies = posts.map((p) => JSON.parse(String(p.init.body)) as { type: string; version: string; condition: Record<string, string>; transport: Record<string, string> });
  for (const p of posts) {
    const h = p.init.headers as Record<string, string>;
    assert.equal(p.init.method, 'POST');
    assert.equal(h.Authorization, 'Bearer tok-1');
    assert.equal(h['Client-Id'], 'abc123');
    assert.equal(h['Content-Type'], 'application/json');
  }
  for (const b of bodies) assert.deepEqual(b.transport, { method: 'websocket', session_id: 'S1' });
  const nachTyp = Object.fromEntries(bodies.map((b) => [b.type, b]));
  assert.deepEqual(nachTyp['channel.follow'], { type: 'channel.follow', version: '2',
    condition: { broadcaster_user_id: '1337', moderator_user_id: '1337' }, transport: { method: 'websocket', session_id: 'S1' } });
  assert.deepEqual(nachTyp['channel.chat.message']?.condition, { broadcaster_user_id: '1337', user_id: '1337' });
  assert.deepEqual(nachTyp['channel.raid']?.condition, { to_broadcaster_user_id: '1337' });
  for (const t of ['channel.subscribe', 'channel.subscription.message', 'channel.subscription.gift', 'channel.cheer', 'stream.online', 'stream.offline', 'channel.channel_points_custom_reward_redemption.add']) {
    assert.deepEqual(nachTyp[t]?.condition, { broadcaster_user_id: '1337' }, t);
    assert.equal(nachTyp[t]?.version, '1', t);
  }
  const letzter = a.adapter.getStatus();
  assert.equal(letzter.status, 'verbunden');
  assert.equal(letzter.login, 'kanal');
  a.adapter.stop();
});

test('Notification → bus.publish mit plattform twitch; doppelte message_id nur einmal', async () => {
  const a = aufbau();
  const s = await verbunden(a);
  s.notify('m1', 'channel.follow', FOLLOW);
  s.notify('m1', 'channel.follow', FOLLOW);
  s.notify('m2', 'channel.follow', FOLLOW);
  assert.equal(a.events.length, 2);
  assert.equal(a.events[0]!.type, 'follow');
  assert.equal(a.events[0]!.plattform, 'twitch');
  assert.equal(a.events[0]!.user?.id, 'twitch:42');
  a.adapter.stop();
});

test('Kaputte Nachrichten werfen nicht', async () => {
  const a = aufbau();
  const s = await verbunden(a);
  assert.doesNotThrow(() => s.emit('message', Buffer.from('kein json')));
  assert.doesNotThrow(() => s.emit('message', Buffer.from('null')));
  assert.doesNotThrow(() => s.send({ metadata: { message_type: 'notification' } }));
  assert.doesNotThrow(() => s.send({ metadata: { message_id: 'z', message_type: 'notification', subscription_type: 'channel.chat.message' }, payload: { event: null } }));
  a.adapter.stop();
});

test('Keepalive-Ausfall → alte Leitung zu, neue Verbindung, Abos neu angelegt', async () => {
  const a = aufbau();
  const s1 = await verbunden(a);
  // Keepalive hält die Leitung am Leben …
  a.uhr.vor(12_000);
  s1.keepalive('k1');
  a.uhr.vor(12_000);
  assert.equal(s1.closed, false);
  assert.equal(a.sockets.length, 1);
  // … Stille über Frist (10 s) + Puffer → tot.
  a.uhr.vor(3_500); // 15,5 s seit dem letzten Keepalive
  assert.equal(s1.closed, true);
  assert.equal(a.adapter.getStatus().status, 'getrennt');
  a.uhr.vor(1_000); // erste Pause
  await warte();
  assert.equal(a.sockets.length, 2);
  assert.equal(a.sockets[1]!.url, TWITCH_EVENTSUB_URL);
  a.sockets[1]!.welcome('S2');
  await warte();
  assert.equal(aboPosts(a).length, 20);
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  a.adapter.stop();
});

test('session_reconnect → neue Leitung an reconnect_url, alte erst nach Welcome zu, keine neuen Abos, keine Doppelten', async () => {
  const a = aufbau();
  const s1 = await verbunden(a);
  const url = 'wss://eventsub.wss.twitch.tv?neu=1';
  s1.send({ metadata: { message_id: 'r1', message_type: 'session_reconnect' },
    payload: { session: { id: 'S1', status: 'reconnecting', keepalive_timeout_seconds: null, reconnect_url: url } } });
  assert.equal(a.sockets.length, 2);
  const s2 = a.sockets[1]!;
  assert.equal(s2.url, url);
  assert.equal(s1.closed, false);
  // Die alte liefert bis zum Welcome der neuen weiter.
  s1.notify('m1', 'channel.follow', FOLLOW);
  assert.equal(a.events.length, 1);
  // Lange genug für den Keepalive-Wächter der alten — darf nicht zuschlagen.
  a.uhr.vor(20_000);
  assert.equal(a.sockets.length, 2);
  assert.equal(a.adapter.getStatus().status, 'verbunden', 'Wächter der alten Leitung ruht während des Wechsels');
  s2.welcome('S2');
  await warte();
  assert.equal(s1.closed, true);
  assert.equal(aboPosts(a).length, 10, 'keine neuen Abos');
  // Dieselbe Nachricht über die neue Leitung → verworfen.
  s2.notify('m1', 'channel.follow', FOLLOW);
  s2.notify('m2', 'channel.follow', FOLLOW);
  assert.equal(a.events.length, 2);
  // Ein später Close der alten löst nichts aus.
  s1.emit('close', 4004);
  a.uhr.vor(5_000);
  assert.equal(a.sockets.length, 2);
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  a.adapter.stop();
});

test('session_reconnect: neue meldet sich nicht → frisch verbinden mit neuen Abos', async () => {
  const a = aufbau();
  const s1 = await verbunden(a);
  s1.send({ metadata: { message_id: 'r1', message_type: 'session_reconnect' },
    payload: { session: { id: 'S1', status: 'reconnecting', reconnect_url: 'wss://x.example/ws' } } });
  a.uhr.vor(30_000);
  assert.equal(s1.closed, true);
  assert.equal(a.sockets[1]!.closed, true);
  a.uhr.vor(1_000);
  await warte();
  assert.equal(a.sockets.length, 3);
  assert.equal(a.sockets[2]!.url, TWITCH_EVENTSUB_URL);
  a.adapter.stop();
});

test('401 beim Abo → Token genau einmal erneuern, mit neuem Token wiederholen', async () => {
  const a = aufbau({
    abo: (_b, auth) => (auth === 'Bearer tok-1' ? 401 : 202),
    getValidToken: async (o) => (o?.abgelehntesToken ? { ...TOKENS, accessToken: 'tok-2' } : TOKENS),
  });
  await verbunden(a);
  const erneuert = a.tokenAufrufe.filter((o) => o?.abgelehntesToken);
  assert.equal(erneuert.length, 1);
  assert.equal(erneuert[0]!.abgelehntesToken, 'tok-1');
  assert.equal(aboPosts(a).length, 20);
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  a.adapter.stop();
});

test('TwitchReloginNoetig beim Erneuern → Status neu-anmelden, keine Wiederverbindungs-Schleife', async () => {
  const a = aufbau({
    abo: () => 401,
    getValidToken: async (o) => { if (o?.abgelehntesToken) throw new TwitchReloginNoetig(); return TOKENS; },
  });
  const s = await verbunden(a);
  assert.equal(a.adapter.getStatus().status, 'neu-anmelden');
  assert.equal(s.closed, true);
  a.uhr.vor(10 * 60_000);
  await warte();
  assert.equal(a.sockets.length, 1);
  assert.equal(a.uhr.timer.size, 0);
});

test('Anmeldung beim Start tot → neu-anmelden, keine Leitung; start() danach geht wieder', async () => {
  let tot = true;
  const a = aufbau({ validate: async () => { if (tot) throw new TwitchReloginNoetig(); return true; } });
  await a.adapter.start();
  assert.equal(a.adapter.getStatus().status, 'neu-anmelden');
  assert.equal(a.sockets.length, 0);
  tot = false;
  await a.adapter.start();
  assert.equal(a.sockets.length, 1);
  a.adapter.stop();
});

test('validate() false (keine Tokens) beim Start oder stündlich → neu-anmelden, keine Schleife', async () => {
  const a = aufbau({ validate: async () => false });
  await a.adapter.start();
  assert.equal(a.adapter.getStatus().status, 'neu-anmelden');
  assert.equal(a.sockets.length, 0);
  let ok = true;
  const b = aufbau({ validate: async () => ok });
  const s = await verbunden(b);
  ok = false;
  b.uhr.vor(60 * 60_000); await warte();
  assert.equal(b.adapter.getStatus().status, 'neu-anmelden');
  assert.equal(s.closed, true);
  assert.equal(b.uhr.timer.size, 0);
});

test('403 für eine Art → die anderen laufen, einmal geloggt', async () => {
  const a = aufbau({ abo: (b) => (b.type === 'channel.subscribe' ? 403 : 202) });
  await verbunden(a);
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  assert.deepEqual(a.einmal.filter((k) => k.startsWith('twitch:abo-403')), ['twitch:abo-403:channel.subscribe']);
  a.adapter.stop();
});

test('Kein einziges Abo angenommen → Status fehler; Close 4003 → Wiederverbinden mit wachsender Pause', async () => {
  const a = aufbau({ abo: () => 500 });
  const s1 = await verbunden(a);
  assert.equal(a.adapter.getStatus().status, 'fehler');
  s1.emit('close', 4003);
  assert.equal(a.adapter.getStatus().status, 'getrennt');
  a.uhr.vor(1_000); await warte();
  assert.equal(a.sockets.length, 2);
  a.sockets[1]!.emit('close', 4006);
  a.uhr.vor(1_000); await warte();
  assert.equal(a.sockets.length, 2, 'zweite Pause ist länger');
  a.uhr.vor(1_000); await warte();
  assert.equal(a.sockets.length, 3);
  a.adapter.stop();
});

test('Pause wächst höchstens bis 60 s', async () => {
  const a = aufbau();
  await a.adapter.start();
  for (let i = 0; i < 10; i++) {
    a.sockets.at(-1)!.emit('close', 4000);
    a.uhr.vor(60_000); await warte();
  }
  assert.equal(a.sockets.length, 11);
  a.adapter.stop();
});

test('Gift-Abo und stream.online: kein Bus-Ereignis; online setzt live', async () => {
  const a = aufbau();
  const s = await verbunden(a);
  s.notify('g1', 'channel.subscribe', { user_id: '5', user_login: 'b', user_name: 'B', tier: '1000', is_gift: true });
  s.notify('o1', 'stream.online', { id: '9001', broadcaster_user_id: '1337', type: 'live', started_at: 'x' });
  assert.equal(a.events.length, 0);
  assert.equal(a.adapter.getStatus().live, true);
  s.notify('o2', 'stream.offline', { id: '9001', broadcaster_user_id: '1337' });
  assert.equal(a.adapter.getStatus().live, false);
  a.adapter.stop();
});

test('revocation authorization_revoked → neu-anmelden', async () => {
  const a = aufbau();
  const s = await verbunden(a);
  s.send({ metadata: { message_id: 'v1', message_type: 'revocation', subscription_type: 'channel.follow', subscription_version: '2' },
    payload: { subscription: { id: 's', status: 'authorization_revoked', type: 'channel.follow', version: '2' } } });
  assert.equal(a.adapter.getStatus().status, 'neu-anmelden');
  assert.equal(s.closed, true);
});

test('Profilbilder: gebündelt nachgeladen, Chat wartet nicht, spätere Ereignisse tragen das Bild', async () => {
  const a = aufbau({
    users: (url) => {
      const ids = new URL(url).searchParams.getAll('id');
      return antwort(200, { data: ids.filter((id) => id !== '3').map((id) => ({ id, login: `u${id}`, profile_image_url: `https://bild/${id}.png` })) });
    },
  });
  const s = await verbunden(a);
  const chat = (mid: string, uid: string) => s.notify(mid, 'channel.chat.message', {
    broadcaster_user_id: '1337', chatter_user_id: uid, chatter_user_login: `u${uid}`, chatter_user_name: `U${uid}`,
    message: { text: 'hi', fragments: [{ type: 'text', text: 'hi' }] }, badges: [],
  });
  chat('c1', '1');
  chat('c2', '2');
  chat('c3', '3');
  assert.equal(a.events.length, 3, 'sofort veröffentlicht');
  assert.equal(a.events[0]!.user?.profilePic, undefined);
  a.uhr.vor(300);
  await warte();
  const gets = a.fetches.filter((f) => f.url.startsWith(TWITCH_USERS_URL));
  assert.equal(gets.length, 1);
  assert.deepEqual(new URL(gets[0]!.url).searchParams.getAll('id'), ['1', '2', '3']);
  assert.equal((gets[0]!.init.headers as Record<string, string>)['Client-Id'], 'abc123');
  chat('c4', '1');
  chat('c5', '3');
  assert.equal(a.events[3]!.user?.profilePic, 'https://bild/1.png');
  assert.equal(a.events[4]!.user?.profilePic, undefined, 'gelöschtes Konto: kein Bild');
  a.uhr.vor(300);
  await warte();
  assert.equal(a.fetches.filter((f) => f.url.startsWith(TWITCH_USERS_URL)).length, 1, 'bekannte IDs werden nicht erneut gefragt');
  a.adapter.stop();
});

test('Profilbilder: mehr als 100 IDs → mehrere Anfragen à höchstens 100', async () => {
  const a = aufbau({ users: () => antwort(200, { data: [] }) });
  const s = await verbunden(a);
  for (let i = 0; i < 150; i++) s.notify(`f${i}`, 'channel.follow', { user_id: String(1000 + i), user_login: 'x', user_name: 'X' });
  a.uhr.vor(300); await warte();
  a.uhr.vor(300); await warte();
  const gets = a.fetches.filter((f) => f.url.startsWith(TWITCH_USERS_URL));
  assert.equal(gets.length, 2);
  assert.equal(new URL(gets[0]!.url).searchParams.getAll('id').length, 100);
  assert.equal(new URL(gets[1]!.url).searchParams.getAll('id').length, 50);
  a.adapter.stop();
});

test('Profilbilder: Fehlschlag → kein Wurf, einmal geloggt, Pause statt Dauerfeuer', async () => {
  const a = aufbau({ users: () => antwort(429) });
  const s = await verbunden(a);
  s.notify('f1', 'channel.follow', { user_id: '1', user_login: 'a', user_name: 'A' });
  a.uhr.vor(300); await warte();
  s.notify('f2', 'channel.follow', { user_id: '2', user_login: 'b', user_name: 'B' });
  a.uhr.vor(300); await warte();
  assert.equal(a.fetches.filter((f) => f.url.startsWith(TWITCH_USERS_URL)).length, 1);
  assert.ok(a.einmal.includes('twitch:profilbild'));
  assert.equal(a.events.length, 2);
  a.adapter.stop();
});

test('Stündlich validieren; Anmeldung tot → neu-anmelden', async () => {
  let tot = false;
  const a = aufbau({ validate: async () => { if (tot) throw new TwitchReloginNoetig(); return true; } });
  await verbunden(a);
  assert.equal(a.validateAufrufe(), 1);
  a.uhr.vor(60 * 60_000); await warte();
  assert.equal(a.validateAufrufe(), 2);
  tot = true;
  a.uhr.vor(60 * 60_000); await warte();
  assert.equal(a.validateAufrufe(), 3);
  assert.equal(a.adapter.getStatus().status, 'neu-anmelden');
});

test('stop() räumt alle Timer und Leitungen ab, Status aus', async () => {
  const a = aufbau();
  const s = await verbunden(a);
  s.notify('f1', 'channel.follow', FOLLOW); // plant Profilbild-Abruf
  assert.ok(a.uhr.timer.size > 0);
  a.adapter.stop();
  assert.equal(a.uhr.timer.size, 0);
  assert.equal(s.closed, true);
  assert.equal(a.adapter.getStatus().status, 'aus');
  // Späte Nachrichten der alten Leitung werden ignoriert.
  s.notify('f2', 'channel.follow', FOLLOW);
  assert.equal(a.events.length, 1);
});

test('Notification setzt den Keepalive-Wächter zurück (Twitch schickt bei laufendem Chat keine Keepalives)', async () => {
  const a = aufbau();
  const s = await verbunden(a); // Frist 10 s + 5 s Puffer
  for (let i = 0; i < 5; i++) {
    a.uhr.vor(12_000);
    s.notify(`n${i}`, 'channel.follow', FOLLOW);
  }
  a.uhr.vor(12_000);
  assert.equal(s.closed, false);
  assert.equal(a.sockets.length, 1);
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  a.adapter.stop();
});

test('Nach dem Leitungswechsel bewacht der Wächter die NEUE Leitung', async () => {
  const a = aufbau();
  const s1 = await verbunden(a);
  wechselAuf(s1, 'wss://eventsub.wss.twitch.tv?neu=1');
  const s2 = a.sockets[1]!;
  s2.welcome('S2', 10);
  await warte();
  assert.equal(s1.closed, true);
  a.uhr.vor(14_000);
  assert.equal(s2.closed, false);
  a.uhr.vor(1_500); // 15,5 s Stille auf der neuen
  assert.equal(s2.closed, true);
  assert.equal(a.adapter.getStatus().status, 'getrennt');
  a.uhr.vor(1_000); await warte();
  assert.equal(a.sockets.length, 3);
  assert.equal(a.sockets[2]!.url, TWITCH_EVENTSUB_URL);
  a.adapter.stop();
});

test('Nachzügler der alten Leitung nach dem Welcome der neuen werden angenommen, Doppelte verworfen', async () => {
  const a = aufbau();
  const s1 = await verbunden(a);
  wechselAuf(s1, 'wss://eventsub.wss.twitch.tv?neu=1');
  const s2 = a.sockets[1]!;
  s2.welcome('S2');
  await warte();
  assert.equal(s1.closed, true);
  s1.notify('nur-alt', 'channel.follow', FOLLOW); // kurz vor dem Umschalten abgeschickt
  assert.equal(a.events.length, 1, 'Nachzügler der alten geht nicht verloren');
  s1.notify('beide', 'channel.follow', FOLLOW);
  s2.notify('beide', 'channel.follow', FOLLOW); // dieselbe über die neue
  assert.equal(a.events.length, 2);
  // Steuer-Nachrichten der alten zählen nicht mehr.
  wechselAuf(s1, 'wss://eventsub.wss.twitch.tv?nochmal=1');
  assert.equal(a.sockets.length, 2);
  s1.emit('close', 1000);
  s1.notify('noch-spaeter', 'channel.follow', FOLLOW);
  assert.equal(a.events.length, 2, 'nach dem Close der alten ist Schluss');
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  a.adapter.stop();
});

test('Stündliche Prüfung läuft auch, wenn der erste Token-Abruf beim Start vorübergehend scheitert', async () => {
  let n = 0;
  const a = aufbau({ getValidToken: async () => { n++; if (n === 1) throw new Error('Netz weg'); return TOKENS; } });
  await a.adapter.start();
  assert.equal(a.sockets.length, 0);
  a.uhr.vor(1_000); await warte(); // Wiederholung klappt
  assert.equal(a.sockets.length, 1);
  a.sockets[0]!.welcome('S1'); await warte();
  assert.equal(a.validateAufrufe(), 1);
  a.uhr.vor(60 * 60_000); await warte();
  assert.equal(a.validateAufrufe(), 2);
  a.adapter.stop();
});

test('rateLimitEnde: Ratelimit-Reset (Unix-Sekunden) nur, wenn plausibel', () => {
  assert.equal(rateLimitEnde('1120', 1_000_000), 1_120_000);
  assert.equal(rateLimitEnde(null, 1_000_000), undefined);
  assert.equal(rateLimitEnde('quatsch', 1_000_000), undefined);
  assert.equal(rateLimitEnde('999', 1_000_000), undefined, 'Vergangenheit');
  assert.equal(rateLimitEnde('99999999', 1_000_000), undefined, 'zu weit weg');
});

test('Profilbilder: 429 wartet bis Ratelimit-Reset statt pauschal 60 s', async () => {
  let gesperrt = true;
  const a = aufbau({
    users: () => (gesperrt ? antwort(429, {}, { 'Ratelimit-Reset': '1120' }) : antwort(200, { data: [] })), // jetzt = 1 000 s
  });
  const s = await verbunden(a);
  assert.equal(a.uhr.jetzt, 1_000_000);
  // Uhr vorspulen, Leitung dabei mit Keepalives am Leben halten.
  const spule = (ms: number) => { for (let t = 0; t < ms; t += 10_000) { a.uhr.vor(Math.min(10_000, ms - t)); s.keepalive(`k${a.uhr.jetzt}`); } };
  s.notify('f1', 'channel.follow', { user_id: '1', user_login: 'a', user_name: 'A' });
  a.uhr.vor(300); await warte();
  gesperrt = false;
  const gets = () => a.fetches.filter((f) => f.url.startsWith(TWITCH_USERS_URL)).length;
  assert.equal(gets(), 1);
  // Nach 61 s wäre die pauschale Pause vorbei — der Reset-Zeitpunkt (120 s) aber nicht.
  spule(61_000);
  s.notify('f2', 'channel.follow', { user_id: '2', user_login: 'b', user_name: 'B' });
  a.uhr.vor(300); await warte();
  assert.equal(gets(), 1);
  spule(60_000); // jetzt > 1 120 s
  s.notify('f3', 'channel.follow', { user_id: '3', user_login: 'c', user_name: 'C' });
  a.uhr.vor(300); await warte();
  assert.equal(gets(), 2);
  assert.equal(a.events.length, 3, 'Leitung lebte die ganze Zeit');
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  a.adapter.stop();
});


// ── Follower-Zahl (Belege 11.1) ─────────────────────────────────────────────

const stand = (a: Aufbau) => a.events.filter((e) => e.type === 'follower_stand').map((e) => e.followerStand?.anzahl);

test('Follower-Zahl: nach dem Verbinden GET followers (first=1) → follower_stand mit total, Plattform twitch', async () => {
  const a = aufbau({ followers: () => antwort(200, { data: [{ user_id: '9' }], total: 1234, pagination: {} }) });
  await verbunden(a);
  const abfragen = a.fetches.filter((f) => f.url.startsWith(TWITCH_FOLLOWERS_URL));
  assert.equal(abfragen.length, 1);
  assert.equal(abfragen[0]!.url, `${TWITCH_FOLLOWERS_URL}?broadcaster_id=1337&first=1`);
  assert.equal(abfragen[0]!.init.method, 'GET');
  assert.equal((abfragen[0]!.init.headers as Record<string, string>).Authorization, 'Bearer tok-1');
  assert.equal((abfragen[0]!.init.headers as Record<string, string>)['Client-Id'], 'abc123');
  const e = a.events.find((x) => x.type === 'follower_stand');
  assert.deepEqual(e, { type: 'follower_stand', ts: a.uhr.jetzt, plattform: 'twitch', followerStand: { anzahl: 1234 } });
  a.adapter.stop();
});

test('Follower-Zahl: jeder echte Follow +1, doppelte message_id nicht; ohne bekannten Stand kein Hochzählen', async () => {
  const a = aufbau({ followers: () => antwort(200, { data: [], total: 10 }) });
  const s = await verbunden(a);
  s.notify('f1', 'channel.follow', FOLLOW);
  s.notify('f1', 'channel.follow', FOLLOW);
  s.notify('f2', 'channel.follow', FOLLOW);
  assert.deepEqual(stand(a), [10, 11, 12]);
  a.adapter.stop();

  const b = aufbau({ followers: () => antwort(500) });
  const t = await verbunden(b);
  t.notify('f1', 'channel.follow', FOLLOW);
  assert.deepEqual(stand(b), [], 'kein Stand → nichts erfunden');
  assert.ok(b.einmal.includes('twitch:follower-stand'), 'Fehlschlag steht einmal im Log');
  assert.equal(b.events.filter((e) => e.type === 'follow').length, 1, 'der Follow selbst kommt trotzdem an');
  b.adapter.stop();
});

test('Follower-Zahl: Abgleich alle 10 Minuten; nach stop() keine Abfrage mehr', async () => {
  let total = 50;
  const a = aufbau({ followers: () => antwort(200, { data: [], total }) });
  await verbunden(a);
  const zahl = () => a.fetches.filter((f) => f.url.startsWith(TWITCH_FOLLOWERS_URL)).length;
  assert.equal(zahl(), 1);
  total = 48; // Unfollows — der Abgleich korrigiert
  a.uhr.vor(FOLLOWER_TAKT_MS);
  await warte();
  assert.equal(zahl(), 2);
  assert.deepEqual(stand(a), [50, 48]);
  a.adapter.stop();
  a.uhr.vor(FOLLOWER_TAKT_MS * 3);
  await warte();
  assert.equal(zahl(), 2, 'gestoppt → kein Takt mehr');
});

test('Follower-Zahl: Antwort ohne total wird nicht als 0 gemeldet', async () => {
  const a = aufbau({ followers: () => antwort(200, { data: [] }) });
  await verbunden(a);
  assert.deepEqual(stand(a), []);
  a.adapter.stop();
});

test('followerStandErneutMelden: meldet den bekannten Stand nach einem Session-Reset noch einmal', async () => {
  const a = aufbau({ followers: () => antwort(200, { data: [], total: 7 }) });
  await verbunden(a);
  a.adapter.followerStandErneutMelden();
  assert.deepEqual(stand(a), [7, 7]);
  a.adapter.stop();
  a.adapter.followerStandErneutMelden();
  assert.deepEqual(stand(a), [7, 7], 'gestoppt → nichts');
});


// ── Kanalpunkte (Belege 5.9 / 11.2) ─────────────────────────────────────────

test('Kanalpunkte: 403 beim Abo → genau eine freundliche Zeile, die anderen Abos laufen, Status verbunden', async () => {
  const a = aufbau({ abo: (b) => (b.type === 'channel.channel_points_custom_reward_redemption.add' ? 403 : 202) });
  const s = await verbunden(a);
  assert.ok(a.einmal.includes('twitch:abo-403:kanalpunkte'));
  assert.equal(a.einmal.filter((k) => k.startsWith('twitch:abo-403:')).length, 1, 'nur die Kanalpunkte-Zeile');
  assert.equal(a.adapter.getStatus().status, 'verbunden');
  s.notify('f1', 'channel.follow', FOLLOW);
  assert.equal(a.events.filter((e) => e.type === 'follow').length, 1);
  a.adapter.stop();
});

test('Kanalpunkte: Einlösung kommt als kanalpunkte-Ereignis auf den Bus', async () => {
  const a = aufbau();
  const s = await verbunden(a);
  s.notify('k1', 'channel.channel_points_custom_reward_redemption.add', {
    id: 'r1', broadcaster_user_id: '1337', user_id: '9001', user_login: 'cooler_user', user_name: 'Cooler_User',
    user_input: '', status: 'unfulfilled', reward: { id: 'w', title: 'Kanone', cost: 500, prompt: '' },
    redeemed_at: '2020-07-15T17:16:03.17106713Z',
  });
  const e = a.events.find((x) => x.type === 'kanalpunkte');
  assert.equal(e?.plattform, 'twitch');
  assert.deepEqual(e?.kanalpunkte, { titel: 'Kanone', kosten: 500 });
  assert.equal(e?.user?.id, 'twitch:9001');
  a.adapter.stop();
});
