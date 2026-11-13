// Tests für die Streamer-Aktionen (Clip, Marker, Werbung, Shoutout, Chat-Modi).
// Kein Netz: fetch und Uhr sind gefälscht. Statuscodes/Felder aus
// docs/twitch-api-belege.md, Abschnitt 10.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioEvent } from '@botexe/trigger-engine';
import { TwitchAktionen, NEU_VERBINDEN } from './twitch-aktionen';
import { TwitchReloginNoetig, TWITCH_SCOPES, type TwitchTokens } from './twitch-auth';

interface Aufruf { url: string; method: string; headers: Record<string, string>; body?: unknown; signal?: AbortSignal | null }
type Antwort = { status: number; body?: unknown };

function antwort(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (body === undefined) throw new SyntaxError('kein Body'); return body; },
  } as unknown as Response;
}

function tokens(extra: Partial<TwitchTokens> = {}): TwitchTokens {
  return {
    accessToken: 'geheim-access-1', refreshToken: 'geheim-refresh-1', expiresAt: 9e15,
    scopes: [...TWITCH_SCOPES], userId: '1000', login: 'alexstreamt', ...extra,
  };
}

function aufbau(opts: {
  antworter: (a: Aufruf, nr: number) => Antwort;
  tokens?: TwitchTokens;
  getValidToken?: (o: { abgelehntesToken?: string }) => Promise<TwitchTokens>;
  clientId?: string;
}) {
  let t = 1_000_000;
  const aufrufe: Aufruf[] = [];
  const tokenAufrufe: Array<{ abgelehntesToken?: string }> = [];
  const logs: Array<{ stufe: string; text: string }> = [];
  let raidCb: ((e: StudioEvent) => void) | null = null;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const a: Aufruf = {
      url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, signal: init?.signal,
    };
    aufrufe.push(a);
    const r = opts.antworter(a, aufrufe.length);
    return antwort(r.status, r.body);
  }) as unknown as typeof fetch;
  const aktionen = new TwitchAktionen({
    auth: {
      getValidToken: async (o = {}) => {
        tokenAufrufe.push(o);
        return opts.getValidToken ? opts.getValidToken(o) : (opts.tokens ?? tokens());
      },
    },
    fetch: fetchFn,
    now: () => t,
    getClientId: () => opts.clientId ?? 'abc123',
    bus: { subscribe: (_type, cb) => { raidCb = cb; return () => { raidCb = null; }; } },
    log: (stufe, text) => { logs.push({ stufe, text }); },
  });
  return {
    aktionen, aufrufe, tokenAufrufe, logs,
    vor: (ms: number) => { t += ms; },
    raid: (e: Partial<StudioEvent> = {}) => raidCb?.({
      type: 'raid', ts: t, plattform: 'twitch', user: { id: 'twitch:777', userId: 'freundin', nickname: 'Freundin' },
      raid: { viewers: 12 }, ...e,
    } as StudioEvent),
    keineGeheimnisse: () => {
      for (const l of logs) assert.ok(!l.text.includes('geheim'), `Log verrät Token: ${l.text}`);
    },
  };
}

// ── Clip ──────────────────────────────────────────────────────────────────

test('clip: 202 → ok mit edit_url, Header Bearer + Client-Id + Zeitlimit, einmal geloggt', async () => {
  const w = aufbau({ antworter: () => ({ status: 202, body: { data: [{ id: 'Clip1', edit_url: 'https://clips.twitch.tv/Clip1/edit' }] } }) });
  const e = await w.aktionen.clip();
  assert.deepEqual(e, { ok: true, info: 'Clip erstellt: https://clips.twitch.tv/Clip1/edit', url: 'https://clips.twitch.tv/Clip1/edit' });
  assert.equal(w.aufrufe.length, 1);
  const a = w.aufrufe[0]!;
  assert.equal(a.method, 'POST');
  assert.equal(a.url, 'https://api.twitch.tv/helix/clips?broadcaster_id=1000');
  assert.equal(a.headers.Authorization, 'Bearer geheim-access-1');
  assert.equal(a.headers['Client-Id'], 'abc123');
  assert.ok(a.signal, 'Zeitlimit-Signal fehlt');
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0]!.text, 'Clip erstellt: https://clips.twitch.tv/Clip1/edit');
  w.keineGeheimnisse();
});

