import test from 'node:test';
import assert from 'node:assert/strict';
import { BYOK_PROVIDERS, isConfigured } from './tts-byok';

test('isConfigured: pflichtfelder müssen alle gesetzt sein', () => {
  assert.equal(isConfigured('elevenlabs', { apiKey: 'sk_x' }), true);
  assert.equal(isConfigured('elevenlabs', { apiKey: '' }), false);
  assert.equal(isConfigured('elevenlabs', undefined), false);
});

test('isConfigured: polly braucht key+secret+region', () => {
  assert.equal(isConfigured('polly', { accessKeyId: 'A', secretAccessKey: 'S', region: 'eu-central-1' }), true);
  assert.equal(isConfigured('polly', { accessKeyId: 'A', secretAccessKey: 'S' }), false);
});

test('isConfigured: openai-key ist optional, baseUrl pflicht', () => {
  assert.equal(isConfigured('openai', { baseUrl: 'http://x/v1' }), true, 'key optional');
  assert.equal(isConfigured('openai', { apiKey: 'k' }), false, 'baseUrl fehlt');
});

test('jeder provider hat anleitung, felder und mind. eine stimme', () => {
  for (const p of BYOK_PROVIDERS) {
    assert.ok(p.howto.length > 20, `${p.id} howto`);
    assert.ok(p.fields.length >= 1, `${p.id} fields`);
    assert.ok(p.voices.length >= 1, `${p.id} voices`);
  }
});
