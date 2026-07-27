// gift-menu.test.ts — Parsing der Eintragsliste inkl. optionaler Challenge-Dauer
// sowie die reine Shuffle-Fahrplan-Logik der Lucky-Card (beides DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItems, shuffleSchedule, mergeGiftItems } from './gift-menu.js';

test('parseItems: 3. Feld = Sekunden, 2-Feld unverändert, :: im Text bleibt', () => {
  assert.deepEqual(parseItems('galaxy::still sein::60'), [{ slug: 'galaxy', text: 'still sein', secs: 60 }]);
  assert.deepEqual(parseItems('rose::Konfetti'), [{ slug: 'rose', text: 'Konfetti', secs: 0 }]);
  assert.deepEqual(parseItems('x::a::b::90'), [{ slug: 'x', text: 'a::b', secs: 90 }]); // :: im Text
  assert.deepEqual(parseItems('y::42'), [{ slug: 'y', text: '42', secs: 0 }]); // reine Zahl = Text, kein Timer
});

test('shuffleSchedule: aufsteigende Zeitpunkte, letzter ~= totalMs, ease-out', () => {
  const s = shuffleSchedule(10, 2000);
  assert.equal(s.length, 10);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1]); // monoton
  assert.ok(s[s.length - 1] <= 2000);
  assert.ok(s[1] - s[0] < s[s.length - 1] - s[s.length - 2]); // wird langsamer
});

// Regression: Nutzer-Meldung „Geschenk in der Tafel ausgewählt (per
// GiftPicker) UND per Trigger-Sound belegt, aber keine Feier". Root Cause:
// die Trigger-Regel feuerte über einen Coin-Schwellenwert (gift_coins_gte),
// nicht über den Gift-Namen — itemsFromRules() liefert dafür korrekt KEINEN
// Eintrag (kein bekannter Gift-Name), aber loadRules() überschrieb `this.list`
// bislang KOMPLETT mit dem (leeren/fremden) Trigger-Ergebnis und verwarf damit
// den manuell per GiftPicker gewählten Eintrag. mergeGiftItems() behebt das:
// Trigger-Einträge haben Vorrang, manuelle Einträge ergänzen nur Lücken.
test('mergeGiftItems: manueller Eintrag bleibt erhalten, wenn ihn kein Trigger ableiten konnte', () => {
  const derived = [{ slug: 'Rose', giftId: 0, text: 'Konfetti', ruleId: 'r1' }];
  const manual = parseItems('Hand Heart::Sound | Rose::Alter Text');
  // "Hand Heart" fehlt in derived → bleibt erhalten; "Rose" ist bereits über
  // den Trigger abgedeckt → der Trigger-Text gewinnt, kein Duplikat.
  assert.deepEqual(mergeGiftItems(derived, manual), [
    { slug: 'Rose', giftId: 0, text: 'Konfetti', ruleId: 'r1' },
    { slug: 'Hand Heart', text: 'Sound', secs: 0 },
  ]);
});

test('mergeGiftItems: leere/fehlende Listen brechen nicht (Guard gegen non-array)', () => {
  assert.deepEqual(mergeGiftItems([], []), []);
  assert.deepEqual(mergeGiftItems(undefined, [{ slug: 'x', text: 'y' }]), [{ slug: 'x', text: 'y' }]);
});