test('clip: 404 → nicht live', async () => {
  const w = aufbau({ antworter: () => ({ status: 404, body: { status: 404, message: 'must be broadcasting live' } }) });
  const e = await w.aktionen.clip();
  assert.equal(e.ok, false);
  assert.match(!e.ok ? e.fehler : '', /nur, während du live bist/);
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0]!.stufe, 'warn');
});

test('clip: fehlender Scope im Token → „neu verbinden", kein Aufruf', async () => {
  const w = aufbau({ tokens: tokens({ scopes: ['user:read:chat'] }), antworter: () => ({ status: 202 }) });
  const e = await w.aktionen.clip();
  assert.equal(e.ok, false);
  assert.ok(!e.ok && e.fehler.includes('clips:edit') && e.fehler.includes(NEU_VERBINDEN));
  assert.equal(w.aufrufe.length, 0);
});

test('401 → genau ein erzwungenes Erneuern mit abgelehntesToken, dann Erfolg mit neuem Token', async () => {
  const w = aufbau({
    getValidToken: async (o) => (o.abgelehntesToken ? tokens({ accessToken: 'geheim-access-2' }) : tokens()),
    antworter: (a) => (a.headers.Authorization === 'Bearer geheim-access-1'
      ? { status: 401, body: { message: 'Invalid OAuth token' } }
      : { status: 202, body: { data: [{ id: 'X', edit_url: 'https://clips.twitch.tv/X/edit' }] } }),
  });
  const e = await w.aktionen.clip();
  assert.equal(e.ok, true);
  assert.deepEqual(w.tokenAufrufe, [{}, { abgelehntesToken: 'geheim-access-1' }]);
  assert.equal(w.aufrufe.length, 2);
  w.keineGeheimnisse();
});

test('401 zweimal (z. B. Scope fehlt bei Twitch) → „Bitte Twitch neu verbinden", keine Schleife', async () => {
  const w = aufbau({ antworter: () => ({ status: 401, body: { message: 'Missing scope: clips:edit' } }) });
  const e = await w.aktionen.clip();
  assert.ok(!e.ok && e.fehler.includes('Bitte Twitch neu verbinden'));
  assert.equal(w.aufrufe.length, 2);
  assert.equal(w.tokenAufrufe.length, 2);
});

test('TwitchReloginNoetig aus getValidToken → „Bitte Twitch neu verbinden"', async () => {
  const w = aufbau({ getValidToken: async () => { throw new TwitchReloginNoetig(); }, antworter: () => ({ status: 200 }) });
  const e = await w.aktionen.marker();
  assert.ok(!e.ok && e.fehler.includes('Bitte Twitch neu verbinden'));
  assert.equal(w.aufrufe.length, 0);
});

test('Netzfehler → verständlicher Fehler statt Ausnahme', async () => {
  const w = aufbau({ antworter: () => { throw new Error('ECONNRESET'); } });
  const e = await w.aktionen.clip();
  assert.ok(!e.ok && /nicht erreichbar/.test(e.fehler));
});

test('ungültige Client-ID → Fehler, kein Aufruf', async () => {
  const w = aufbau({ clientId: '', antworter: () => ({ status: 202 }) });
  const e = await w.aktionen.clip();
  assert.ok(!e.ok && /Client-ID/.test(e.fehler));
  assert.equal(w.aufrufe.length, 0);
});

// ── Marker ────────────────────────────────────────────────────────────────

