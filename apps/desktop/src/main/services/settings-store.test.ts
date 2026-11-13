import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SettingsStore,
  SETTINGS_SCHEMA_VERSION,
  redactSecretsForExport,
  stripSecretFieldsForImport,
  sanitizeSettingsPatch,
  einstellungenFuerRenderer,
} from './settings-store';
import type { Krypto } from './secret-box';
import type { TwitchTokens } from './twitch-auth';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
}

function writeSettings(dir: string, data: unknown): void {
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(data), 'utf-8');
}

test('Migration v4→v5: triggerRules bleiben, kaputte Regel fliegt raus, neue Felder als Default', () => {
  const dir = tmpDir();
  writeSettings(dir, {
    schemaVersion: 4,
    triggerRules: [
      { id: 'r1', name: 'Gut', event: 'gift', actions: [], enabled: true },
      { id: 'kaputt', name: 'fehlt event' }, // ungültig → verworfen
    ],
    points: { perChat: 5 }, // partial → mit Defaults gemerged
    // redemptions / panelButtons / audioOutputId fehlen (v4)
  });
  const s = new SettingsStore(dir).get();

  assert.equal(s.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(s.triggerRules.length, 1);
  assert.equal(s.triggerRules[0]?.id, 'r1');
  assert.deepEqual(s.redemptions, []);
  assert.deepEqual(s.panelButtons, []);
  assert.equal(s.audioOutputId, '');
  assert.equal(s.points.perChat, 5); // übernommen
  assert.equal(typeof s.points.perFollow, 'number'); // aus Defaults ergänzt
});

test('Migration: ungültige Einlösung/Panel-Knopf werden einzeln verworfen', () => {
  const dir = tmpDir();
  writeSettings(dir, {
    schemaVersion: 5,
    redemptions: [
      { id: 'ok', name: 'Airhorn', command: '!airhorn', cost: 100, actions: [], enabled: true },
      { id: 'bad', name: 'fehlt cost', command: '!x', actions: [], enabled: true }, // cost fehlt → raus
    ],
    panelButtons: [
      { id: 'pb', label: 'Knopf', action: { kind: 'play_sound', soundId: 's' } },
      { id: 'badpb', label: 'kein action' }, // action fehlt → raus
      { id: 'badaccel', label: 'x', action: {}, accelerator: 123 }, // accelerator nicht string → raus
    ],
  });
  const s = new SettingsStore(dir).get();

  assert.equal(s.redemptions.length, 1);
  assert.equal(s.redemptions[0]?.id, 'ok');
  assert.equal(s.panelButtons.length, 1);
  assert.equal(s.panelButtons[0]?.id, 'pb');
});

test('kaputtes settings.json → Defaults statt Crash', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ das ist kein json', 'utf-8');
  const s = new SettingsStore(dir).get();
  assert.equal(s.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.deepEqual(s.triggerRules, []);
  assert.deepEqual(s.redemptions, []);
});

test('get() liefert tiefe Kopie — Mutation leakt nicht in den Cache', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  const a = store.get();
  a.redemptions.push({ id: 'x', name: 'x', command: '!x', cost: 0, actions: [], enabled: true });
  (a.points as { perChat: number }).perChat = 999;
  const b = store.get();
  assert.equal(b.redemptions.length, 0); // Mutation an a hat den Cache NICHT verändert
  assert.notEqual(b.points.perChat, 999);
});

