import test from 'node:test';
import assert from 'node:assert/strict';
import type { TriggerRule } from '@botexe/trigger-engine';
import { planSlotOutcome, matchingSlotLayers, matchingGiftMenuLayers, planSlotSpins } from './slot-gift';

// planSlotOutcome — reine Logik (RNG injiziert): rollWin < winChance ⇒ Gewinn,
// winnerIndex kommt unabhängig davon aus rollPick (0..1) × n Symbole.
test('planSlotOutcome: rollWin < winChance ⇒ Gewinn, winnerIndex aus rollPick', () => {
  assert.deepEqual(planSlotOutcome(0.2, 0.5, 0.6, 4), { win: true, winnerIndex: 2 }); // 0.5*4=2
  assert.deepEqual(planSlotOutcome(0.8, 0.5, 0.6, 4), { win: false, winnerIndex: 2 }); // Niete
  assert.deepEqual(planSlotOutcome(0.0, 0.99, 1.0, 3), { win: true, winnerIndex: 2 }); // 100%
  assert.deepEqual(planSlotOutcome(0.0, 0.0, 0.0, 3), { win: false, winnerIndex: 0 }); // 0%
});

test('planSlotOutcome: winChance wird auf 0..1 geklemmt', () => {
  assert.equal(planSlotOutcome(0.5, 0.1, 5, 3).win, true); // >1 ⇒ wie 1
  assert.equal(planSlotOutcome(0.0, 0.1, -1, 3).win, false); // <0 ⇒ wie 0
});

test('planSlotOutcome: n<=0 ⇒ nie Gewinn, winnerIndex 0 (kein Absturz)', () => {
  assert.deepEqual(planSlotOutcome(0.0, 0.5, 1, 0), { win: false, winnerIndex: 0 });
  assert.deepEqual(planSlotOutcome(0.0, 0.5, 1, -2), { win: false, winnerIndex: 0 });
});

// matchingSlotLayers — spiegelt matchingWheelLayers (wheel-gift.ts): nur
// sichtbare slot-machine-Layer, deren spinGift-Prop auf den Gift-Slug passt —
// UND source:'trigger' (Parität, s. Kommentar an der Funktion).
test('matchingSlotLayers: nur sichtbare slot-machine-Layer mit passendem spinGift + source:trigger', () => {
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'trigger' } },
    { id: 's2', widgetType: 'slot-machine', visible: false, props: { spinGift: 'galaxy', source: 'trigger' } }, // unsichtbar
    { id: 's3', widgetType: 'slot-machine', visible: true, props: { spinGift: 'rose', source: 'trigger' } }, // anderes Gift
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'galaxy', source: 'trigger' } }, // anderer Widget-Typ
  ];
  assert.deepEqual(
    matchingSlotLayers(layers, 'galaxy').map((l) => l.id),
    ['s1'],
  );
});

test('matchingSlotLayers: source:liste wird NICHT gematcht (kein Server-winnerIndex ohne Trigger-Symbol-Parität)', () => {
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'liste' } },
    { id: 's2', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy' } }, // source fehlt ⇒ auch nicht trigger
  ];
  assert.deepEqual(matchingSlotLayers(layers, 'galaxy'), []);
});

test('matchingSlotLayers: leerer Gift-Slug ⇒ nichts', () => {
  const layers = [{ id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: '', source: 'trigger' } }];
  assert.deepEqual(matchingSlotLayers(layers, ''), []);
});

// planSlotSpins — Task 3 (Gewinn-Aktivierung): EIN Automat, EIN Gift-Trigger
// (galaxy → play_sound), winChance:100 ⇒ Gewinn garantiert. Muss genau EINEN
// spin_slot (win:true) UND genau EINEN play_sound (delayMs>=spinMs) liefern.
test('planSlotSpins: Gewinn (winChance 100) — spin_slot + volle Aktion, verzögert um spinMs', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'trigger', winChance: 100, spinMs: 4000 } },
  ];
  const plan = planSlotSpins(layers, 'galaxy', rules, () => 0); // rollWin=0 < 1.0 ⇒ immer Gewinn, winnerIndex=0
  assert.equal(plan.length, 2, 'genau ein Spin + ein Aktions-Satz, kein Doppelfeuer');
  assert.deepEqual(plan[0], { ruleId: 'slot-gift', action: { kind: 'spin_slot', targetId: 's1', win: true, winnerIndex: 0, roll: 0 } });
  assert.equal(plan[1]?.ruleId, 'r-galaxy');
  assert.equal(plan[1]?.action.kind, 'play_sound');
  assert.ok((plan[1]?.action.delayMs ?? 0) >= 4000, 'Aktion muss um mind. spinMs verzögert sein');
});

