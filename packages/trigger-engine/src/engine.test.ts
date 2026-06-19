import test from 'node:test';
import assert from 'node:assert/strict';
import { TriggerEngine, renderSpeakTemplate, type StudioEvent, type TriggerRule } from './index';

function giftEvent(overrides: Partial<StudioEvent> = {}): StudioEvent {
  return {
    type: 'gift',
    ts: 1_000,
    user: { id: 'u1', nickname: 'Anna' },
    gift: { slug: 'rose', count: 1, coinsPerUnit: 1, totalCoins: 1 },
    ...overrides,
  };
}

function rule(overrides: Partial<TriggerRule> = {}): TriggerRule {
  return {
    id: 'r1',
    name: 'Gift-Alert',
    event: 'gift',
    actions: [{ kind: 'fire_alert', targetId: 'alert-layer' }],
    enabled: true,
    ...overrides,
  };
}

test('regel matcht event-typ und liefert ihre actions mit ruleId', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule()]);

  const matches = engine.evaluate(giftEvent());

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.ruleId, 'r1');
  assert.deepEqual(matches[0]?.action, { kind: 'fire_alert', targetId: 'alert-layer' });
});

test('regel mit anderem event-typ matcht nicht', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ event: 'follow' })]);

  assert.deepEqual(engine.evaluate(giftEvent()), []);
});

test('deaktivierte regel matcht nie', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ enabled: false })]);

  assert.deepEqual(engine.evaluate(giftEvent()), []);
});

test('mehrere actions einer regel werden alle geliefert, in reihenfolge', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({
      actions: [
        { kind: 'play_sound', soundId: 'tada.mp3' },
        { kind: 'fire_alert', targetId: 'alert-layer' },
      ],
    }),
  ]);

  const matches = engine.evaluate(giftEvent());

  assert.deepEqual(
    matches.map((m) => m.action.kind),
    ['play_sound', 'fire_alert'],
  );
});

test('actions behalten ihr delayMs (Sequenzierung) durch die Engine', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({
      actions: [
        { kind: 'fire_alert', targetId: 'alert-layer' },
        { kind: 'play_sound', soundId: 'tada.mp3', delayMs: 500 },
        { kind: 'speak', template: 'Danke {user}!', delayMs: 2000 },
      ],
    }),
  ]);

  const matches = engine.evaluate(giftEvent());

  assert.deepEqual(
    matches.map((m) => m.action.delayMs ?? 0),
    [0, 500, 2000],
  );
});

// ── Zyklus 2: Bedingungen ────────────────────────────────────────────────

test('gift_coins_gte: matcht nur ab schwellwert', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ conditions: [{ kind: 'gift_coins_gte', value: 100 }] })]);

  const cheap = giftEvent({ gift: { slug: 'rose', count: 1, coinsPerUnit: 1, totalCoins: 1 } });
  const big = giftEvent({ gift: { slug: 'lion', count: 1, coinsPerUnit: 2999, totalCoins: 2999 } });
  const exact = giftEvent({ gift: { slug: 'hat', count: 2, coinsPerUnit: 50, totalCoins: 100 } });

  assert.equal(engine.evaluate(cheap).length, 0);
  assert.equal(engine.evaluate(big).length, 1);
  assert.equal(engine.evaluate(exact).length, 1, 'gte schließt exakten wert ein');
});

test('gift_slug_is: matcht exakten slug case-insensitive', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ conditions: [{ kind: 'gift_slug_is', value: 'Rose' }] })]);

  assert.equal(engine.evaluate(giftEvent()).length, 1); // slug 'rose'
  assert.equal(
    engine.evaluate(giftEvent({ gift: { slug: 'lion', count: 1, coinsPerUnit: 1, totalCoins: 1 } })).length,
    0,
  );
});

test('gift_count_gte: matcht combo ab N', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ conditions: [{ kind: 'gift_count_gte', value: 10 }] })]);

  assert.equal(engine.evaluate(giftEvent()).length, 0); // count 1
  assert.equal(
    engine.evaluate(giftEvent({ gift: { slug: 'rose', count: 12, coinsPerUnit: 1, totalCoins: 12 } })).length,
    1,
  );
});

test('chat_keyword: case-insensitive substring im text', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ event: 'chat', conditions: [{ kind: 'chat_keyword', value: 'hype' }] }),
  ]);

  const chat = (text: string): StudioEvent => ({ type: 'chat', ts: 1, text });

  assert.equal(engine.evaluate(chat('HYPE im chat!')).length, 1);
  assert.equal(engine.evaluate(chat('alles ruhig')).length, 0);
  assert.equal(engine.evaluate(chat('')).length, 0);
});