test('marker: Body user_id + description (max 140), 200 → Position', async () => {
  const w = aufbau({ antworter: () => ({ status: 200, body: { data: [{ id: 'm', position_seconds: 3725, description: 'x' }] } }) });
  const e = await w.aktionen.marker('  ' + 'a'.repeat(200) + '  ');
  assert.equal(e.ok, true);
  assert.match(e.ok ? e.info : '', /bei 1:02:05/);
  const a = w.aufrufe[0]!;
  assert.equal(a.url, 'https://api.twitch.tv/helix/streams/markers');
  assert.equal(a.headers['Content-Type'], 'application/json');
  assert.deepEqual(a.body, { user_id: '1000', description: 'a'.repeat(140) });
});

test('marker: ohne Beschreibung kein description-Feld; 404 → live/VOD-Hinweis', async () => {
  const w = aufbau({ antworter: () => ({ status: 404, body: {} }) });
  const e = await w.aktionen.marker();
  assert.deepEqual(w.aufrufe[0]!.body, { user_id: '1000' });
  assert.ok(!e.ok && /live/.test(e.fehler) && /VOD/.test(e.fehler));
});

// ── Werbung ───────────────────────────────────────────────────────────────

test('werbung: Body broadcaster_id + length, merkt retry_after → nächster Druck ohne Aufruf mit Restsekunden', async () => {
  const w = aufbau({ antworter: () => ({ status: 200, body: { data: [{ length: 60, message: '', retry_after: 480 }] } }) });
  const e = await w.aktionen.werbung(60);
  assert.ok(e.ok && /60 Sekunden/.test(e.info));
  assert.deepEqual(w.aufrufe[0]!.body, { broadcaster_id: '1000', length: 60 });
  assert.equal(w.aufrufe[0]!.url, 'https://api.twitch.tv/helix/channels/commercial');
  w.vor(100_000);
  const zweit = await w.aktionen.werbung(30);
  assert.ok(!zweit.ok && zweit.fehler.includes('380 Sekunden'));
  assert.equal(w.aufrufe.length, 1);
  w.vor(380_000);
  await w.aktionen.werbung(30);
  assert.equal(w.aufrufe.length, 2);
});

test('werbung: 429 ohne bekannte Sperre → Abklingzeit-Hinweis; 400 → nicht live', async () => {
  let status = 429;
  const w = aufbau({ antworter: () => ({ status, body: { message: 'cooldown' } }) });
  const e = await w.aktionen.werbung(90);
  assert.ok(!e.ok && /Abklingzeit/.test(e.fehler));
  status = 400;
  const f = await w.aktionen.werbung(90);
  assert.ok(!f.ok && /live/.test(f.fehler));
});

test('werbung: ungültige Länge → Fehler, kein Aufruf', async () => {
  const w = aufbau({ antworter: () => ({ status: 200 }) });
  const e = await w.aktionen.werbung(45);
  assert.ok(!e.ok && /30, 60, 90, 120, 150, 180/.test(e.fehler));
  assert.equal(w.aufrufe.length, 0);
});

// ── Shoutout ──────────────────────────────────────────────────────────────

test('shoutout ohne Login und ohne Raid → klarer Fehler, kein Aufruf', async () => {
  const w = aufbau({ antworter: () => ({ status: 204 }) });
  const e = await w.aktionen.shoutout();
  assert.ok(!e.ok && /niemand geraidet/.test(e.fehler));
  assert.equal(w.aufrufe.length, 0);
});

test('shoutout ohne Login → letzter echter Raider; Test-Raids zählen nicht', async () => {
  const w = aufbau({ antworter: () => ({ status: 204 }) });
  w.raid();
  w.raid({ synthetic: true, user: { id: 'twitch:999', nickname: 'Test' } });
  w.raid({ plattform: 'tiktok', user: { id: '555', nickname: 'TikToker' } });
  const e = await w.aktionen.shoutout();
  assert.deepEqual(e, { ok: true, info: 'Shoutout an Freundin gesendet.' });
  assert.equal(w.aufrufe[0]!.url,
    'https://api.twitch.tv/helix/chat/shoutouts?from_broadcaster_id=1000&to_broadcaster_id=777&moderator_id=1000');
  assert.equal(w.aufrufe[0]!.method, 'POST');
});

