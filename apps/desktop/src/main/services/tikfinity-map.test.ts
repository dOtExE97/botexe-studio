import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTikfinity, collectSoundUrls, mapWidgets } from './tikfinity-map';
import type { TikfinityConfig } from './tikfinity-decrypt';

let n = 0;
const newId = () => `id-${++n}`;
const soundId = (url: string) => (url.includes('applepay') ? 'snd-1' : undefined);

function cfg(events: unknown[], actions: unknown[]): TikfinityConfig {
  return { actions, dynamicSettings: { events: JSON.stringify(events) } };
}

test('Gift-Trigger (bestimmtes Gift) → gift-Regel mit gift_slug_is + TTS-Aktion', () => {
  n = 0;
  const r = mapTikfinity(
    cfg(
      [{ active: true, triggerTypeId: 4, giftName: 'Rose', actionIds: [1] }],
      [{ id: 1, textToSpeech: 'Danke für die Rose!', dynamicConfig: { ttsVoice: 'de_002', cooldown: 5 } }],
    ),
    soundId, newId,
  );
  assert.equal(r.triggerRules.length, 1);
  const rule = r.triggerRules[0]!;
  assert.equal(rule.event, 'gift');
  assert.deepEqual(rule.conditions, [{ kind: 'gift_slug_is', value: 'Rose' }]);
  assert.deepEqual(rule.actions, [{ kind: 'speak', template: 'Danke für die Rose!', voice: 'de_002' }]);
  assert.equal(rule.cooldownMs, 5000, 'Cooldown Sekunden→ms');
});

test('min_coins-Trigger → gift_coins_gte', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 3, minBarsAmount: 100, actionIds: [1] }], [{ id: 1, message: 'Wow!' }]),
    soundId, newId,
  );
  assert.deepEqual(r.triggerRules[0]?.conditions, [{ kind: 'gift_coins_gte', value: 100 }]);
  assert.deepEqual(r.triggerRules[0]?.actions, [{ kind: 'send_chat', template: 'Wow!' }]);
});

test('bestimmtes Gift MIT giftId → gift_id_is (sprachunabhängig, nicht der lokalisierte Name)', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 4, giftName: 'Goldenes Gamepad', giftId: 16369, actionIds: [1] }], [{ id: 1, message: 'Danke!' }]),
    soundId, newId,
  );
  assert.deepEqual(r.triggerRules[0]?.conditions, [{ kind: 'gift_id_is', value: 16369 }]);
  assert.ok(r.triggerRules[0]?.name.includes('Goldenes Gamepad'), 'Name bleibt im Regelnamen lesbar');
});

test('bestimmtes Gift OHNE giftId → gift_slug_is (Fallback auf Namen)', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 4, giftName: 'Rose', actionIds: [1] }], [{ id: 1, message: 'Danke!' }]),
    soundId, newId,
  );
  assert.deepEqual(r.triggerRules[0]?.conditions, [{ kind: 'gift_slug_is', value: 'Rose' }]);
});

test('Like-Trigger mit minLikesAmount → like_count_gte (Schwelle bleibt erhalten)', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 7, minLikesAmount: 50, actionIds: [1] }], [{ id: 1, message: '50 Likes!' }]),
    soundId, newId,
  );
  assert.deepEqual(r.triggerRules[0]?.conditions, [{ kind: 'like_count_gte', value: 50 }]);
});

test('userCooldown → userCooldownMs (Sekunden→ms)', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 9, actionIds: [1] }], [{ id: 1, message: 'Hi', dynamicConfig: { userCooldown: 30 } }]),
    soundId, newId,
  );
  assert.equal(r.triggerRules[0]?.userCooldownMs, 30000);
});