test('chat_first_time: matcht nur die allererste nachricht eines zuschauers', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ event: 'chat', conditions: [{ kind: 'chat_first_time' }] }),
  ]);

  const first: StudioEvent = { type: 'chat', ts: 1000, user: { id: 'u9', nickname: 'Neu' }, text: 'hi', firstOfUser: true };
  const again: StudioEvent = { type: 'chat', ts: 2000, user: { id: 'u9', nickname: 'Neu' }, text: 'nochmal' };

  assert.equal(engine.evaluate(first).length, 1);
  assert.equal(engine.evaluate(again).length, 0);
});

test('viewer_count_gte: matcht ab schwellwert', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ event: 'viewer_count', conditions: [{ kind: 'viewer_count_gte', value: 100 }] }),
  ]);

  assert.equal(engine.evaluate({ type: 'viewer_count', ts: 1, viewerCount: 99 }).length, 0);
  assert.equal(engine.evaluate({ type: 'viewer_count', ts: 1, viewerCount: 100 }).length, 1);
});

test('mehrere bedingungen sind UND-verknüpft', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({
      conditions: [
        { kind: 'gift_slug_is', value: 'rose' },
        { kind: 'gift_count_gte', value: 5 },
      ],
    }),
  ]);

  assert.equal(engine.evaluate(giftEvent()).length, 0); // rose, aber count 1
  assert.equal(
    engine.evaluate(giftEvent({ gift: { slug: 'rose', count: 5, coinsPerUnit: 1, totalCoins: 5 } })).length,
    1,
  );
  assert.equal(
    engine.evaluate(giftEvent({ gift: { slug: 'lion', count: 5, coinsPerUnit: 1, totalCoins: 5 } })).length,
    0,
  );
});

test('bedingung auf fehlendem feld matcht nicht (gift-bedingung bei chat-event)', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ event: 'chat', conditions: [{ kind: 'gift_coins_gte', value: 1 }] }),
  ]);

  assert.equal(engine.evaluate({ type: 'chat', ts: 1, text: 'hi' }).length, 0);
});

// ── Zyklus 3: Cooldown ───────────────────────────────────────────────────

test('cooldown: regel feuert innerhalb cooldownMs nicht erneut (basiert auf event.ts)', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ cooldownMs: 5_000 })]);

  assert.equal(engine.evaluate(giftEvent({ ts: 1_000 })).length, 1);
  assert.equal(engine.evaluate(giftEvent({ ts: 3_000 })).length, 0, 'noch im cooldown');
  assert.equal(engine.evaluate(giftEvent({ ts: 6_000 })).length, 1, 'cooldown abgelaufen');
});

test('cooldown ist pro regel unabhängig', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ id: 'a', cooldownMs: 10_000 }),
    rule({ id: 'b', actions: [{ kind: 'play_sound', soundId: 's.mp3' }] }),
  ]);

  assert.equal(engine.evaluate(giftEvent({ ts: 1_000 })).length, 2);
  const second = engine.evaluate(giftEvent({ ts: 2_000 }));
  assert.deepEqual(second.map((m) => m.ruleId), ['b'], 'nur regel ohne cooldown feuert');
});

test('nicht-matchende events starten keinen cooldown', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ cooldownMs: 5_000, conditions: [{ kind: 'gift_coins_gte', value: 100 }] }),
  ]);

  assert.equal(engine.evaluate(giftEvent({ ts: 1_000 })).length, 0); // zu billig
  assert.equal(
    engine.evaluate(
      giftEvent({ ts: 2_000, gift: { slug: 'lion', count: 1, coinsPerUnit: 500, totalCoins: 500 } }),
    ).length,
    1,
    'cooldown wurde durch nicht-match nicht gestartet',
  );
});

test('resetCooldowns: nach reset feuert regel sofort wieder', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ cooldownMs: 60_000 })]);

  assert.equal(engine.evaluate(giftEvent({ ts: 1_000 })).length, 1);
  engine.resetCooldowns();
  assert.equal(engine.evaluate(giftEvent({ ts: 2_000 })).length, 1);
});

test('setRules behält cooldown-stand bestehender regeln (config-update mitten im stream)', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ cooldownMs: 60_000 })]);
  assert.equal(engine.evaluate(giftEvent({ ts: 1_000 })).length, 1);

  engine.setRules([rule({ cooldownMs: 60_000 })]); // gleiche regel-id neu gesetzt
  assert.equal(engine.evaluate(giftEvent({ ts: 2_000 })).length, 0, 'cooldown überlebt setRules');
});

// ── Zyklus 4: speak-action (TTS) ─────────────────────────────────────────

test('speak-action wird wie jede andere action geliefert', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({
      actions: [{ kind: 'speak', template: '{user} hat {gift} geschickt, danke!' }],
    }),
  ]);

  const matches = engine.evaluate(giftEvent());
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0]?.action, {
    kind: 'speak',
    template: '{user} hat {gift} geschickt, danke!',
  });
});