test('redactSecretsForExport: entfernt alle Geheimnisse, behält harmlose Felder', () => {
  const input = {
    lastUsername: 'alex',
    tiktokSessionId: 'sess', tiktokTargetIdc: 'idc', tiktokSignApiKey: 'sign',
    tiktokSignApiKeys: ['euler_a', 'euler_b'],
    ttsCredentials: { elevenlabs: { apiKey: 'k' } },
    controlToken: 'tok', sportApiKey: 'sport',
    aiApiKey: 'gemini-key', spotifyTokens: { accessToken: 'at', refreshToken: 'rt' },
    obs: { enabled: true, url: 'ws://x', password: 'geheim' },
    points: { perChat: 1 },
  } as unknown as Parameters<typeof redactSecretsForExport>[0];
  const out = redactSecretsForExport(input) as Record<string, unknown>;
  assert.equal(out.tiktokSessionId, undefined);
  assert.equal(out.tiktokTargetIdc, undefined);
  assert.equal(out.tiktokSignApiKey, undefined);
  assert.equal(out.tiktokSignApiKeys, undefined); // Ausweich-Keys sind ebenfalls geheim
  assert.equal(out.ttsCredentials, undefined);
  assert.equal(out.controlToken, undefined);
  assert.equal(out.sportApiKey, undefined);
  assert.equal(out.aiApiKey, undefined);
  assert.equal(out.spotifyTokens, undefined);
  assert.equal((out.obs as Record<string, unknown>).password, undefined);
  assert.equal((out.obs as Record<string, unknown>).url, 'ws://x'); // harmlose OBS-Felder bleiben
  assert.equal(out.lastUsername, 'alex');
  assert.deepEqual(out.points, { perChat: 1 });
});

test('stripSecretFieldsForImport: P1-2 Regression — aiApiKey aus importiertem Backup kann lokalen KI-Key NICHT überschreiben', () => {
  // Vorher: die Import-Whitelist in studio.ts#importConfig war eine von Hand
  // gepflegte Kopie der Export-Feldliste und hatte aiApiKey/spotifyTokens vergessen
  // → ein importiertes Backup konnte den lokal gespeicherten Gemini/KI-Key sowie
  // Spotify-OAuth-Tokens überschreiben. Jetzt: dieselbe Liste wie beim Export.
  const maliciousBackup = {
    lastUsername: 'evil',
    aiApiKey: 'stolen-or-stale-key',
    spotifyTokens: { accessToken: 'stolen', refreshToken: 'stolen' },
    tiktokSignApiKey: 'stolen-sign-key',
    controlToken: 'stolen-token',
    schemaVersion: 99,
    obs: { enabled: true, url: 'ws://evil', password: 'stolen-obs-pw' },
  } as Record<string, unknown>;
  const out = stripSecretFieldsForImport(maliciousBackup);
  assert.equal(out.aiApiKey, undefined);
  assert.equal(out.spotifyTokens, undefined);
  assert.equal(out.tiktokSignApiKey, undefined);
  assert.equal(out.controlToken, undefined);
  assert.equal(out.schemaVersion, undefined);
  assert.equal((out.obs as Record<string, unknown>).password, undefined);
  assert.equal((out.obs as Record<string, unknown>).url, 'ws://evil'); // harmlose OBS-Felder bleiben übernehmbar
  assert.equal(out.lastUsername, 'evil'); // harmlose Felder bleiben übernehmbar
  // Original bleibt unangetastet (neue Kopie zurückgegeben).
  assert.equal(maliciousBackup.aiApiKey, 'stolen-or-stale-key');
});

test('redactSecretsForExport: mutiert das Original NICHT (tiefe Kopie)', () => {
  const input = { tiktokSessionId: 'sess', obs: { password: 'geheim', url: 'u' } } as unknown as Parameters<typeof redactSecretsForExport>[0];
  redactSecretsForExport(input);
  const orig = input as unknown as { tiktokSessionId: string; obs: { password: string } };
  assert.equal(orig.tiktokSessionId, 'sess');
  assert.equal(orig.obs.password, 'geheim');
});

