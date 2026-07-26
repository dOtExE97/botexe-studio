import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVoiceId, providerFromVoice } from './tts-voice';

test('normalizeVoiceId: namespaced Stimme bleibt unverändert', () => {
  assert.equal(normalizeVoiceId('piper:de-thorsten'), 'piper:de-thorsten');
});

test('normalizeVoiceId: Legacy-Stimme ohne Namespace bekommt edge:', () => {
  assert.equal(normalizeVoiceId('de-DE-KatjaNeural'), 'edge:de-DE-KatjaNeural');
});

test('providerFromVoice: liest den Namespace vor dem ersten ":"', () => {
  assert.equal(providerFromVoice('edge:de-DE-KatjaNeural'), 'edge');
  assert.equal(providerFromVoice('elevenlabs:abc123'), 'elevenlabs');
});

test('providerFromVoice: Legacy-Stimme ohne Namespace → edge', () => {
  assert.equal(providerFromVoice('de-DE-KatjaNeural'), 'edge');
});
