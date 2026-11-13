import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTwitch, twitchEmoteBild, istGeschenkAbo } from './twitch-normalize';

// Beispiel-Ereignisse wörtlich aus docs/twitch-api-belege.md (Abschnitt 5).
const NOW = 1_700_000_000_000;

test('channel.follow → follow mit Twitch-Nutzer (Belege 5.1)', () => {
  const ev = normalizeTwitch('channel.follow', {
    user_id: '1337', user_login: 'awesome_user', user_name: 'Awesome_User',
    broadcaster_user_id: '12826', broadcaster_user_login: 'twitch',
    broadcaster_user_name: 'Twitch', followed_at: '2023-07-15T18:16:11.17106713Z',
  }, NOW);
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0], {
    type: 'follow', ts: NOW, plattform: 'twitch',
    user: { id: 'twitch:1337', userId: 'awesome_user', nickname: 'Awesome_User' },
  });
});

test('Profilbild aus dem Zwischenspeicher wird übernommen', () => {
  const ev = normalizeTwitch('channel.follow', { user_id: '1337', user_login: 'a', user_name: 'A' }, NOW,
    (id) => (id === '1337' ? 'https://bild/1337.png' : undefined));
  assert.equal(ev[0]?.user?.profilePic, 'https://bild/1337.png');
});

test('channel.chat.message (Doc-Beispiel) → chat, Badges → Mod/Sub (Belege 5.2)', () => {
  const ev = normalizeTwitch('channel.chat.message', {
    broadcaster_user_id: '1971641', broadcaster_user_login: 'streamer', broadcaster_user_name: 'streamer',
    chatter_user_id: '4145994', chatter_user_login: 'viewer32', chatter_user_name: 'viewer32',
    message_id: 'cc106a89-1814-919d-454c-f4f2f970aae7',
    message: { text: 'Hi chat', fragments: [{ type: 'text', text: 'Hi chat', cheermote: null, emote: null, mention: null }] },
    color: '#00FF7F',
    badges: [
      { set_id: 'moderator', id: '1', info: '' },
      { set_id: 'subscriber', id: '12', info: '16' },
      { set_id: 'sub-gifter', id: '1', info: '' },
    ],
    message_type: 'text', cheer: null, reply: null, channel_points_custom_reward_id: null,
    source_broadcaster_user_id: null, source_broadcaster_user_login: null, source_broadcaster_user_name: null,
    source_message_id: null, source_badges: null,
  }, NOW);
  assert.equal(ev.length, 1);
  const e = ev[0]!;
  assert.equal(e.type, 'chat');
  assert.equal(e.plattform, 'twitch');
  assert.equal(e.text, 'Hi chat');
  assert.equal(e.sticker, undefined);
  assert.deepEqual(e.user, { id: 'twitch:4145994', userId: 'viewer32', nickname: 'viewer32', isMod: true, isSub: true });
});

test('Chat ohne Badges: weder Mod noch Sub; der Kanal selbst zählt als Mod', () => {
  const zuschauer = normalizeTwitch('channel.chat.message', {
    broadcaster_user_id: '1', chatter_user_id: '2', chatter_user_login: 'z', chatter_user_name: 'Z',
    message: { text: 'hallo', fragments: [{ type: 'text', text: 'hallo' }] }, badges: [],
  }, NOW)[0]!;
  assert.equal(zuschauer.user?.isMod, undefined);
  assert.equal(zuschauer.user?.isSub, undefined);
  assert.equal(zuschauer.user?.isBroadcaster, undefined);
  const kanal = normalizeTwitch('channel.chat.message', {
    broadcaster_user_id: '1', chatter_user_id: '1', chatter_user_login: 'ich', chatter_user_name: 'Ich',
    message: { text: 'moin', fragments: [{ type: 'text', text: 'moin' }] }, badges: [],
  }, NOW)[0]!;
  assert.equal(kanal.user?.isMod, true);
  assert.equal(kanal.user?.isBroadcaster, true);
});

