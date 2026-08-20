import test from 'node:test';
import assert from 'node:assert/strict';
import { stickerRuleId, findStickerRule, upsertStickerRule, otherStickerRules } from './sticker-mapping';
import type { TriggerRule, TriggerAction } from './index';

// FLACH — genau wie TriggerActionKind es definiert. Ein verschachteltes
// { kind: { kind: … } } wäre beim Speichern still verworfen worden.
const SOUND: TriggerAction = { kind: 'play_sound', soundId: 's1' };

test('upsertStickerRule: erzeugt eine ganz normale Regel, die die Trigger-Seite versteht', () => {
  const [r] = upsertStickerRule([], '7444741533452225312', [SOUND]);
  assert.equal(r?.event, 'emote');
  assert.deepEqual(r?.conditions, [{ kind: 'sticker_ist', value: '7444741533452225312' }]);
  assert.equal(r?.actions.length, 1);
  assert.equal(r?.enabled, true);
  assert.equal(r?.cooldownMs, 0, 'keine Abklingzeit — jeder Sticker feuert (ausdrueckliche Entscheidung)');
  assert.equal(r?.name, 'Sticker: #7444741533452225312', 'ohne eigenen Namen steht die Nummer da');
});

test('upsertStickerRule: eigener Name landet im Regel-Namen', () => {
  const [r] = upsertStickerRule([], '42', [SOUND], 'Lachsticker');
  assert.equal(r?.name, 'Sticker: Lachsticker');
});

test('upsertStickerRule: zweimal derselbe Sticker ergibt KEINE zweite Regel', () => {
  const erst = upsertStickerRule([], '42', [SOUND]);
  const zweit = upsertStickerRule(erst, '42', [SOUND]);
  assert.equal(zweit.length, 1, 'die bestehende Regel wird geaendert, nicht verdoppelt');
});

test('upsertStickerRule: eingestellte Abklingzeit und „aus" bleiben erhalten', () => {
  // Sonst wuerde jedes Speichern auf der Sticker-Seite die Einstellungen der
  // Trigger-Seite ueberschreiben.
  const bestand = upsertStickerRule([], '42', [SOUND]).map((r) => ({ ...r, cooldownMs: 5_000, enabled: false }));
  const [r] = upsertStickerRule(bestand, '42', [SOUND]);
  assert.equal(r?.cooldownMs, 5_000);
  assert.equal(r?.enabled, false);
});

test('upsertStickerRule: leere Aktionsliste entfernt die Regel', () => {
  const bestand = upsertStickerRule([], '42', [SOUND]);
  assert.deepEqual(upsertStickerRule(bestand, '42', []), []);
});

test('findStickerRule findet ueber die stabile id', () => {
  const bestand = upsertStickerRule([], '42', [SOUND]);
  assert.equal(findStickerRule(bestand, '42')?.id, stickerRuleId('42'));
  assert.equal(findStickerRule(bestand, '43'), undefined);
});

test('otherStickerRules: von Hand gebaute Regeln zum selben Sticker werden gefunden', () => {
  // Die Seite soll ehrlich sagen koennen „hier haengt noch etwas dran".
  const eigen: TriggerRule = {
    id: 'meine-regel', name: 'Mein Ding', event: 'emote',
    conditions: [{ kind: 'sticker_ist', value: '42' }],
    actions: [SOUND], enabled: true,
  };
  const bestand = upsertStickerRule([eigen], '42', [SOUND]);
  assert.deepEqual(otherStickerRules(bestand, '42').map((r) => r.id), ['meine-regel']);
  assert.deepEqual(otherStickerRules(bestand, '99'), []);
});
