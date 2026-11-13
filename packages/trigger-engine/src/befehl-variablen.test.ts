import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fuelleBefehlsVariablen, formatKiste, formatUptime, zielUser, braucheSong, pruefeBefehlsPause,
  piratenVorlagen, fehlendeVorlagen, renderSpeakTemplate, matchChatCommand,
  KEINE_KISTE_TEXT, KEINE_MUSIK_TEXT, LINK_FEHLT_TEXT, type ChatCommand, type StudioEvent,
} from './index';

test('formatKiste: deutsche Tausenderpunkte mit „Nr."', () => {
  assert.equal(formatKiste(7), 'Nr. 7');
  assert.equal(formatKiste(12345), 'Nr. 12.345');
  assert.equal(formatKiste(1234567), 'Nr. 1.234.567');
});

test('formatUptime: Stunden und Minuten', () => {
  assert.equal(formatUptime((2 * 60 + 14) * 60_000 + 30_000), '2 Std 14 Min');
  assert.equal(formatUptime(14 * 60_000), '14 Min');
  assert.equal(formatUptime(3 * 3_600_000), '3 Std');
  assert.equal(formatUptime(20_000), 'gerade eben');
});

test('zielUser: erstes Wort nach dem Befehl, ohne @', () => {
  assert.equal(zielUser('!hug @Mia'), 'Mia');
  assert.equal(zielUser('!hug Ben und alle'), 'Ben');
  assert.equal(zielUser('!hug'), '');
});

test('fuelleBefehlsVariablen: alle Werte vorhanden', () => {
  const t = '{song}|{uptime}|{kiste}|{follower}|{ziel}|{top}|{ziel_user}|{discord}|{befehle}';
  const out = fuelleBefehlsVariablen(t, '!hug @Mia', {
    song: { title: 'Seemannslied', artist: 'Santiano' },
    uptimeMs: 8_040_000,
    kiste: 12345,
    follower: 23,
    top: ['Anna', 'Ben', 'Carl', 'Dora'],
    links: { discord: ' discord.gg/piraten ' },
    befehle: ['!kiste', '!song'],
  });
  assert.equal(out, 'Seemannslied – Santiano|2 Std 14 Min|Nr. 12.345|23|23 von 50|1. Anna · 2. Ben · 3. Carl|Mia|discord.gg/piraten|!kiste · !song');
});

test('fuelleBefehlsVariablen: fehlende Werte → freundliche Texte, Ereignis-Platzhalter bleiben', () => {
  const out = fuelleBefehlsVariablen('{user}: {kiste} / {song} / {insta} / {ziel} / {args}', '!kiste', {});
  assert.equal(out, `{user}: ${KEINE_KISTE_TEXT} / ${KEINE_MUSIK_TEXT} / ${LINK_FEHLT_TEXT} / ? von 50 / {args}`);
  assert.match(fuelleBefehlsVariablen('{top}', '', {}), /noch niemand/);
  assert.match(fuelleBefehlsVariablen('{uptime}', '', { uptimeMs: null }), /kurzem/);
  assert.match(fuelleBefehlsVariablen('{ziel}', '', { follower: 51 }), /51 von 50 — geschafft/);
  assert.equal(fuelleBefehlsVariablen('{hug}', '', {}), '{hug}', 'unbekannte Platzhalter bleiben stehen');
});

test('fuelleBefehlsVariablen: Songtitel mit $-Mustern bleibt wörtlich', () => {
  assert.equal(fuelleBefehlsVariablen('{song}', '', { song: { title: 'Cash $& $1', artist: '' } }), 'Cash $& $1');
});

test('braucheSong', () => {
  assert.equal(braucheSong('🎵 {song}'), true);
  assert.equal(braucheSong('{user}'), false);
});

