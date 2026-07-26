import test from 'node:test';
import assert from 'node:assert/strict';
import type { TriggerRule } from '@botexe/trigger-engine';
import { matchingWheelSpins, planWheelSpins } from './wheel-gift';

test('matchingWheelSpins liefert IDs sichtbarer Räder mit passendem spinGift', () => {
  const layers = [
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'galaxy' } },
    { id: 'w2', widgetType: 'wheel', visible: true, props: { spinGift: 'rose' } },
    { id: 'w3', widgetType: 'wheel', visible: false, props: { spinGift: 'galaxy' } }, // unsichtbar
    { id: 'w4', widgetType: 'wheel', visible: true, props: { spinGift: '' } }, // leer = nie
    { id: 'g1', widgetType: 'gift-menu', visible: true, props: { spinGift: 'galaxy' } }, // kein Rad
  ];
  assert.deepEqual(matchingWheelSpins(layers, 'galaxy'), ['w1']);
  assert.deepEqual(matchingWheelSpins(layers, 'rose'), ['w2']);
  assert.deepEqual(matchingWheelSpins(layers, 'diamond'), []);
});

// planWheelSpins — Task 3 (Auto-Feuern): EIN Rad, EIN Gift-Trigger (galaxy →
// play_sound). autoFire:true muss genau EINEN spin_wheel (mit segmentIndex)
// UND genau EINEN play_sound (delayMs >= spinMs) liefern — nie mehr, nie
// weniger (kein Doppelfeuer).
test('planWheelSpins: autoFire true — spin_wheel (segmentIndex) + volle Aktion, verzögert um spinMs', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'galaxy', source: 'trigger', autoFire: true, spinMs: 4000 } },
  ];
  const plan = planWheelSpins(layers, 'galaxy', rules, () => 0);
  assert.equal(plan.length, 2, 'genau ein Spin + ein Aktions-Satz, kein Doppelfeuer');
  assert.deepEqual(plan[0], { ruleId: 'wheel-gift', action: { kind: 'spin_wheel', targetId: 'w1', segmentIndex: 0 } });
  assert.equal(plan[1]?.ruleId, 'r-galaxy');
  assert.equal(plan[1]?.action.kind, 'play_sound');
  assert.ok((plan[1]?.action.delayMs ?? 0) >= 4000, 'Aktion muss um mind. spinMs verzögert sein');
});

test('planWheelSpins: autoFire false — nur spin_wheel (roll-basiert), keine Aktion', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'galaxy', source: 'trigger', autoFire: false, spinMs: 4000 } },
  ];
  const plan = planWheelSpins(layers, 'galaxy', rules, () => 0);
  assert.equal(plan.length, 1, 'nur der Spin, keine Aktion');
  assert.deepEqual(plan[0], { ruleId: 'wheel-gift', action: { kind: 'spin_wheel', targetId: 'w1' } });
});

test('planWheelSpins: source liste (kein Auto-Feuern) — trotz autoFire-Häkchen nur spin_wheel', () => {
  const rules: TriggerRule[] = [
    { id: 'r-galaxy', name: 'Galaxy', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }] },
  ];
  const layers = [
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'galaxy', source: 'liste', autoFire: true, spinMs: 4000 } },
  ];
  const plan = planWheelSpins(layers, 'galaxy', rules, () => 0);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0], { ruleId: 'wheel-gift', action: { kind: 'spin_wheel', targetId: 'w1' } });
});
