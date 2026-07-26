import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNING_SPECS, resolveTuning } from './tts-tuning';

test('jeder Anbieter mit Reglern hat Vorgaben', () => {
  for (const [prov, params] of Object.entries(TUNING_SPECS)) {
    assert.ok(params.length > 0, prov);
    for (const p of params) assert.notEqual(p.default, undefined, `${prov}.${p.key}`);
  }
});

test('resolveTuning füllt Vorgaben und klemmt Ausreißer', () => {
  const t = resolveTuning('edge', { rate: 999 });
  assert.equal(t.rate, 50); // auf max geklemmt
  assert.equal(t.pitch, 0); // Vorgabe ergänzt
});

test('resolveTuning: unbekannter Anbieter ⇒ leeres Objekt', () => {
  assert.deepEqual(resolveTuning('gibtsnicht', {}), {});
});

test('resolveTuning klemmt auch nach unten', () => {
  const t = resolveTuning('edge', { rate: -999, pitch: -999 });
  assert.equal(t.rate, -50);
  assert.equal(t.pitch, -20);
});

test('resolveTuning: string-Parameter mit ungültigem Wert fällt auf Vorgabe zurück', () => {
  const t = resolveTuning('openai', { quality: 'gibtsnicht' });
  assert.equal(t.quality, 'tts-1');
  assert.equal(t.speed, 1);
});

test('resolveTuning: gültiger string-Parameter wird übernommen', () => {
  const t = resolveTuning('openai', { quality: 'tts-1-hd', speed: 1.5 });
  assert.equal(t.quality, 'tts-1-hd');
  assert.equal(t.speed, 1.5);
});

test('resolveTuning: ohne gespeicherte Werte kommen nur Vorgaben zurück', () => {
  assert.deepEqual(resolveTuning('polly', {}), { engine: 'neural' });
  assert.deepEqual(resolveTuning('elevenlabs', undefined), { stability: 0.5, similarity: 0.75, style: 0 });
});

test('gtts hat KEINEN Eintrag (verify-or-drop: kein bestätigter Slow-Parameter)', () => {
  assert.equal(TUNING_SPECS.gtts, undefined);
  assert.deepEqual(resolveTuning('gtts', { slow: 1 }), {});
});
