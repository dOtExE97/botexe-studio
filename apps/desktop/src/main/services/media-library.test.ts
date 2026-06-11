import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MediaLibrary } from './media-library';

function tmpUserDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'botexe-media-test-'));
}

function fakeFile(dir: string, name: string, bytes = 64): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(bytes, 1));
  return p;
}

test('import: kopiert Bild + leitet kind=image ab', () => {
  const userDir = tmpUserDir();
  const src = tmpUserDir();
  const lib = new MediaLibrary(userDir);
  const res = lib.import(fakeFile(src, 'Logo.PNG'));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.entry.kind, 'image');
  assert.match(res.entry.filename, /\.png$/); // kleingeschrieben/saniert
  assert.equal(fs.existsSync(path.join(lib.getDir(), res.entry.filename)), true);
});

test('import: Video bekommt kind=video', () => {
  const userDir = tmpUserDir();
  const src = tmpUserDir();
  const lib = new MediaLibrary(userDir);
  const res = lib.import(fakeFile(src, 'welcome.mp4'));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.entry.kind, 'video');
});

test('import: unbekanntes Format wird abgelehnt', () => {
  const userDir = tmpUserDir();
  const src = tmpUserDir();
  const lib = new MediaLibrary(userDir);
  const res = lib.import(fakeFile(src, 'evil.exe'));
  assert.equal(res.ok, false);
});

test('import: Namenskollision wird durchnummeriert', () => {
  const userDir = tmpUserDir();
  const src = tmpUserDir();
  const lib = new MediaLibrary(userDir);
  const a = lib.import(fakeFile(src, 'pic.jpg'));
  const b = lib.import(fakeFile(src, 'pic.jpg'));
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.notEqual(a.entry.filename, b.entry.filename);
});

test('list: gibt importierte Medien sortiert zurück, ignoriert Fremddateien', () => {
  const userDir = tmpUserDir();
  const src = tmpUserDir();
  const lib = new MediaLibrary(userDir);
  lib.import(fakeFile(src, 'b.png'));
  lib.import(fakeFile(src, 'a.mp4'));
  fs.writeFileSync(path.join(lib.getDir(), 'notes.txt'), 'x'); // Fremddatei
  const list = lib.list();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((e) => e.filename), ['a.mp4', 'b.png']);
  assert.deepEqual(list.map((e) => e.kind), ['video', 'image']);
});

test('delete: entfernt Datei, lehnt Pfad-Traversal ab', () => {
  const userDir = tmpUserDir();
  const src = tmpUserDir();
  const lib = new MediaLibrary(userDir);
  const res = lib.import(fakeFile(src, 'gone.png'));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(lib.delete('../../etc/passwd'), false);
  assert.equal(lib.delete(res.entry.filename), true);
  assert.equal(fs.existsSync(path.join(lib.getDir(), res.entry.filename)), false);
});