test('planSlotSpins: Niete (winChance 0) — nur spin_slot, keine Aktion', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'trigger', winChance: 0, spinMs: 4000 } },
  ];
  const plan = planSlotSpins(layers, 'galaxy', rules, () => 0.999);
  assert.equal(plan.length, 1, 'nur der Spin, keine Aktion');
  assert.equal(plan[0]?.action.kind, 'spin_slot');
  assert.equal((plan[0]?.action as { win?: boolean }).win, false);
});

test('planSlotSpins: source:liste wird nicht gematcht ⇒ kein Plan', () => {
  const rules: TriggerRule[] = [
    { id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }] },
  ];
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'liste', winChance: 100, spinMs: 4000 } },
  ];
  const plan = planSlotSpins(layers, 'galaxy', rules, () => 0);
  assert.deepEqual(plan, []);
});

// matchingGiftMenuLayers — Stück 3, Teil C: nur sichtbare gift-menu-Layer,
// KEINE Prop-Bindung (jeder sichtbare Slider bekommt das Signal, er entscheidet
// selbst per matchIndex, ob er das Geschenk kennt).
test('matchingGiftMenuLayers: nur sichtbare gift-menu-Layer, andere Widget-Typen ignoriert', () => {
  const layers = [
    { id: 'g1', widgetType: 'gift-menu', visible: true },
    { id: 'g2', widgetType: 'gift-menu', visible: false }, // unsichtbar
    { id: 's1', widgetType: 'slot-machine', visible: true }, // anderer Widget-Typ
  ];
  assert.deepEqual(matchingGiftMenuLayers(layers).map((l) => l.id), ['g1']);
});

// planSlotSpins + Geschenke-Slider (Stück 3, Teil C): bei Gewinn zusätzlich
// EIN start_gift_challenge pro sichtbarem gift-menu, verzögert um spinMs, mit
// dem Slug des GEWÜRFELTEN Gewinners (winnerIndex → orderedGiftKeys), nicht
// zwingend dem Gift, das den Automaten ausgelöst hat.
test('planSlotSpins: Gewinn ⇒ start_gift_challenge pro sichtbarem Geschenke-Slider, verzögert um spinMs', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'trigger', winChance: 100, spinMs: 4000 } },
    { id: 'gm1', widgetType: 'gift-menu', visible: true },
    { id: 'gm2', widgetType: 'gift-menu', visible: false }, // unsichtbar ⇒ kein Signal
  ];
  const plan = planSlotSpins(layers, 'galaxy', rules, () => 0, 'Mia');
  assert.equal(plan.length, 3, 'spin_slot + Aktions-Satz + genau ein Challenge-Signal (gm2 unsichtbar)');
  const challenge = plan.find((p) => p.action.kind === 'start_gift_challenge');
  assert.deepEqual(challenge, {
    ruleId: 'slot-gift-challenge',
    action: { kind: 'start_gift_challenge', targetId: 'gm1', slug: 'galaxy', who: 'Mia', delayMs: 4000 },
  });
});

test('planSlotSpins: Niete ⇒ kein start_gift_challenge, auch bei sichtbarem Geschenke-Slider', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'trigger', winChance: 0, spinMs: 4000 } },
    { id: 'gm1', widgetType: 'gift-menu', visible: true },
  ];
  const plan = planSlotSpins(layers, 'galaxy', rules, () => 0.999, 'Mia');
  assert.ok(!plan.some((p) => p.action.kind === 'start_gift_challenge'));
});

test('planSlotSpins: ohne who ⇒ Challenge-Aktion trägt kein who-Feld', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy', source: 'trigger', winChance: 100, spinMs: 4000 } },
    { id: 'gm1', widgetType: 'gift-menu', visible: true },
  ];
  const plan = planSlotSpins(layers, 'galaxy', rules, () => 0);
  const challenge = plan.find((p) => p.action.kind === 'start_gift_challenge');
  assert.deepEqual(challenge, {
    ruleId: 'slot-gift-challenge',
    action: { kind: 'start_gift_challenge', targetId: 'gm1', slug: 'galaxy', delayMs: 4000 },
  });
});
