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
});