test('Befehl (triggerTypeId 2) → ChatCommand mit speak/sendToChat', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 2, chatCmd: '!discord', whichUserId: 1, actionIds: [1] }],
      [{ id: 1, message: 'discord.gg/xyz', textToSpeech: 'Discord-Link im Chat' }]),
    soundId, newId,
  );
  assert.equal(r.triggerRules.length, 0);
  assert.equal(r.chatCommands.length, 1);
  const c = r.chatCommands[0]!;
  assert.equal(c.command, 'discord');
  assert.equal(c.response, 'discord.gg/xyz');
  assert.equal(c.speak, true);
  assert.equal(c.sendToChat, true);
});

test('Sound-Aktion: ladbar → play_sound, nicht ladbar → skipped', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 9, actionIds: [1, 2] }],
      [{ id: 1, audioUrl: 'https://x/applepay.mp3' }, { id: 2, audioUrl: 'https://x/unbekannt.mp3' }]),
    soundId, newId,
  );
  assert.deepEqual(r.triggerRules[0]?.actions, [{ kind: 'play_sound', soundId: 'snd-1' }]);
  assert.ok(r.report.skipped.some((s) => s.includes('Sound nicht ladbar')));
});

test('inaktive Events + nicht-mappbare Aktionen werden übersprungen', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([
      { active: false, triggerTypeId: 9, actionIds: [1] },
      { active: true, triggerTypeId: 9, actionIds: [2] },
    ], [{ id: 1, message: 'x' }, { id: 2, keystrokes: 'ctrl+a' }]),
    soundId, newId,
  );
  assert.equal(r.triggerRules.length, 0, 'inaktiv übersprungen, keystroke-only ergibt keine Aktion');
  assert.ok(r.report.skipped.some((s) => s.includes('Tastendruck')));
});

test('mapWidgets: Glücksrad-Segmente (sortiert) + Social-Kanäle → Layer', () => {
  n = 0;
  const cfg = {
    dynamicSettings: {
      widget_wheelofactions_wheels: JSON.stringify([{ name: 'Mein Rad', segments: [{ text: 'B', order: 2 }, { text: 'A', order: 1 }, { text: '', order: 3 }] }]),
      widget_socialmediarotator_socials: JSON.stringify([{ platform: 'tiktok', username: 'exe' }, { platform: 'discord', username: 'link' }]),
    },
  };
  const r = mapWidgets(cfg, () => `w-${++n}`);
  // 2 Alert-Widgets (immer) + Rad + Social.
  assert.equal(r.layers.length, 4);
  const wheel = r.layers.find((l) => l.widgetType === 'wheel');
  assert.equal(wheel?.props?.segments, 'A|B', 'nach order sortiert, leere raus');
  assert.equal(wheel?.props?.title, 'Mein Rad');
  const social = r.layers.find((l) => l.widgetType === 'social-rotator');
  assert.equal(social?.props?.channels, 'tiktok:exe | discord:link');
});

test('visueller Gift-Trigger (nur Animation) → fire_alert auf unseren Gift-Alert statt wegfallen', () => {
  n = 0;
  const r = mapTikfinity(
    cfg(
      [{ active: true, triggerTypeId: 4, giftName: 'Rose', giftId: 5655, actionIds: [1] }],
      [{ id: 1, animationUrl: '/assets/lotties/x.json', name: 'Rosen-Effekt' }], // NUR Animation, kein Sound/TTS
    ),
    soundId, newId,
    { gift: 'alert-1', follow: 'alert-2' },
  );
  assert.equal(r.triggerRules.length, 1, 'Regel fällt NICHT weg (früher: „ohne Aktion")');
  const rule = r.triggerRules[0]!;
  assert.deepEqual(rule.actions, [{ kind: 'fire_alert', targetId: 'alert-1' }], 'Animation → unser Gift-Alert');
});

