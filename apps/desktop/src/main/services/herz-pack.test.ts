import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { leseTar, istSichererName, ladeHerzPaket, istErlaubterWeiterleitungsHost } from './herz-pack';

/** tar-Block von Hand (wie im Gift-Pack-Test) — testet den Leser gegen echtes Format. */
function tarEintrag(name: string, inhalt: Buffer, typ = '0'): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf-8');
  header.write('000644 \0', 100, 8, 'utf-8');
  header.write(inhalt.length.toString(8).padStart(11, '0') + ' ', 124, 12, 'utf-8');
  header.write('00000000000 ', 136, 12, 'utf-8');
  header.write('        ', 148, 8, 'utf-8');
  header.write(typ, 156, 1, 'utf-8');
  header.write('ustar\0' + '00', 257, 8, 'utf-8');
  let summe = 0; for (const b of header) summe += b;
  header.write(summe.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf-8');
  const daten = Buffer.alloc(Math.ceil(inhalt.length / 512) * 512);
  inhalt.copy(daten);
  return Buffer.concat([header, daten]);
}
function tarArchiv(...teile: Buffer[]): Buffer {
  return Buffer.concat([...teile, Buffer.alloc(1024)]);
}

test('leseTar: nur .webm, wehrt Ausbruch und Fremd-Dateien ab', () => {
  const archiv = tarArchiv(
    tarEintrag('../../etc/passwd', Buffer.from('BOESE')),
    tarEintrag('unter/ordner/neon.webm', Buffer.from('BOESE')),
    tarEintrag('/absolut/dj.webm', Buffer.from('BOESE')),
    tarEintrag('.versteckt.webm', Buffer.from('BOESE')),
    tarEintrag('royal.png', Buffer.from('BOESE')),        // falsche Endung
    tarEintrag('ordner/', Buffer.alloc(0), '5'),
    tarEintrag('signature-dj.webm', Buffer.from('GUT')),
  );
  const e = leseTar(archiv);
  assert.equal(e.length, 1, 'nur der harmlose .webm-Eintrag überlebt');
  assert.equal(e[0]?.name, 'signature-dj.webm');
  assert.equal(e[0]?.daten.toString(), 'GUT');
});

test('istSichererName: nur schlichte .webm-Namen', () => {
  for (const gut of ['signature-dj.webm', 'galaxy-rider.webm', 'a.WEBM']) {
    assert.equal(istSichererName(gut), true, gut);
  }
  for (const boese of ['', '../x.webm', 'a/b.webm', 'a\\b.webm', '.x.webm', 'x.mp4', 'x.webm.exe', 'x'.repeat(300) + '.webm']) {
    assert.equal(istSichererName(boese), false, boese);
  }
});

test('ladeHerzPaket: lädt, entpackt, überschreibt Vorhandenes NICHT', async (t) => {
  const archiv = tarArchiv(
    tarEintrag('signature-dj.webm', Buffer.from('NEU-DJ')),
    tarEintrag('galaxy-rider.webm', Buffer.from('NEU-GALAXY')),
  );
  const gz = zlib.gzipSync(archiv);
  const server = http.createServer((_q, res) => { res.writeHead(200, { 'Content-Length': String(gz.length) }); res.end(gz); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'herzpack-'));
  fs.writeFileSync(path.join(ziel, 'signature-dj.webm'), 'MEIN-EIGENES');
  const r = await ladeHerzPaket(ziel, undefined, `http://127.0.0.1:${port}/heart-pack.tar.gz`);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.geschrieben, 1);
  assert.equal(r.uebersprungen, 1);
  assert.equal(fs.readFileSync(path.join(ziel, 'signature-dj.webm'), 'utf-8'), 'MEIN-EIGENES');
  assert.equal(fs.readFileSync(path.join(ziel, 'galaxy-rider.webm'), 'utf-8'), 'NEU-GALAXY');
});

test('ladeHerzPaket: Weiterleitung auf fremden Host wird abgelehnt (SSRF-Schutz)', async (t) => {
  const server = http.createServer((_q, res) => { res.writeHead(302, { Location: 'http://boese.example.com/p.tar.gz' }); res.end(); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'herzpack-'));
  const r = await ladeHerzPaket(ziel, undefined, `http://127.0.0.1:${port}/x.tar.gz`);
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /unerwartete Adresse/i);
});

test('Weiterleitungs-Ziele: nur GitHub erlaubt', () => {
  for (const gut of ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']) {
    assert.equal(istErlaubterWeiterleitungsHost(gut), true, gut);
  }
  for (const boese of ['boese.example.com', 'github.com.evil.net', 'notgithub.com', '127.0.0.1']) {
    assert.equal(istErlaubterWeiterleitungsHost(boese), false, boese);
  }
});
