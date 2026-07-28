import test from 'node:test';
import assert from 'node:assert/strict';
import type { TriggerRule } from '@botexe/trigger-engine';
import { planWheelSpins } from './wheel-gift';

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

// Regressionstest: Das eingestellte Geschenk und der Name im TikTok-Ereignis
// sind selten zeichengleich — TikTok liefert „Hat and Mustache", der Nutzer
// wählt/tippt „hat and mustache" oder „Hat-and-Mustache". Vorher verglich die
// Rad-Bindung buchstabengenau und das Rad drehte einfach nicht, obwohl ein
// Trigger auf dasselbe Geschenk daneben korrekt feuerte (die Trigger-Engine
// vergleicht seit jeher über giftKey).
test('planWheelSpins: findet das Rad auch bei abweichender Schreibweise', () => {
  const rules: TriggerRule[] = [
    {
      id: 'r-hm', name: 'Hut', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'Hat and Mustache' }],
      actions: [{ kind: 'play_sound', soundId: 'boom.mp3' }],
    },
  ];
  const layers = [
    { id: 'w1', widgetType: 'wheel', visible: true, props: { spinGift: 'Hat and Mustache', source: 'trigger', autoFire: true, spinMs: 1000 } },
  ];
  for (const gesendet of ['Hat and Mustache', 'hat and mustache', 'HAT-AND-MUSTACHE', "Hat  and  Mustache"]) {
    const plan = planWheelSpins(layers, gesendet, rules, () => 0);
    assert.equal(plan.length, 2, `Rad muss bei "${gesendet}" drehen`);
  }
  // Ein anderes Geschenk darf weiterhin NICHT auslösen.
  assert.equal(planWheelSpins(layers, 'Rose', rules, () => 0).length, 0, 'fremdes Geschenk loest nicht aus');
});
