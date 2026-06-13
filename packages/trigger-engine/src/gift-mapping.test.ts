// gift-mapping.test.ts — die Galerie ordnet einem Gift Aktionen zu. Das macht
// im Hintergrund genau EINE „kanonische" Trigger-Regel pro Gift (id giftmap-…).
// Daneben können auf der Trigger-Seite beliebig viele EIGENE Regeln dasselbe
// Gift referenzieren — beides soll nebeneinander existieren.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { TriggerRule } from './index';
import { giftRuleId, findGiftRule, upsertGiftRule, otherGiftRules } from './gift-mapping';

test('upsertGiftRule legt eine neue kanonische Regel für das Gift an', () => {
  const rules = upsertGiftRule([], 'Rose', [{ kind: 'play_sound', soundId: 's.mp3' }]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0]?.id, giftRuleId('Rose'));
  assert.equal(rules[0]?.event, 'gift');
  assert.deepEqual(rules[0]?.conditions, [{ kind: 'gift_slug_is', value: 'Rose' }]);
  assert.equal(rules[0]?.actions.length, 1);
});

test('upsertGiftRule aktualisiert die bestehende Regel statt zu duplizieren', () => {
  let rules = upsertGiftRule([], 'Rose', [{ kind: 'play_sound', soundId: 'a.mp3' }]);
  rules = upsertGiftRule(rules, 'rose', [
    { kind: 'play_sound', soundId: 'a.mp3' },
    { kind: 'fire_alert', targetId: 'fw' },
  ]);
  assert.equal(rules.filter((r) => r.id === giftRuleId('Rose')).length, 1, 'keine Duplikate');
  assert.equal(findGiftRule(rules, 'Rose')?.actions.length, 2);
});

test('upsertGiftRule mit leeren Aktionen entfernt die kanonische Regel', () => {
  let rules = upsertGiftRule([], 'Rose', [{ kind: 'play_sound', soundId: 'a.mp3' }]);
  rules = upsertGiftRule(rules, 'Rose', []);
  assert.equal(findGiftRule(rules, 'Rose'), undefined);
});

test('upsertGiftRule erhält enabled/cooldown der bestehenden Regel', () => {
  let rules = upsertGiftRule([], 'Rose', [{ kind: 'play_sound', soundId: 'a.mp3' }]);
  rules = rules.map((r) => ({ ...r, enabled: false, cooldownMs: 5000 }));
  rules = upsertGiftRule(rules, 'Rose', [{ kind: 'fire_alert', targetId: 'fw' }]);
  assert.equal(findGiftRule(rules, 'Rose')?.enabled, false);
  assert.equal(findGiftRule(rules, 'Rose')?.cooldownMs, 5000);
});

test('otherGiftRules findet fremde Regeln, die dasselbe Gift referenzieren — ohne die kanonische', () => {
  const own = upsertGiftRule([], 'Rose', [{ kind: 'play_sound', soundId: 'a.mp3' }]);
  const manual: TriggerRule = {
    id: 'rule-custom',
    name: 'Mega-Combo',
    event: 'gift',
    conditions: [{ kind: 'gift_slug_is', value: 'ROSE' }],
    actions: [{ kind: 'speak', template: 'Danke!' }],
    enabled: true,
  };
  const rules = [...own, manual];
  const others = otherGiftRules(rules, 'Rose');
  assert.equal(others.length, 1);
  assert.equal(others[0]?.id, 'rule-custom');
});
