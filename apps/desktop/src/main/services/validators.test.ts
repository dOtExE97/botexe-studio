import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTriggerAction,
  validateTriggerRule,
  validateChatCommand,
  validateTriggerRules,
  validateChatCommands,
} from './validators';

// ── validateTriggerAction ─────────────────────────────────────────────────────

test('Action: gültiges play_sound → durch (mit volume)', () => {
  const a = validateTriggerAction({ kind: 'play_sound', soundId: 'snd-1', volume: 0.5 });
  assert.deepEqual(a, { kind: 'play_sound', soundId: 'snd-1', volume: 0.5 });
});

test('Action: speak ohne voice → durch, leeres template erlaubt', () => {
  assert.deepEqual(validateTriggerAction({ kind: 'speak', template: '' }), {
    kind: 'speak',
    template: '',
  });
});

test('Action: obs_visibility braucht alle drei Felder', () => {
  assert.deepEqual(
    validateTriggerAction({ kind: 'obs_visibility', scene: 'A', source: 'cam', visible: true }),
    { kind: 'obs_visibility', scene: 'A', source: 'cam', visible: true },
  );
  // visible fehlt
  assert.equal(validateTriggerAction({ kind: 'obs_visibility', scene: 'A', source: 'cam' }), null);
  // visible kein bool
  assert.equal(
    validateTriggerAction({ kind: 'obs_visibility', scene: 'A', source: 'cam', visible: 'yes' }),
    null,
  );
});

test('Action: send_chat + obs_scene + streamerbot_action', () => {
  assert.deepEqual(validateTriggerAction({ kind: 'send_chat', template: 'hi' }), {
    kind: 'send_chat',
    template: 'hi',
  });
  assert.deepEqual(validateTriggerAction({ kind: 'obs_scene', scene: 'Game' }), {
    kind: 'obs_scene',
    scene: 'Game',
  });
  assert.deepEqual(validateTriggerAction({ kind: 'streamerbot_action', action: 'Do' }), {
    kind: 'streamerbot_action',
    action: 'Do',
  });
});

test('Action: play_media braucht targetId', () => {
  assert.deepEqual(validateTriggerAction({ kind: 'play_media', targetId: 't1' }), {
    kind: 'play_media',
    targetId: 't1',
  });
  assert.equal(validateTriggerAction({ kind: 'play_media' }), null);
});

test('Action: delayMs wird übernommen wenn valide, sonst ignoriert', () => {
  assert.deepEqual(validateTriggerAction({ kind: 'obs_scene', scene: 'A', delayMs: 500 }), {
    kind: 'obs_scene',
    scene: 'A',
    delayMs: 500,
  });
  // negatives delayMs ignoriert
  assert.deepEqual(validateTriggerAction({ kind: 'obs_scene', scene: 'A', delayMs: -5 }), {
    kind: 'obs_scene',
    scene: 'A',
  });
});

test('Action: unbekannter kind → null', () => {
  assert.equal(validateTriggerAction({ kind: 'launch_nukes', x: 1 }), null);
});

test('Action: kein Objekt / fehlender kind → null', () => {
  assert.equal(validateTriggerAction(null), null);
  assert.equal(validateTriggerAction('speak'), null);
  assert.equal(validateTriggerAction([]), null);
  assert.equal(validateTriggerAction({ template: 'x' }), null);
});

test('Action: fehlende Pflichtfelder → null', () => {
  assert.equal(validateTriggerAction({ kind: 'play_sound' }), null);
  assert.equal(validateTriggerAction({ kind: 'speak' }), null);
  assert.equal(validateTriggerAction({ kind: 'counter_add', targetId: 't' }), null); // delta fehlt
});

test('Action: String-Capping greift (template ≤ 1000, voice ≤ 100)', () => {
  const longT = 'x'.repeat(2000);
  const longV = 'v'.repeat(300);
  const a = validateTriggerAction({ kind: 'speak', template: longT, voice: longV });
  assert.ok(a && a.kind === 'speak');
  assert.equal(a.template.length, 1000);
  assert.equal(a.voice?.length, 100);
});

test('Action: unbekannte Felder werden nicht durchgereicht', () => {
  const a = validateTriggerAction({ kind: 'obs_scene', scene: 'A', evil: 'payload' });
  assert.deepEqual(a, { kind: 'obs_scene', scene: 'A' });
  assert.equal((a as Record<string, unknown>)['evil'], undefined);
});

test('Action: spotify_control nur mit gültigem control', () => {
  assert.deepEqual(validateTriggerAction({ kind: 'spotify_control', control: 'play' }), {
    kind: 'spotify_control',
    control: 'play',
  });
  assert.equal(validateTriggerAction({ kind: 'spotify_control', control: 'explode' }), null);
});

// ── validateTriggerRule ───────────────────────────────────────────────────────

const validRule = {
  id: 'r1',
  name: 'Danke',
  event: 'gift',
  enabled: true,
  actions: [{ kind: 'speak', template: 'Danke {user}' }],
};

test('Rule: gültige Regel → durch', () => {
  const r = validateTriggerRule(validRule);
  assert.ok(r);
  assert.equal(r.id, 'r1');
  assert.equal(r.event, 'gift');
  assert.equal(r.enabled, true);
  assert.equal(r.actions.length, 1);
});

