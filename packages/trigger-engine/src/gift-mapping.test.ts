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

test('otherGiftRules findet auch Regeln mit abweichender Satzzeichen-/Leerzeichen-Schreibweise (giftKey-Fix)', () => {
  // Vorher verglich otherGiftRules nur mit trim()+toLowerCase() — das
  // tatsächliche Matching (conditionHolds, giftKey) ignoriert zusätzlich
  // Satzzeichen/Leerzeichen. "Finger Heart's" (Galerie-Slug) und
  // "finger hearts" (fremde Regel, andere Schreibweise) sind laut Engine
  // DASSELBE Gift, wurden hier aber als zwei verschiedene behandelt.
  const own = upsertGiftRule([], "Finger Heart's", [{ kind: 'play_sound', soundId: 'a.mp3' }]);
  const manual: TriggerRule = {
    id: 'rule-custom',
    name: 'Eigene Regel',
    event: 'gift',
    conditions: [{ kind: 'gift_slug_is', value: 'finger hearts' }],
    actions: [{ kind: 'speak', template: 'Danke!' }],
    enabled: true,
  };
  const rules = [...own, manual];
  const others = otherGiftRules(rules, "Finger Heart's");
  assert.equal(others.length, 1);
  assert.equal(others[0]?.id, 'rule-custom');
});

test('giftRuleId bleibt bei der schwächeren Normalisierung (Bestandsschutz persistierter IDs)', () => {
  // giftRuleId erzeugt die PERSISTIERTE Regel-id — hier bewusst NICHT auf
  // giftKey() umgestellt (siehe Kommentar in gift-mapping.ts): sonst würde
  // sich die id jedes bestehenden Gifts mit Satzzeichen/Leerzeichen beim
  // nächsten Speichern ändern und die alte Regel verwaisen.
  assert.equal(giftRuleId("Finger Heart's"), "giftmap-finger heart's");
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

// ── Golden-Fixture-Paritätstest ──────────────────────────────────────────
// orderedGiftKeys() UND das Rad-Widget (wheel.js: this.segments) entstehen
// beide aus itemsFromRules() (packages/widget-kit/gift-rules.js) — das ist
// die einzige Quelle, die beide Seiten teilen. Ein reiner Kommentar hätte die
// Drift aus Task 1/2 nicht verhindert (dort driftete genau das auseinander:
// eine textlose Regel zählte serverseitig mit, das Rad zeigte sie aber gar
// nicht als Segment). Dieser Test fixiert die Fixture-Erwartung UNABHÄNGIG
// von orderedGiftKeys()' Implementierung — bricht künftig jemand die
// gemeinsame Quelle wieder in zwei Kopien auseinander und lässt dabei den
// Textfilter aus, schlägt HIER etwas fehl, nicht erst live auf dem Rad.
import { itemsFromRules } from '../../widget-kit/gift-rules.js';

test('orderedGiftKeys deckt sich exakt mit den Rad-Segmenten (Golden Fixture)', () => {
  const rules: TriggerRule[] = [
    // 1) generischer Name („Gift: …"), Text kommt aus der Aktion → sichtbar.
    {
      id: 'r-rose', name: 'Gift: rose', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'rose' }],
      actions: [{ kind: 'play_sound', soundId: 'a.mp3' }],
    },
    // 2) KEINE Aktion, generischer Name → leerer Text. Zählt server- UND
    //    rad-seitig NICHT mit (der ursprüngliche Bug: diese Regel driftete
    //    den Server-Index gegen die Rad-Segmente).
    {
      id: 'r-empty', name: 'Gift: leer', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'leer' }],
      actions: [],
    },
    // 3) nicht-alphanumerischer Slug (Apostroph/Leerzeichen) — eigener Name.
    {
      id: 'r-fingerheart', name: "Finger Heart's Gruß", event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: "Finger Heart's" }],
      actions: [{ kind: 'speak', template: 'Danke!' }],
    },
    // 4) Duplikat per Groß-/Kleinschreibung desselben Slugs — muss wegfallen.
    {
      id: 'r-rose-dup', name: 'Rose nochmal', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_slug_is', value: 'ROSE' }],
      actions: [{ kind: 'fire_alert', targetId: 'fw' }],
    },
    // 5) nur gift_id_is (kein Slug) — eigener Name.
    {
      id: 'r-giftid', name: 'Galaxy-Geschenk', event: 'gift', enabled: true,
      conditions: [{ kind: 'gift_id_is', value: 5655 }],
      actions: [{ kind: 'spotify_request', query: '{{gift}}' }],
    },
    // 6) deaktivierte Regel — muss wegfallen.
    {
      id: 'r-disabled', name: 'Deaktiviert', event: 'gift', enabled: false,
      conditions: [{ kind: 'gift_slug_is', value: 'diamond' }],
      actions: [{ kind: 'play_sound', soundId: 'x.mp3' }],
    },
    // 7) kein Gift-Event — muss wegfallen.
    {
      id: 'r-follow', name: 'Follow-Regel', event: 'follow', enabled: true,
      conditions: [],
      actions: [{ kind: 'speak', template: 'Willkommen!' }],
    },
  ];

  // Was das Rad-Widget zeigt (wheel.js, this.segments): itemsFromRules() +
  // GENAU dieser Filter — Hand-erhaltene Erwartung, unabhängig importiert.
  const wheelSegments = itemsFromRules(rules).filter((it: { text: string }) => it.text);
  const wheelSlugs = wheelSegments.map((it: { slug: string }) => it.slug);

  const serverKeys = orderedGiftKeys(rules);

  assert.deepEqual(
    serverKeys.map((k) => k.slug),
    wheelSlugs,
    'Server-Gewinner-Index-Reihenfolge muss exakt den Rad-Segmenten entsprechen',
  );
  assert.equal(serverKeys.length, wheelSegments.length, 'gleiche Anzahl Einträge — kein Drift');
  assert.deepEqual(
    serverKeys.map((k) => k.ruleId),
    ['r-rose', 'r-fingerheart', 'r-giftid'],
    'r-empty (leerer Text), r-rose-dup (Duplikat), r-disabled und r-follow fallen bei BEIDEN Seiten gleichermaßen weg',
  );
});
