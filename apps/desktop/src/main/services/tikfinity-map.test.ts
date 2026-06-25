import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTikfinity, collectSoundUrls } from './tikfinity-map';
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

test('collectSoundUrls sammelt audioUrl + soundsdatasource', () => {
  const c: TikfinityConfig = {
    actions: [{ id: 1, audioUrl: 'https://a/one.mp3' }],
    dynamicSettings: { soundsdatasource: JSON.stringify([{ soundUrl: 'https://b/two.mp3' }, { soundUrl: 'https://a/one.mp3' }]) },
  };
  const urls = collectSoundUrls(c);
  assert.equal(urls.length, 2, 'dedupliziert');
  assert.ok(urls.includes('https://a/one.mp3') && urls.includes('https://b/two.mp3'));
});
