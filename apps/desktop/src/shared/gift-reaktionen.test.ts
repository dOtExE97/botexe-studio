import test from 'node:test';
import assert from 'node:assert/strict';
import { reaktionenFuerGift, hatEigeneReaktion, slugsAusFeldwert } from './gift-reaktionen';

const rose = { slug: 'Rose', giftId: 5655 };

test('Regel auf den Namen zählt als eigene Reaktion', () => {
  const q = { regeln: [{ name: 'Rose→Sound', event: 'gift', enabled: true, actions: [{ kind: 'play_sound' }], conditions: [{ kind: 'gift_slug_is', value: 'rose' }] }] };
  assert.equal(hatEigeneReaktion(rose, q), true);
});

test('Regel auf die Nummer (TikFinity-Import) zählt ebenfalls', () => {
  const q = { regeln: [{ name: 'Import', event: 'gift', enabled: true, actions: [{ kind: 'speak' }], conditions: [{ kind: 'gift_id_is', value: 5655 }] }] };
  assert.equal(hatEigeneReaktion(rose, q), true);
});

test('Ausgeschaltete Regel zählt NICHT — sonst behauptet die Galerie eine Reaktion, die im Stream ausbleibt', () => {
  const q = { regeln: [{ name: 'Aus', event: 'gift', enabled: false, actions: [{ kind: 'speak' }], conditions: [{ kind: 'gift_slug_is', value: 'Rose' }] }] };
  assert.equal(hatEigeneReaktion(rose, q), false);
});

test('Regel ohne Aktion zählt NICHT — sie tut nichts', () => {
  const q = { regeln: [{ name: 'Leer', event: 'gift', enabled: true, actions: [], conditions: [{ kind: 'gift_slug_is', value: 'Rose' }] }] };
  assert.equal(hatEigeneReaktion(rose, q), false);
});

test('Allgemein-Regeln (jedes Geschenk / ab X Coins) sind Reaktionen, aber keine EIGENEN', () => {
  const q = {
    regeln: [
      { name: 'Danke', event: 'gift', enabled: true, actions: [{ kind: 'speak' }], conditions: [] },
      { name: 'Groß', event: 'gift', enabled: true, actions: [{ kind: 'speak' }], conditions: [{ kind: 'gift_coins_gte', value: 100 }] },
    ],
  };
  assert.equal(reaktionenFuerGift(rose, q).length, 2);
  assert.equal(hatEigeneReaktion(rose, q), false);
});

test('Geschenk in einem Widget-Feld zählt als eigene Reaktion', () => {
  const q = { widgetFelder: [{ ebene: 'Glücksrad', slugs: ['Rose', 'Galaxy'] }] };
  assert.equal(hatEigeneReaktion(rose, q), true);
  assert.match(reaktionenFuerGift(rose, q)[0]?.grund ?? '', /Glücksrad/);
});

test('Schreibweise egal: „Finger Heart\'s" trifft „fingerhearts"', () => {
  const gift = { slug: "Finger Heart's" };
  const q = { regeln: [{ name: 'FH', event: 'gift', enabled: true, actions: [{ kind: 'speak' }], conditions: [{ kind: 'gift_slug_is', value: 'fingerhearts' }] }] };
  assert.equal(hatEigeneReaktion(gift, q), true);
});

test('Andere Ereignisse (Chat/Follow) reagieren nicht auf Geschenke', () => {
  const q = { regeln: [{ name: 'Chat', event: 'chat', enabled: true, actions: [{ kind: 'speak' }], conditions: [{ kind: 'chat_keyword', value: 'Rose' }] }] };
  assert.equal(reaktionenFuerGift(rose, q).length, 0);
});

test('slugsAusFeldwert versteht alle drei Speicherformate', () => {
  assert.deepEqual(slugsAusFeldwert('Rose'), ['Rose']);
  assert.deepEqual(slugsAusFeldwert('Rose, Galaxy'), ['Rose', 'Galaxy']);
  assert.deepEqual(slugsAusFeldwert('Rose::Danke | Galaxy::Wow::60'), ['Rose', 'Galaxy']);
  assert.deepEqual(slugsAusFeldwert(''), []);
  assert.deepEqual(slugsAusFeldwert(undefined), []);
  // Nur-Text-Zeile im Karussell (Legacy) liefert keinen Slug-Müll.
  assert.deepEqual(slugsAusFeldwert(' | '), []);
});

test('Leerer Slug trifft nicht versehentlich alles', () => {
  const q = { widgetFelder: [{ ebene: 'Rad', slugs: [''] }] };
  assert.equal(hatEigeneReaktion({ slug: '' }, q), false);
});
