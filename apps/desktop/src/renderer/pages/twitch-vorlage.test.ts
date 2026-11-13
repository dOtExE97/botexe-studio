// Twitch-Vorlage: gültiges Layout, richtige Plattform, alles im Bild, und der
// Herz-Alarm spielt wirklich das Piraten-Orakel bei einem Follow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout } from '@botexe/overlay-engine';
import { erzeugeTwitchVorlage } from './twitch-vorlage';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WIDGET_TYPES } from './widget-types';

const WURZEL = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), '..', '..')
  : process.cwd();

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Dynamisch über die Datei-URL: das Widget-Modul ist reines JS ohne Typen. */
const ladeEreignisAlarm = async (): Promise<any> =>
  import(pathToFileURL(join(WURZEL, 'packages', 'widget-kit', 'ereignis-alarm.js')).href);

test('Twitch-Vorlage besteht validateLayout', () => {
  const r = validateLayout(erzeugeTwitchVorlage('layout-twitch-test'));
  assert.ok(r.ok, r.ok ? '' : r.errors.join('; '));
});

test('Twitch-Vorlage: Plattform twitch, Querformat 1920×1080, Name und ID wie übergeben', () => {
  const l = erzeugeTwitchVorlage('abc', 'Mein Twitch');
  assert.equal(l.plattform, 'twitch');
  assert.deepEqual(l.canvas, { width: 1920, height: 1080, background: 'transparent' });
  assert.equal(l.id, 'abc');
  assert.equal(l.name, 'Mein Twitch');
  assert.equal(erzeugeTwitchVorlage('x').name, 'Twitch (Querformat)');
});

test('Twitch-Vorlage: alle vier Ebenen da und vollständig innerhalb des Bildes', () => {
  const l = erzeugeTwitchVorlage('x');
  assert.deepEqual(l.layers.map((e) => e.widgetType).sort(), ['chat-box', 'follow-alert', 'herz-alarm', 'piraten-banner']);
  for (const e of l.layers) {
    assert.ok(e.x >= 0 && e.y >= 0 && e.w > 0 && e.h > 0, e.id);
    assert.ok(e.x + e.w <= 1920 && e.y + e.h <= 1080, `${e.id} ragt aus dem Bild`);
    assert.equal(e.visible, true);
  }
  // Die Bildmitte (Fadenkreuz) bleibt frei von allem außer dem Alarm, der nur kurz kommt.
  for (const e of l.layers.filter((x) => x.widgetType !== 'herz-alarm')) {
    const ueberMitte = e.x < 960 && e.x + e.w > 960 && e.y < 540 && e.y + e.h > 540;
    assert.equal(ueberMitte, false, `${e.id} liegt über der Bildmitte`);
  }
});

test('Twitch-Vorlage: Props sind die Standardwerte des Katalogs (nichts erfunden)', () => {
  const l = erzeugeTwitchVorlage('x');
  for (const e of l.layers) {
    const def = WIDGET_TYPES.find((w) => w.type === e.widgetType)!;
    for (const k of Object.keys(e.props ?? {})) {
      assert.ok(k in def.props, `${e.widgetType}.${k} gibt es im Katalog nicht`);
    }
  }
  // Keine geteilten Arrays mit dem Katalog — sonst ändert der Editor den Standard mit.
  const fa = l.layers.find((e) => e.widgetType === 'follow-alert')!;
  assert.notEqual(fa.props!.events, WIDGET_TYPES.find((w) => w.type === 'follow-alert')!.props.events);
});

test('Twitch-Vorlage: Follow-Alert feuert NICHT beim Follow (das macht das Orakel), aber bei Subs', () => {
  const fa = erzeugeTwitchVorlage('x').layers.find((e) => e.widgetType === 'follow-alert')!;
  // follow-alert.js blendet genau die Arten aus props.events ein (onEvent: events.includes(type)).
  const events = fa.props!.events as string[];
  assert.equal(events.includes('follow'), false, 'sonst zwei Einblendungen je Follow (Alert + Orakel)');
  assert.ok(events.includes('sub'), 'Subs blendet der Alert weiter ein');
  // Nur Werte, die das Feld im Editor auch anbietet.
  const feld = WIDGET_TYPES.find((w) => w.type === 'follow-alert')!.fields!.find((f) => f.key === 'events') as { options?: { value: string }[] };
  for (const e of events) assert.ok(feld.options?.some((o) => o.value === e), e);
});

test('Twitch-Vorlage: Herz-Alarm spielt beim Twitch-Follow das Piraten-Orakel, sonst nichts', async () => {
  const { normalisiereCfg, alarmArt, neuerMerker } = await ladeEreignisAlarm();
  const alarm = erzeugeTwitchVorlage('x').layers.find((e) => e.widgetType === 'herz-alarm')!;
  const cfg = normalisiereCfg(alarm.props);
  assert.deepEqual([...cfg.ereignisse], ['follow']);
  assert.equal(cfg.anim.follow, 'piraten-orakel');
  assert.equal(alarmArt({ type: 'follow', plattform: 'twitch', user: { id: 'twitch:123', nickname: 'Pirat' } }, cfg, neuerMerker()), 'follow');
  assert.equal(alarmArt({ type: 'sub', plattform: 'twitch', user: { id: 'twitch:123' } }, cfg, neuerMerker()), null);
  // Orakel-Bilder bleiben leer → Widget zeichnet Münze und Truhe selbst.
  assert.equal(alarm.props!.orakelToken, '');
  assert.equal(alarm.props!.orakelKiste, '');
  const banner = erzeugeTwitchVorlage('x').layers.find((e) => e.widgetType === 'piraten-banner')!;
  assert.equal(banner.props!.tokenId, '');
  assert.equal(banner.props!.kisteId, '');
});
