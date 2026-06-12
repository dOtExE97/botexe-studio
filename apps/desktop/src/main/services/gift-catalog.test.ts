import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GiftCatalog } from './gift-catalog';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'giftcat-'));
}

test('record sammelt Gifts mit Bild + Zähler, all() liefert sie slug-normalisiert', () => {
  const c = new GiftCatalog(tmpDir());
  c.record({ slug: 'Rose', icon: 'https://cdn/rose.png', coinsPerUnit: 1, count: 2 });
  c.record({ slug: 'rose', coinsPerUnit: 1, count: 1 }); // ohne icon → icon bleibt
  c.record({ slug: 'Lion', icon: 'https://cdn/lion.png', coinsPerUnit: 29999, count: 1 });

  const all = c.all();
  assert.equal(all['rose']?.icon, 'https://cdn/rose.png');
  assert.equal(all['rose']?.count, 3);
  assert.equal(all['lion']?.coins, 29999);
});

test('persistiert und lädt wieder', () => {
  const dir = tmpDir();
  const a = new GiftCatalog(dir);
  a.record({ slug: 'GG', icon: 'https://cdn/gg.png', coinsPerUnit: 1, count: 1 });
  a.save();
  const b = new GiftCatalog(dir);
  assert.equal(b.all()['gg']?.icon, 'https://cdn/gg.png');
});
