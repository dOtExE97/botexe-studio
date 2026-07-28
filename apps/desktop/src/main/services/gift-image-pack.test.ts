import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { leseTar, istSichererName, ladeBildPaket, istErlaubterWeiterleitungsHost } from './gift-image-pack';

/** Baut einen tar-Block von Hand — so testen wir den Leser gegen echtes Format. */
function tarEintrag(name: string, inhalt: Buffer, typ = '0'): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf-8');
  header.write('000644 \0', 100, 8, 'utf-8');           // mode
  header.write('000000 \0', 108, 8, 'utf-8');           // uid
  header.write('000000 \0', 116, 8, 'utf-8');           // gid
  header.write(inhalt.length.toString(8).padStart(11, '0') + ' ', 124, 12, 'utf-8');
  header.write('00000000000 ', 136, 12, 'utf-8');       // mtime
  header.write('        ', 148, 8, 'utf-8');            // Prüfsumme (Platzhalter)
  header.write(typ, 156, 1, 'utf-8');
  header.write('ustar\0' + '00', 257, 8, 'utf-8');
  // Prüfsumme nachtragen (unser Leser prüft sie nicht, echte tars haben sie aber)
  let summe = 0;
  for (const b of header) summe += b;
  header.write(summe.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf-8');

  const daten = Buffer.alloc(Math.ceil(inhalt.length / 512) * 512);
  inhalt.copy(daten);
  return Buffer.concat([header, daten]);
}

function tarArchiv(...teile: Buffer[]): Buffer {
  return Buffer.concat([...teile, Buffer.alloc(1024)]); // zwei Null-Blöcke = Ende
}

test('leseTar: liest reguläre Dateien mit Namen und Inhalt', () => {
  const archiv = tarArchiv(
    tarEintrag('0001_Rose.png', Buffer.from('PNGDATA-ROSE')),
    tarEintrag('0002_Flame_heart.webp', Buffer.from('WEBP-FLAME')),
  );
  const e = leseTar(archiv);
  assert.equal(e.length, 2);
  assert.equal(e[0]?.name, '0001_Rose.png');
  assert.equal(e[0]?.daten.toString(), 'PNGDATA-ROSE');
  assert.equal(e[1]?.name, '0002_Flame_heart.webp');
  assert.equal(e[1]?.daten.toString(), 'WEBP-FLAME');
});

test('leseTar: wehrt Ausbruchsversuche und Fremd-Dateien ab', () => {
  const archiv = tarArchiv(
    tarEintrag('../../../etc/passwd', Buffer.from('BOESE')),      // Pfad nach oben
    tarEintrag('unter/ordner/bild.png', Buffer.from('BOESE')),    // Unterordner
    tarEintrag('/absolut/bild.png', Buffer.from('BOESE')),        // absoluter Pfad
    tarEintrag('.versteckt.png', Buffer.from('BOESE')),           // versteckte Datei
    tarEintrag('schadcode.sh', Buffer.from('BOESE')),             // keine Bild-Endung
    tarEintrag('ordner/', Buffer.alloc(0), '5'),                  // Ordner-Eintrag
    tarEintrag('0001_Rose.png', Buffer.from('GUT')),              // der einzig gute
  );
  const e = leseTar(archiv);
  assert.equal(e.length, 1, 'nur der harmlose Eintrag überlebt');
  assert.equal(e[0]?.name, '0001_Rose.png');
  assert.equal(e[0]?.daten.toString(), 'GUT');
});

test('istSichererName: nur schlichte Bild-Dateinamen', () => {
  for (const gut of ['Rose.png', '0001_Rose.png', 'Hat and Mustache.webp', 'a.JPEG', 'x.gif']) {
    assert.equal(istSichererName(gut), true, gut);
  }
  for (const boese of ['', '../x.png', 'a/b.png', 'a\\b.png', '.x.png', 'x.sh', 'x.png.exe', 'x'.repeat(300) + '.png']) {
    assert.equal(istSichererName(boese), false, boese);
  }
});

test('ladeBildPaket: lädt, entpackt und überschreibt vorhandene Bilder NICHT', async (t) => {
  const archiv = tarArchiv(
    tarEintrag('0001_Rose.png', Buffer.from('NEU-ROSE')),
    tarEintrag('0002_Flame_heart.png', Buffer.from('NEU-FLAME')),
  );
  const gz = zlib.gzipSync(archiv);

  // Kleiner lokaler Server statt echtem Netz — der Host-Filter erlaubt nur
  // GitHub, deshalb wird die URL beim Aufruf explizit übergeben.
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Length': String(gz.length) });
    res.end(gz);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'giftpack-'));
  // Eigenes Bild, das erhalten bleiben MUSS.
  fs.writeFileSync(path.join(ziel, '0001_Rose.png'), 'MEIN-EIGENES');

  const r = await ladeBildPaket(ziel, undefined, `http://127.0.0.1:${port}/gift-images.tar.gz`);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.geschrieben, 1, 'nur das fehlende Bild wird geschrieben');
  assert.equal(r.uebersprungen, 1, 'vorhandenes Bild bleibt');
  assert.equal(fs.readFileSync(path.join(ziel, '0001_Rose.png'), 'utf-8'), 'MEIN-EIGENES', 'eigenes Bild unangetastet');
  assert.equal(fs.readFileSync(path.join(ziel, '0002_Flame_heart.png'), 'utf-8'), 'NEU-FLAME');
});

test('ladeBildPaket: Weiterleitung auf fremden Host wird abgelehnt (SSRF-Schutz)', async (t) => {
  // Der Server spielt GitHub und leitet auf einen fremden Host weiter — genau
  // das darf NICHT gefolgt werden.
  const server = http.createServer((_req, res) => {
    res.writeHead(302, { Location: 'http://boese.example.com/paket.tar.gz' });
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'giftpack-'));
  const r = await ladeBildPaket(ziel, undefined, `http://127.0.0.1:${port}/x.tar.gz`);
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /unerwartete Adresse/i);
});

test('Weiterleitungs-Ziele: nur GitHub erlaubt', () => {
  // Ein echter GitHub-Sprung laesst sich lokal nicht nachstellen, deshalb wird
  // hier die Regel selbst geprueft statt eine Weiterleitung vorzutaeuschen.
  for (const gut of ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']) {
    assert.equal(istErlaubterWeiterleitungsHost(gut), true, gut);
  }
  for (const boese of ['boese.example.com', 'github.com.evil.net', 'notgithub.com', '127.0.0.1', 'githubXcom']) {
    assert.equal(istErlaubterWeiterleitungsHost(boese), false, boese);
  }
});
