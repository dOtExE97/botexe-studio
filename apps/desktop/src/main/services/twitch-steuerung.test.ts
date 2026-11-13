import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TwitchSteuerung, istTwitchBestaetigungsUrl, sollTwitchAutoStarten,
  type TwitchEinstellungen, type TwitchUiStatus, type TwitchSteuerungDeps,
} from './twitch-steuerung';
import type { TwitchStatusInfo } from '../adapters/twitch-adapter';
import type { TwitchTokens } from './twitch-auth';

const TOKENS: TwitchTokens = { accessToken: 'geheim-access', refreshToken: 'geheim-refresh', expiresAt: 9e15, scopes: [], userId: '1', login: 'kanal' };
const CODE = { userCode: 'ABCD-EFGH', verificationUri: 'https://www.twitch.tv/activate?device-code=ABCD-EFGH', expiresIn: 1800 };

async function warte(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

function aufbau(einst: Partial<TwitchEinstellungen> = {}) {
  const s: TwitchEinstellungen = { twitchClientId: 'abc123', twitchTokens: TOKENS, twitchAutoConnect: true, ...einst };
  const geoeffnet: string[] = [];
  const pushes: TwitchUiStatus[] = [];
  const logs: string[] = [];
  let adapterStatus: TwitchStatusInfo = { status: 'aus' };
  let starts = 0;
  let stops = 0;
  const warter: Array<{ signal?: AbortSignal; ok: (t: TwitchTokens) => void; nein: (e: Error) => void }> = [];
  let beginAntwort: () => Promise<typeof CODE> = () => Promise.resolve({ ...CODE });
  let logouts = 0;
  // eslint-disable-next-line prefer-const
  let st: TwitchSteuerung;
  const deps: TwitchSteuerungDeps = {
    auth: {
      beginDeviceLogin: () => beginAntwort(),
      waitForLogin: (signal) => new Promise<TwitchTokens>((ok, nein) => {
        warter.push({ signal, ok, nein });
        signal?.addEventListener('abort', () => { const e = new Error('abgebrochen'); e.name = 'AbortError'; nein(e); }, { once: true });
      }),
      logout: () => { logouts++; s.twitchTokens = undefined; return Promise.resolve(); },
    },
    adapter: {
      start: () => { starts++; adapterStatus = { status: 'verbinde' }; st.adapterStatus(adapterStatus); return Promise.resolve(); },
      stop: () => { stops++; adapterStatus = { status: 'aus' }; st.adapterStatus(adapterStatus); },
      getStatus: () => ({ ...adapterStatus }),
    },
    getEinstellungen: () => s,
    openExternal: (url) => { geoeffnet.push(url); },
    onStatus: (info) => { pushes.push(info); },
    log: { info: (_scope, text) => { logs.push(text); }, warn: (_scope, text) => { logs.push(text); } },
  };
  st = new TwitchSteuerung(deps);
  return {
    st, s, geoeffnet, pushes, logs, warter,
    get starts() { return starts; }, get stops() { return stops; }, get logouts() { return logouts; },
    setBegin(f: () => Promise<typeof CODE>) { beginAntwort = f; },
  };
}

// ── Adresse fürs Öffnen ─────────────────────────────────────────────────────

test('istTwitchBestaetigungsUrl: nur https auf twitch.tv bzw. *.twitch.tv', () => {
  for (const ok of ['https://www.twitch.tv/activate?device-code=X', 'https://twitch.tv/activate', 'https://id.twitch.tv/x']) {
    assert.equal(istTwitchBestaetigungsUrl(ok), true, ok);
  }
  for (const nein of [
    'http://www.twitch.tv/activate', 'https://www.twitch.tv.evil.com/activate', 'https://eviltwitch.tv/',
    'https://user:pw@www.twitch.tv/', 'https://www.twitch.tv:8443/', 'file:///etc/passwd', 'javascript:alert(1)',
    'nichts', '', 42, undefined,
  ]) {
    assert.equal(istTwitchBestaetigungsUrl(nein), false, String(nein));
  }
});

// ── Start-Bedingungen ───────────────────────────────────────────────────────

test('sollTwitchAutoStarten: nur mit Tokens UND Auto-Verbinden UND gültiger Client-ID', () => {
  const basis: TwitchEinstellungen = { twitchClientId: 'abc123', twitchTokens: TOKENS, twitchAutoConnect: true };
  assert.equal(sollTwitchAutoStarten(basis), true);
  assert.equal(sollTwitchAutoStarten({ ...basis, twitchTokens: undefined }), false, 'nicht angemeldet');
  assert.equal(sollTwitchAutoStarten({ ...basis, twitchTokens: { accessToken: 'a' } }), false, 'kaputte Tokens');
  assert.equal(sollTwitchAutoStarten({ ...basis, twitchAutoConnect: false }), false, 'Schalter aus');
  assert.equal(sollTwitchAutoStarten({ ...basis, twitchClientId: '' }), false, 'keine Client-ID');
  assert.equal(sollTwitchAutoStarten({ ...basis, twitchClientId: 'ab cd' }), false, 'ungültige Client-ID');
});

test('autoStart startet den Adapter nur, wenn die Bedingungen stimmen', async () => {
  const ja = aufbau();
  assert.equal(await ja.st.autoStart(), true);
  assert.equal(ja.starts, 1);
  const nein = aufbau({ twitchAutoConnect: false });
  assert.equal(await nein.st.autoStart(), false);
  assert.equal(nein.starts, 0);
});

// ── Anmelden ────────────────────────────────────────────────────────────────

test('beginLogin: ohne gültige Client-ID kein Login-Versuch', async () => {
  const t = aufbau({ twitchClientId: '' });
  await assert.rejects(() => t.st.beginLogin(), /Client-ID/);
  assert.equal(t.geoeffnet.length, 0);
});

test('beginLogin: öffnet die Twitch-Adresse, liefert den Code, startet nach Erfolg den Adapter', async () => {
  const t = aufbau({ twitchTokens: undefined });
  const r = await t.st.beginLogin();
  assert.deepEqual(r, CODE);
  assert.deepEqual(t.geoeffnet, [CODE.verificationUri]);
  assert.equal(t.st.status().anmeldungLaeuft, true);
  assert.equal(t.warter.length, 1);
  t.s.twitchTokens = TOKENS;
  t.warter[0]?.ok(TOKENS);
  await warte();
  assert.equal(t.starts, 1, 'Adapter nach dem Login gestartet');
  assert.equal(t.st.status().anmeldungLaeuft, false);
  assert.equal(t.st.status().angemeldet, true);
  assert.equal(t.st.status().login, 'kanal');
  assert.ok(!t.logs.some((l) => l.includes(CODE.userCode)), 'der Code landet nie im Log');
});

test('beginLogin: fremde Adresse wird NICHT geöffnet, Login abgebrochen', async () => {
  const t = aufbau();
  t.setBegin(() => Promise.resolve({ ...CODE, verificationUri: 'https://evil.example/activate' }));
  await assert.rejects(() => t.st.beginLogin(), /Adresse/);
  assert.equal(t.geoeffnet.length, 0);
  assert.equal(t.warter.length, 0, 'es wird nicht auf eine Bestätigung gewartet');
  assert.equal(t.st.status().anmeldungLaeuft, false);
});

test('beginLogin: ein zweiter Versuch bricht den ersten ab, ohne Fehlermeldung des ersten', async () => {
  const t = aufbau();
  await t.st.beginLogin();
  await t.st.beginLogin();
  await warte();
  assert.equal(t.warter.length, 2);
  assert.equal(t.warter[0]?.signal?.aborted, true, 'erster Wartender abgebrochen');
  assert.equal(t.warter[1]?.signal?.aborted, false);
  assert.ok(!t.pushes.some((p) => p.loginFehler), 'der bewusste Abbruch ist kein Fehler');
  t.warter[1]?.ok(TOKENS);
  await warte();
  assert.equal(t.starts, 1);
});

test('beginLogin: zwei gleichzeitige Aufrufe laufen nacheinander (kein vertauschter Gerätecode)', async () => {
  const t = aufbau();
  let offen = 0;
  let maxOffen = 0;
  t.setBegin(async () => { offen++; maxOffen = Math.max(maxOffen, offen); await warte(); offen--; return { ...CODE }; });
  await Promise.all([t.st.beginLogin().catch(() => undefined), t.st.beginLogin()]);
  assert.equal(maxOffen, 1, 'nie zwei Gerätecode-Anfragen gleichzeitig');
});

test('beginLogin: Fehlschlag (z. B. Code abgelaufen) → Status-Push mit deutscher Meldung, kein Start', async () => {
  const t = aufbau({ twitchTokens: undefined });
  await t.st.beginLogin();
  t.warter[0]?.nein(new Error('Der Twitch-Code ist abgelaufen, ohne dass er bestätigt wurde — bitte noch einmal verbinden.'));
  await warte();
  const letzter = t.pushes[t.pushes.length - 1];
  assert.match(letzter?.loginFehler ?? '', /abgelaufen/);
  assert.equal(letzter?.anmeldungLaeuft, false);
  assert.equal(t.starts, 0);
});

// ── Abmelden / Client-ID / Beenden ──────────────────────────────────────────

test('logout bricht einen laufenden Login ab, stoppt den Adapter und meldet ab', async () => {
  const t = aufbau();
  await t.st.autoStart();
  await t.st.beginLogin();
  await t.st.logout();
  await warte();
  assert.equal(t.warter[0]?.signal?.aborted, true);
  assert.ok(t.stops >= 1);
  assert.equal(t.logouts, 1);
  assert.equal(t.st.status().angemeldet, false);
  assert.ok(!t.pushes.some((p) => p.loginFehler));
});

test('clientIdGeaendert stoppt Adapter und Login und meldet den neuen Stand', async () => {
  const t = aufbau();
  await t.st.autoStart();
  await t.st.beginLogin();
  const vorher = t.pushes.length;
  t.s.twitchClientId = 'neu999';
  t.s.twitchTokens = undefined; // so verwirft es der SettingsStore
  t.st.clientIdGeaendert();
  await warte();
  assert.equal(t.warter[0]?.signal?.aborted, true);
  assert.ok(t.stops >= 1);
  assert.ok(t.pushes.length > vorher);
  assert.equal(t.pushes[t.pushes.length - 1]?.angemeldet, false);
});

test('connect ohne Anmeldung wirft verständlich; mit Anmeldung startet er', async () => {
  const ohne = aufbau({ twitchTokens: undefined });
  await assert.rejects(() => ohne.st.connect(), /Mit Twitch verbinden/);
  const mit = aufbau();
  await mit.st.connect();
  assert.equal(mit.starts, 1);
  mit.st.disconnect();
  assert.equal(mit.stops, 1);
});

test('beenden bricht den Login ab und stoppt den Adapter', async () => {
  const t = aufbau();
  await t.st.beginLogin();
  t.st.beenden();
  await warte();
  assert.equal(t.warter[0]?.signal?.aborted, true);
  assert.equal(t.stops, 1);
});

test('Status: clientIdGesetzt und Login aus den Tokens, auch wenn der Adapter aus ist', () => {
  const t = aufbau();
  const s = t.st.status();
  assert.equal(s.status, 'aus');
  assert.equal(s.clientIdGesetzt, true);
  assert.equal(s.angemeldet, true);
  assert.equal(s.login, 'kanal');
  assert.equal(aufbau({ twitchClientId: '' }).st.status().clientIdGesetzt, false);
  assert.ok(!JSON.stringify(s).includes('geheim'), 'keine Tokens im Status');
});

// ── Abschluss-Review ────────────────────────────────────────────────────────

test('Trennen während der Gerätecode-Anfrage: Meldung sagt „abgebrochen", nicht „durch eine neue ersetzt"', async () => {
  const t = aufbau();
  let freigeben!: () => void;
  t.setBegin(() => new Promise((r) => { freigeben = () => r({ ...CODE }); }));
  const laeuft = t.st.beginLogin();
  await warte();
  await t.st.logout();
  freigeben();
  await assert.rejects(laeuft, (err: Error) => !/ersetzt/.test(err.message) && /abgebrochen/.test(err.message));
});

test('Client-ID-Wechsel während der Gerätecode-Anfrage: ebenfalls „abgebrochen"', async () => {
  const t = aufbau();
  let freigeben!: () => void;
  t.setBegin(() => new Promise((r) => { freigeben = () => r({ ...CODE }); }));
  const laeuft = t.st.beginLogin();
  await warte();
  t.st.clientIdGeaendert();
  freigeben();
  await assert.rejects(laeuft, (err: Error) => !/ersetzt/.test(err.message) && /abgebrochen/.test(err.message));
});

test('Neuer Versuch während der Gerätecode-Anfrage: der alte meldet weiterhin „ersetzt"', async () => {
  const t = aufbau();
  let freigeben!: () => void;
  t.setBegin(() => new Promise((r) => { freigeben = () => r({ ...CODE }); }));
  const erster = t.st.beginLogin();
  await warte();
  t.setBegin(() => Promise.resolve({ ...CODE, userCode: 'NEU-CODE' }));
  const zweiter = t.st.beginLogin();
  freigeben();
  await assert.rejects(erster, /ersetzt/);
  assert.equal((await zweiter).userCode, 'NEU-CODE');
});

test('Laufende Anmeldung: der Code steht im Status (Seitenwechsel), danach nicht mehr — und nie im Log', async () => {
  const t = aufbau({ twitchTokens: undefined });
  await t.st.beginLogin();
  const s = t.st.status();
  assert.equal(s.anmeldeCode?.userCode, CODE.userCode, 'nach Seitenwechsel holt der Renderer den Code per Pull');
  assert.equal(s.anmeldeCode?.verificationUri, CODE.verificationUri);
  assert.ok((s.anmeldeCode?.gueltigBis ?? 0) > Date.now(), 'Ablauf liegt in der Zukunft');
  assert.equal(t.pushes[t.pushes.length - 1]?.anmeldeCode?.userCode, CODE.userCode, 'auch im Push');
  t.s.twitchTokens = TOKENS;
  t.warter[0]?.ok(TOKENS);
  await warte();
  assert.equal(t.st.status().anmeldeCode, undefined, 'nach dem Login weg');
  assert.ok(!t.logs.some((l) => l.includes(CODE.userCode)));

  const t2 = aufbau({ twitchTokens: undefined });
  await t2.st.beginLogin();
  await t2.st.logout();
  assert.equal(t2.st.status().anmeldeCode, undefined, 'nach Trennen weg');
});
