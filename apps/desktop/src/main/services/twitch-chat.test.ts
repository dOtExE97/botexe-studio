import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchChat, TWITCH_CHAT_URL, TWITCH_CHAT_ABSTAND_MS, TWITCH_CHAT_SCHLANGE_MAX } from './twitch-chat';
import { TwitchReloginNoetig, TWITCH_SCOPES, type TwitchTokens } from './twitch-auth';

class FakeUhr {
  jetzt = 1_000_000;
  private naechste = 1;
  readonly timer = new Map<number, { fn: () => void; at: number }>();
  setTimeout = (fn: () => void, ms: number): number => { const id = this.naechste++; this.timer.set(id, { fn, at: this.jetzt + ms }); return id; };
  clearTimeout = (h: unknown): void => { this.timer.delete(h as number); };
  vor(ms: number): void {
    const ziel = this.jetzt + ms;
    for (;;) {
      let f: [number, { fn: () => void; at: number }] | undefined;
      for (const e of this.timer) if (e[1].at <= ziel && (!f || e[1].at < f[1].at)) f = e;
      if (!f) break;
      this.timer.delete(f[0]);
      this.jetzt = f[1].at;
      f[1].fn();
    }
    this.jetzt = ziel;
  }
}

async function warte(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

const TOKENS: TwitchTokens = { accessToken: 'tok-1', refreshToken: 'r', expiresAt: 9e15, scopes: [...TWITCH_SCOPES], userId: '1337', login: 'kanal' };

function ok(id = 'mid-1'): Response {
  return new Response(JSON.stringify({ data: [{ message_id: id, is_sent: true, drop_reason: null }] }), { status: 200 });
}

function aufbau(opts: {
  antwort?: (n: number, body: Record<string, unknown>, auth: string) => Response;
  tokens?: (o?: { abgelehntesToken?: string }) => Promise<TwitchTokens>;
} = {}) {
  const uhr = new FakeUhr();
  const posts: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
  const logs: Array<{ stufe: string; text: string }> = [];
  const chat = new TwitchChat({
    auth: { getValidToken: async (o?: { abgelehntesToken?: string }) => (opts.tokens ? opts.tokens(o) : TOKENS) },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      posts.push({ url: String(input), init: init ?? {}, body });
      const auth = String((init?.headers as Record<string, string>).Authorization);
      return opts.antwort ? opts.antwort(posts.length, body, auth) : ok(`mid-${posts.length}`);
    }) as typeof fetch,
    now: () => uhr.jetzt,
    getClientId: () => 'abc123',
    log: (stufe, text) => { logs.push({ stufe, text }); },
    setTimeout: uhr.setTimeout,
    clearTimeout: uhr.clearTimeout,
  });
  return { chat, uhr, posts, logs };
}

test('senden: POST /helix/chat/messages, Absender = Kanal (broadcaster_id = sender_id), Header, Belege 8', async () => {
  const a = aufbau();
  assert.equal(a.chat.senden('Komm auf meinen Discord!'), 'eingereiht');
  await warte();
  assert.equal(a.posts.length, 1);
  const p = a.posts[0]!;
  assert.equal(p.url, TWITCH_CHAT_URL);
  assert.equal(p.init.method, 'POST');
  const h = p.init.headers as Record<string, string>;
  assert.equal(h.Authorization, 'Bearer tok-1');
  assert.equal(h['Client-Id'], 'abc123');
  assert.equal(h['Content-Type'], 'application/json');
  assert.deepEqual(p.body, { broadcaster_id: '1337', sender_id: '1337', message: 'Komm auf meinen Discord!' });
  assert.ok(!('for_source_only' in p.body), 'mit User-Token kein for_source_only (Belege 11.3)');
  assert.ok(a.logs.some((l) => l.stufe === 'info' && /gesendet/.test(l.text)));
  assert.ok(!a.logs.some((l) => l.text.includes('tok-1')), 'Token nie im Log');
});

test('Drossel: höchstens eine Nachricht alle 1,5 s, Reihenfolge bleibt', async () => {
  const a = aufbau();
  a.chat.senden('eins');
  a.chat.senden('zwei');
  a.chat.senden('drei');
  await warte();
  assert.equal(a.posts.length, 1);
  a.uhr.vor(TWITCH_CHAT_ABSTAND_MS - 1);
  await warte();
  assert.equal(a.posts.length, 1, 'vor Ablauf der 1,5 s nichts');
  a.uhr.vor(1);
  await warte();
  assert.equal(a.posts.length, 2);
  a.uhr.vor(TWITCH_CHAT_ABSTAND_MS);
  await warte();
  assert.deepEqual(a.posts.map((p) => p.body.message), ['eins', 'zwei', 'drei']);
});

test('Doppelte: gleicher Text in der Schlange oder in den letzten 30 s → verworfen; danach wieder erlaubt', async () => {
  const a = aufbau();
  assert.equal(a.chat.senden('!discord → discord.gg/x'), 'eingereiht');
  assert.equal(a.chat.senden('  !discord   → discord.gg/x '), 'doppelt', 'Leerzeichen zählen nicht');
  await warte();
  a.uhr.vor(5_000);
  assert.equal(a.chat.senden('!discord → discord.gg/x'), 'doppelt', 'gerade erst gesendet');
  a.uhr.vor(30_000);
  assert.equal(a.chat.senden('!discord → discord.gg/x'), 'eingereiht');
  await warte();
  assert.equal(a.posts.length, 2);
  assert.equal(a.chat.senden('   '), 'leer');
});

