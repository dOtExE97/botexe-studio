// level-up-waechter.test.ts — Teamherz-Stufe über Abzeichen + Dedup mit Bannern.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LevelUpWaechter } from './level-up-waechter';

test('Erstsichtung liefert null, ein Anstieg die neue Stufe', () => {
  const w = new LevelUpWaechter();
  assert.equal(w.sieheStufe('a', 5, 1), null, 'Erstsichtung ist kein Level-Up');
  assert.equal(w.sieheStufe('a', 6, 2), 6);
  assert.equal(w.sieheStufe('a', 6, 3), null, 'gleiche Stufe nochmal');
  assert.equal(w.sieheStufe('a', 5, 4), null, 'kein Abstieg');
});

test('nach einem Abstieg zählt die höchste bekannte Stufe weiter', () => {
  const w = new LevelUpWaechter();
  w.sieheStufe('a', 6, 1);
  w.sieheStufe('a', 5, 2);
  assert.equal(w.sieheStufe('a', 6, 3), null, 'zurück auf 6 ist kein neuer Anstieg');
});

test('Zuschauer werden getrennt gezählt', () => {
  const w = new LevelUpWaechter();
  w.sieheStufe('a', 5, 1);
  assert.equal(w.sieheStufe('b', 9, 2), null, 'für b ist 9 die Erstsichtung');
});

test('Banner-Level-Up merkt sich Zuschauer+Stufe 60 Sekunden lang', () => {
  const w = new LevelUpWaechter();
  w.vonBanner('a', 7, 1000);
  assert.equal(w.istDoppelt('a', 7, 50_000), true);
  assert.equal(w.istDoppelt('a', 7, 61_001), false);
  assert.equal(w.istDoppelt('a', 8, 2000), false, 'andere Stufe');
  assert.equal(w.istDoppelt('b', 7, 2000), false, 'anderer Zuschauer');
});

test('Abzeichen nach einem Banner derselben Stufe löst nichts mehr aus', () => {
  const w = new LevelUpWaechter();
  w.vonBanner('a', 7, 1000);
  assert.equal(w.sieheStufe('a', 7, 2000), null);
  assert.equal(w.sieheStufe('a', 8, 3000), 8, 'die nächste Stufe schon');
});

test('reset() macht die nächste Sichtung zur Erstsichtung und leert das Dedup', () => {
  const w = new LevelUpWaechter();
  w.sieheStufe('a', 5, 1);
  w.vonBanner('a', 7, 1000);
  w.reset();
  assert.equal(w.sieheStufe('a', 6, 2), null);
  assert.equal(w.istDoppelt('a', 7, 2000), false);
});
