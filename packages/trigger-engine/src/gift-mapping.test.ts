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

// orderedGiftKeys: Server-Pendant zu itemsFromRules (widget-kit/gift-menu.js) —
// MUSS dessen Einschluss-/Dedup-/Reihenfolge-Logik exakt spiegeln, sonst zeigt
// das Rad ein anderes Feld als das, dessen Aktion serverseitig gefeuert wird.
import { orderedGiftKeys } from './gift-mapping';

test('orderedGiftKeys: gift-Regeln in Reihenfolge, dedupliziert, deaktivierte raus', () => {
  const rules: TriggerRule[] = [
    { id: 'a', name: 'a', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'Galaxy' }], actions: [] },
    { id: 'b', name: 'b', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'rose' }], actions: [] },
    { id: 'c', name: 'c', event: 'gift', enabled: true, conditions: [{ kind: 'gift_slug_is', value: 'galaxy' }], actions: [] }, // Dup (case)
    { id: 'd', name: 'd', event: 'gift', enabled: false, conditions: [{ kind: 'gift_slug_is', value: 'tiktok' }], actions: [] }, // aus
    { id: 'e', name: 'e', event: 'follow', enabled: true, conditions: [], actions: [] }, // kein gift
  ];
  assert.deepEqual(orderedGiftKeys(rules).map((k) => k.ruleId), ['a', 'b']);
  assert.deepEqual(orderedGiftKeys(rules)[0], { slug: 'Galaxy', giftId: 0, ruleId: 'a' });
});

test('orderedGiftKeys: gift_id_is als Schlüssel (#<id>), keine Regel ohne Gift-Bedingung', () => {
  const rules: TriggerRule[] = [
    { id: 'x', name: 'x', event: 'gift', enabled: true, conditions: [{ kind: 'gift_id_is', value: 5655 }], actions: [] },
    { id: 'y', name: 'y', event: 'gift', enabled: true, conditions: [{ kind: 'gift_coins_gte', value: 100 }], actions: [] }, // keine Gift-Bedingung
  ];
  assert.deepEqual(orderedGiftKeys(rules).map((k) => k.ruleId), ['x']);
  assert.deepEqual(orderedGiftKeys(rules)[0], { slug: '', giftId: 5655, ruleId: 'x' });
});
