// tts-service.test.ts — Sequencing: mehrere Ansagen dürfen sich NICHT
// überlappen. Die nächste startet erst, wenn der Renderer das echte Audio-Ende
// meldet (notifyEnded), nicht nach einer Zeichen-Schätzung.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TTSService, type TTSPlayback } from './tts-service';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Test-Service ohne echte Synthese — riesige Schätzdauer, damit nur das
 *  echte 'ended' die nächste Ansage freigeben kann. */
class FakeTTS extends TTSService {
  override async synthesize(text: string): Promise<TTSPlayback> {
    return { fileId: `f-${text}`, durationMs: 100_000 };
  }
}

test('nächste Ansage startet erst nach echtem Audio-Ende, nicht nach Schätzung', async () => {
  const played: string[] = [];
  const tts = new FakeTTS(tmpDir(), (p) => played.push(p.fileId));

  tts.speak('a', 'v');
  tts.speak('b', 'v');
  await wait(20);
  assert.deepEqual(played, ['f-a'], 'erst nur die erste Ansage');

  // Renderer meldet: erste Ansage ist fertig → zweite darf starten.
  tts.notifyEnded('f-a');
  await wait(260); // 180ms Atempause + Puffer
  assert.deepEqual(played, ['f-a', 'f-b'], 'zweite Ansage erst nach Ende der ersten');
});

test('clear() gibt eine laufende Wartezeit frei (Reset hängt nicht)', async () => {
  const played: string[] = [];
  const tts = new FakeTTS(tmpDir(), (p) => played.push(p.fileId));
  tts.speak('x', 'v');
  await wait(20);
  assert.deepEqual(played, ['f-x']);
  // ohne notifyEnded: clear() muss die Wartezeit trotzdem auflösen
  tts.clear();
  await wait(20);
  // Queue ist leer → keine weitere Ansage, aber auch kein Hänger.
  assert.deepEqual(played, ['f-x']);
});
