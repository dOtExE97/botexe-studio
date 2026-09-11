// herz-alarm.test.ts — reine Logik des Herz-Alarm-Widgets (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trifftAusloeser, waehleMotiv, baueUserText, escapeHtml, MOTIVE, GEBUENDELT } from './herz-alarm.js';

test('Teamherz kommt auf ZWEI Wegen — beide zählen', () => {
  // Fanclub-Beitritt als sub …
  assert.equal(trifftAusloeser({ type: 'sub', user: {} }, 'teamherz'), true);
  // … und das Teamherz-Geschenk (giftId 7934).
  assert.equal(trifftAusloeser({ type: 'gift', gift: { giftId: 7934 } }, 'teamherz'), true);
  // Ein anderes Geschenk ist KEIN Teamherz.
  assert.equal(trifftAusloeser({ type: 'gift', gift: { giftId: 1 } }, 'teamherz'), false);
  assert.equal(trifftAusloeser({ type: 'follow' }, 'teamherz'), false);
});

test('Mindeststufe greift nur beim Teamherz und nur mit bekannter Stufe', () => {
  assert.equal(trifftAusloeser({ type: 'sub', user: { teamLevel: 5 } }, 'teamherz', 3), true);
  assert.equal(trifftAusloeser({ type: 'sub', user: { teamLevel: 2 } }, 'teamherz', 3), false);
  // Keine Stufe bekannt, aber ab 3 verlangt → NICHT feuern (sonst löst jeder aus).
  assert.equal(trifftAusloeser({ type: 'sub', user: {} }, 'teamherz', 3), false);
  // Ohne Mindeststufe reicht das Teamherz.
  assert.equal(trifftAusloeser({ type: 'sub', user: {} }, 'teamherz', 0), true);
});

test('andere Auslöser matchen direkt auf den Ereignistyp', () => {
  assert.equal(trifftAusloeser({ type: 'gift' }, 'gift'), true);
  assert.equal(trifftAusloeser({ type: 'follow' }, 'follow'), true);
  assert.equal(trifftAusloeser({ type: 'sub' }, 'gift'), false);
  assert.equal(trifftAusloeser(null, 'gift'), false);
});

test('waehleMotiv: rotation läuft rund über die VERFÜGBAREN', () => {
  const verf = ['royal', 'kiss', 'angel'];
  assert.equal(waehleMotiv('rotation', null, verf), 'royal', 'erster Lauf');
  assert.equal(waehleMotiv('rotation', 'royal', verf), 'kiss');
  assert.equal(waehleMotiv('rotation', 'angel', verf), 'royal', 'nach dem letzten wieder von vorn');
});

test('waehleMotiv: fester Wunsch gewinnt — aber nur wenn vorhanden', () => {
  const verf = ['royal', 'kiss', 'angel'];
  assert.equal(waehleMotiv('kiss', 'royal', verf), 'kiss');
  assert.equal(waehleMotiv('signature-dj', 'royal', verf), 'kiss', 'Pack nicht installiert → Rotation');
  assert.equal(waehleMotiv('signature-dj', 'royal', ['royal', 'kiss', 'angel', 'signature-dj']), 'signature-dj');
});

test('waehleMotiv: leere Liste → null (kein Absturz)', () => {
  assert.equal(waehleMotiv('rotation', null, []), null);
  assert.equal(waehleMotiv('royal', null, undefined), null);
});

test('baueUserText: {name} einsetzen, HTML entschärfen, Rückfall', () => {
  assert.equal(baueUserText('💜 {name} ist Teil des Teams', 'Semil'), '💜 Semil ist Teil des Teams');
  assert.equal(baueUserText('{name} lässt ein Teamherz da', 'Mia'), 'Mia lässt ein Teamherz da');
  // Kein Name → „Jemand".
  assert.equal(baueUserText('{name} da', ''), 'Jemand da');
  // Leere Vorlage → nur der Name.
  assert.equal(baueUserText('', 'Mia'), 'Mia');
  // XSS: spitze Klammern im Namen werden escaped, nicht als HTML gedeutet.
  assert.ok(!baueUserText('{name}', '<img src=x onerror=alert(1)>').includes('<img'));
  assert.equal(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
});

test('Katalog: 3 gebündelt + 6 Pack, alle mit .webm', () => {
  assert.deepEqual(GEBUENDELT, ['royal', 'kiss', 'angel']);
  assert.equal(MOTIVE.length, 9);
  for (const m of MOTIVE) assert.match(m.datei, /\.webm$/);
});

// Wächter: Die Teamherz-Geschenknummer steht ein zweites Mal im Widget (reines
// JS kann intro.ts nicht importieren). Laufen die Zahlen auseinander, feuert
// „Teamherz" beim Gift-Weg nie — ohne dass irgendwo ein Fehler auftaucht.
test('Teamherz-Geschenknummer deckt sich mit intro.ts', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const hier = dirname(fileURLToPath(import.meta.url));
  const intro = readFileSync(join(hier, '../../apps/desktop/src/main/services/intro.ts'), 'utf-8');
  const widget = readFileSync(join(hier, 'herz-alarm.js'), 'utf-8');
  const a = intro.match(/TEAMHERZ_GIFT_ID\s*=\s*(\d+)/);
  const b = widget.match(/TEAMHERZ_GIFT_ID\s*=\s*(\d+)/);
  assert.ok(a && b, 'TEAMHERZ_GIFT_ID in beiden Dateien gefunden');
  assert.equal(a[1], b[1]);
});
