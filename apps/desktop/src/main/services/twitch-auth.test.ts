// Tests für den Twitch-Login (Device-Code-Flow) und die Token-Verwaltung.
// Kein Netz: fetch, Uhr und Warten werden gefälscht. Statuscodes und
// Fehlertexte stammen aus docs/twitch-api-belege.md (Abschnitt 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TwitchAuth,
  TwitchReloginNoetig,
  TWITCH_SCOPES,
  istGueltigeTwitchClientId,
  type TwitchTokens,
} from './twitch-auth';

interface Aufruf { url: string; method: string; body: URLSearchParams; headers: Record<string, string> }
type Antwort = { status: number; body?: unknown };
type Antworter = (a: Aufruf, nr: number) => Antwort | Promise<Antwort>;

const ALLE_SCOPES = [...TWITCH_SCOPES];

function antwort(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('kein Body');
      return body;
    },
  } as unknown as Response;
}

function aufbau(opts: { tokens?: TwitchTokens; clientId?: string; antworter: Antworter; t?: number }) {
  let tokens = opts.tokens;
  let t = opts.t ?? 1_000_000;
  const aufrufe: Aufruf[] = [];
  const gespeichert: Array<TwitchTokens | undefined> = [];
  const logs: string[] = [];
  const pausen: number[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    const a: Aufruf = { url, method: init?.method ?? 'GET', body, headers: (init?.headers ?? {}) as Record<string, string> };
    aufrufe.push(a);
    const r = await opts.antworter(a, aufrufe.length);
    return antwort(r.status, r.body);
  }) as unknown as typeof fetch;
  const auth = new TwitchAuth({
    fetch: fetchFn,
    now: () => t,
    getClientId: () => opts.clientId ?? 'abc123def',
    loadTokens: () => tokens,
    saveTokens: (n) => { tokens = n; gespeichert.push(n); },
    log: (_stufe, text) => { logs.push(text); },
    // Warten = Uhr vorstellen, sofort weiter.
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw new Error('abgebrochen');
      pausen.push(ms);
      t += ms;
    },
  });
  return {
    auth,
    aufrufe,
    gespeichert,
    logs,
    pausen,
    tokens: () => tokens,
    setT: (n: number) => { t = n; },
  };
}

const DEVICE_OK = {
  device_code: 'geheimer-device-code',
  expires_in: 1800,
  interval: 5,
  user_code: 'ABCDEFGH',
  verification_uri: 'https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH',
};

const TOKEN_OK = {
  access_token: 'access-1',
  expires_in: 14400,
  refresh_token: 'refresh-1',
  scope: ALLE_SCOPES,
  token_type: 'bearer',
};

const VALIDATE_OK = {
  client_id: 'abc123def',
  login: 'alexstreamt',
  scopes: ALLE_SCOPES,
  user_id: '141981764',
  expires_in: 14000,
};

function gueltigeTokens(extra: Partial<TwitchTokens> = {}): TwitchTokens {
  return {
    accessToken: 'access-alt',
    refreshToken: 'refresh-alt',
    expiresAt: 1_000_000 + 3_600_000,
    scopes: ALLE_SCOPES,
    userId: '141981764',
    login: 'alexstreamt',
    ...extra,
  };
}

test('TWITCH_SCOPES: genau die vier Lese-Scopes aus den Belegen, keine Schreibrechte', () => {
  assert.deepEqual([...TWITCH_SCOPES].sort(), [
    'bits:read', 'channel:read:subscriptions', 'moderator:read:followers', 'user:read:chat',
  ]);
});

test('Client-ID: nur Buchstaben/Ziffern, 1..64 Zeichen', () => {
  assert.equal(istGueltigeTwitchClientId('wbmytr93xzw8zbg0p1izqyzzc5mbiz'), true);
  assert.equal(istGueltigeTwitchClientId('ABC123'), true);
  assert.equal(istGueltigeTwitchClientId(''), false);
  assert.equal(istGueltigeTwitchClientId('abc&scopes=chat:edit'), false);
  assert.equal(istGueltigeTwitchClientId('abc def'), false);
  assert.equal(istGueltigeTwitchClientId('a'.repeat(65)), false);
});

