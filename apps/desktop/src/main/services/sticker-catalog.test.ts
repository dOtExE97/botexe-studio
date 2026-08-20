import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StickerCatalog, istFremdeAdresse } from './sticker-catalog';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stickercat-'));
}

/** Sticker ohne echte Bildadresse — so laeuft im Test kein Download an. */
function s(id: string, extra: Record<string, unknown> = {}) {
  return { id, bild: '', index: 0, animiert: false, ...extra };
}

test('Ordner wird angelegt, lokale Datei nur bei echter Datei', () => {
  const dir = tmpDir();
  const c = new StickerCatalog(dir);
  assert.ok(fs.existsSync(c.getImagesDir()));
  assert.equal(c.getImagesDir(), path.join(dir, 'sticker-images'));
  const eintrag = { id: '1', bildUrl: '', animiert: false, anzahl: 1, erstGesehen: 0, zuletztGesehen: 0, bildDatei: 'sticker-1.webp' };
  assert.equal(c.localeDatei(eintrag), '', 'Dateiname gesetzt, Datei fehlt → leer');
  fs.writeFileSync(path.join(c.getImagesDir(), 'sticker-1.webp'), 'BILD');
  assert.equal(c.localeDatei(eintrag), 'sticker-1.webp');
});

test('merken: neuer Sticker wird angelegt, zweite Sichtung zaehlt nur hoch', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([s('42')], 1_000);
  c.merken([s('42')], 2_000);
  const alle = c.alle();
  assert.equal(alle.length, 1, 'kein Doppel-Eintrag');
  assert.equal(alle[0]?.anzahl, 2);
  assert.equal(alle[0]?.erstGesehen, 1_000);
  assert.equal(alle[0]?.zuletztGesehen, 2_000);
});

test('merken: Sticker ohne Bild wird trotzdem gemerkt', () => {
  // Die ID ist der Anker fuer Regeln — ohne Bild kann er immer noch feuern.
  const c = new StickerCatalog(tmpDir());
  c.merken([s('7')], 1_000);
  assert.equal(c.alle().length, 1);
  assert.equal(c.alle()[0]?.bildDatei, undefined, 'kein Dateiname ohne Download');
});

test('merken: Eintraege ohne id werden uebersprungen, der Rest ueberlebt', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([{ id: '', bild: '', index: 0, animiert: false }, s('9')], 1_000);
  assert.deepEqual(c.alle().map((e) => e.id), ['9']);
});

test('merken: die Bildadresse wird aufgefrischt (die alte laeuft ab)', () => {
  // Echte Adressen, weil die Auffrischung inzwischen prueft, WOHER sie zeigen.
  const c = new StickerCatalog(tmpDir());
  c.merken([{ id: '42', bild: 'https://p16-webcast.tiktokcdn.com/alt.webp', index: 0, animiert: false }], 1_000);
  c.merken([{ id: '42', bild: 'https://p16-webcast.tiktokcdn.com/neu.webp', index: 0, animiert: false }], 2_000);
  assert.equal(c.alle()[0]?.bildUrl, 'https://p16-webcast.tiktokcdn.com/neu.webp');
});

test('umbenennen: eigener Name ueberlebt die naechste Sichtung', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([s('42')], 1_000);
  c.umbenennen('42', 'Mein Lachsticker');
  c.merken([s('42')], 2_000);
  assert.equal(c.alle()[0]?.eigenerName, 'Mein Lachsticker');
});

test('umbenennen: leerer Name loescht ihn wieder', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([s('42')], 1_000);
  c.umbenennen('42', 'Name');
  c.umbenennen('42', '   ');
  assert.equal(c.alle()[0]?.eigenerName, undefined);
});

test('alle(): zuletzt gesehene zuerst', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([s('alt')], 1_000);
  c.merken([s('neu')], 5_000);
  assert.deepEqual(c.alle().map((e) => e.id), ['neu', 'alt']);
});

test('speichern und wieder laden: Katalog ueberlebt einen Neustart', () => {
  const dir = tmpDir();
  const c = new StickerCatalog(dir);
  c.merken([s('42', { paket: 'fansclub' })], 1_000);
  c.umbenennen('42', 'Herz');
  c.save();

  const neu = new StickerCatalog(dir);
  const e = neu.alle()[0];
  assert.equal(e?.id, '42');
  assert.equal(e?.eigenerName, 'Herz');
  assert.equal(e?.paket, 'fansclub');
  assert.equal(e?.anzahl, 1);
});

test('kaputte Katalog-Datei wirft nicht — die Sticker werden neu gelernt', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'sticker-catalog.json'), '{kaputt');
  const c = new StickerCatalog(dir);
  assert.deepEqual(c.alle(), []);
  c.merken([s('1')], 1_000);
  assert.equal(c.alle().length, 1, 'nach dem Fehlstart laeuft alles normal weiter');
});

// ── Doppelzaehlung und die zerstoerte Herkunft ─────────────────────────────
// Eine Chat-Nachricht mit Sticker erzeugt ZWEI Ereignisse: das Chat-Ereignis
// und ein nachgereichtes 'emote' je Sticker (damit Sticker-Regeln greifen).
// Beide tragen dasselbe Sticker-Objekt — und zwischendurch biegt die App
// dessen Bild auf die lokale Kopie um.

test('derselbe Sticker zur selben Zeit zaehlt nur EINMAL', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([s('42')], 1_000);
  c.merken([s('42')], 1_000); // das nachgereichte emote-Ereignis
  assert.equal(c.alle()[0]?.anzahl, 1, 'sonst behauptet die Seite „2x gesehen" fuer ein einziges Mal');
});

test('derselbe Sticker spaeter zaehlt wieder', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([s('42')], 1_000);
  c.merken([s('42')], 2_000);
  assert.equal(c.alle()[0]?.anzahl, 2);
});

test('die eigene Auslieferungs-Adresse ueberschreibt die TikTok-Herkunft NICHT', () => {
  // Sonst steht im Katalog dauerhaft eine Adresse mit Port und Zugangsschluessel,
  // und das Bild liesse sich nie wieder neu laden.
  const c = new StickerCatalog(tmpDir());
  c.merken([{ id: '42', bild: 'https://p16-webcast.tiktokcdn.com/img/x.webp', index: 0, animiert: false }], 1_000);
  c.merken([{ id: '42', bild: 'http://127.0.0.1:7777/sticker-img/sticker-42.webp?token=geheim', index: 0, animiert: false }], 2_000);
  assert.equal(c.alle()[0]?.bildUrl, 'https://p16-webcast.tiktokcdn.com/img/x.webp');
});

test('istFremdeAdresse trennt TikTok von der eigenen Auslieferung', () => {
  assert.equal(istFremdeAdresse('https://p16-webcast.tiktokcdn.com/img/x.webp'), true);
  assert.equal(istFremdeAdresse('http://127.0.0.1:7777/sticker-img/x.webp?token=a'), false);
  assert.equal(istFremdeAdresse('http://localhost:7777/sticker-img/x.webp'), false);
  assert.equal(istFremdeAdresse(''), false);
  assert.equal(istFremdeAdresse('kein-url'), false);
  assert.equal(istFremdeAdresse(undefined), false);
});
