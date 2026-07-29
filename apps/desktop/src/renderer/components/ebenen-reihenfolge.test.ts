// Stapel-Reihenfolge im Overlay-Editor.
//
// Die Logik ist hier nachgebaut, damit sie ohne DOM prüfbar ist (sie steckt in
// OverlayPage.tsx#moveLayer). Ändert sie sich dort, muss dieser Test mitziehen.
//
// Der Kniff: Es wird mit dem Nachbarn GETAUSCHT, nicht „z + 1" gerechnet.
// Sonst landen zwei Widgets auf demselben Wert und die Reihenfolge wird
// zufällig — auf dem Bild sieht man dann mal das eine, mal das andere oben.
import test from 'node:test';
import assert from 'node:assert/strict';

interface L { id: string; z: number }

function verschiebe(layers: L[], id: string, richtung: 1 | -1): L[] {
  const sortiert = [...layers].sort((a, b) => a.z - b.z);
  const i = sortiert.findIndex((l) => l.id === id);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= sortiert.length) return layers;
  const a = sortiert[i];
  const b = sortiert[j];
  if (!a || !b) return layers;
  const zA = a.z;
  return layers.map((l) => (l.id === a.id ? { ...l, z: b.z } : l.id === b.id ? { ...l, z: zA } : l));
}

const reihenfolge = (ls: L[]) => [...ls].sort((a, b) => a.z - b.z).map((l) => l.id).join(',');

test('nach vorn: tauscht mit dem nächsten Nachbarn', () => {
  const ls: L[] = [{ id: 'a', z: 1 }, { id: 'b', z: 2 }, { id: 'c', z: 3 }];
  assert.equal(reihenfolge(verschiebe(ls, 'a', 1)), 'b,a,c');
});

test('nach hinten: ebenso, in die andere Richtung', () => {
  const ls: L[] = [{ id: 'a', z: 1 }, { id: 'b', z: 2 }, { id: 'c', z: 3 }];
  assert.equal(reihenfolge(verschiebe(ls, 'c', -1)), 'a,c,b');
});

test('an den Enden passiert nichts', () => {
  const ls: L[] = [{ id: 'a', z: 1 }, { id: 'b', z: 2 }];
  assert.equal(reihenfolge(verschiebe(ls, 'a', -1)), 'a,b', 'unterstes kann nicht tiefer');
  assert.equal(reihenfolge(verschiebe(ls, 'b', 1)), 'a,b', 'oberstes kann nicht höher');
});

test('keine zwei Widgets landen auf derselben Stufe', () => {
  // Der eigentliche Grund fürs Tauschen. Mit „z + 1" hätten hier zwei
  // Widgets denselben Wert — welches oben liegt, wäre dann Zufall.
  let ls: L[] = [{ id: 'a', z: 1 }, { id: 'b', z: 2 }, { id: 'c', z: 3 }];
  for (const [id, r] of [['a', 1], ['c', -1], ['b', 1], ['a', -1]] as [string, 1 | -1][]) {
    ls = verschiebe(ls, id, r);
    const werte = ls.map((l) => l.z);
    assert.equal(new Set(werte).size, werte.length, `doppelte Stufe nach ${id}/${r}: ${werte.join(',')}`);
  }
});

test('auch bei Lücken in den Stufen', () => {
  // Layouts aus älteren Versionen haben keine lückenlosen Werte.
  const ls: L[] = [{ id: 'a', z: 5 }, { id: 'b', z: 40 }, { id: 'c', z: 41 }];
  assert.equal(reihenfolge(verschiebe(ls, 'a', 1)), 'b,a,c');
});
