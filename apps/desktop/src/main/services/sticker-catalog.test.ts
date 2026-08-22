import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StickerCatalog, istFremdeAdresse, formatVonBytes } from './sticker-catalog';

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

test('derselbe Sticker aus DERSELBEN Nachricht zaehlt nur EINMAL', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([s('42')], 1_000, 'anna');
  c.merken([s('42')], 1_000, 'anna'); // das nachgereichte emote-Ereignis
  assert.equal(c.alle()[0]?.anzahl, 1, 'sonst behauptet die Seite „2x gesehen" fuer ein einziges Mal');
});

test('ZWEI Sticker in einer Nachricht: beide zaehlen, keiner doppelt', () => {
  // Die Falle: Im Chat-Ereignis stehen beide in EINER Liste, nachgereicht wird
  // jeder EINZELN. Wer die Listenposition als Merkmal nimmt, zaehlt den zweiten
  // Sticker doppelt (er steht dann naemlich auch an Position 0).
  const c = new StickerCatalog(tmpDir());
  const a = { id: 'A', bild: '', index: 0, animiert: false };
  const b = { id: 'B', bild: '', index: 5, animiert: false };
  c.merken([a, b], 1_000, 'anna');   // Chat-Ereignis mit beiden
  c.merken([a], 1_000, 'anna');      // nachgereicht fuer A
  c.merken([b], 1_000, 'anna');      // nachgereicht fuer B
  assert.equal(c.get('A')?.anzahl, 1);
  assert.equal(c.get('B')?.anzahl, 1, 'der zweite Sticker darf nicht doppelt zaehlen');
});

test('ZWEI Zuschauer, derselbe Sticker, dieselbe Millisekunde: beides zaehlt', () => {
  // Passiert wirklich — die Bibliothek verarbeitet gebuendelte Nachrichten in
  // einer Schleife. Das sind zwei echte Sichtungen.
  const c = new StickerCatalog(tmpDir());
  c.merken([s('42')], 1_000, 'anna');
  c.merken([s('42')], 1_000, 'ben');
  assert.equal(c.alle()[0]?.anzahl, 2);
});

test('derselbe Sticker zweimal IN einer Nachricht zaehlt zweimal', () => {
  const c = new StickerCatalog(tmpDir());
  c.merken([
    { id: '42', bild: '', index: 0, animiert: false },
    { id: '42', bild: '', index: 7, animiert: false },
  ], 1_000, 'anna');
  assert.equal(c.alle()[0]?.anzahl, 2, 'zwei Stellen im Text sind zwei Sticker');
});

test('istFremdeAdresse: IPv6-Loopback wird erkannt (hostname traegt Klammern)', () => {
  assert.equal(istFremdeAdresse('http://[::1]:7777/sticker-img/x.webp'), false);
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

// ── Dateiformat aus dem INHALT statt aus der Adresse ───────────────────────
// Belegt am echten Live vom 22.08.2026: Die kanaleigenen Sticker (die der
// Streamer selbst hochgeladen hat) kommen unter Adressen OHNE Dateiendung —
// `…/webcast-no/sub_9497d2d4ea4c…` — und sind PNG. Die Endung aus der Adresse
// zu raten heisst: PNG-Daten landen unter `.webp` und werden mit falschem
// Inhaltstyp ausgeliefert. Heute faellt das nicht auf (der Browser erkennt das
// Format selbst), aber es bricht, sobald jemand `nosniff` setzt.

test('formatVonBytes erkennt PNG, WebP, JPEG und GIF am Inhalt', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(6)]);
  assert.equal(formatVonBytes(png), 'png');
  assert.equal(formatVonBytes(webp), 'webp');
  assert.equal(formatVonBytes(jpeg), 'jpg');
  assert.equal(formatVonBytes(gif), 'gif');
});

test('formatVonBytes: Unbekanntes bleibt undefined — kein Raten', () => {
  assert.equal(formatVonBytes(Buffer.from('kein bild hier drin')), undefined);
  assert.equal(formatVonBytes(Buffer.alloc(2)), undefined);
});
