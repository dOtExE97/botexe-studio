import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTriggerAction,
  validateTriggerRule,
  validateChatCommand,
  validateTriggerRules,
  validateChatCommands,
  validateRedemption,
  validateRedemptions,
  validatePanelButton,
  validatePanelButtons,
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

test('Action: spin_slot/start_gift_challenge/lucky_draw werden NICHT gefiltert (P2-Audit Regression)', () => {
  // Diese drei kinds unterstützt die Trigger-Engine (TriggerActionKind in
  // packages/trigger-engine/src/index.ts), fehlten aber im switch — der
  // `default: return null`-Zweig hätte sie stillschweigend verworfen.
  assert.deepEqual(
    validateTriggerAction({ kind: 'spin_slot', targetId: 't1', win: true, winnerIndex: 2, roll: 0.5 }),
    { kind: 'spin_slot', targetId: 't1', win: true, winnerIndex: 2, roll: 0.5 },
  );
  assert.equal(validateTriggerAction({ kind: 'spin_slot' }), null); // targetId fehlt

  assert.deepEqual(
    validateTriggerAction({ kind: 'start_gift_challenge', targetId: 'gm1', slug: 'rose', who: 'ExE' }),
    { kind: 'start_gift_challenge', targetId: 'gm1', slug: 'rose', who: 'ExE' },
  );
  assert.equal(validateTriggerAction({ kind: 'start_gift_challenge', targetId: 'gm1' }), null); // slug fehlt

  assert.deepEqual(
    validateTriggerAction({ kind: 'lucky_draw', targetId: 'gm1', win: false, winnerIndex: 0 }),
    { kind: 'lucky_draw', targetId: 'gm1', win: false, winnerIndex: 0 },
  );
  assert.equal(validateTriggerAction({ kind: 'lucky_draw' }), null); // targetId fehlt
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

test('Rule: gift_id_is/follow_first_time/like_count_gte werden NICHT gefiltert (P1-1 Regression)', () => {
  // Diese drei kinds unterstützt die Trigger-Engine (siehe TriggerCondition in
  // packages/trigger-engine/src/index.ts), fehlten aber in CONDITION_KINDS —
  // eine auf ein einzelnes Geschenk beschränkte Regel verlor dadurch beim
  // Import/Speichern ihre Einschränkung und feuerte auf JEDES Geschenk.
  const r = validateTriggerRule({
    ...validRule,
    conditions: [
      { kind: 'gift_id_is', value: 5655 },
      { kind: 'follow_first_time' },
      { kind: 'like_count_gte', value: 1000 },
    ],
  });
  assert.ok(r);
  assert.deepEqual(r.conditions, [
    { kind: 'gift_id_is', value: 5655 },
    { kind: 'follow_first_time' },
    { kind: 'like_count_gte', value: 1000 },
  ]);
});

test('Rule: gift_id_is ohne numerischen value → gefiltert', () => {
  const r = validateTriggerRule({
    ...validRule,
    conditions: [{ kind: 'gift_id_is', value: 'not-a-number' }],
  });
  assert.ok(r);
  assert.deepEqual(r.conditions, []);
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

// ── validateRedemption / validatePanelButton (P2-2-Audit) ─────────────────────
//
// Vorher wurden Einlösungen/Panel-Knöpfe an der IPC-/Backup-Grenze nur
// oberflächlich geprüft (Array.isArray, kein Check der einzelnen Aktionen).
// `actions: [null]` kam so bis zum Dispatcher durch und riss dort per
// TypeError den gesamten Event-Handler für dieses Ereignis ab.

const validRedemption = {
  id: 're1',
  name: 'Airhorn',
  command: '!airhorn',
  cost: 100,
  enabled: true,
  actions: [{ kind: 'play_sound', soundId: 's1' }],
};

test('Redemption: gültige Einlösung → durch', () => {
  const r = validateRedemption(validRedemption);
  assert.ok(r);
  assert.equal(r.command, '!airhorn');
  assert.equal(r.cost, 100);
  assert.equal(r.actions.length, 1);
});

test('Redemption: actions: [null] → Aktion gefiltert, keine gültige übrig → gesamte Einlösung null', () => {
  // Das ist genau das P2-2-Szenario: ein manipuliertes/kaputtes Backup mit
  // `actions: [null]` darf NIE bis zum Dispatcher durchkommen.
  assert.equal(validateRedemption({ ...validRedemption, actions: [null] }), null);
});

test('Redemption: gemischtes actions-Array — nur die gültige Aktion überlebt', () => {
  const r = validateRedemption({ ...validRedemption, actions: [null, { kind: 'nope' }, { kind: 'obs_scene', scene: 'A' }] });
  assert.ok(r);
  assert.deepEqual(r.actions, [{ kind: 'obs_scene', scene: 'A' }]);
});

test('Redemption: cost muss eine nicht-negative Zahl sein', () => {
  assert.equal(validateRedemption({ ...validRedemption, cost: -5 }), null);
  assert.equal(validateRedemption({ ...validRedemption, cost: 'free' }), null);
  const r = validateRedemption({ ...validRedemption, cost: 12.7 });
  assert.ok(r);
  assert.equal(r.cost, 12); // nonNegInt rundet ab
});

test('Redemption: fehlende Pflichtfelder / kein Objekt → null', () => {
  assert.equal(validateRedemption(null), null);
  assert.equal(validateRedemption({ ...validRedemption, id: undefined }), null);
  assert.equal(validateRedemption({ ...validRedemption, command: '' }), null);
  assert.equal(validateRedemption({ ...validRedemption, actions: 'nope' }), null);
});

test('validateRedemptions: filtert Müll aus gemischtem Array, kein Array → []', () => {
  const out = validateRedemptions([
    validRedemption,
    null,
    { ...validRedemption, id: 're2', actions: [null] }, // raus: keine gültige Aktion
    { ...validRedemption, id: 're3' },
  ]);
  assert.deepEqual(out.map((r) => r.id), ['re1', 're3']);
  assert.deepEqual(validateRedemptions('nope'), []);
});

const validPanelButton = { id: 'b1', label: 'Airhorn', action: { kind: 'play_sound', soundId: 's1' } };

test('PanelButton: gültiger Knopf → durch, inkl. optionalem accelerator', () => {
  const b = validatePanelButton({ ...validPanelButton, accelerator: 'CommandOrControl+1' });
  assert.ok(b);
  assert.equal(b.label, 'Airhorn');
  assert.equal(b.accelerator, 'CommandOrControl+1');
});

test('PanelButton: action: null → gesamter Knopf null (P2-2-Regression)', () => {
  assert.equal(validatePanelButton({ ...validPanelButton, action: null }), null);
  assert.equal(validatePanelButton({ ...validPanelButton, action: { kind: 'nope' } }), null);
});

test('PanelButton: fehlende Pflichtfelder / kein Objekt → null', () => {
  assert.equal(validatePanelButton(null), null);
  assert.equal(validatePanelButton({ ...validPanelButton, label: '' }), null);
});

test('validatePanelButtons: filtert Müll aus gemischtem Array, kein Array → []', () => {
  const out = validatePanelButtons([validPanelButton, null, { ...validPanelButton, id: 'b2', action: null }, 5]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, 'b1');
  assert.deepEqual(validatePanelButtons('nope'), []);
});

test('Regel-Validierung behält die Sperre pro Zuschauer', () => {
  // Sie fehlte im Validator — und weil die Oberfläche bei jeder Änderung die
  // KOMPLETTE Regelliste zurückschickt, löschte jeder Klick den Wert aus allen
  // Regeln. Die Regel feuerte danach für denselben Zuschauer beliebig oft,
  // ohne dass irgendwo etwas darauf hindeutete.
  const r = validateTriggerRule({
    id: 'r1', name: 'Danke', event: 'gift', enabled: true,
    actions: [{ kind: 'play_sound', soundId: 'boom.wav' }],
    cooldownMs: 5000,
    userCooldownMs: 60000,
  });
  assert.ok(r);
  assert.equal(r?.cooldownMs, 5000);
  assert.equal(r?.userCooldownMs, 60000, 'die Sperre pro Zuschauer darf nicht verloren gehen');
});
