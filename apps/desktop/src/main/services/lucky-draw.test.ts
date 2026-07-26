import test from 'node:test';
import assert from 'node:assert/strict';
import type { TriggerRule } from '@botexe/trigger-engine';
import { matchingLuckyLayers, luckyCardCount, planLuckyDraws } from './lucky-draw';

// matchingLuckyLayers — spiegelt matchingSlotLayers (slot-gift.ts): nur
// sichtbare gift-menu-Layer mit luckyMode:true UND passendem luckyGift-Prop.
// Anders als beim Automat gibt es HIER keine source-Einschränkung (siehe
// luckyCardCount für die Kartenzahl je Quelle).
test('matchingLuckyLayers: nur sichtbare gift-menu-Layer mit luckyMode:true + passendem luckyGift', () => {
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: 'galaxy' } },
    { id: 'g2', widgetType: 'gift-menu', visible: false, props: { luckyMode: true, luckyGift: 'galaxy' } }, // unsichtbar
    { id: 'g3', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: 'rose' } }, // anderes Gift
    { id: 'g4', widgetType: 'gift-menu', visible: true, props: { luckyMode: false, luckyGift: 'galaxy' } }, // Lucky-Draw aus
    { id: 'g5', widgetType: 'gift-menu', visible: true, props: { luckyGift: 'galaxy' } }, // luckyMode fehlt
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { luckyMode: true, luckyGift: 'galaxy' } }, // anderer Widget-Typ
  ];
  assert.deepEqual(
    matchingLuckyLayers(layers, 'galaxy').map((l) => l.id),
    ['g1'],
  );
});

test('matchingLuckyLayers: leerer Gift-Slug ⇒ nichts', () => {
  const layers = [{ id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: '' } }];
  assert.deepEqual(matchingLuckyLayers(layers, ''), []);
});

// luckyCardCount — trigger: orderedGiftKeys(rules).length (Parität mit
// itemsFromRules im Widget); liste: Einträge aus props.items, gezählt mit
// demselben Filter wie parseItems in gift-menu.js.
test('luckyCardCount: source:trigger ⇒ Anzahl aus orderedGiftKeys(rules)', () => {
  const rules: TriggerRule[] = [
    { id: 'a', name: 'a', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [] },
    { id: 'b', name: 'b', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'rose' }], actions: [] },
    { id: 'c', name: 'c', event: 'gift', enabled: false, conditions: [{ kind: 'gift_slug_is', value: 'tiktok' }], actions: [] }, // aus
  ];
  const layer = { id: 'g1', widgetType: 'gift-menu', visible: true, props: { source: 'trigger' } };
  assert.equal(luckyCardCount(layer, rules), 2);
});

test('luckyCardCount: source:liste ⇒ Anzahl aus props.items (wie parseItems gefiltert)', () => {
  const layer = {
    id: 'g1', widgetType: 'gift-menu', visible: true,
    props: { source: 'liste', items: 'Rose::Konfetti | Galaxy::Songwunsch::45 |   | ::nur Text' },
  };
  // 4 Segmente, eines davon leer (weder slug noch text) ⇒ 3 zählbare Einträge.
  assert.equal(luckyCardCount(layer, []), 3);
});

test('luckyCardCount: source fehlt ⇒ zählt wie liste (Default)', () => {
  const layer = { id: 'g1', widgetType: 'gift-menu', visible: true, props: { items: 'Rose::Konfetti | Galaxy::Songwunsch' } };
  assert.equal(luckyCardCount(layer, []), 2);
});

// planLuckyDraws — Gewinn (source:'trigger'): lucky_draw + volle Aktion,
// verzögert um luckyDrawMs.
test('planLuckyDraws: Gewinn (luckyChance 100, source:trigger) — lucky_draw + Aktion, verzögert um luckyDrawMs', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: 'galaxy', source: 'trigger', luckyChance: 100, luckyDrawMs: 4000 } },
  ];
  const plan = planLuckyDraws(layers, 'galaxy', rules, () => 0); // rollWin=0 < 1.0 ⇒ immer Gewinn, winnerIndex=0
  assert.equal(plan.length, 2, 'genau ein Draw + ein Aktions-Satz, kein Doppelfeuer');
  assert.deepEqual(plan[0], { ruleId: 'lucky-draw', action: { kind: 'lucky_draw', targetId: 'g1', win: true, winnerIndex: 0, roll: 0 } });
  assert.equal(plan[1]?.ruleId, 'r-galaxy');
  assert.equal(plan[1]?.action.kind, 'play_sound');
  assert.ok((plan[1]?.action.delayMs ?? 0) >= 4000, 'Aktion muss um mind. luckyDrawMs verzögert sein');
});

test('planLuckyDraws: Niete (luckyChance 0) — nur lucky_draw, keine Aktion', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: 'galaxy', source: 'trigger', luckyChance: 0, luckyDrawMs: 4000 } },
  ];
  const plan = planLuckyDraws(layers, 'galaxy', rules, () => 0.999);
  assert.equal(plan.length, 1, 'nur der Draw, keine Aktion');
  assert.equal(plan[0]?.action.kind, 'lucky_draw');
  assert.equal((plan[0]?.action as { win?: boolean }).win, false);
});

test('planLuckyDraws: Gewinn bei source:liste ⇒ nur lucky_draw, keine Aktion (keine Regel zum Feuern)', () => {
  const rules: TriggerRule[] = [
    { id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }] },
  ];
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: 'galaxy', source: 'liste', items: 'Rose::x | Galaxy::y', luckyChance: 100, luckyDrawMs: 4000 } },
  ];
  const plan = planLuckyDraws(layers, 'galaxy', rules, () => 0);
  assert.equal(plan.length, 1, 'source:liste feuert keine Trigger-Aktion, nur den Draw');
  assert.equal(plan[0]?.action.kind, 'lucky_draw');
  assert.equal((plan[0]?.action as { win?: boolean }).win, true);
});

test('planLuckyDraws: nicht-matching Layer wird ignoriert ⇒ leerer Plan', () => {
  const rules: TriggerRule[] = [
    { id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }] },
  ];
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: false, luckyGift: 'galaxy', source: 'trigger', luckyChance: 100 } },
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'trigger', winChance: 100 } },
  ];
  const plan = planLuckyDraws(layers, 'galaxy', rules, () => 0);
  assert.deepEqual(plan, []);
});

test('planLuckyDraws: who wird in die lucky_draw-Aktion durchgereicht', () => {
  const rules: TriggerRule[] = [
    { id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [] },
  ];
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: 'galaxy', source: 'trigger', luckyChance: 100 } },
  ];
  const plan = planLuckyDraws(layers, 'galaxy', rules, () => 0, 'Mia');
  assert.equal((plan[0]?.action as { who?: string }).who, 'Mia');
});

test('planLuckyDraws: ohne who ⇒ Aktion trägt kein who-Feld', () => {
  const rules: TriggerRule[] = [
    { id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [] },
  ];
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { luckyMode: true, luckyGift: 'galaxy', source: 'trigger', luckyChance: 100 } },
  ];
  const plan = planLuckyDraws(layers, 'galaxy', rules, () => 0);
  assert.ok(!('who' in (plan[0]?.action ?? {})));
});