test('Schlange voll → weitere Nachrichten verworfen (mit Hinweis), nicht endlos gestaut', () => {
  const a = aufbau();
  // Erste geht sofort in den Versand, danach füllt sich die Schlange.
  for (let i = 0; i <= TWITCH_CHAT_SCHLANGE_MAX; i++) assert.equal(a.chat.senden(`n${i}`), 'eingereiht');
  assert.equal(a.chat.senden('zu viel'), 'voll');
  assert.ok(a.logs.some((l) => l.stufe === 'warn' && /verworfen/.test(l.text)));
});

test('Lange Nachricht wird auf 500 Zeichen gekürzt (Belege 8)', async () => {
  const a = aufbau();
  a.chat.senden('x'.repeat(800));
  await warte();
  assert.equal(String(a.posts[0]!.body.message).length, 500);
});

test('Echo: eigene Nachricht über message_id oder (vor der Antwort) über den Text erkannt — genau einmal', async () => {
  const a = aufbau();
  a.chat.senden('!kanone feuert');
  // Echo kommt an, bevor die HTTP-Antwort da ist → Text-Treffer.
  assert.equal(a.chat.istEcho(undefined, '!kanone feuert'), true);
  assert.equal(a.chat.istEcho(undefined, '!kanone feuert'), false, 'Text-Treffer wird verbraucht');
  await warte();
  assert.equal(a.chat.istEcho('mid-1', 'egal'), true, 'message_id aus der Antwort');
  assert.equal(a.chat.istEcho('fremd', 'ganz was anderes'), false);
  a.uhr.vor(20_000);
  a.chat.senden('neu');
  await warte();
  assert.equal(a.chat.istEcho(undefined, '!kanone feuert'), false, 'nach dem Fenster nicht mehr');
});

test('is_sent false → Grund aus drop_reason im Log, kein „gesendet"', async () => {
  const a = aufbau({ antwort: () => new Response(JSON.stringify({ data: [{ message_id: '', is_sent: false,
    drop_reason: { code: 'followers_only_mode', message: 'Followers only' } }] }), { status: 200 }) });
  a.chat.senden('hallo');
  await warte();
  assert.ok(a.logs.some((l) => l.stufe === 'warn' && /followers_only_mode/.test(l.text)));
  assert.ok(!a.logs.some((l) => /„hallo" gesendet/.test(l.text)));
});

test('401 → genau ein erzwungenes Erneuern und eine Wiederholung', async () => {
  const aufrufe: Array<{ abgelehntesToken?: string } | undefined> = [];
  const a = aufbau({
    tokens: async (o) => { aufrufe.push(o); return o?.abgelehntesToken ? { ...TOKENS, accessToken: 'tok-2' } : TOKENS; },
    antwort: (_n, _b, auth) => (auth === 'Bearer tok-1' ? new Response('{}', { status: 401 }) : ok()),
  });
  a.chat.senden('hi');
  await warte();
  assert.equal(a.posts.length, 2);
  assert.deepEqual(aufrufe.filter((o) => o?.abgelehntesToken), [{ abgelehntesToken: 'tok-1' }]);
  assert.ok(a.logs.some((l) => /gesendet/.test(l.text)));
});

test('Ohne user:write:chat (alte Anmeldung) → nichts gesendet, Hinweis „neu verbinden", Schlange geleert', async () => {
  const a = aufbau({ tokens: async () => ({ ...TOKENS, scopes: TOKENS.scopes.filter((s) => s !== 'user:write:chat') }) });
  a.chat.senden('a');
  a.chat.senden('b');
  await warte();
  a.uhr.vor(10_000);
  await warte();
  assert.equal(a.posts.length, 0);
  assert.equal(a.logs.filter((l) => /user:write:chat/.test(l.text)).length, 1, 'ein Hinweis, nicht je Nachricht');
});

test('Nicht angemeldet → ein Hinweis, kein Wurf', async () => {
  const a = aufbau({ tokens: async () => { throw new TwitchReloginNoetig('weg'); } });
  a.chat.senden('a');
  await warte();
  assert.equal(a.posts.length, 0);
  assert.ok(a.logs.some((l) => /nicht \(mehr\) mit Twitch angemeldet/.test(l.text)));
});

test('429 → Nachricht verworfen, Pause bis Ratelimit-Reset', async () => {
  const uhrStart = 1_000_000;
  const a = aufbau({ antwort: (n) => (n === 1
    ? new Response('{}', { status: 429, headers: { 'Ratelimit-Reset': String(Math.ceil((uhrStart + 20_000) / 1000)) } })
    : ok()) });
  a.chat.senden('eins');
  await warte();
  a.chat.senden('zwei');
  a.uhr.vor(5_000);
  await warte();
  assert.equal(a.posts.length, 1, 'während der Pause nichts');
  a.uhr.vor(16_000);
  await warte();
  assert.equal(a.posts.length, 2);
  assert.ok(a.logs.some((l) => /bremst/.test(l.text)));
});

test('stop() leert die Schlange', async () => {
  const a = aufbau();
  a.chat.senden('eins');
  a.chat.senden('zwei');
  await warte();
  a.chat.stop();
  a.uhr.vor(10_000);
  await warte();
  assert.equal(a.posts.length, 1);
});