test('Migration v5→v6: altes tts.readWho → readGroups (Verhalten erhalten), kein readWho mehr', () => {
  const dir = tmpDir();
  writeSettings(dir, {
    schemaVersion: 5,
    tts: { enabled: true, readChat: true, readWho: 'followers', chatTemplate: '{user}: {text}' },
  });
  const s = new SettingsStore(dir).get();
  // 'followers' war hierarchisch (Follower + Subs + Mods)
  assert.deepEqual(s.tts.readGroups, ['followers', 'subs', 'mods']);
  assert.equal((s.tts as unknown as Record<string, unknown>).readWho, undefined);
  assert.equal(s.tts.chatTemplate, '{user}: {text}'); // andere Felder bleiben
});

test('Migration: fehlendes readWho/readGroups → Default ["all"]', () => {
  const dir = tmpDir();
  writeSettings(dir, { schemaVersion: 5, tts: { enabled: true } });
  const s = new SettingsStore(dir).get();
  assert.deepEqual(s.tts.readGroups, ['all']);
});

test('Neues readGroups wird unverändert übernommen (nicht überschrieben)', () => {
  const dir = tmpDir();
  writeSettings(dir, { schemaVersion: 6, tts: { enabled: true, readGroups: ['mods', 'subs'] } });
  const s = new SettingsStore(dir).get();
  assert.deepEqual(s.tts.readGroups, ['mods', 'subs']);
});

// ── P3a-Audit: sanitizeSettingsPatch — dieselbe Härtung, die vorher NUR im
// IPC.SETTINGS_UPDATE-Handler lag, muss jetzt auch den Backup-Import
// (studio.ts#importConfig) vor kaputten/manipulierten Feldern schützen. ──

test('sanitizeSettingsPatch: kaputter mixer (String statt Objekt) wird verworfen — aktueller Mixer bleibt', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  store.update({ mixer: { master: 0.5, channels: store.get().mixer.channels } });
  const current = store.get();

  const patch = sanitizeSettingsPatch({ mixer: 'laut' }, current);
  assert.equal(patch.mixer, undefined); // kein gültiges Objekt → nicht übernommen
});

test('sanitizeSettingsPatch: mixer.master als String wird von normalizeMixer geklemmt statt zu crashen', () => {
  const dir = tmpDir();
  const current = new SettingsStore(dir).get();
  const patch = sanitizeSettingsPatch({ mixer: { master: 'laut', channels: {} } }, current);
  assert.equal(typeof patch.mixer?.master, 'number');
  assert.ok(patch.mixer && patch.mixer.master >= 0 && patch.mixer.master <= 1);
});

test('sanitizeSettingsPatch: tiktokSignApiKeys — nur Strings, getrimmt, leere raus, max. 10', () => {
  const dir = tmpDir();
  const current = new SettingsStore(dir).get();
  const patch = sanitizeSettingsPatch(
    { tiktokSignApiKeys: ['  euler_a  ', '', 'euler_b', 42, null, 'euler_c'] },
    current,
  );
  assert.deepEqual(patch.tiktokSignApiKeys, ['euler_a', 'euler_b', 'euler_c'],
    'Nicht-Strings und Leere fliegen raus, der Rest wird getrimmt');
});

test('SettingsStore: tiktokSignApiKeys überleben Speichern/Laden (Runde durch den Tresor)', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  store.update({ tiktokSignApiKeys: ['euler_x', 'euler_y'] });
  // Frisch laden (neue Instanz), damit es wirklich von der Platte kommt.
  const wieder = new SettingsStore(dir).get();
  assert.deepEqual(wieder.tiktokSignApiKeys, ['euler_x', 'euler_y']);
});

test('sanitizeSettingsPatch: points.perChat als String (kaputtes Backup) wird ignoriert — aktueller Wert bleibt', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  store.update({ points: { ...store.get().points, perChat: 7 } });
  const current = store.get();

  const patch = sanitizeSettingsPatch({ points: { perChat: '10' } }, current);
  assert.equal(patch.points?.perChat, 7); // String verworfen, alter Wert bleibt
});