test('Gift-Trigger mit Sound + Animation → Sound bleibt, Alert kommt dazu', () => {
  n = 0;
  const r = mapTikfinity(
    cfg([{ active: true, triggerTypeId: 9, actionIds: [1] }], [{ id: 1, audioUrl: 'https://x/applepay.mp3', animationUrl: '/assets/lotties/y.json' }]),
    soundId, newId, { follow: 'alert-f' },
  );
  const acts = r.triggerRules[0]?.actions ?? [];
  assert.ok(acts.some((a) => a.kind === 'play_sound'), 'Sound bleibt');
  assert.ok(acts.some((a) => a.kind === 'fire_alert' && (a as { targetId: string }).targetId === 'alert-f'), 'Follow-Alert kommt dazu');
});

test('mapWidgets: immer Gift-/Follow-Alert für die Trigger-Ersetzung', () => {
  const r = mapWidgets({ dynamicSettings: {} }, () => 'x');
  const types = r.layers.map((l) => l.widgetType).sort();
  assert.deepEqual(types, ['follow-alert', 'gift-alert'], 'ohne genutzte Widgets bleiben nur die Alert-Ziele');
});

test('mapWidgets: v4-Design-Import — Coin-Glas, angepasstes Ziel, Chat, Top-Gifter', () => {
  n = 0;
  const cfg = {
    dynamicSettings: {
      widget_coinjar_gifttype: 'allGifts',
      widget_coinjar_displayalert: 'true',
      widget_chat_usernamecolornormal: '#bfbfbf',
      widget_chat_commentcolornormal: '#e8e8e8',
      widget_chat_fonttype: 'Exo 2',
      goal_likes_title: 'Like Ziel, bei erreichen = Tüte',
      goal_likes_value: '20000',
      widget_goallikes_fontcolor: '#3ed5f7',
      widget_goallikes_progress1color: '#02f01e',
      widget_goallikes_titleeffect: 'aurora',
      widget_goallikes_fonttype: 'Luckiest Guy',
      goal_coins_title: 'Earned Coins', // Standardtitel → NICHT importiert
      goal_coins_value: '500',
      widget_topgifter_fonttype: 'Luckiest Guy', // ≠ Exo 2 → importiert
      widget_topgifter_pointscolor: '#f2da00',
      widget_topgifter_showcrown: 'true',
    },
  };
  const r = mapWidgets(cfg, () => `w-${++n}`);
  // Alert-Widgets kommen immer dazu → nur die inhaltlichen Widgets prüfen.
  const types = r.layers.map((l) => l.widgetType).filter((t) => t !== 'gift-alert' && t !== 'follow-alert').sort();
  assert.deepEqual(types, ['chat-box', 'gift-jar', 'goal-bar', 'leaderboard']);

  const goal = r.layers.find((l) => l.widgetType === 'goal-bar');
  assert.equal(goal?.props?.metric, 'likes');
  assert.equal(goal?.props?.target, 20000);
  assert.equal(goal?.props?.label, 'Like Ziel, bei erreichen = Tüte');
  assert.equal(goal?.props?.theme, 'aurora', 'aurora-Effekt → aurora-Theme');
  assert.equal(goal?.props?.fontFamily, 'luckiest', 'Luckiest Guy → luckiest');
  assert.equal(goal?.props?.accent, '#02f01e');

  const board = r.layers.find((l) => l.widgetType === 'leaderboard');
  assert.equal(board?.props?.source, 'gifts');
  assert.equal(board?.props?.style, 'royal', 'showcrown → royal');

  assert.equal(r.layers.filter((l) => l.widgetType === 'goal-bar').length, 1, 'nur das angepasste Ziel, nicht das Standard-Coins-Ziel');
});

test('collectSoundUrls sammelt audioUrl + soundsdatasource', () => {
  const c: TikfinityConfig = {
    actions: [{ id: 1, audioUrl: 'https://a/one.mp3' }],
    dynamicSettings: { soundsdatasource: JSON.stringify([{ soundUrl: 'https://b/two.mp3' }, { soundUrl: 'https://a/one.mp3' }]) },
  };
  const urls = collectSoundUrls(c);
  assert.equal(urls.length, 2, 'dedupliziert');
  assert.ok(urls.includes('https://a/one.mp3') && urls.includes('https://b/two.mp3'));
});
