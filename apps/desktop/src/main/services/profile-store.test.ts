import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProfileStore } from './profile-store';

function tmpStore(): ProfileStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-prof-'));
  return new ProfileStore(dir);
}

test('create + list + get: Profil mit Bundle anlegen und wiederfinden', () => {
  const s = tmpStore();
  const p = s.create('Mein Setup', { settings: { a: 1 }, layouts: [] }, 1000);
  assert.equal(p.name, 'Mein Setup');
  assert.ok(p.id);
  const list = s.list();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.name, 'Mein Setup');
  assert.deepEqual(s.get(p.id)?.bundle, { settings: { a: 1 }, layouts: [] });
});

test('saveBundle: Stand eines Profils aktualisieren (für Umschalten)', () => {
  const s = tmpStore();
  const p = s.create('A', { settings: { v: 1 } }, 1000);
  assert.equal(s.saveBundle(p.id, { settings: { v: 2 } }, 2000), true);
  assert.deepEqual(s.get(p.id)?.bundle, { settings: { v: 2 } });
  assert.equal(s.saveBundle('gibts-nicht', {}, 3000), false);
});

test('aktives Profil merken + Löschen setzt active zurück', () => {
  const s = tmpStore();
  const a = s.create('A', {}, 1000);
  const b = s.create('B', {}, 1001);
  s.setActiveId(a.id);
  assert.equal(s.getActiveId(), a.id);
  s.delete(a.id);
  assert.equal(s.getActiveId(), null, 'active wird beim Löschen des aktiven Profils geleert');
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0]?.id, b.id);
});

test('rename + source-Badge (z.B. tikfinity-Import)', () => {
  const s = tmpStore();
  const p = s.create('TikFinity-Import', {}, 1000, 'tikfinity');
  assert.equal(s.list()[0]?.source, 'tikfinity');
  assert.equal(s.rename(p.id, 'Mein Import', 2000), true);
  assert.equal(s.get(p.id)?.name, 'Mein Import');
});

test('eindeutige IDs auch bei gleichem Namen', () => {
  const s = tmpStore();
  const a = s.create('Gleich', {}, 1000);
  const b = s.create('Gleich', {}, 2000);
  assert.notEqual(a.id, b.id);
  assert.equal(s.list().length, 2);
});
