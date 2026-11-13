// orakel-kisten.test.ts — die App würfelt die Orakel-Kiste für Twitch-Follows.
//
// Drei Fragen:
// 1. Würfelt die App GENAU wie das Widget? (eine Funktion, nicht zwei Kopien)
// 2. Einmal je Zuschauer und Stream — Test-Ereignisse würfeln frisch, ohne
//    etwas zu verbrauchen; TikTok bleibt Sache des Widgets.
// 3. Ist es in studio.ts auch EINGEBAUT — vor dem Overlay-Server, mit Reset?
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { wuerfleKiste as appWurf, type StudioEvent } from '@botexe/trigger-engine';
import { wuerfleKiste as widgetWurf, orakelWurf, normalisiereCfg } from '../../../../../packages/widget-kit/ereignis-alarm.js';
import { wuerfleKiste as quelle } from '../../../../../packages/widget-kit/orakel-kiste.js';
import { EventBus } from '../core/event-bus';
import { OrakelKisten, orakelGrenzen, sollOrakelWuerfeln } from './orakel-kisten';
import { TWITCH_ANONYM_ID } from '../adapters/twitch-normalize';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

function follow(id: string, extra: Partial<StudioEvent> = {}): StudioEvent {
  return { type: 'follow', ts: 1, plattform: 'twitch', user: { id, nickname: id }, ...extra };
}

/** Feste Zufallsfolge — jede Seite bekommt dieselbe. */
function folge(werte: number[]): () => number {
  let i = 0;
  return () => werte[i++ % werte.length]!;
}

test('App und Widget würfeln mit DERSELBEN Funktion — gleiche Zufallszahl, gleiche Kiste', () => {
  assert.equal(appWurf, quelle, 'App-Import ist die eine Quelle');
  assert.equal(widgetWurf, quelle, 'Widget-Export ist die eine Quelle');
  const us = [0, 1e-9, 0.01, 0.25, 0.5, 0.75, 0.99, 0.999999, 0.999999999999];
  for (const chance of [2, 1000, 137500, 99_999_999]) {
    for (const u of us) assert.equal(appWurf(chance, () => u), widgetWurf(chance, () => u), `chance ${chance}, u ${u}`);
  }
  // Durchs Kistenlager der App gerechnet: dieselben Zahlen wie das Widget.
  const lager = new OrakelKisten(folge(us));
  const erwartet = us.map((u) => widgetWurf(137500, () => u));
  const bekommen = us.map((_, i) => lager.fuerFollow(follow(`twitch:${i}`), { chance: 137500, glueck: 1000 })!.kiste);
  assert.deepEqual(bekommen, erwartet);
});

test('einmal je Zuschauer und Stream: Neu-Folgen würfelt nicht neu, Reset schon', () => {
  const lager = new OrakelKisten(folge([0.3, 0.6, 0.9]));
  const a = lager.fuerFollow(follow('twitch:mia'), { chance: 137500, glueck: 1000 })!;
  const b = lager.fuerFollow(follow('twitch:mia'), { chance: 137500, glueck: 1000 })!;
  assert.deepEqual(a, b, 'Entfolgen + neu Folgen → dieselbe Kiste');
  assert.equal(lager.kisteVon('twitch:mia'), a.kiste);
  const ben = lager.fuerFollow(follow('twitch:ben'), { chance: 137500, glueck: 1000 })!;
  assert.notEqual(ben.kiste, a.kiste);
  assert.equal(lager.anzahl(), 2);
  lager.reset();
  assert.equal(lager.kisteVon('twitch:mia'), null, 'neuer Stream → keine Kiste mehr');
  const neu = lager.fuerFollow(follow('twitch:mia'), { chance: 137500, glueck: 1000 })!;
  assert.notEqual(neu.kiste, a.kiste, 'nach dem Reset würfelt Mia neu');
});