test('renderSpeakTemplate füllt platzhalter aus dem event', () => {
  const e = giftEvent({
    user: { id: 'mia', nickname: 'Mia' },
    gift: { slug: 'Rose', count: 3, coinsPerUnit: 1, totalCoins: 3 },
  });
  assert.equal(
    renderSpeakTemplate('{user} schickt {count}x {gift} für {coins} Coins!', e),
    'Mia schickt 3x Rose für 3 Coins!',
  );
  assert.equal(
    renderSpeakTemplate('{user} sagt: {text}', { type: 'chat', ts: 1, user: { id: 'a', nickname: 'Anna' }, text: 'hi!' }),
    'Anna sagt: hi!',
  );
  assert.equal(
    renderSpeakTemplate('{user} folgt!', { type: 'follow', ts: 1 }),
    'Jemand folgt!',
    'fehlender user → "Jemand"',
  );
  // {args} = Chat-Text nach dem ersten Wort (Befehl) — für Song-Requests „!sr <Song>".
  assert.equal(
    renderSpeakTemplate('{args}', { type: 'chat', ts: 1, text: '!sr Bad Habits Ed Sheeran' }),
    'Bad Habits Ed Sheeran',
  );
  assert.equal(renderSpeakTemplate('{args}', { type: 'chat', ts: 1, text: '!skip' }), '', 'nur Befehl → leer');
});

// ── Zyklus 5: chat_command-bedingung ─────────────────────────────────────

test('chat_command: matcht "!hype" am anfang, case-insensitive, mit/ohne args', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ event: 'chat', conditions: [{ kind: 'chat_command', value: '!hype' }] })]);
  const chat = (text: string): StudioEvent => ({ type: 'chat', ts: 1, text });

  assert.equal(engine.evaluate(chat('!hype')).length, 1);
  assert.equal(engine.evaluate(chat('!HYPE jetzt geht ab')).length, 1, 'mit args + caps');
  assert.equal(engine.evaluate(chat('  !hype  ')).length, 1, 'mit whitespace');
  assert.equal(engine.evaluate(chat('!hypen')).length, 0, 'kein präfix-teilmatch');
  assert.equal(engine.evaluate(chat('mega !hype')).length, 0, 'nur am anfang');
  assert.equal(engine.evaluate(chat('hype')).length, 0, 'ohne !');
});

test('chat_command: value ohne ! wird trotzdem als befehl erkannt', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ event: 'chat', conditions: [{ kind: 'chat_command', value: 'discord' }] })]);
  assert.equal(engine.evaluate({ type: 'chat', ts: 1, text: '!discord' }).length, 1);
});

// ── Zyklus 6: timer-trigger ──────────────────────────────────────────────

test('evaluateTimer: timer-regel feuert erst nach ablauf des intervalls', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ id: 't1', event: 'timer', cooldownMs: 600_000, actions: [{ kind: 'play_sound', soundId: 's.mp3' }] }),
  ]);

  // erster tick: feuert sofort (noch nie gefeuert)
  assert.equal(engine.evaluateTimer(0).length, 1);
  assert.equal(engine.evaluateTimer(300_000).length, 0, 'noch im intervall');
  assert.equal(engine.evaluateTimer(600_000).length, 1, 'intervall abgelaufen');
});

test('evaluateTimer: ignoriert nicht-timer-regeln und deaktivierte', () => {
  const engine = new TriggerEngine();
  engine.setRules([
    rule({ id: 'gift', event: 'gift' }),
    rule({ id: 'off', event: 'timer', cooldownMs: 1000, enabled: false }),
    rule({ id: 'on', event: 'timer', cooldownMs: 1000 }),
  ]);
  const matches = engine.evaluateTimer(0);
  assert.deepEqual(matches.map((m) => m.ruleId), ['on']);
});

test('evaluateTimer: ohne cooldownMs feuert die timer-regel bei jedem tick', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ event: 'timer' })]);
  assert.equal(engine.evaluateTimer(0).length, 1);
  assert.equal(engine.evaluateTimer(1).length, 1);
});

test('spin_wheel-action wird mit targetId + cost geliefert', () => {
  const engine = new TriggerEngine();
  engine.setRules([rule({ event: 'chat', conditions: [{ kind: 'chat_command', value: '!spin' }],
    actions: [{ kind: 'spin_wheel', targetId: 'wheel-1', cost: 100 }] })]);
  const m = engine.evaluate({ type: 'chat', ts: 1, user: { id: 'mia', nickname: 'Mia' }, text: '!spin' });
  assert.equal(m.length, 1);
  assert.deepEqual(m[0]?.action, { kind: 'spin_wheel', targetId: 'wheel-1', cost: 100 });
});