test('shoutout mit Login → Get Users, dann Shoutout an die ID', async () => {
  const w = aufbau({
    antworter: (a) => (a.url.includes('/helix/users')
      ? { status: 200, body: { data: [{ id: '4242', login: 'kumpel', display_name: 'Kumpel' }] } }
      : { status: 204 }),
  });
  const e = await w.aktionen.shoutout('@Kumpel');
  assert.deepEqual(e, { ok: true, info: 'Shoutout an Kumpel gesendet.' });
  assert.equal(w.aufrufe[0]!.url, 'https://api.twitch.tv/helix/users?login=kumpel');
  assert.match(w.aufrufe[1]!.url, /to_broadcaster_id=4242/);
});

test('shoutout: unbekannter Login (leere Liste) und ungültiger Name', async () => {
  const w = aufbau({ antworter: () => ({ status: 200, body: { data: [] } }) });
  const e = await w.aktionen.shoutout('gibtsnicht');
  assert.ok(!e.ok && /gibt es nicht/.test(e.fehler));
  const f = await w.aktionen.shoutout('böse name');
  assert.ok(!f.ok && /kein gültiger/.test(f.fehler));
  assert.equal(w.aufrufe.length, 1);
});

test('shoutout: Abklingzeiten 2 min allgemein / 60 min gleicher Kanal (mit Sekunden), ohne Twitch zu fragen', async () => {
  const w = aufbau({
    antworter: (a) => (a.url.includes('/helix/users')
      ? { status: 200, body: { data: [{ id: '4242', display_name: 'Kumpel' }] } }
      : { status: 204 }),
  });
  w.raid();
  assert.equal((await w.aktionen.shoutout()).ok, true);
  w.vor(30_000);
  const zuFrueh = await w.aktionen.shoutout('kumpel');
  assert.ok(!zuFrueh.ok && zuFrueh.fehler.includes('90 Sekunden'));
  w.vor(90_000);
  const gleicher = await w.aktionen.shoutout();
  assert.ok(!gleicher.ok && gleicher.fehler.includes('3480 Sekunden'));
  const shoutoutAufrufe = () => w.aufrufe.filter((a) => a.url.includes('shoutouts')).length;
  assert.equal(shoutoutAufrufe(), 1);
  assert.equal((await w.aktionen.shoutout('kumpel')).ok, true);
  assert.equal(shoutoutAufrufe(), 2);
});

test('shoutout: 429 von Twitch → Sperr-Hinweis; 400 → nicht live; an sich selbst → kein Aufruf', async () => {
  let status = 429;
  const w = aufbau({ antworter: () => ({ status }) });
  w.raid();
  const e = await w.aktionen.shoutout();
  assert.ok(!e.ok && /2 Minuten/.test(e.fehler) && /60 Minuten/.test(e.fehler));
  status = 400;
  const f = await w.aktionen.shoutout();
  assert.ok(!f.ok && /live/.test(f.fehler));
  const vorher = w.aufrufe.length;
  w.raid({ user: { id: 'twitch:1000', nickname: 'Ich' } });
  const g = await w.aktionen.shoutout();
  assert.ok(!g.ok && /selbst/.test(g.fehler));
  assert.equal(w.aufrufe.length, vorher);
});

test('shoutout: fehlender Scope → neu verbinden', async () => {
  const w = aufbau({ tokens: tokens({ scopes: ['clips:edit'] }), antworter: () => ({ status: 204 }) });
  w.raid();
  const e = await w.aktionen.shoutout();
  assert.ok(!e.ok && e.fehler.includes('moderator:manage:shoutouts') && e.fehler.includes(NEU_VERBINDEN));
});