test('Test-Ereignisse würfeln jedes Mal frisch und verbrauchen nichts', () => {
  const lager = new OrakelKisten(folge([0.2, 0.7]));
  const t1 = lager.fuerFollow(follow('twitch:mia', { synthetic: true }), { chance: 137500, glueck: 1000 })!;
  const t2 = lager.fuerFollow(follow('twitch:mia', { synthetic: true }), { chance: 137500, glueck: 1000 })!;
  assert.notEqual(t1.kiste, t2.kiste);
  assert.equal(lager.kisteVon('twitch:mia'), null);
  assert.equal(lager.anzahl(), 0);
});

test('nur Twitch-Follows mit echtem Zuschauer — TikTok bleibt beim Widget', () => {
  assert.equal(sollOrakelWuerfeln(follow('twitch:1')), true);
  assert.equal(sollOrakelWuerfeln(follow('tt1', { plattform: 'tiktok' })), false);
  assert.equal(sollOrakelWuerfeln(follow('tt1', { plattform: undefined })), false);
  assert.equal(sollOrakelWuerfeln(follow(TWITCH_ANONYM_ID)), false);
  assert.equal(sollOrakelWuerfeln({ type: 'chat', ts: 1, plattform: 'twitch', user: { id: 'twitch:1', nickname: 'x' } }), false);
  assert.equal(new OrakelKisten().fuerFollow(follow('tt1', { plattform: 'tiktok' }), { chance: 1, glueck: 1 }), null);
});

test('Glück und Grenzen kommen aus den Einstellungen', () => {
  const klein = new OrakelKisten(() => 0).fuerFollow(follow('twitch:a'), { chance: 137500, glueck: 1000 })!;
  assert.deepEqual(klein, { kiste: 1, glueck: true, chance: 137500 });
  const gross = new OrakelKisten(() => 0.5).fuerFollow(follow('twitch:a'), { chance: 137500, glueck: 1000 })!;
  assert.equal(gross.glueck, false);
  assert.deepEqual(orakelGrenzen('quatsch', -5), { chance: 137500, glueck: 1000 });
  assert.deepEqual(orakelGrenzen(1, 0), { chance: 137500, glueck: 0 });
  assert.deepEqual(orakelGrenzen(5000, 20), { chance: 5000, glueck: 20 });
});

test('das Ereignis trägt die Kiste, BEVOR ein späterer Abonnent (Overlay-Server) es sieht', () => {
  const bus = new EventBus();
  const lager = new OrakelKisten(() => 0.5);
  bus.subscribeAll((e) => { const w = lager.fuerFollow(e, { chance: 137500, glueck: 1000 }); if (w) e.orakel = w; });
  let gesehen: StudioEvent | undefined;
  bus.subscribeAll((e) => { gesehen = e; });
  bus.publish(follow('twitch:mia'));
  assert.equal(gesehen?.orakel?.kiste, lager.kisteVon('twitch:mia'));
  // Und das Widget nimmt GENAU diese Zahl.
  const w = orakelWurf(gesehen, normalisiereCfg({}), () => 0.99);
  assert.equal(w.kiste, gesehen?.orakel?.kiste);
});

/** Quelltext ohne Kommentarzeilen (wie tts-verdrahtung.test.ts). */
function echterCode(datei: string): string {
  return readFileSync(datei, 'utf-8').split('\n')
    .filter((z) => !z.trim().startsWith('//') && !z.trim().startsWith('*')).join('\n');
}

test('studio.ts: Kiste wird in wireBus angehängt, beim Session-Reset verworfen, !kiste liest sie', () => {
  const studio = echterCode(join(SRC, 'main', 'services', 'studio.ts'));
  const wire = studio.slice(studio.indexOf('private wireBus()'));
  assert.match(wire.slice(0, 4000), /this\.orakelKisten\.fuerFollow\(e,[\s\S]*?e\.orakel = wurf/,
    'Die Kiste muss ganz oben in wireBus ans Ereignis — der Overlay-Server hängt danach am Bus.');
  const reset = studio.slice(studio.indexOf('resetSession(): void {'));
  assert.match(reset.slice(0, 4000), /this\.orakelKisten\.reset\(\)/, 'Neuer Stream → jeder würfelt neu.');
  assert.match(studio, /kiste: this\.orakelKisten\.kisteVon\(event\.user\?\.id\)/, '{kiste} liest die Kiste des Fragenden.');
});
