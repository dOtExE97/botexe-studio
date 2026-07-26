import test from 'node:test';
import assert from 'node:assert/strict';
import { planSlotOutcome, matchingSlotLayers } from './slot-gift';

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
// sichtbare slot-machine-Layer, deren spinGift-Prop auf den Gift-Slug passt.
test('matchingSlotLayers: nur sichtbare slot-machine-Layer mit passendem spinGift', () => {
  const layers = [
    { id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: 'galaxy' } },
    { id: 's2', widgetType: 'slot-machine', visible: false, props: { spinGift: 'galaxy' } }, // unsichtbar
    { id: 's3', widgetType: 'slot-machine', visible: true, props: { spinGift: 'rose' } }, // anderes Gift
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'galaxy' } }, // anderer Widget-Typ
  ];
  assert.deepEqual(
    matchingSlotLayers(layers, 'galaxy').map((l) => l.id),
    ['s1'],
  );
});

test('matchingSlotLayers: leerer Gift-Slug ⇒ nichts', () => {
  const layers = [{ id: 's1', widgetType: 'slot-machine', visible: true, props: { spinGift: '' } }];
  assert.deepEqual(matchingSlotLayers(layers, ''), []);
});
