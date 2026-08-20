import test from 'node:test';
import assert from 'node:assert/strict';
import { sortiereGeschenke, type GiftSort } from './galerie-sortierung';
import { bewerte } from '../../shared/suche';

const G = [
  { slug: 'Bless Pose', coins: 1, lastSeen: 900 },
  { slug: 'Rose', coins: 1, lastSeen: 100 },
  { slug: 'Anhelex Rosa', coins: 1, lastSeen: 800 },
  { slug: 'Galaxy', coins: 1000, lastSeen: 700 },
];

/** Genau wie die Galerie es aufruft. */
const mittel = (suche: string) => ({
  anzeigeName: (g: (typeof G)[number]) => g.slug,
  relevanz: (g: (typeof G)[number]) => (suche ? bewerte(suche, [g.slug]) : 0),
});

const ersten = (sort: GiftSort, suche: string) =>
  sortiereGeschenke(G, sort, mittel(suche))[0]?.slug;

test('bei Suche steht der beste Treffer oben — bei JEDER Sortierung', () => {
  // Das war der Fehler: Die Relevanz galt nur, solange man nicht umsortierte.
  for (const sort of ['coins', 'name', 'recent'] as GiftSort[]) {
    assert.equal(ersten(sort, 'rose'), 'Rose', `Sortierung „${sort}" darf die Relevanz nicht ueberschreiben`);
  }
});

test('ohne Suche gilt die gewaehlte Sortierung unveraendert', () => {
  assert.equal(ersten('coins', ''), 'Galaxy', 'teuerstes zuerst');
  assert.equal(ersten('name', ''), 'Anhelex Rosa', 'alphabetisch');
  assert.equal(ersten('recent', ''), 'Bless Pose', 'zuletzt gesehen');
});

test('bei gleichwertigen Treffern entscheidet die gewaehlte Sortierung', () => {
  const gleich = [
    { slug: 'Rose Gold', coins: 5, lastSeen: 1 },
    { slug: 'Rose Bouquet', coins: 99, lastSeen: 2 },
  ];
  const m = { anzeigeName: (g: (typeof gleich)[number]) => g.slug, relevanz: (g: (typeof gleich)[number]) => bewerte('rose', [g.slug]) };
  assert.equal(sortiereGeschenke(gleich, 'coins', m)[0]?.slug, 'Rose Bouquet', 'gleiche Guete → teureres zuerst');
  assert.equal(sortiereGeschenke(gleich, 'name', m)[0]?.slug, 'Rose Bouquet', 'gleiche Guete → alphabetisch');
});

test('die uebergebene Liste bleibt unberuehrt', () => {
  const kopie = [...G];
  sortiereGeschenke(G, 'name', mittel('rose'));
  assert.deepEqual(G.map((g) => g.slug), kopie.map((g) => g.slug));
});
