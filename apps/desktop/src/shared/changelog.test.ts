import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChangelog, compareVersions, entriesSince } from './changelog';

const SAMPLE = `# Changelog

Alle nennenswerten Änderungen.

## [0.38.0] — 2026-07-26

### Behoben: Sprachausgabe bleibt nicht mehr stumm
- Erster Punkt
- Zweiter Punkt

## [0.37.1] — 2026-07-26

### Behoben: kleiner Fix

## [0.36.0] — 2026-07-20

### Neu: Listen-Felder
`;

test('parseChangelog: erkennt alle Sektionen in Datei-Reihenfolge (neueste zuerst)', () => {
  const entries = parseChangelog(SAMPLE);
  assert.equal(entries.length, 3);
  assert.equal(entries[0]!.version, '0.38.0');
  assert.equal(entries[0]!.date, '2026-07-26');
  assert.match(entries[0]!.body, /Erster Punkt/);
  assert.equal(entries[1]!.version, '0.37.1');
  assert.equal(entries[2]!.version, '0.36.0');
});

test('parseChangelog: Body ist getrimmt und enthält keine Heading-Zeile', () => {
  const entries = parseChangelog(SAMPLE);
  assert.ok(!entries[0]!.body.startsWith('\n'));
  assert.ok(!entries[0]!.body.includes('## ['));
});

test('parseChangelog: leerer/kaputter Text ergibt leere Liste', () => {
  assert.deepEqual(parseChangelog(''), []);
  assert.deepEqual(parseChangelog('kein Changelog hier, nur Prosa.'), []);
});

test('compareVersions: größer/kleiner/gleich', () => {
  assert.ok(compareVersions('0.38.0', '0.37.1') > 0);
  assert.ok(compareVersions('0.37.1', '0.38.0') < 0);
  assert.equal(compareVersions('0.38.0', '0.38.0'), 0);
});

test('compareVersions: unbekannte/kaputte Strings ergeben 0 (konservativ)', () => {
  assert.equal(compareVersions('nicht-semver', '0.38.0'), 0);
  assert.equal(compareVersions('0.38.0', ''), 0);
});

test('entriesSince: liefert alle Einträge neuer als lastSeen, auch übersprungene', () => {
  const entries = parseChangelog(SAMPLE);
  const since = entriesSince(entries, '0.36.0');
  assert.equal(since.length, 2);
  assert.deepEqual(since.map((e) => e.version), ['0.38.0', '0.37.1']);
});

test('entriesSince: lastSeen == neueste Version → nichts Neues', () => {
  const entries = parseChangelog(SAMPLE);
  assert.deepEqual(entriesSince(entries, '0.38.0'), []);
});

test('entriesSince: lastSeen neuer als alles (Downgrade-Fall) → nichts', () => {
  const entries = parseChangelog(SAMPLE);
  assert.deepEqual(entriesSince(entries, '9.9.9'), []);
});

test('entriesSince: fehlender/leerer lastSeen → leere Liste (Aufrufer behandelt Erstinstall separat)', () => {
  const entries = parseChangelog(SAMPLE);
  assert.deepEqual(entriesSince(entries, null), []);
  assert.deepEqual(entriesSince(entries, undefined), []);
  assert.deepEqual(entriesSince(entries, ''), []);
});
