// layout-store.test.ts — Disk-Persistenz + Cache-Invalidierung.
// Der list()-Cache spart Disk-I/O im Hot-Path (pro Gift-Event), darf aber
// NIEMALS stale werden — sonst greift die App auf veraltete Layouts zu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LayoutStore } from './layout-store';

function tmpStore(): LayoutStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-layouts-'));
  return new LayoutStore(dir);
}

function layout(id: string, name: string) {
  return {
    schemaVersion: 1,
    id,
    name,
    canvas: { width: 1920, height: 1080, background: 'transparent' },
    layers: [
      { id: 'l1', widgetType: 'gift-alert', name: 'A', x: 0, y: 0, w: 100, h: 100, z: 1, visible: true, props: {} },
    ],
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
  };
}

test('save + list: gespeichertes Layout erscheint', () => {
  const store = tmpStore();
  store.save(layout('a', 'Erstes'));
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.name, 'Erstes');
});

test('list ist gecacht (gleiche Referenz ohne Schreibvorgang)', () => {
  const store = tmpStore();
  store.save(layout('a', 'Erstes'));
  assert.equal(store.list(), store.list(), 'kein erneutes Disk-Lesen/Sortieren');
});

test('save invalidiert den Cache — list zeigt die neue Version, nicht stale', () => {
  const store = tmpStore();
  store.save(layout('a', 'Alt'));
  store.list(); // Cache füllen
  store.save(layout('a', 'Neu')); // selbes Layout, neuer Name
  assert.equal(store.list()[0]?.name, 'Neu', 'Cache darf nach Save nicht stale sein');
});

test('delete invalidiert den Cache — Layout verschwindet aus list', () => {
  const store = tmpStore();
  store.save(layout('a', 'Erstes'));
  store.save(layout('b', 'Zweites'));
  store.list(); // Cache füllen
  store.delete('a');
  const ids = store.list().map((l) => l.id);
  assert.deepEqual(ids.sort(), ['b']);
});
