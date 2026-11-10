// Wächter: Kennt die Test-Event-Route alle Felder eines StudioEvent?
//
// `/api/test-event` baut das Ereignis aus einer festen Feldliste neu zusammen
// (Defense-in-Depth, damit keine Fremdfelder in den Bus gelangen). Fehlt dort
// ein Feld, wird es STILL verworfen: Das Ereignis kommt an, aber ohne seinen
// Inhalt — ein Sticker-Overlay lässt sich dann ohne echten Stream gar nicht
// ausprobieren, und niemand sieht, woran es liegt.
//
// Das ist die dritte Allowlist dieser Art im Projekt (nach SETTINGS_UPDATE und
// CONDITION_KINDS), und alle drei sind schon einmal vergessen worden. Deshalb
// prüft dieser Test sie gegen den echten Typ, statt sich auf Sorgfalt zu
// verlassen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), '..', '..')
  : process.cwd();

/** Felder, die die Route bewusst NICHT übernimmt — mit Grund. */
const BEWUSST_DRAUSSEN = new Map<string, string>([
  ['type', 'wird oben separat geprüft und gesetzt'],
  ['ts', 'setzt die Route selbst (Date.now), sonst wäre die Zeit fälschbar'],
  ['synthetic', 'setzt die Route hart auf true — sonst könnte ein Aufrufer die Absicherung aushebeln'],
  ['sticky', 'nur für den Reconnect-Replay der App, von außen sinnlos'],
  ['raumBeste', 'TikToks Raum-Bestenliste, kein sinnvoller Testwert'],
  ['anonymousViewers', 'kommt nur mit echten Zuschauerzahlen'],
  ['beliebtheit', 'TikToks eigener Wert, von außen nicht simulierbar'],
  ['ehrengast', 'hängt an echten Beitritts-Daten'],
  ['firstFollow', 'entscheidet das Follow-Gedächtnis der App, nicht der Aufrufer'],
  ['superfanNeu', 'entscheidet die Normalisierung aus TikToks Daten'],
]);

test('die Test-Event-Route kennt jedes Feld eines StudioEvent', () => {
  const typQuelle = readFileSync(join(WURZEL, 'packages/trigger-engine/src/index.ts'), 'utf-8');
  const anfang = typQuelle.indexOf('export interface StudioEvent {');
  assert.ok(anfang > 0, 'StudioEvent nicht gefunden — Test muss angepasst werden');
  const block = typQuelle.slice(anfang, typQuelle.indexOf('\n}', anfang));
  // Feldnamen einsammeln: alles am Zeilenanfang vor `?:` oder `:`.
  const felder = [...block.matchAll(/^\s{2}([a-zA-Z][\w]*)\??:/gm)].map((m) => m[1] as string);
  assert.ok(felder.length > 8, `nur ${felder.length} Felder erkannt — Regex prüfen`);

  const route = readFileSync(join(WURZEL, 'apps/desktop/src/main/adapters/overlay-server.ts'), 'utf-8');
  const von = route.indexOf('const clean: StudioEvent = {');
  assert.ok(von > 0, 'Test-Event-Route nicht gefunden');
  const routenBlock = route.slice(von, route.indexOf('this.bus.publish(clean)', von));

  // Gegen den eigenen Kommentar-Text pruefen waere zu lasch: Ein Feldname, der
  // zufaellig in einem der (langen) deutschen Kommentare vorkommt, wuerde den
  // Waechter beruhigen, obwohl die Route das Feld weiter verwirft. Deshalb
  // zaehlen nur echte Zuweisungen `feld:` — und Kommentarzeilen fliegen vorher
  // raus.
  const ohneKommentare = routenBlock
    .split('\n')
    .filter((z) => !z.trim().startsWith('//') && !z.trim().startsWith('*') && !z.trim().startsWith('/*'))
    .join('\n');
  const fehlen = felder.filter(
    (f) => !BEWUSST_DRAUSSEN.has(f) && !new RegExp(`\\b${f}\\s*:`).test(ohneKommentare),
  );
  assert.deepEqual(
    fehlen,
    [],
    'Diese StudioEvent-Felder fehlen in /api/test-event und werden dadurch STILL verworfen: '
      + `${fehlen.join(', ')}\n`
      + 'Entweder in die Liste der Route aufnehmen oder in BEWUSST_DRAUSSEN mit Grund eintragen.',
  );
});

test('die Ausnahmeliste enthält nur Felder, die es wirklich gibt', () => {
  // Sonst schleppt sie Namen mit, die längst umbenannt wurden — und deckt
  // dabei ein echtes neues Feld zu.
  const typQuelle = readFileSync(join(WURZEL, 'packages/trigger-engine/src/index.ts'), 'utf-8');
  const anfang = typQuelle.indexOf('export interface StudioEvent {');
  const block = typQuelle.slice(anfang, typQuelle.indexOf('\n}', anfang));
  const felder = new Set([...block.matchAll(/^\s{2}([a-zA-Z][\w]*)\??:/gm)].map((m) => m[1] as string));
  const veraltet = [...BEWUSST_DRAUSSEN.keys()].filter((f) => !felder.has(f));
  assert.deepEqual(veraltet, [], `Diese Ausnahmen gibt es im Typ gar nicht (mehr): ${veraltet.join(', ')}`);
});