test('sanitizeSettingsPatch: obs mit falschen Feldtypen fällt pro Feld auf den aktuellen Wert zurück', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  store.update({ obs: { enabled: true, url: 'ws://echt', password: 'geheim' } });
  const current = store.get();

  const patch = sanitizeSettingsPatch({ obs: { enabled: 'ja', url: 123, password: 'neu' } }, current);
  assert.equal(patch.obs?.enabled, true); // 'ja' ist kein boolean → alter Wert
  assert.equal(patch.obs?.url, 'ws://echt'); // 123 ist kein string → alter Wert
  assert.equal(patch.obs?.password, 'neu'); // gültiger String → übernommen
});

test('sanitizeSettingsPatch: unbekannte/kaputte Felder tauchen nicht im Ergebnis auf (kein Prototype-Pollution-Vektor)', () => {
  const dir = tmpDir();
  const current = new SettingsStore(dir).get();
  const patch = sanitizeSettingsPatch(
    { __proto__: { polluted: true }, notAField: 'x', telemetry: 'kaputt' },
    current,
  );
  assert.equal((patch as Record<string, unknown>).notAField, undefined);
  assert.equal(patch.telemetry, undefined); // nur 'on'/'off' sind gültig
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('sanitizeSettingsPatch: import-artiges Rundum-kaputtes Backup korrumpiert settings.json NICHT', () => {
  // Simuliert genau das Szenario aus dem Audit: ein altes/manipuliertes Backup
  // mit falschen Typen in mixer/points/obs/tts landet über importConfig() im
  // Store — vorher ging das ROH durch settings.update() durch.
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  const before = store.get();

  const malformedBackup = {
    mixer: null,
    points: { perChat: 'zehn', enabled: 'nein' },
    obs: { enabled: 'ja', url: 42, password: {} },
    tts: { enabled: 'nope', volume: 'laut', tuning: 'kaputt' },
    moderation: { blockedWords: 'kein-array' },
    telemetry: 'invalid',
    autostart: 'yes',
  };
  const sanitized = sanitizeSettingsPatch(malformedBackup, before);
  store.update(sanitized);
  const after = store.get();

  // Nichts crasht, und die kaputten Werte landen NICHT im persistierten Store.
  assert.deepEqual(after.mixer, before.mixer);
  assert.equal(after.points.perChat, before.points.perChat);
  assert.equal(after.points.enabled, before.points.enabled);
  assert.equal(after.obs.enabled, before.obs.enabled);
  assert.equal(after.obs.url, before.obs.url);
  assert.equal(after.tts.enabled, before.tts.enabled);
  assert.equal(typeof after.tts.volume, 'number');
  assert.deepEqual(after.moderation.blockedWords, before.moderation.blockedWords);
  assert.equal(after.telemetry, before.telemetry);
  assert.equal(after.autostart, before.autostart);

  // Reload von Platte (simuliert Neustart) — bleibt konsistent, kein Crash.
  const reloaded = new SettingsStore(dir).get();
  assert.deepEqual(reloaded.mixer, before.mixer);
});

test('sanitizeSettingsPatch: gültige triggerRules/chatCommands werden durchgereicht (bereits vom Aufrufer validiert)', () => {
  const dir = tmpDir();
  const current = new SettingsStore(dir).get();
  const rules = [{ id: 'r1', name: 'x', event: 'gift', actions: [], enabled: true }];
  const patch = sanitizeSettingsPatch({ triggerRules: rules }, current);
  assert.deepEqual(patch.triggerRules, rules);
});

// ── Twitch ──────────────────────────────────────────────────────────────────

const xorKrypto: Krypto = {
  isEncryptionAvailable: () => true,
  encryptString: (t) => Buffer.from([...Buffer.from(t, 'utf-8')].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf-8'),
};

const twitchTokens: TwitchTokens = {
  accessToken: 'twitch-access-geheim',
  refreshToken: 'twitch-refresh-geheim',
  expiresAt: 123,
  scopes: ['user:read:chat'],
  userId: '42',
  login: 'alex',
};

test('Twitch: Standardwerte — keine Client-ID, keine Tokens, Auto-Verbinden an', () => {
  const s = new SettingsStore(tmpDir()).get();
  assert.equal(s.twitchClientId, '');
  assert.equal(s.twitchTokens, undefined);
  assert.equal(s.twitchAutoConnect, true);
});

test('Twitch: Tokens liegen verschlüsselt in settings.json und kommen beim Neustart zurück', () => {
  const dir = tmpDir();
  new SettingsStore(dir, xorKrypto).update({ twitchTokens, twitchClientId: 'abc123' });
  const datei = fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8');
  assert.ok(!datei.includes('twitch-access-geheim'), 'Access-Token steht im Klartext in der Datei');
  assert.ok(!datei.includes('twitch-refresh-geheim'), 'Refresh-Token steht im Klartext in der Datei');
  assert.ok(datei.includes('abc123'), 'die Client-ID ist öffentlich und bleibt lesbar');
  const neu = new SettingsStore(dir, xorKrypto).get();
  assert.deepEqual(neu.twitchTokens, twitchTokens);
});

test('Twitch: Abmelden (Tokens undefined) entfernt sie aus der Datei', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir, xorKrypto);
  store.update({ twitchTokens });
  store.update({ twitchTokens: undefined });
  assert.equal(new SettingsStore(dir, xorKrypto).get().twitchTokens, undefined);
});

test('Twitch: Backup-Export/-Import trägt keine Tokens', () => {
  const s = { ...new SettingsStore(tmpDir()).get(), twitchTokens };
  assert.equal(redactSecretsForExport(s).twitchTokens, undefined);
  assert.equal(stripSecretFieldsForImport({ twitchTokens, twitchClientId: 'abc' }).twitchTokens, undefined);
});

test('sanitizeSettingsPatch: Renderer darf Client-ID und Auto-Verbinden setzen, aber NIE Tokens', () => {
  const current = new SettingsStore(tmpDir()).get();
  const patch = sanitizeSettingsPatch({ twitchClientId: '  AbC123  ', twitchAutoConnect: false, twitchTokens }, current);
  assert.equal(patch.twitchClientId, 'AbC123');
  assert.equal(patch.twitchAutoConnect, false);
  assert.equal('twitchTokens' in patch, false);
});

test('sanitizeSettingsPatch: Twitch-Client-ID mit fremden Zeichen wird verworfen, leer = löschen', () => {
  const current = new SettingsStore(tmpDir()).get();
  assert.equal('twitchClientId' in sanitizeSettingsPatch({ twitchClientId: 'abc&scopes=chat:edit' }, current), false);
  assert.equal('twitchClientId' in sanitizeSettingsPatch({ twitchClientId: 'a'.repeat(65) }, current), false);
  assert.equal('twitchClientId' in sanitizeSettingsPatch({ twitchClientId: 42 }, current), false);
  assert.equal('twitchAutoConnect' in sanitizeSettingsPatch({ twitchAutoConnect: 'ja' }, current), false);
  assert.equal(sanitizeSettingsPatch({ twitchClientId: '   ' }, current).twitchClientId, '');
});

test('Laden: kaputte Twitch-Felder fallen auf Standard zurück', () => {
  const dir = tmpDir();
  writeSettings(dir, { schemaVersion: SETTINGS_SCHEMA_VERSION, twitchClientId: 7, twitchAutoConnect: 'ja' });
  const s = new SettingsStore(dir).get();
  assert.equal(s.twitchClientId, '');
  assert.equal(s.twitchAutoConnect, true);
});

test('einstellungenFuerRenderer (SETTINGS_GET): kein Twitch-Token, aber twitchConnected', () => {
  const basis = new SettingsStore(tmpDir()).get();
  const mit = einstellungenFuerRenderer({ ...basis, twitchTokens, twitchClientId: 'abc123' });
  assert.equal(mit.twitchTokens, undefined);
  assert.equal(mit.twitchConnected, true);
  assert.equal(mit.twitchClientId, 'abc123');
  assert.ok(!JSON.stringify(mit).includes('twitch-access-geheim'));
  assert.ok(!JSON.stringify(mit).includes('twitch-refresh-geheim'));
  const ohne = einstellungenFuerRenderer(basis);
  assert.equal(ohne.twitchConnected, false);
});

test('einstellungenFuerRenderer (SETTINGS_GET): die übrigen Geheimnisse bleiben draußen (Umzug aus main.ts)', () => {
  const basis = new SettingsStore(tmpDir()).get();
  const s = {
    ...basis,
    tiktokSessionId: 'g-sess', tiktokTargetIdc: 'g-idc', tiktokSignApiKey: 'g-sign', tiktokSignApiKeys: ['g-a', 'g-b'],
    sportApiKey: 'g-sport', aiApiKey: 'g-ai', controlToken: 'g-ctl',
    spotifyTokens: { accessToken: 'g-sp-at', refreshToken: 'g-sp-rt', expiresAt: 1 },
    obs: { enabled: true, url: 'ws://x', password: 'g-obs-pw' },
  };
  const r = einstellungenFuerRenderer(s);
  const json = JSON.stringify(r);
  for (const geheim of ['g-sess', 'g-idc', 'g-sign', 'g-a', 'g-b', 'g-sport', 'g-ai', 'g-ctl', 'g-sp-at', 'g-sp-rt', 'g-obs-pw']) {
    assert.ok(!json.includes(geheim), `${geheim} geht an den Renderer`);
  }
  assert.equal(r.ttsCredentials, undefined);
  assert.equal(r.tiktokLoggedIn, true);
  assert.equal(r.tiktokSignKeySet, true);
  assert.equal(r.tiktokSignKeyCount, 2);
  assert.equal(r.sportKeySet, true);
  assert.equal(r.aiKeySet, true);
  assert.equal(r.spotifyConnected, true);
  assert.equal(r.obsPasswordSet, true);
  assert.equal((r.obs as Record<string, unknown>).url, 'ws://x');
});

test('Twitch: andere Client-ID (Hand, Profilwechsel, Import) → alte Tokens werden verworfen', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir, xorKrypto);
  store.update({ twitchClientId: 'abc123', twitchTokens });
  store.update({ twitchClientId: 'abc123' }); // gleiche ID → bleibt
  assert.deepEqual(store.get().twitchTokens, twitchTokens);
  // Profilwechsel/Import laufen über sanitizeSettingsPatch → update()
  store.update(sanitizeSettingsPatch({ twitchClientId: 'andereid' }, store.get()));
  assert.equal(store.get().twitchTokens, undefined);
  assert.equal(new SettingsStore(dir, xorKrypto).get().twitchTokens, undefined, 'auch auf der Platte weg');
});

test('Twitch: Client-ID leeren → Tokens weg; ID + neue Tokens im selben Patch → neue Tokens bleiben', () => {
  const store = new SettingsStore(tmpDir(), xorKrypto);
  store.update({ twitchClientId: 'abc123', twitchTokens });
  store.update({ twitchClientId: '' });
  assert.equal(store.get().twitchTokens, undefined);
  store.update({ twitchClientId: 'neu1', twitchTokens });
  assert.deepEqual(store.get().twitchTokens, twitchTokens);
});

test('einstellungenFuerRenderer: kaputte Twitch-Tokens gelten als nicht verbunden', () => {
  const basis = new SettingsStore(tmpDir()).get();
  const r = einstellungenFuerRenderer({ ...basis, twitchTokens: { accessToken: 5 } as unknown as TwitchTokens });
  assert.equal(r.twitchConnected, false);
  assert.equal(r.twitchTokens, undefined);
});
