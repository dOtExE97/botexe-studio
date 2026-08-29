import test from 'node:test';
import assert from 'node:assert/strict';
import { sollIntroLaufen, TEAMHERZ_GIFT_ID, type IntroTrigger } from './intro';

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

// „Teamherz" ist auf TikTok ein GESCHENK (ID 7934, 1 Coin) — kein Abo. Die App
// nannte bis v0.47 das bezahlte Abo so. Wer „Intro beim Teamherz" einstellte,
// wartete deshalb auf etwas, das fast nie kommt, während die Teamherzen im
// Sekundentakt eintrudelten (belegt: 10 Stück in einem Stream, null Intros).
test('Teamherz-Auslöser reagiert auf das GESCHENK 7934, nicht auf das Abo', () => {
  const f = { schonGezeigt: false, wann: 'teamherz' as const };
  assert.equal(sollIntroLaufen({ ...f, typ: 'gift', giftId: TEAMHERZ_GIFT_ID }), true);
  assert.equal(sollIntroLaufen({ ...f, typ: 'gift', giftId: 5655 }), false, 'anderes Geschenk zählt nicht');
  assert.equal(sollIntroLaufen({ ...f, typ: 'sub' }), false, 'das Abo ist etwas anderes');
  assert.equal(sollIntroLaufen({ ...f, typ: 'join' }), false);
});

test('Abo-Auslöser reagiert NUR auf das Abo, nicht auf das Teamherz-Geschenk', () => {
  const f = { schonGezeigt: false, wann: 'sub' as const };
  assert.equal(sollIntroLaufen({ ...f, typ: 'sub' }), true);
  assert.equal(sollIntroLaufen({ ...f, typ: 'gift', giftId: TEAMHERZ_GIFT_ID }), false);
});

test('„Bei allem" schließt Betreten, Abo UND Teamherz-Geschenk ein', () => {
  const f = { schonGezeigt: false, wann: 'beides' as const };
  assert.equal(sollIntroLaufen({ ...f, typ: 'join' }), true);
  assert.equal(sollIntroLaufen({ ...f, typ: 'sub' }), true);
  assert.equal(sollIntroLaufen({ ...f, typ: 'gift', giftId: TEAMHERZ_GIFT_ID }), true);
  assert.equal(sollIntroLaufen({ ...f, typ: 'gift', giftId: 1 }), false, 'ein x-beliebiges Geschenk nicht');
});

// Wächter: Die Geschenk-Nummer des Teamherzens steht ein zweites Mal im
// Coin-Glas (packages/widget-kit/gift-jar.js) — reines JavaScript kann diese
// TypeScript-Datei nicht importieren. Laufen die Zahlen auseinander, füllt sich
// das Teamherz-Glas einfach nie, ohne dass irgendwo ein Fehler auftaucht.
test('die Teamherz-Geschenknummer im Coin-Glas ist dieselbe', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const wurzel = existsSync(join(process.cwd(), 'src', 'main.ts')) ? join(process.cwd(), '..', '..') : process.cwd();
  const quelle = readFileSync(join(wurzel, 'packages/widget-kit/gift-jar.js'), 'utf-8');
  const m = quelle.match(/const TEAMHERZ_GIFT_ID = (\d+);/);
  assert.ok(m, 'TEAMHERZ_GIFT_ID im Coin-Glas nicht gefunden — Kopie umbenannt?');
  assert.equal(Number(m[1]), TEAMHERZ_GIFT_ID);
});