test('Rule: conditions + cooldownMs werden valide übernommen', () => {
  const r = validateTriggerRule({
    ...validRule,
    cooldownMs: 5000,
    conditions: [
      { kind: 'gift_coins_gte', value: 100 },
      { kind: 'chat_first_time' },
      { kind: 'broken' }, // wird gefiltert
    ],
  });
  assert.ok(r);
  assert.equal(r.cooldownMs, 5000);
  assert.deepEqual(r.conditions, [
    { kind: 'gift_coins_gte', value: 100 },
    { kind: 'chat_first_time' },
  ]);
});

test('Rule: ungültige Action wird gefiltert, Regel überlebt wenn ≥1 gültig', () => {
  const r = validateTriggerRule({
    ...validRule,
    actions: [{ kind: 'nope' }, { kind: 'obs_scene', scene: 'A' }],
  });
  assert.ok(r);
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0]?.kind, 'obs_scene');
});

test('Rule: leere/komplett ungültige actions → null', () => {
  assert.equal(validateTriggerRule({ ...validRule, actions: [] }), null);
  assert.equal(validateTriggerRule({ ...validRule, actions: [{ kind: 'nope' }] }), null);
});

test('Rule: actions kein Array → null', () => {
  assert.equal(validateTriggerRule({ ...validRule, actions: 'nope' }), null);
});

test('Rule: unbekannter event → null', () => {
  assert.equal(validateTriggerRule({ ...validRule, event: 'explosion' }), null);
});

test('Rule: fehlende id/name oder falsche Typen → null', () => {
  assert.equal(validateTriggerRule({ ...validRule, id: 123 }), null);
  assert.equal(validateTriggerRule({ ...validRule, name: undefined }), null);
  const { id: _id, ...noId } = validRule;
  assert.equal(validateTriggerRule(noId), null);
});

test('Rule: kein Objekt → null', () => {
  assert.equal(validateTriggerRule(null), null);
  assert.equal(validateTriggerRule([validRule]), null);
});

test('Rule: enabled fehlend → defensiv false', () => {
  const { enabled: _e, ...noEnabled } = validRule;
  const r = validateTriggerRule(noEnabled);
  assert.ok(r);
  assert.equal(r.enabled, false);
});

test('Rule: unbekannte Top-Level-Felder werden nicht durchgereicht', () => {
  const r = validateTriggerRule({ ...validRule, hacked: true, __proto__pollute: 1 });
  assert.ok(r);
  assert.equal((r as unknown as Record<string, unknown>)['hacked'], undefined);
});

// ── validateChatCommand ───────────────────────────────────────────────────────

const validCmd = {
  id: 'c1',
  command: '!discord',
  response: 'Komm auf den Discord!',
  speak: false,
  sendToChat: true,
  enabled: true,
};

test('Command: gültiger Befehl → durch', () => {
  const c = validateChatCommand(validCmd);
  assert.ok(c);
  assert.equal(c.command, '!discord');
  assert.equal(c.sendToChat, true);
});

test('Command: who + cooldownMs optional, valides who übernommen', () => {
  const c = validateChatCommand({ ...validCmd, who: 'mods', cooldownMs: 3000 });
  assert.ok(c);
  assert.equal(c.who, 'mods');
  assert.equal(c.cooldownMs, 3000);
});

test('Command: ungültiges who wird weggelassen', () => {
  const c = validateChatCommand({ ...validCmd, who: 'royalty' });
  assert.ok(c);
  assert.equal(c.who, undefined);
});

test('Command: fehlende/falsche Booleans → null', () => {
  assert.equal(validateChatCommand({ ...validCmd, speak: 'no' }), null);
  const { enabled: _e, ...noEnabled } = validCmd;
  assert.equal(validateChatCommand(noEnabled), null);
});

test('Command: fehlende Strings → null', () => {
  assert.equal(validateChatCommand({ ...validCmd, command: '' }), null);
  assert.equal(validateChatCommand({ ...validCmd, id: 42 }), null);
});

test('Command: response-Capping greift (≤ 1000)', () => {
  const c = validateChatCommand({ ...validCmd, response: 'y'.repeat(5000) });
  assert.ok(c);
  assert.equal(c.response.length, 1000);
});

test('Command: kein Objekt → null', () => {
  assert.equal(validateChatCommand(null), null);
  assert.equal(validateChatCommand('!hi'), null);
});

// ── Array-Validatoren ─────────────────────────────────────────────────────────

test('validateTriggerRules: filtert Müll aus gemischtem Array', () => {
  const out = validateTriggerRules([
    validRule,
    null,
    'garbage',
    { ...validRule, id: 'r2', event: 'bad' }, // raus: event ungültig
    { ...validRule, id: 'r3', actions: [] }, // raus: keine action
    { ...validRule, id: 'r4' }, // durch
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.id),
    ['r1', 'r4'],
  );
});

test('validateTriggerRules: kein Array → []', () => {
  assert.deepEqual(validateTriggerRules(null), []);
  assert.deepEqual(validateTriggerRules({ foo: 'bar' }), []);
  assert.deepEqual(validateTriggerRules(undefined), []);
});

test('validateChatCommands: filtert Müll, kein Array → []', () => {
  const out = validateChatCommands([validCmd, null, { ...validCmd, speak: 'x' }, 5]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, 'c1');
  assert.deepEqual(validateChatCommands('nope'), []);
});
