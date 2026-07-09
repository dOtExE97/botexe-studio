import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MIXER, channelGain, channelSinkId, categoryOf, normalizeMixer, SOUND_CATEGORIES,
} from './mixer';

test('DEFAULT_MIXER: Master voll, jeder Kanal offen und nicht stumm', () => {
  assert.equal(DEFAULT_MIXER.master, 1);
  for (const c of SOUND_CATEGORIES) {
    assert.equal(DEFAULT_MIXER.channels[c].volume, 1);
    assert.equal(DEFAULT_MIXER.channels[c].muted, false);
    assert.equal(DEFAULT_MIXER.channels[c].sinkId, '');
  }
});

test('channelGain: Master × Kanal-Lautstärke', () => {
  const m = normalizeMixer({ master: 0.5, channels: { tts: { volume: 0.8 } } });
  assert.equal(Math.round(channelGain(m, 'tts') * 1000) / 1000, 0.4);
});

test('channelGain: stumm ergibt 0 (egal welche Lautstärke)', () => {
  const m = normalizeMixer({ channels: { alert: { volume: 1, muted: true } } });
  assert.equal(channelGain(m, 'alert'), 0);
});

test('channelGain: Werte über 1 / unter 0 werden geklemmt', () => {
  const m = normalizeMixer({ master: 5, channels: { game: { volume: 5 } } });
  assert.equal(channelGain(m, 'game'), 1);
  const m2 = normalizeMixer({ master: -3, channels: { game: { volume: 2 } } });
  assert.equal(channelGain(m2, 'game'), 0);
});

test('channelSinkId: eigenes Gerät gewinnt, sonst globales', () => {
  const m = normalizeMixer({ channels: { tts: { sinkId: 'kabel-b1' } } });
  assert.equal(channelSinkId(m, 'tts', 'rodecaster'), 'kabel-b1', 'eigenes Gerät des Kanals');
  assert.equal(channelSinkId(m, 'alert', 'rodecaster'), 'rodecaster', 'ohne eigenes → globales');
});

test('categoryOf: explizite Kategorie, sonst tts-Prefix, sonst soundboard', () => {
  assert.equal(categoryOf({ soundId: 'x', category: 'game' }), 'game');
  assert.equal(categoryOf({ soundId: 'tts-123.mp3' }), 'tts', 'Alt-Sounds ohne Kategorie via Prefix');
  assert.equal(categoryOf({ soundId: 'boom' }), 'soundboard');
});

test('normalizeMixer: Teil-Objekt wird mit Defaults vervollständigt', () => {
  const m = normalizeMixer({ master: 0.6, channels: { tts: { volume: 0.3 } } });
  assert.equal(m.master, 0.6);
  assert.equal(m.channels.tts.volume, 0.3);
  // fehlende Kanäle bekommen Defaults
  assert.equal(m.channels.alert.volume, 1);
  assert.equal(m.channels.soundboard.muted, false);
  assert.equal(m.channels.game.sinkId, '');
});

test('normalizeMixer: Müll/undefined → sauberer Default', () => {
  const m = normalizeMixer(undefined);
  assert.deepEqual(m, DEFAULT_MIXER);
  const m2 = normalizeMixer('kaputt');
  assert.equal(m2.master, 1);
});
