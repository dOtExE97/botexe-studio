import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GiftCatalog } from './gift-catalog';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'giftcat-'));
}

test('Gift-Bilder: Ordner wird angelegt, localIconFile nur bei echter Datei', () => {
  const dir = tmpDir();
  const c = new GiftCatalog(dir);
  assert.ok(fs.existsSync(c.getImagesDir()), 'gift-images-Ordner angelegt');
  assert.equal(c.getImagesDir(), path.join(dir, 'gift-images'));
  // iconFile gesetzt, aber Datei fehlt → '' (CDN-Fallback greift dann)
  assert.equal(c.localIconFile({ slug: 'x', coins: 0, count: 0, iconFile: 'gift-1.png' }), '');
  fs.writeFileSync(path.join(c.getImagesDir(), 'gift-1.png'), 'PNGDATA');
  assert.equal(c.localIconFile({ slug: 'x', coins: 0, count: 0, iconFile: 'gift-1.png' }), 'gift-1.png');
});

test('eigene Bilder: nach Geschenknamen benannte Dateien werden gefunden (Schreibweise egal)', () => {
  const c = new GiftCatalog(tmpDir());
  const dir = c.getImagesDir();
  // Ohne passende Datei: kein Bild.
  assert.equal(c.localIconFile({ slug: 'Hat and Mustache', coins: 0, count: 0 }), '');

  fs.writeFileSync(path.join(dir, 'Hat and Mustache.png'), 'PNGDATA');
  fs.writeFileSync(path.join(dir, 'galaxy.webp'), 'WEBPDATA');
  // Der 5-s-Cache darf einen frisch angelegten Ordnerinhalt nicht verstecken:
  // die erste Abfrage oben lief auf dem leeren Ordner.
  c.vergisseEigeneBilder();

  // Exakt, andere Schreibweise, andere Endung — alle finden dieselbe Datei.
  assert.equal(c.localIconFile({ slug: 'Hat and Mustache', coins: 0, count: 0 }), 'Hat and Mustache.png');
  assert.equal(c.localIconFile({ slug: 'hat-and-mustache', coins: 0, count: 0 }), 'Hat and Mustache.png');
  assert.equal(c.localIconFile({ slug: 'HATANDMUSTACHE', coins: 0, count: 0 }), 'Hat and Mustache.png');
  assert.equal(c.localIconFile({ slug: 'Galaxy', coins: 0, count: 0 }), 'galaxy.webp');
  // Nicht hinterlegt → weiterhin leer (Platzhalter im Widget).
  assert.equal(c.localIconFile({ slug: 'Rose', coins: 0, count: 0 }), '');
});

test('eigene Bilder: fuehrende Sortiernummer im Dateinamen wird ignoriert', () => {
  const c = new GiftCatalog(tmpDir());
  const dir = c.getImagesDir();
  // Namensschema der verbreiteten Gift-Sammlungen (Alex' Archiv auf dem
  // Heimserver): 0001_Rose.png, 0002_Flame_heart.png, 0003_You_re_awesome.png.
  fs.writeFileSync(path.join(dir, '0001_Rose.png'), 'PNGDATA');
  fs.writeFileSync(path.join(dir, '0002_Flame_heart.png'), 'PNGDATA');
  fs.writeFileSync(path.join(dir, '0003_You_re_awesome.png'), 'PNGDATA');
  fs.writeFileSync(path.join(dir, '0008_Ice_Cream_Cone.png'), 'PNGDATA');
  c.vergisseEigeneBilder();

  // So heissen die Geschenke im TikTok-Ereignis.
  assert.equal(c.localIconFile({ slug: 'Rose', coins: 0, count: 0 }), '0001_Rose.png');
  assert.equal(c.localIconFile({ slug: 'Flame heart', coins: 0, count: 0 }), '0002_Flame_heart.png');
  assert.equal(c.localIconFile({ slug: "You're awesome", coins: 0, count: 0 }), '0003_You_re_awesome.png');
  assert.equal(c.localIconFile({ slug: 'Ice Cream Cone', coins: 0, count: 0 }), '0008_Ice_Cream_Cone.png');
  // Der volle Name (mit Nummer) findet die Datei ebenfalls.
  assert.equal(c.localIconFile({ slug: '0001 Rose', coins: 0, count: 0 }), '0001_Rose.png');
  // Fremdes Geschenk weiterhin ohne Bild.
  assert.equal(c.localIconFile({ slug: 'Galaxy', coins: 0, count: 0 }), '');
});

test('eigene Bilder: heruntergeladene gift-<id>-Dateien laufen weiter über iconFile', () => {
  const c = new GiftCatalog(tmpDir());
  // Eine gift-42.png darf NICHT als „eigenes Bild" für ein Gift namens
  // „gift 42" gelten — sonst kollidieren die beiden Quellen.
  fs.writeFileSync(path.join(c.getImagesDir(), 'gift-42.png'), 'PNGDATA');
  c.vergisseEigeneBilder();
  assert.equal(c.localIconFile({ slug: 'gift 42', coins: 0, count: 0 }), '');
  // Über iconFile (der vorgesehene Weg) wird sie sehr wohl gefunden.
  assert.equal(c.localIconFile({ slug: 'irgendwas', coins: 0, count: 0, iconFile: 'gift-42.png' }), 'gift-42.png');
});

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