test('beginDeviceLogin: schickt client_id + Scopes (Leerzeichen-getrennt) und liefert Code + Adresse', async () => {
  const w = aufbau({ antworter: () => ({ status: 200, body: DEVICE_OK }) });
  const r = await w.auth.beginDeviceLogin();
  assert.deepEqual(r, { userCode: 'ABCDEFGH', verificationUri: DEVICE_OK.verification_uri, expiresIn: 1800 });
  assert.equal(w.aufrufe.length, 1);
  const a = w.aufrufe[0]!;
  assert.equal(a.url, 'https://id.twitch.tv/oauth2/device');
  assert.equal(a.method, 'POST');
  assert.equal(a.body.get('client_id'), 'abc123def');
  assert.equal(a.body.get('scopes'), ALLE_SCOPES.join(' '));
  assert.equal(a.body.has('client_secret'), false, 'öffentlicher Client: nie ein Secret');
});

test('beginDeviceLogin: ungültige Client-ID → Fehler, kein Netzaufruf', async () => {
  const w = aufbau({ clientId: 'abc&x=1', antworter: () => ({ status: 200, body: DEVICE_OK }) });
  await assert.rejects(() => w.auth.beginDeviceLogin(), /Client-ID/);
  assert.equal(w.aufrufe.length, 0);
});

test('beginDeviceLogin: Adresse ohne https wird nicht akzeptiert', async () => {
  const w = aufbau({ antworter: () => ({ status: 200, body: { ...DEVICE_OK, verification_uri: 'javascript:alert(1)' } }) });
  await assert.rejects(() => w.auth.beginDeviceLogin());
});

