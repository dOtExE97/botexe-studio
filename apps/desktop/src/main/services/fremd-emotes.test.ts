import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sevenTvEmotes, bttvEmotes, ffzEmotes, FremdEmotes } from './fremd-emotes';
import { normalizeTwitch } from '../adapters/twitch-normalize';

// Ausschnitte aus echten Antworten (13.11.2026), gekürzt.
const SIEBEN_GLOBAL = { id: 'x', emotes: [{ id: '01FCY771D800007PQ2DF3GDTN6', name: 'RainTime', data: { animated: true, host: { url: '//cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6', files: [] } } }] };
const SIEBEN_KANAL = { emote_set: { emotes: [{ id: 'abc', name: 'catJAM', data: { animated: true, host: { url: '//cdn.7tv.app/emote/abc' } } }] } };
const BTTV_GLOBAL = [{ id: '54fa8fce01e468494b85b53c', code: 'CiGrip', imageType: 'png', animated: false }];
const BTTV_KANAL = { channelEmotes: [{ id: '5f1b0186cf6d2144653d2970', code: 'catJAM', animated: true }], sharedEmotes: [] };
const FFZ = [{ id: 9, code: 'ZrehplaR', images: { '1x': 'https://cdn.betterttv.net/frankerfacez_emote/9/1', '2x': 'https://cdn.betterttv.net/frankerfacez_emote/9/2' }, animated: false }];

test('7TV: Name, Bild-Adresse aus host.url, animiert', () => {
  assert.deepEqual(sevenTvEmotes(SIEBEN_GLOBAL), [['RainTime', { quelle: '7tv', id: '01FCY771D800007PQ2DF3GDTN6', bild: 'https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6/2x.webp', animiert: true }]]);
  assert.equal(sevenTvEmotes(SIEBEN_KANAL)[0]?.[0], 'catJAM');
  assert.deepEqual(sevenTvEmotes({ status: 'Not Found', error_code: 12000 }), []);
});
test('7TV: fremde Bild-Hosts werden verworfen', () => {
  assert.deepEqual(sevenTvEmotes({ emotes: [{ id: 'a', name: 'Boese', data: { host: { url: '//evil.example/x' } } }] }), []);
});
test('BTTV: global (Liste) und Kanal (channel/shared)', () => {
  assert.equal(bttvEmotes(BTTV_GLOBAL)[0]?.[1].bild, 'https://cdn.betterttv.net/emote/54fa8fce01e468494b85b53c/2x');
  assert.equal(bttvEmotes(BTTV_KANAL)[0]?.[1].animiert, true);
  assert.deepEqual(bttvEmotes({ message: 'user not found' }), []);
});
test('FFZ: 2x-Bild, Zahl-ID als Text', () => {
  assert.deepEqual(ffzEmotes(FFZ), [['ZrehplaR', { quelle: 'ffz', id: '9', bild: 'https://cdn.betterttv.net/frankerfacez_emote/9/2', animiert: false }]]);
});

test('Laden: Kanal-Emotes schlagen globale, 7TV gewinnt; 404 ist kein Fehler', async () => {
  const antworten: Record<string, unknown> = {
    'https://7tv.io/v3/emote-sets/global': SIEBEN_GLOBAL,
    'https://api.betterttv.net/3/cached/emotes/global': BTTV_GLOBAL,
    'https://api.betterttv.net/3/cached/frankerfacez/emotes/global': FFZ,
    'https://7tv.io/v3/users/twitch/42': SIEBEN_KANAL,
    'https://api.betterttv.net/3/cached/users/twitch/42': BTTV_KANAL,
  };
  const logs: string[] = [];
  const f = new FremdEmotes({
    fetch: (async (url: string) => (url in antworten ? { ok: true, json: async () => antworten[url] } : { ok: false, json: async () => ({}) })) as unknown as typeof fetch,
    now: () => 0, log: (_s, t) => logs.push(t),
  });
  await f.laden('42');
  assert.equal(f.finde('catJAM')?.quelle, '7tv');
  assert.equal(f.finde('CiGrip')?.quelle, 'bttv');
  assert.equal(f.finde('catjam'), undefined, 'Groß-/Kleinschreibung zählt');
  assert.equal(f.anzahl, 4);
  assert.match(logs[0] ?? '', /4 \(davon 2 eigene/);
});
test('Laden: alles offline → alte Liste bleibt, Warnung', async () => {
  const logs: string[] = [];
  const f = new FremdEmotes({ fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch, now: () => 0, log: (s, t) => logs.push(s + t) });
  await f.laden('42');
  assert.equal(f.anzahl, 0);
  assert.match(logs[0] ?? '', /^warn/);
});

test('Chat: Fremd-Emote mitten im Satz wird Sticker an der richtigen Stelle, Kürzel nicht im Text', () => {
  const finde = (w: string) => (w === 'catJAM' ? { quelle: '7tv' as const, id: 'abc', bild: 'https://cdn.7tv.app/emote/abc/2x.webp', animiert: true } : undefined);
  const [nachricht, emote] = normalizeTwitch('channel.chat.message', {
    chatter_user_id: '1', chatter_user_login: 'a', chatter_user_name: 'A', broadcaster_user_id: '2',
    message: { text: 'hallo catJAM du', fragments: [{ type: 'text', text: 'hallo catJAM du' }] },
  }, 0, undefined, finde);
  assert.equal(nachricht?.text, 'hallo  du');
  assert.deepEqual(nachricht?.sticker, [{ id: 'twitch-7tv-abc', bild: 'https://cdn.7tv.app/emote/abc/2x.webp', index: 6, animiert: true }]);
  assert.equal(emote?.type, 'emote');
});
test('Chat: ohne Finder bleibt alles Text (alter Weg)', () => {
  const [n] = normalizeTwitch('channel.chat.message', { chatter_user_id: '1', message: { text: 'catJAM', fragments: [{ type: 'text', text: 'catJAM' }] } }, 0);
  assert.equal(n?.text, 'catJAM');
  assert.equal(n?.sticker, undefined);
});