test('Pause: global 10 s, je Zuschauer 30 s', () => {
  const cmd = { id: 'k', cooldownMs: 10_000, userCooldownMs: 30_000 };
  const p = { global: new Map<string, number>(), jeUser: new Map<string, number>() };
  assert.deepEqual(pruefeBefehlsPause(cmd, 'mia', 0, p), { ok: true });
  const g = pruefeBefehlsPause(cmd, 'ben', 5_000, p);
  assert.equal(g.ok, false);
  assert.equal(!g.ok && g.grund, 'global');
  assert.equal(!g.ok && g.restMs, 5_000);
  assert.equal(pruefeBefehlsPause(cmd, 'ben', 11_000, p).ok, true, 'anderer Zuschauer nach der globalen Pause');
  const u = pruefeBefehlsPause(cmd, 'mia', 22_000, p);
  assert.equal(!u.ok && u.grund, 'user', 'Mia hat ihre eigene Pause noch');
  assert.equal(!u.ok && u.restMs, 8_000);
  assert.equal(pruefeBefehlsPause(cmd, 'mia', 30_000, p).ok, true);
});

test('Pause: gesperrte Versuche verlängern die Sperre nicht; ohne Pause wird nichts gemerkt', () => {
  const p = { global: new Map<string, number>(), jeUser: new Map<string, number>() };
  const cmd = { id: 'k', cooldownMs: 10_000 };
  pruefeBefehlsPause(cmd, 'a', 0, p);
  pruefeBefehlsPause(cmd, 'a', 9_000, p);
  assert.equal(pruefeBefehlsPause(cmd, 'a', 10_000, p).ok, true);
  const frei = { global: new Map<string, number>(), jeUser: new Map<string, number>() };
  pruefeBefehlsPause({ id: 'x' }, 'a', 0, frei);
  assert.equal(frei.global.size + frei.jeUser.size, 0);
});

test('Piraten-Vorlagen: vollständig, in den Chat, mit Pausen, matchen', () => {
  const v = piratenVorlagen();
  const befehle = v.map((c) => c.command);
  for (const b of ['!kiste', '!song', '!musik', '!uptime', '!discord', '!tiktok', '!insta', '!socials', '!lurk', '!ziel', '!befehle', '!hug', '!sr']) {
    assert.ok(befehle.includes(b), `${b} fehlt`);
  }
  assert.equal(new Set(v.map((c) => c.id)).size, v.length, 'ids eindeutig');
  for (const c of v) {
    assert.equal(c.sendToChat, true);
    assert.ok((c.cooldownMs ?? 0) >= 10_000 && (c.userCooldownMs ?? 0) >= 30_000, `${c.command} ohne Pause`);
  }
  assert.equal(v.find((c) => c.command === '!sr')?.aktion, 'song_request');
  assert.equal(matchChatCommand(v, '!hug @Mia')?.command, '!hug');
});

test('Vorlage !hug + !kiste ergeben den fertigen Text', () => {
  const v = piratenVorlagen();
  const ev: StudioEvent = { type: 'chat', ts: 1, plattform: 'twitch', user: { id: 'twitch:1', nickname: 'Käpt\'n' }, text: '!hug @Mia' };
  const hug = v.find((c) => c.command === '!hug')!;
  assert.equal(renderSpeakTemplate(fuelleBefehlsVariablen(hug.response, ev.text, {}), ev), 'Käpt\'n umarmt Mia 🤗');
  const kiste = v.find((c) => c.command === '!kiste')!;
  assert.equal(renderSpeakTemplate(fuelleBefehlsVariablen(kiste.response, '!kiste', { kiste: 4711 }), ev), '@Käpt\'n Dein Piraten-Token liegt in Kiste Nr. 4.711 🏴‍☠️');
});

test('fehlendeVorlagen: vorhandene Befehle (Schreibweise egal) werden nicht doppelt angelegt', () => {
  const eigen: ChatCommand = { id: 'cmd-1', command: '!Discord', response: 'meins', speak: true, sendToChat: false, enabled: true };
  const fehlend = fehlendeVorlagen([eigen]);
  assert.ok(!fehlend.some((c) => c.command === '!discord'));
  assert.equal(fehlend.length, piratenVorlagen().length - 1);
  assert.equal(fehlendeVorlagen([...piratenVorlagen()]).length, 0);
});