// ── Chat-Modi ─────────────────────────────────────────────────────────────

function chatSettings(extra: Record<string, unknown>) {
  return {
    data: [{
      broadcaster_id: '1000', emote_mode: false, follower_mode: false, follower_mode_duration: null,
      slow_mode: false, slow_mode_wait_time: null, subscriber_mode: false, unique_chat_mode: false, ...extra,
    }],
  };
}

for (const [modus, feld] of [['emote', 'emote_mode'], ['langsam', 'slow_mode'], ['follower', 'follower_mode']] as const) {
  test(`chatModus ${modus}: aus → PATCH {${feld}: true}; an → PATCH {${feld}: false}`, async () => {
    let stand = false;
    const w = aufbau({
      antworter: (a) => {
        if (a.method === 'GET') return { status: 200, body: chatSettings({ [feld]: stand }) };
        const neu = (a.body as Record<string, boolean>)[feld]!;
        return { status: 200, body: chatSettings({ [feld]: neu, ...(neu && feld === 'slow_mode' ? { slow_mode_wait_time: 30 } : {}) }) };
      },
    });
    const an = await w.aktionen.chatModus(modus);
    assert.ok(an.ok && / an/.test(an.info), JSON.stringify(an));
    const patch = w.aufrufe.find((a) => a.method === 'PATCH')!;
    assert.deepEqual(patch.body, { [feld]: true });
    assert.equal(patch.url, 'https://api.twitch.tv/helix/chat/settings?broadcaster_id=1000&moderator_id=1000');
    assert.equal(w.aufrufe[0]!.url, 'https://api.twitch.tv/helix/chat/settings?broadcaster_id=1000');
    stand = true;
    const aus = await w.aktionen.chatModus(modus);
    assert.ok(aus.ok && / aus\./.test(aus.info), JSON.stringify(aus));
    assert.deepEqual(w.aufrufe.filter((a) => a.method === 'PATCH')[1]!.body, { [feld]: false });
  });
}

test('chatModus langsam an → Wartezeit im Text', async () => {
  const w = aufbau({
    antworter: (a) => (a.method === 'GET'
      ? { status: 200, body: chatSettings({}) }
      : { status: 200, body: chatSettings({ slow_mode: true, slow_mode_wait_time: 30 }) }),
  });
  const e = await w.aktionen.chatModus('langsam');
  assert.deepEqual(e, { ok: true, info: 'Langsamer Modus an (30 Sekunden).' });
});

test('chatModus: unbekannter Modus, fehlender Scope, 403', async () => {
  const w = aufbau({ antworter: (a) => (a.method === 'GET' ? { status: 200, body: chatSettings({}) } : { status: 403 }) });
  const e = await w.aktionen.chatModus('sub');
  assert.ok(!e.ok && /Unbekannter Chat-Modus/.test(e.fehler));
  assert.equal(w.aufrufe.length, 0);
  const f = await w.aktionen.chatModus('emote');
  assert.ok(!f.ok && /nicht, die Chat-Einstellungen/.test(f.fehler));
  const ohne = aufbau({ tokens: tokens({ scopes: [] }), antworter: () => ({ status: 200 }) });
  const g = await ohne.aktionen.chatModus('emote');
  assert.ok(!g.ok && g.fehler.includes('moderator:manage:chat_settings'));
  assert.equal(ohne.aufrufe.length, 0);
});

test('ausfuehren verteilt nach Art', async () => {
  const w = aufbau({ antworter: () => ({ status: 200, body: { data: [{ position_seconds: 5 }] } }) });
  const e = await w.aktionen.ausfuehren({ art: 'marker', beschreibung: 'Hi' });
  assert.ok(e.ok && /Marker gesetzt bei 0:05/.test(e.info));
});
