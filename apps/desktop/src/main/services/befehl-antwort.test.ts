// befehl-antwort.test.ts — was ein Chat-Befehl antwortet und WOHIN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { piratenVorlagen, type StudioEvent } from '@botexe/trigger-engine';
import { planeBefehlsAntwort, songWunsch, srOhneWunsch, waehleSongTreffer, SR_NUR_EXPLICIT } from './befehl-antwort';
import { validateChatCommand } from './validators';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

const vorlage = (befehl: string) => piratenVorlagen().find((c) => c.command === befehl)!;

function chat(text: string, plattform?: 'twitch' | 'tiktok'): StudioEvent {
  return { type: 'chat', ts: 1, ...(plattform ? { plattform } : {}), user: { id: 'u1', nickname: 'Mia' }, text };
}

test('Twitch-Befehl → Antwort in den Twitch-Chat, TikTok/ohne Plattform → TikTok', () => {
  const c = vorlage('!kiste');
  assert.equal(planeBefehlsAntwort(c, c.response, chat('!kiste', 'twitch'), { kiste: 12345 }).chat, 'twitch');
  assert.equal(planeBefehlsAntwort(c, c.response, chat('!kiste', 'tiktok'), {}).chat, 'tiktok');
  assert.equal(planeBefehlsAntwort(c, c.response, chat('!kiste'), {}).chat, 'tiktok');
  assert.equal(planeBefehlsAntwort({ ...c, sendToChat: false }, c.response, chat('!kiste', 'twitch'), {}).chat, null);
});

test('Antworttexte der Vorlagen mit echten Werten', () => {
  const ev = chat('!x', 'twitch');
  const text = (b: string, w: Parameters<typeof planeBefehlsAntwort>[3]) => planeBefehlsAntwort(vorlage(b), vorlage(b).response, ev, w).chatText;
  assert.equal(text('!kiste', { kiste: 12345 }), '@Mia Dein Piraten-Token liegt in Kiste Nr. 12.345 🏴‍☠️');
  assert.equal(text('!song', { song: { title: 'Seemannslied', artist: 'Santiano' } }), '🎵 Gerade läuft: Seemannslied – Santiano');
  assert.equal(text('!musik', { song: null }), '🎵 Gerade läuft: Gerade läuft keine Musik');
  assert.equal(text('!uptime', { uptimeMs: (2 * 60 + 14) * 60_000 }), '⏱️ Wir segeln schon seit 2 Std 14 Min');
  assert.equal(text('!ziel', { follower: 23 }), 'Auf dem Weg zum Affiliate: 23 von 50 Follower ⚓');
  assert.equal(text('!lurk', {}), '@Mia versteckt sich im Krähennest 👀 Danke fürs Mitsegeln!');
  assert.equal(text('!discord', {}), '🏴‍☠️ Discord: (Link in den Einstellungen eintragen)');
  assert.equal(text('!befehle', { befehle: ['!kiste', '!lurk'] }), '📜 Befehle an Bord: !kiste · !lurk');
});

test('Sprechweg bekommt die Vorlage mit {user} noch offen (wird dort aussprechbar gemacht)', () => {
  const c = { ...vorlage('!kiste'), speak: true };
  const plan = planeBefehlsAntwort(c, c.response, chat('!kiste', 'twitch'), { kiste: 7 });
  assert.equal(plan.sprechen, true);
  assert.equal(plan.vorlage, '@{user} Dein Piraten-Token liegt in Kiste Nr. 7 🏴‍☠️');
});

test('Song-Wunsch: Text nach dem Befehl; ohne Wunsch eine Anleitung mit dem eigenen Befehl', () => {
  assert.equal(songWunsch('!sr Seemannslied Santiano'), 'Seemannslied Santiano');
  assert.equal(songWunsch('!sr'), '');
  assert.match(srOhneWunsch('!wunsch'), /!wunsch Seemannslied/);
});

test('Validator behält Pause je Zuschauer und Song-Wunsch, verwirft unbekannte Aktionen', () => {
  const sr = validateChatCommand(vorlage('!sr'));
  assert.equal(sr?.aktion, 'song_request');
  assert.equal(sr?.userCooldownMs, 60_000);
  assert.equal(sr?.cooldownMs, 10_000);
  const fremd = validateChatCommand({ ...vorlage('!kiste'), aktion: 'rm -rf', userCooldownMs: -1 });
  assert.ok(fremd);
  assert.equal(fremd?.aktion, undefined);
  assert.equal(fremd?.userCooldownMs, undefined);
});

