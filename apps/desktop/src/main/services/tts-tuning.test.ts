import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNING_SPECS, resolveTuning } from './tts-tuning';
import { piperArgs } from './tts-providers';

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

// ── piperArgs (Task 3: Tuning wirkt jetzt auch bei Piper) ──────────────────

test('piperArgs setzt Tempo/Ausdruck/Pausen', () => {
  const a = piperArgs({ lengthScale: 1.2, noiseScale: 0.5, noiseW: 0.6, sentenceSilence: 0.3 });
  assert.ok(a.includes('--length_scale')); assert.ok(a.includes('1.2'));
  assert.ok(a.includes('--noise_scale')); assert.ok(a.includes('--noise_w')); assert.ok(a.includes('--sentence_silence'));
});

test('piperArgs ohne Tuning ⇒ keine Flags', () => {
  assert.deepEqual(piperArgs({}), []);
  assert.deepEqual(piperArgs(undefined), []);
});

test('piperArgs: aufgelöstes Standard-Tuning (resolveTuning-Output) ergibt alle vier Flags', () => {
  const a = piperArgs(resolveTuning('piper', {}));
  for (const flag of ['--length_scale', '--noise_scale', '--noise_w', '--sentence_silence']) {
    assert.ok(a.includes(flag), flag);
  }
  assert.equal(a.length, 8); // 4 Flags + 4 Werte
});

test('piperArgs ignoriert nicht-numerische/undefinierte Werte', () => {
  assert.deepEqual(piperArgs({ lengthScale: Number.NaN, quality: 'tts-1' } as unknown as Record<string, number>), []);
});