test('waitForLogin: „authorization_pending" → weiter im Takt von interval, dann Erfolg + validate → userId/login gespeichert', async () => {
  let tokenAnfragen = 0;
  const w = aufbau({
    antworter: (a) => {
      if (a.url.endsWith('/device')) return { status: 200, body: DEVICE_OK };
      if (a.url.endsWith('/token')) {
        tokenAnfragen++;
        if (tokenAnfragen < 3) return { status: 400, body: { status: 400, message: 'authorization_pending' } };
        return { status: 200, body: TOKEN_OK };
      }
      if (a.url.endsWith('/validate')) return { status: 200, body: VALIDATE_OK };
      return { status: 500 };
    },
  });
  await w.auth.beginDeviceLogin();
  const t = await w.auth.waitForLogin();
  assert.equal(tokenAnfragen, 3);
  assert.deepEqual(w.pausen, [5000, 5000, 5000]);
  const polls = w.aufrufe.filter((a) => a.url.endsWith('/token'));
  for (const p of polls) {
    assert.equal(p.method, 'POST');
    assert.equal(p.body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
    assert.equal(p.body.get('device_code'), 'geheimer-device-code');
    assert.equal(p.body.get('client_id'), 'abc123def');
    assert.equal(p.body.get('scopes'), ALLE_SCOPES.join(' '));
  }
  const v = w.aufrufe.find((a) => a.url.endsWith('/validate'))!;
  assert.equal(v.url, 'https://id.twitch.tv/oauth2/validate');
  assert.equal(v.headers.Authorization, 'OAuth access-1');
  assert.equal(t.userId, '141981764');
  assert.equal(t.login, 'alexstreamt');
  assert.equal(t.accessToken, 'access-1');
  assert.equal(t.refreshToken, 'refresh-1');
  assert.deepEqual(w.tokens(), t, 'Tokens sind gespeichert');
  for (const zeile of w.logs) {
    for (const geheim of ['access-1', 'refresh-1', 'geheimer-device-code', 'ABCDEFGH']) {
      assert.ok(!zeile.includes(geheim), `Log verrät ein Geheimnis: ${zeile}`);
    }
  }
});

test('waitForLogin: „slow_down" (unbelegt, defensiv) → Pause wird um 5 s länger', async () => {
  let n = 0;
  const w = aufbau({
    antworter: (a) => {
      if (a.url.endsWith('/device')) return { status: 200, body: DEVICE_OK };
      if (a.url.endsWith('/token')) {
        n++;
        if (n === 1) return { status: 400, body: { status: 400, message: 'slow_down' } };
        if (n === 2) return { status: 400, body: { status: 400, message: 'authorization_pending' } };
        return { status: 200, body: TOKEN_OK };
      }
      return { status: 200, body: VALIDATE_OK };
    },
  });
  await w.auth.beginDeviceLogin();
  await w.auth.waitForLogin();
  assert.deepEqual(w.pausen, [5000, 10000, 10000]);
});

test('waitForLogin: anderer 400er („invalid device code", abgelehnt …) → Fehler, nichts gespeichert', async () => {
  const w = aufbau({
    antworter: (a) => {
      if (a.url.endsWith('/device')) return { status: 200, body: DEVICE_OK };
      return { status: 400, body: { status: 400, message: 'invalid device code' } };
    },
  });
  await w.auth.beginDeviceLogin();
  await assert.rejects(() => w.auth.waitForLogin(), /invalid device code/);
  assert.equal(w.tokens(), undefined);
  // Der Code ist verbraucht — ein zweites Warten ohne neuen Start geht nicht.
  await assert.rejects(() => w.auth.waitForLogin());
});

test('waitForLogin: Code läuft ab (expires_in) → Fehler statt Endlos-Polling', async () => {
  const w = aufbau({
    antworter: (a) => {
      if (a.url.endsWith('/device')) return { status: 200, body: { ...DEVICE_OK, expires_in: 12 } };
      return { status: 400, body: { status: 400, message: 'authorization_pending' } };
    },
  });
  await w.auth.beginDeviceLogin();
  await assert.rejects(() => w.auth.waitForLogin(), /abgelaufen/);
  assert.ok(w.aufrufe.filter((a) => a.url.endsWith('/token')).length <= 3);
});

test('waitForLogin: Abbruch per AbortSignal beendet das Warten', async () => {
  const w = aufbau({
    antworter: (a) => {
      if (a.url.endsWith('/device')) return { status: 200, body: DEVICE_OK };
      return { status: 400, body: { status: 400, message: 'authorization_pending' } };
    },
  });
  await w.auth.beginDeviceLogin();
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(() => w.auth.waitForLogin(ctl.signal));
  assert.equal(w.aufrufe.filter((a) => a.url.endsWith('/token')).length, 0);
});

test('waitForLogin: fehlende Scopes beim Validieren → TwitchReloginNoetig, nichts gespeichert', async () => {
  const w = aufbau({
    antworter: (a) => {
      if (a.url.endsWith('/device')) return { status: 200, body: DEVICE_OK };
      if (a.url.endsWith('/token')) return { status: 200, body: TOKEN_OK };
      return { status: 200, body: { ...VALIDATE_OK, scopes: ['user:read:chat'] } };
    },
  });
  await w.auth.beginDeviceLogin();
  await assert.rejects(() => w.auth.waitForLogin(), TwitchReloginNoetig);
  assert.equal(w.tokens(), undefined);
});

test('getValidToken: noch lange gültig → kein Netzaufruf', async () => {
  const w = aufbau({ tokens: gueltigeTokens(), antworter: () => ({ status: 500 }) });
  const t = await w.auth.getValidToken();
  assert.equal(t.accessToken, 'access-alt');
  assert.equal(w.aufrufe.length, 0);
});

test('getValidToken: läuft in < 60 s ab → Refresh ohne Secret; neues Refresh-Token wird gespeichert, BEVOR es zurückkommt', async () => {
  const w = aufbau({
    tokens: gueltigeTokens({ expiresAt: 1_000_000 + 30_000 }),
    antworter: (a) => {
      assert.equal(a.url, 'https://id.twitch.tv/oauth2/token');
      return { status: 200, body: { ...TOKEN_OK, access_token: 'access-2', refresh_token: 'refresh-2' } };
    },
  });
  const t = await w.auth.getValidToken();
  const gespeichertVorRueckgabe = w.tokens()?.refreshToken === 'refresh-2';
  const a = w.aufrufe[0]!;
  assert.equal(a.method, 'POST');
  assert.equal(a.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(a.body.get('grant_type'), 'refresh_token');
  assert.equal(a.body.get('refresh_token'), 'refresh-alt');
  assert.equal(a.body.get('client_id'), 'abc123def');
  assert.equal(a.body.has('client_secret'), false);
  assert.equal(t.accessToken, 'access-2');
  assert.equal(t.refreshToken, 'refresh-2');
  assert.equal(t.expiresAt, 1_000_000 + 14400 * 1000);
  assert.equal(t.userId, '141981764', 'Nutzerdaten bleiben erhalten');
  assert.equal(t.login, 'alexstreamt');
  assert.ok(gespeichertVorRueckgabe);
  assert.equal(w.gespeichert.length, 1);
});

test('getValidToken: Refresh-Antwort mit scope als String (Tabelle sagt „String") wird verstanden', async () => {
  const w = aufbau({
    tokens: gueltigeTokens({ expiresAt: 0 }),
    antworter: () => ({ status: 200, body: { ...TOKEN_OK, scope: ALLE_SCOPES.join(' ') } }),
  });
  const t = await w.auth.getValidToken();
  assert.deepEqual([...t.scopes].sort(), [...ALLE_SCOPES].sort());
});

test('getValidToken: gleichzeitige Aufrufe → nur EIN Refresh (Einmal-Refresh-Token!)', async () => {
  let freigeben!: () => void;
  const tor = new Promise<void>((r) => { freigeben = r; });
  const w = aufbau({
    tokens: gueltigeTokens({ expiresAt: 0 }),
    antworter: async () => {
      await tor;
      return { status: 200, body: { ...TOKEN_OK, access_token: 'access-2', refresh_token: 'refresh-2' } };
    },
  });
  const p = Promise.all([w.auth.getValidToken(), w.auth.getValidToken(), w.auth.getValidToken()]);
  freigeben();
  const ergebnisse = await p;
  assert.equal(w.aufrufe.length, 1);
  for (const r of ergebnisse) assert.equal(r.accessToken, 'access-2');
});

test('getValidToken: Refresh 400 „Invalid refresh token" → TwitchReloginNoetig + Tokens gelöscht', async () => {
  const w = aufbau({
    tokens: gueltigeTokens({ expiresAt: 0 }),
    antworter: () => ({ status: 400, body: { error: 'Bad Request', status: 400, message: 'Invalid refresh token' } }),
  });
  await assert.rejects(() => w.auth.getValidToken(), TwitchReloginNoetig);
  assert.equal(w.tokens(), undefined);
});

test('getValidToken: Refresh 401 → TwitchReloginNoetig + Tokens gelöscht', async () => {
  const w = aufbau({ tokens: gueltigeTokens({ expiresAt: 0 }), antworter: () => ({ status: 401 }) });
  await assert.rejects(() => w.auth.getValidToken(), TwitchReloginNoetig);
  assert.equal(w.tokens(), undefined);
});

test('getValidToken: 5xx/Netzaussetzer → Fehler, aber Anmeldung bleibt', async () => {
  const w = aufbau({ tokens: gueltigeTokens({ expiresAt: 0 }), antworter: () => ({ status: 503 }) });
  await assert.rejects(() => w.auth.getValidToken());
  assert.equal(w.tokens()?.refreshToken, 'refresh-alt');
  assert.ok(!((await w.auth.getValidToken().catch((e: unknown) => e)) instanceof TwitchReloginNoetig));
});

test('getValidToken: ohne Tokens → TwitchReloginNoetig', async () => {
  const w = aufbau({ antworter: () => ({ status: 500 }) });
  await assert.rejects(() => w.auth.getValidToken(), TwitchReloginNoetig);
});

test('getValidToken({abgelehntesToken}): erzwingt Refresh, aber nur wenn das abgelehnte Token noch aktuell ist', async () => {
  const w = aufbau({
    tokens: gueltigeTokens(),
    antworter: () => ({ status: 200, body: { ...TOKEN_OK, access_token: 'access-2', refresh_token: 'refresh-2' } }),
  });
  const a = await w.auth.getValidToken({ abgelehntesToken: 'access-alt' });
  assert.equal(a.accessToken, 'access-2');
  // Ein zweiter Aufrufer mit dem schon ersetzten Token löst keinen zweiten Refresh aus.
  const b = await w.auth.getValidToken({ abgelehntesToken: 'access-alt' });
  assert.equal(b.accessToken, 'access-2');
  assert.equal(w.aufrufe.length, 1);
});

test('validate: 200 mit allen Scopes → true; Nutzername-Änderung wird übernommen', async () => {
  const w = aufbau({
    tokens: gueltigeTokens({ login: 'alterName' }),
    antworter: () => ({ status: 200, body: VALIDATE_OK }),
  });
  assert.equal(await w.auth.validate(), true);
  assert.equal(w.aufrufe[0]!.headers.Authorization, 'OAuth access-alt');
  assert.equal(w.tokens()?.login, 'alexstreamt');
});

test('validate: ohne Tokens → false, kein Netz', async () => {
  const w = aufbau({ antworter: () => ({ status: 500 }) });
  assert.equal(await w.auth.validate(), false);
  assert.equal(w.aufrufe.length, 0);
});

test('validate: fehlende Scopes → TwitchReloginNoetig + Tokens gelöscht', async () => {
  const w = aufbau({
    tokens: gueltigeTokens(),
    antworter: () => ({ status: 200, body: { ...VALIDATE_OK, scopes: ['user:read:chat', 'bits:read'] } }),
  });
  await assert.rejects(() => w.auth.validate(), TwitchReloginNoetig);
  assert.equal(w.tokens(), undefined);
});

test('validate: 401 → einmal erneuern, neues Token validieren → true', async () => {
  const w = aufbau({
    tokens: gueltigeTokens(),
    antworter: (a) => {
      if (a.url.endsWith('/validate')) {
        return a.headers.Authorization === 'OAuth access-alt'
          ? { status: 401, body: { status: 401, message: 'invalid access token' } }
          : { status: 200, body: VALIDATE_OK };
      }
      return { status: 200, body: { ...TOKEN_OK, access_token: 'access-2', refresh_token: 'refresh-2' } };
    },
  });
  assert.equal(await w.auth.validate(), true);
  assert.equal(w.tokens()?.accessToken, 'access-2');
});

test('validate: 401 und Refresh ungültig (App getrennt) → TwitchReloginNoetig + gelöscht, keine Schleife', async () => {
  const w = aufbau({
    tokens: gueltigeTokens(),
    antworter: (a) => (a.url.endsWith('/validate')
      ? { status: 401, body: { status: 401, message: 'invalid access token' } }
      : { status: 400, body: { status: 400, message: 'Invalid refresh token' } }),
  });
  await assert.rejects(() => w.auth.validate(), TwitchReloginNoetig);
  assert.equal(w.tokens(), undefined);
  assert.ok(w.aufrufe.length <= 3);
});

test('validate: Netzaussetzer → false, Anmeldung bleibt', async () => {
  const w = aufbau({ tokens: gueltigeTokens(), antworter: () => ({ status: 502 }) });
  assert.equal(await w.auth.validate(), false);
  assert.equal(w.tokens()?.accessToken, 'access-alt');
});

test('logout: widerruft das Access-Token (client_id + token) und löscht die Tokens', async () => {
  const w = aufbau({ tokens: gueltigeTokens(), antworter: () => ({ status: 200 }) });
  await w.auth.logout();
  const a = w.aufrufe[0]!;
  assert.equal(a.url, 'https://id.twitch.tv/oauth2/revoke');
  assert.equal(a.method, 'POST');
  assert.equal(a.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(a.body.get('client_id'), 'abc123def');
  assert.equal(a.body.get('token'), 'access-alt');
  assert.equal(w.tokens(), undefined);
});

test('logout: Widerruf scheitert → Tokens trotzdem gelöscht, kein Wurf', async () => {
  const w = aufbau({ tokens: gueltigeTokens(), antworter: () => { throw new Error('offline'); } });
  await w.auth.logout();
  assert.equal(w.tokens(), undefined);
});

test('kaputte gespeicherte Tokens (Handbearbeitung) gelten als „nicht verbunden"', async () => {
  const w = aufbau({
    tokens: { accessToken: 5, refreshToken: '' } as unknown as TwitchTokens,
    antworter: () => ({ status: 500 }),
  });
  await assert.rejects(() => w.auth.getValidToken(), TwitchReloginNoetig);
  assert.equal(await w.auth.validate(), false);
});
