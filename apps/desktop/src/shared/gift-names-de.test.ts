import test from 'node:test';
import assert from 'node:assert/strict';
import { giftNameDe, giftDisplayName } from './gift-names-de';

test('giftNameDe: Schreibweise, Bindestriche und Leerzeichen sind egal', () => {
  // Die kuratierte Map ist von Hand gepflegt und uneinheitlich geschrieben.
  // Mit bloßem toLowerCase verfehlte ein echter Ereignis-Name wie
  // „Love You So Much" den Eintrag „love you so much" — dieselbe Falle wie bei
  // den Gift-Zuordnungen.
  assert.equal(giftNameDe('Finger Heart'), 'Fingerherz');
  assert.equal(giftNameDe('finger-heart'), 'Fingerherz');
  assert.equal(giftNameDe('FINGERHEART'), 'Fingerherz');
  assert.equal(giftNameDe('Love You So Much'), 'Hab dich sehr lieb');
  assert.equal(giftNameDe("You're awesome"), 'Du bist großartig');
});

test('giftNameDe: kuratierte Übersetzung gewinnt über die automatische Liste', () => {
  // „Hat and Mustache" steht in BEIDEN Listen. Die handverlesene ist besser.
  assert.equal(giftNameDe('Hat and Mustache'), 'Hut und Schnurrbart');
  assert.equal(giftNameDe('Lion'), 'Löwe');
});

test('giftNameDe: greift auch auf die große Master-Liste zurück', () => {
  // Nicht in den kuratierten 52, aber in den 817 aus der Master-Liste.
  assert.equal(giftNameDe('A Shard of Hope'), 'Hoffnungssplitter');
});

test('giftNameDe: unbekanntes Geschenk → null (Aufrufer nimmt den Originalnamen)', () => {
  assert.equal(giftNameDe('Gibt Es Nicht 12345'), null);
  assert.equal(giftNameDe(''), null);
});

test('giftDisplayName: eigener Name gewinnt IMMER — auch über Englisch', () => {
  assert.equal(giftDisplayName('Rocket', 'de', 'fette Rakete'), 'fette Rakete');
  assert.equal(giftDisplayName('Rocket', 'en', 'fette Rakete'), 'fette Rakete');
  // Leerer/blanker eigener Name zählt nicht.
  assert.equal(giftDisplayName('Rocket', 'de', '   '), 'Rakete');
});

test('giftDisplayName: Englisch lässt den Originalnamen unangetastet', () => {
  // Das ist die Standardeinstellung — Zuschauer kennen die Namen aus TikTok.
  assert.equal(giftDisplayName('Finger Heart', 'en'), 'Finger Heart');
  assert.equal(giftDisplayName('Galaxy', 'en'), 'Galaxy');
});
