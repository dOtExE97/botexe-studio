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

test('erster echter Sender wird mit Datum verewigt und ändert sich nicht mehr', () => {
  const c = new GiftCatalog(tmpDir());
  // Aus der Room-Liste (count 0) → noch kein Sender.
  c.record({ slug: 'Rose', icon: 'https://cdn/rose.png', coinsPerUnit: 1, count: 0 });
  assert.equal(c.all()['rose']?.firstSender, undefined);

  // Erstes echtes Gift mit Sender → verewigt.
  c.record({ slug: 'Rose', count: 1, sender: { id: 'anna', nickname: 'Anna' }, at: 1000 });
  assert.equal(c.all()['rose']?.firstSender?.nickname, 'Anna');
  assert.equal(c.all()['rose']?.firstSenderAt, 1000);

  // Späterer Sender überschreibt den Erstsender NICHT.
  c.record({ slug: 'Rose', count: 1, sender: { id: 'ben', nickname: 'Ben' }, at: 2000 });
  assert.equal(c.all()['rose']?.firstSender?.nickname, 'Anna');
  assert.equal(c.all()['rose']?.firstSenderAt, 1000);
});

test('markLastRoom markiert genau die Gifts des letzten Live (vorige Markierung fällt weg)', () => {
  const c = new GiftCatalog(tmpDir());
  c.record({ slug: 'Rose', count: 0 });
  c.record({ slug: 'Lion', count: 0 });
  c.record({ slug: 'Galaxy', count: 0 });

  c.markLastRoom(['Rose', 'Lion']);
  assert.equal(c.all()['rose']?.inLastRoom, true);
  assert.equal(c.all()['galaxy']?.inLastRoom, false);

  // Nächstes Live mit anderer Liste → alte Markierung weg.
  c.markLastRoom(['Galaxy']);
  assert.equal(c.all()['rose']?.inLastRoom, false);
  assert.equal(c.all()['galaxy']?.inLastRoom, true);
});

test('persistiert und lädt wieder', () => {
  const dir = tmpDir();
  const a = new GiftCatalog(dir);
  a.record({ slug: 'GG', icon: 'https://cdn/gg.png', coinsPerUnit: 1, count: 1 });
  a.save();
  const b = new GiftCatalog(dir);
  assert.equal(b.all()['gg']?.icon, 'https://cdn/gg.png');
});
