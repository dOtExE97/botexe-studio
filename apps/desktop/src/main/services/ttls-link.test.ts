import test from 'node:test';
import assert from 'node:assert/strict';
import { TTLS_HOST, hostsContainsEntry, addEntryToHosts, removeEntryFromHosts, toTtlsUrl } from './ttls-link';

test('toTtlsUrl ersetzt 127.0.0.1 durch die TTLS-Domain', () => {
  assert.equal(
    toTtlsUrl('http://127.0.0.1:27415/overlay?token=abc'),
    `http://${TTLS_HOST}:27415/overlay?token=abc`,
  );
});

test('hostsContainsEntry erkennt vorhandene Einträge (auch mit Tabs/Kommentar dahinter)', () => {
  assert.equal(hostsContainsEntry(`# kommentar\n127.0.0.1\tlocaltest.me\n`), true);
  assert.equal(hostsContainsEntry(`127.0.0.1 localtest.me # botexe\n`), true);
  assert.equal(hostsContainsEntry(`127.0.0.1 anderes.example\n`), false);
  assert.equal(hostsContainsEntry(`# 127.0.0.1 localtest.me\n`), false); // auskommentiert zählt nicht
});

test('addEntryToHosts hängt den Eintrag idempotent an', () => {
  const once = addEntryToHosts('127.0.0.1 sonstwas\n');
  assert.equal(hostsContainsEntry(once), true);
  assert.equal(addEntryToHosts(once), once); // zweiter Aufruf ändert nichts
});

test('removeEntryFromHosts entfernt nur unsere Zeile', () => {
  const content = `127.0.0.1 anderes.example\n127.0.0.1 localtest.me # bOtExE Studio\nfe80::1 example\n`;
  const cleaned = removeEntryFromHosts(content);
  assert.equal(hostsContainsEntry(cleaned), false);
  assert.match(cleaned, /anderes\.example/);
  assert.match(cleaned, /fe80::1/);
});