/** Quelltext ohne Kommentarzeilen (wie tts-verdrahtung.test.ts). */
function echterCode(datei: string): string {
  return readFileSync(datei, 'utf-8').split('\n')
    .filter((z) => !z.trim().startsWith('//') && !z.trim().startsWith('*')).join('\n');
}

test('studio.ts: Befehle laufen über Pause, Plan und chatAntwort (Plattform des Befehls)', () => {
  const studio = echterCode(join(SRC, 'main', 'services', 'studio.ts'));
  assert.match(studio, /pruefeBefehlsPause\(cmd, event\.user\?\.id, event\.ts/);
  assert.match(studio, /planeBefehlsAntwort\(cmd, antwort, event, this\.befehlsWerte\(event, song\)\)/);
  assert.match(studio, /if \(plan\.chat\) this\.chatAntwort\(event, plan\.chatText\)/);
  assert.match(studio, /this\.commandUserCooldowns\.clear\(\)/, 'Session-Reset leert auch die Pausen je Zuschauer.');
});

test('Review M2: Platzhalter werden EINMAL aufgelöst — Zuschauertext mit {..} vervielfacht sich nicht', () => {
  const cmd = { speak: true, sendToChat: true };
  const ev = chat('!hug {text}{text}{text} {args}', 'twitch');
  const p = planeBefehlsAntwort(cmd, '{user} umarmt {ziel_user}', ev, {});
  assert.equal(p.chatText, 'Mia umarmt texttexttext');
  assert.ok(!p.vorlage.includes('{text}'), 'auch der Sprechweg bekommt keinen Platzhalter aus Zuschauertext');
  // {args}/{text} selbst: der eingesetzte Text wird nicht noch einmal durchsucht.
  assert.equal(planeBefehlsAntwort(cmd, '>{args}<', chat('!x {user} {text}'), {}).chatText, '>{user} {text}<');
  // Songtitel mit Klammern
  assert.equal(planeBefehlsAntwort(cmd, '{song}', ev, { song: { title: '{user}', artist: '' } }).chatText, 'user');
  // Nickname mit „$&" bleibt wörtlich
  const dollar: StudioEvent = { type: 'chat', ts: 1, user: { id: 'u', nickname: 'a$&b' }, text: '!x' };
  assert.equal(planeBefehlsAntwort(cmd, 'hi {user}', dollar, {}).chatText, 'hi a$&b');
});

test('Review M6: !sr nimmt den ersten Treffer ohne Explicit; nur Explicit → eigene Antwort', () => {
  const hits = [{ uri: 'a', explicit: true }, { uri: 'b', explicit: false }];
  assert.equal(waehleSongTreffer(hits, true), hits[1]);
  assert.equal(waehleSongTreffer(hits, false), hits[0]);
  assert.equal(waehleSongTreffer([{ uri: 'a', explicit: true }], true), 'nur-explicit');
  assert.equal(waehleSongTreffer([], true), null);
  assert.match(SR_NUR_EXPLICIT, /Explicit/);
});

test('Review M6: studio.ts — !sr ist ohne Angabe explicit-frei, Spotify liefert `explicit` mit', () => {
  const studio = readFileSync(join(SRC, 'main', 'services', 'studio.ts'), 'utf8');
  assert.match(studio, /this\.spotifyRequest\(wunsch, \{ ohneExplicit: cmd\.ohneExplicit !== false \}\)/);
  assert.match(studio, /waehleSongTreffer\(hits, opts\.ohneExplicit === true\)/);
  assert.match(studio, /r\.nurExplicit\) antwort = SR_NUR_EXPLICIT/);
  const spotify = readFileSync(join(SRC, 'main', 'services', 'spotify-service.ts'), 'utf8');
  assert.match(spotify, /explicit: t\.explicit === true/);
  assert.equal(validateChatCommand({ id: 'x', command: '!sr', response: '', speak: false, sendToChat: true, enabled: true, aktion: 'song_request', ohneExplicit: false })?.ohneExplicit, false);
});
