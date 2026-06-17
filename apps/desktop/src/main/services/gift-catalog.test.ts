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

test('„Letztes Live": nur ERHALTENE Gifts markiert, Katalog-Import (count:0) NICHT', () => {
  const c = new GiftCatalog(tmpDir());
  // Stream-Start: Room-Katalog importiert (count:0, nur Bilder) + Reset.
  c.resetLastRoom();
  c.record({ slug: 'Rose', count: 0 });
  c.record({ slug: 'Lion', count: 0 });
  c.record({ slug: 'Galaxy', count: 0 });
  // Nur ein Rose-Gift kam wirklich rein.
  c.record({ slug: 'Rose', count: 3, sender: { id: 'u1', nickname: 'Anna' } });

  assert.equal(c.all()['rose']?.inLastRoom, true, 'erhaltenes Gift ist markiert');
  assert.ok(!c.all()['lion']?.inLastRoom, 'nur verfügbares (count:0) NICHT');
  assert.ok(!c.all()['galaxy']?.inLastRoom);

  // Nächster Stream: Reset leert alles, dann markiert sich das neue Gift.
  c.resetLastRoom();
  assert.ok(!c.all()['rose']?.inLastRoom, 'voriges Live fällt weg');
  c.record({ slug: 'Galaxy', count: 1, sender: { id: 'u2', nickname: 'Ben' } });
  assert.equal(c.all()['galaxy']?.inLastRoom, true);
  assert.ok(!c.all()['rose']?.inLastRoom);
});

test('persistiert und lädt wieder', () => {
  const dir = tmpDir();
  const a = new GiftCatalog(dir);
  a.record({ slug: 'GG', icon: 'https://cdn/gg.png', coinsPerUnit: 1, count: 1 });
  a.save();
  const b = new GiftCatalog(dir);
  assert.equal(b.all()['gg']?.icon, 'https://cdn/gg.png');
});
