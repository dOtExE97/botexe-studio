import test from 'node:test';
import assert from 'node:assert/strict';
import { sollIntroLaufen, type IntroTrigger } from './intro';

const frage = (typ: string, wann: IntroTrigger, extra: Partial<Parameters<typeof sollIntroLaufen>[0]> = {}) =>
  sollIntroLaufen({ typ, wann, schonGezeigt: false, ...extra });

test('Auslöser: jede Einstellung greift genau bei ihrem Ereignis', () => {
  assert.equal(frage('join', 'join'), true);
  assert.equal(frage('sub', 'join'), false);

  assert.equal(frage('sub', 'sub'), true);
  assert.equal(frage('join', 'sub'), false);

  assert.equal(frage('join', 'beides'), true);
  assert.equal(frage('sub', 'beides'), true);

  assert.equal(frage('join', 'aus'), false);
  assert.equal(frage('sub', 'aus'), false);
});

test('andere Ereignisse lösen nie ein Intro aus', () => {
  for (const typ of ['chat', 'gift', 'like', 'follow', 'share']) {
    assert.equal(frage(typ, 'beides'), false, `${typ} darf kein Intro starten`);
  }
});

test('einmal pro Stream: wer sein Intro hatte, bekommt es nicht nochmal', () => {
  // Der wichtigste Test: Zuschauer gehen bei TikTok ständig raus und rein.
  // Ohne diese Bremse liefe dasselbe Video bei jedem Wiedereintritt.
  assert.equal(frage('join', 'join', { schonGezeigt: true }), false);
  assert.equal(frage('sub', 'beides', { schonGezeigt: true }), false);
});

test('Test-Ereignisse lösen nichts aus', () => {
  // Sonst feuert jeder Probelauf im Test-Panel echte Intros ins Overlay.
  assert.equal(frage('join', 'join', { synthetic: true }), false);
  assert.equal(frage('sub', 'beides', { synthetic: true }), false);
});

test('unbekannte Einstellung spielt lieber nichts ab', () => {
  assert.equal(frage('join', 'quatsch' as IntroTrigger), false);
});