test('Chat mit 2 Emotes und Text dazwischen → Sticker an der richtigen Stelle, Kürzel nicht im Text', () => {
  const ev = normalizeTwitch('channel.chat.message', {
    broadcaster_user_id: '1', chatter_user_id: '2', chatter_user_login: 'z', chatter_user_name: 'Z',
    message: {
      text: 'Hi Kappa du LUL',
      fragments: [
        { type: 'text', text: 'Hi ', emote: null },
        { type: 'emote', text: 'Kappa', emote: { id: '25', emote_set_id: '0', owner_id: '0', format: ['static'] } },
        { type: 'text', text: ' du ', emote: null },
        { type: 'emote', text: 'LUL', emote: { id: 'emotesv2_abc', emote_set_id: '0', owner_id: '0', format: ['static', 'animated'] } },
      ],
    },
    badges: [],
  }, NOW);
  const chat = ev[0]!;
  assert.equal(chat.text, 'Hi  du ');
  assert.deepEqual(chat.sticker, [
    { id: 'twitch-25', bild: 'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0', index: 3, animiert: false },
    { id: 'twitch-emotesv2_abc', bild: 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_abc/animated/dark/2.0', index: 7, animiert: true },
  ]);
  // Je Emote ein eigenes 'emote'-Ereignis mit genau einem Sticker (wie TikTok).
  assert.equal(ev.length, 3);
  assert.deepEqual(ev.slice(1).map((e) => [e.type, e.sticker?.length, e.sticker?.[0]?.id, e.plattform]), [
    ['emote', 1, 'twitch-25', 'twitch'],
    ['emote', 1, 'twitch-emotesv2_abc', 'twitch'],
  ]);
});

test('Emote ohne Formatliste wird statisch angefragt (nie animiert raten)', () => {
  assert.equal(twitchEmoteBild('62836', false), 'https://static-cdn.jtvnw.net/emoticons/v2/62836/static/dark/2.0');
  const ev = normalizeTwitch('channel.chat.message', {
    chatter_user_id: '2', message: { fragments: [{ type: 'emote', text: 'X', emote: { id: '9' } }] },
  }, NOW);
  assert.equal(ev[0]?.sticker?.[0]?.animiert, false);
});

test('Leere Nachricht und fehlende Felder → kein Wurf', () => {
  const leer = normalizeTwitch('channel.chat.message', {
    chatter_user_id: '2', chatter_user_login: 'z', chatter_user_name: 'Z', message: { text: '', fragments: [] },
  }, NOW);
  assert.equal(leer[0]?.text, '');
  assert.doesNotThrow(() => normalizeTwitch('channel.chat.message', {}, NOW));
  const nackt = normalizeTwitch('channel.chat.message', {}, NOW)[0]!;
  assert.equal(nackt.type, 'chat');
  assert.equal(nackt.user, undefined);
  assert.equal(nackt.text, '');
  // Kaputte Fragmente: null-Einträge, Emote ohne Objekt, Text als Zahl.
  const kaputt = normalizeTwitch('channel.chat.message', {
    chatter_user_id: '2', message: { text: 'x', fragments: [null, { type: 'emote', text: 'K', emote: null }, { type: 'text', text: 5 }] },
    badges: [null, 'quatsch'],
  }, NOW)[0]!;
  // Emote ohne Emote-Objekt bleibt als Kürzel im Text stehen, statt zu verschwinden.
  assert.equal(kaputt.text, 'K');
  assert.equal(kaputt.sticker, undefined);
  for (const typ of ['channel.follow', 'channel.subscribe', 'channel.subscription.message', 'channel.subscription.gift',
    'channel.cheer', 'channel.raid', 'stream.online', 'stream.offline', 'gibts.nicht']) {
    assert.doesNotThrow(() => normalizeTwitch(typ, {}, NOW), typ);
    assert.doesNotThrow(() => normalizeTwitch(typ, null, NOW), typ);
    assert.doesNotThrow(() => normalizeTwitch(typ, 'quatsch', NOW), typ);
  }
});

test('Sehr langer Name bleibt unverändert (Kürzen ist Sache der Anzeige)', () => {
  const lang = 'X'.repeat(300);
  const ev = normalizeTwitch('channel.chat.message', { chatter_user_id: '2', chatter_user_name: lang, message: { text: 'a' } }, NOW);
  assert.equal(ev[0]?.user?.nickname, lang);
  assert.equal(ev[0]?.text, 'a'); // ohne Fragmente: Klartext
});

test('channel.subscribe → sub mit 1 Monat; Geschenk-Abo wird übersprungen (Belege 5.3)', () => {
  const neu = normalizeTwitch('channel.subscribe', {
    user_id: '1234', user_login: 'cool_user', user_name: 'Cool_User', broadcaster_user_id: '1337',
    broadcaster_user_login: 'cooler_user', broadcaster_user_name: 'Cooler_User', tier: '1000', is_gift: false,
  }, NOW);
  assert.deepEqual(neu, [{
    type: 'sub', ts: NOW, plattform: 'twitch', subMonths: 1,
    user: { id: 'twitch:1234', userId: 'cool_user', nickname: 'Cool_User' },
  }]);
  const geschenkt = { user_id: '1', user_login: 'a', user_name: 'A', tier: '1000', is_gift: true };
  assert.deepEqual(normalizeTwitch('channel.subscribe', geschenkt, NOW), []);
  assert.equal(istGeschenkAbo('channel.subscribe', geschenkt), true);
  assert.equal(istGeschenkAbo('channel.subscribe', { is_gift: false }), false);
  assert.equal(istGeschenkAbo('channel.follow', geschenkt), false);
});

test('channel.subscription.message → sub mit kumulierten Monaten und Text (Belege 5.4)', () => {
  const ev = normalizeTwitch('channel.subscription.message', {
    user_id: '1234', user_login: 'cool_user', user_name: 'Cool_User', broadcaster_user_id: '1337',
    broadcaster_user_login: 'cooler_user', broadcaster_user_name: 'Cooler_User', tier: '1000',
    message: { text: 'Love the stream! FevziGG', emotes: [{ begin: 23, end: 30, id: '302976485' }] },
    cumulative_months: 15, streak_months: 1, duration_months: 6,
  }, NOW);
  assert.equal(ev.length, 1);
  assert.equal(ev[0]?.type, 'sub');
  assert.equal(ev[0]?.subMonths, 15);
  assert.equal(ev[0]?.text, 'Love the stream! FevziGG');
  assert.equal(ev[0]?.user?.id, 'twitch:1234');
  // streak_months null (nicht geteilt) stört nicht.
  assert.doesNotThrow(() => normalizeTwitch('channel.subscription.message', { user_id: '1', streak_months: null, message: null }, NOW));
});

test('channel.subscription.gift → sub mit subGeschenk; anonym → Nutzer „Anonym" (Belege 5.5)', () => {
  const ev = normalizeTwitch('channel.subscription.gift', {
    user_id: '1234', user_login: 'cool_user', user_name: 'Cool_User', broadcaster_user_id: '1337',
    broadcaster_user_login: 'cooler_user', broadcaster_user_name: 'Cooler_User', total: 2, tier: '1000',
    cumulative_total: 284, is_anonymous: false,
  }, NOW);
  assert.deepEqual(ev[0]?.subGeschenk, { anzahl: 2, tier: '1000', anonym: false });
  assert.equal(ev[0]?.user?.nickname, 'Cool_User');
  const anonym = normalizeTwitch('channel.subscription.gift', {
    user_id: null, user_login: null, user_name: null, broadcaster_user_id: '1337', total: 5, tier: '2000',
    cumulative_total: null, is_anonymous: true,
  }, NOW);
  assert.equal(anonym[0]?.type, 'sub');
  assert.equal(anonym[0]?.user?.nickname, 'Anonym');
  assert.equal(anonym[0]?.user?.id, 'twitch:anonym');
  assert.deepEqual(anonym[0]?.subGeschenk, { anzahl: 5, tier: '2000', anonym: true });
});

test('channel.cheer → cheer mit Bits und Text; anonym (Belege 5.6)', () => {
  const ev = normalizeTwitch('channel.cheer', {
    is_anonymous: false, user_id: '1234', user_login: 'cool_user', user_name: 'Cool_User',
    broadcaster_user_id: '1337', broadcaster_user_login: 'cooler_user', broadcaster_user_name: 'Cooler_User',
    message: 'pogchamp', bits: 1000,
  }, NOW);
  assert.deepEqual(ev, [{
    type: 'cheer', ts: NOW, plattform: 'twitch', cheer: { bits: 1000 }, text: 'pogchamp',
    user: { id: 'twitch:1234', userId: 'cool_user', nickname: 'Cool_User' },
  }]);
  const anonym = normalizeTwitch('channel.cheer', { is_anonymous: true, user_id: null, user_login: null, user_name: null, message: '', bits: 100 }, NOW);
  assert.equal(anonym[0]?.user?.nickname, 'Anonym');
  assert.equal(anonym[0]?.cheer?.bits, 100);
  assert.equal(anonym[0]?.text, undefined);
});

test('channel.raid → raid mit Zuschauern, Nutzer = Raider-Kanal (Belege 5.7)', () => {
  const ev = normalizeTwitch('channel.raid', {
    from_broadcaster_user_id: '1234', from_broadcaster_user_login: 'cool_user', from_broadcaster_user_name: 'Cool_User',
    to_broadcaster_user_id: '1337', to_broadcaster_user_login: 'cooler_user', to_broadcaster_user_name: 'Cooler_User',
    viewers: 9001,
  }, NOW);
  assert.deepEqual(ev, [{
    type: 'raid', ts: NOW, plattform: 'twitch', raid: { viewers: 9001 },
    user: { id: 'twitch:1234', userId: 'cool_user', nickname: 'Cool_User' },
  }]);
});

test('stream.online/offline → keine Ereignisse (Belege 5.8)', () => {
  assert.deepEqual(normalizeTwitch('stream.online', {
    id: '9001', broadcaster_user_id: '1337', broadcaster_user_login: 'cool_user',
    broadcaster_user_name: 'Cool_User', type: 'live', started_at: '2020-10-11T10:11:12.123Z',
  }, NOW), []);
  assert.deepEqual(normalizeTwitch('stream.offline', { id: '9001', broadcaster_user_id: '1337' }, NOW), []);
});
