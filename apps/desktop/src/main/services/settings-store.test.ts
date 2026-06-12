import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SettingsStore, SETTINGS_SCHEMA_VERSION } from './settings-store';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
}

function writeSettings(dir: string, data: unknown): void {
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(data), 'utf-8');
}

test('Migration v4→v5: triggerRules bleiben, kaputte Regel fliegt raus, neue Felder als Default', () => {
  const dir = tmpDir();
  writeSettings(dir, {
    schemaVersion: 4,
    triggerRules: [
      { id: 'r1', name: 'Gut', event: 'gift', actions: [], enabled: true },
      { id: 'kaputt', name: 'fehlt event' }, // ungültig → verworfen
    ],
    points: { perChat: 5 }, // partial → mit Defaults gemerged
    // redemptions / panelButtons / audioOutputId fehlen (v4)
  });
  const s = new SettingsStore(dir).get();

  assert.equal(s.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(s.triggerRules.length, 1);
  assert.equal(s.triggerRules[0]?.id, 'r1');
  assert.deepEqual(s.redemptions, []);
  assert.deepEqual(s.panelButtons, []);
  assert.equal(s.audioOutputId, '');
  assert.equal(s.points.perChat, 5); // übernommen
  assert.equal(typeof s.points.perFollow, 'number'); // aus Defaults ergänzt
});

test('Migration: ungültige Einlösung/Panel-Knopf werden einzeln verworfen', () => {
  const dir = tmpDir();
  writeSettings(dir, {
    schemaVersion: 5,
    redemptions: [
      { id: 'ok', name: 'Airhorn', command: '!airhorn', cost: 100, actions: [], enabled: true },
      { id: 'bad', name: 'fehlt cost', command: '!x', actions: [], enabled: true }, // cost fehlt → raus
    ],
    panelButtons: [
      { id: 'pb', label: 'Knopf', action: { kind: 'play_sound', soundId: 's' } },
      { id: 'badpb', label: 'kein action' }, // action fehlt → raus
      { id: 'badaccel', label: 'x', action: {}, accelerator: 123 }, // accelerator nicht string → raus
    ],
  });
  const s = new SettingsStore(dir).get();

  assert.equal(s.redemptions.length, 1);
  assert.equal(s.redemptions[0]?.id, 'ok');
  assert.equal(s.panelButtons.length, 1);
  assert.equal(s.panelButtons[0]?.id, 'pb');
});

test('kaputtes settings.json → Defaults statt Crash', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ das ist kein json', 'utf-8');
  const s = new SettingsStore(dir).get();
  assert.equal(s.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.deepEqual(s.triggerRules, []);
  assert.deepEqual(s.redemptions, []);
});

test('get() liefert tiefe Kopie — Mutation leakt nicht in den Cache', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  const a = store.get();
  a.redemptions.push({ id: 'x', name: 'x', command: '!x', cost: 0, actions: [], enabled: true });
  (a.points as { perChat: number }).perChat = 999;
  const b = store.get();
  assert.equal(b.redemptions.length, 0); // Mutation an a hat den Cache NICHT verändert
  assert.notEqual(b.points.perChat, 999);
});
