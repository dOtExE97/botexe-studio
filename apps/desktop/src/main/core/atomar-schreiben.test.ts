import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { schreibeAtomar } from './atomar-schreiben';

function tempOrdner(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bx-atomar-'));
}

test('schreibt die Datei und lässt keine .tmp zurück', () => {
  const dir = tempOrdner();
  const ziel = path.join(dir, 'daten.json');
  schreibeAtomar(ziel, '{"a":1}');
  assert.equal(fs.readFileSync(ziel, 'utf-8'), '{"a":1}');
  assert.equal(fs.existsSync(`${ziel}.tmp`), false, 'die Zwischendatei muss weg sein');
});

test('ersetzt eine bestehende Datei vollständig', () => {
  const dir = tempOrdner();
  const ziel = path.join(dir, 'daten.json');
  fs.writeFileSync(ziel, 'ein ziemlich langer alter Inhalt', 'utf-8');
  schreibeAtomar(ziel, 'kurz');
  assert.equal(fs.readFileSync(ziel, 'utf-8'), 'kurz', 'kein Rest des alten Inhalts');
});

test('Umlaute überleben (UTF-8)', () => {
  const dir = tempOrdner();
  const ziel = path.join(dir, 'daten.json');
  schreibeAtomar(ziel, JSON.stringify({ name: 'Glücksrad — Größe: 1080×1920 🎡' }));
  assert.equal(JSON.parse(fs.readFileSync(ziel, 'utf-8')).name, 'Glücksrad — Größe: 1080×1920 🎡');
});

test('meldet einen Fehler nach oben, statt ihn zu verschlucken', () => {
  // Zielordner existiert nicht → der Aufrufer muss die Chance haben, das zu merken.
  assert.throws(() => schreibeAtomar(path.join(tempOrdner(), 'fehlt', 'daten.json'), 'x'));
});

test('DAS eigentliche Versprechen: scheitert das Schreiben, bleibt die alte Datei unversehrt', () => {
  const dir = tempOrdner();
  const ziel = path.join(dir, 'daten.json');
  fs.writeFileSync(ziel, '{"wichtig":true}', 'utf-8');
  // Den Zwischenpfad blockieren: dort liegt ein ORDNER, das Schreiben muss scheitern.
  fs.mkdirSync(`${ziel}.tmp`);
  assert.throws(() => schreibeAtomar(ziel, '{"neu":1}'));
  assert.equal(fs.readFileSync(ziel, 'utf-8'), '{"wichtig":true}', 'die alte Datei darf nicht angefasst worden sein');
});

test('räumt die Zwischendatei weg, wenn das Umbenennen scheitert', () => {
  const dir = tempOrdner();
  const ziel = path.join(dir, 'unterordner'); // Ziel ist ein ORDNER → rename scheitert
  fs.mkdirSync(ziel);
  assert.throws(() => schreibeAtomar(ziel, 'x'));
  assert.equal(fs.existsSync(`${ziel}.tmp`), false, 'keine Waisen-Datei zurücklassen');
});
