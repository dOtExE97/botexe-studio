// Wächter: Herz-Alarm im Modus „Ereignisse" — Editor-Standards und Widget-Standards
// sind dasselbe Wissen an zwei Orten.
//
// widget-types.ts (EA_STANDARD_ARTEN, EA_STANDARD_ANIM, EA_LEVEL_ANIM, minVip …)
// bestimmt, was der Editor als Standard zeigt; ereignis-alarm.js (STANDARD_ARTEN,
// ARTEN[*].std, normalisiereCfg) und alarm-anim.js (ANIMATIONEN) bestimmen, was das
// Widget wirklich spielt. Driftet das auseinander, zeigt der Editor einen Standard
// und das Overlay spielt einen anderen — still, ohne Fehlermeldung (Fehlerklasse
// „doppeltes Wissen"). Dieser Test hält beide Seiten zusammen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WIDGET_TYPES } from './widget-types';

const WURZEL = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), '..', '..')
  : process.cwd();
const WK = join(WURZEL, 'packages', 'widget-kit');

/* eslint-disable @typescript-eslint/no-explicit-any */
async function ladeWidgetKit() {
  // Dynamisch über die Datei-URL: die Module sind reines JS ohne Typen.
  const ea: any = await import(pathToFileURL(join(WK, 'ereignis-alarm.js')).href);
  const anim: any = await import(pathToFileURL(join(WK, 'alarm-anim.js')).href);
  const herz: any = await import(pathToFileURL(join(WK, 'herz-alarm.js')).href);
  return { cfg: ea.normalisiereCfg({}), ANIMATIONEN: anim.ANIMATIONEN as Record<string, { fuer: string[] }>, MOTIVE: herz.MOTIVE as { id: string }[] };
}

const herzAlarm = () => {
  const t = WIDGET_TYPES.find((w) => w.type === 'herz-alarm');
  assert.ok(t, 'herz-alarm fehlt in WIDGET_TYPES');
  return t;
};

test('Standard-Häkchen und Standard-Werte stimmen mit normalisiereCfg({}) überein', async () => {
  const { cfg } = await ladeWidgetKit();
  const p = herzAlarm().props as Record<string, unknown>;
  assert.deepEqual(p.ereignisse, [...cfg.ereignisse], 'EA_STANDARD_ARTEN ≠ STANDARD_ARTEN in ereignis-alarm.js');
  assert.equal(p.minVip, cfg.minVip, 'minVip');
  assert.equal(p.minLevelUp, cfg.minLevelUp, 'minLevelUp');
  assert.equal(p.superfanVerlaengert, cfg.superfanVerlaengert, 'superfanVerlaengert');
  assert.equal(p.qualitaet, cfg.qualitaet, 'qualitaet');
  assert.equal(p.showUser, cfg.zeigeUser, 'showUser');
  assert.equal(p.userText, cfg.userText, 'userText');
});

test('Je Art: Standard-Animation, Datei und Sound wie ARTEN in ereignis-alarm.js', async () => {
  const { cfg } = await ladeWidgetKit();
  const p = herzAlarm().props as Record<string, unknown>;
  const artenWidget = Object.keys(cfg.anim).sort();
  const artenEditor = Object.keys(p).filter((k) => k.startsWith('anim_')).map((k) => k.slice(5)).sort();
  assert.deepEqual(artenEditor, artenWidget, 'EA_STANDARD_ANIM kennt andere Arten als ARTEN');
  for (const art of artenWidget) {
    assert.equal(p[`anim_${art}`], cfg.anim[art], `Standard-Animation „${art}"`);
    assert.equal(p[`media_${art}`], cfg.media[art], `Standard-Datei „${art}"`);
    assert.equal(p[`sound_${art}`], cfg.sound[art], `Standard-Sound „${art}"`);
    assert.equal(p[`soundId_${art}`], cfg.soundId[art], `Standard-SoundId „${art}"`);
  }
  const haken = herzAlarm().fields.find((f) => f.key === 'ereignisse');
  assert.deepEqual((haken?.options ?? []).map((o) => o.value).sort(), artenWidget, 'Häkchen-Liste ≠ ARTEN');
});

test('Jede Animations-Auswahl gibt es im Widget — und sie passt zur Art', async () => {
  const { cfg, ANIMATIONEN, MOTIVE } = await ladeWidgetKit();
  const motive = new Set(MOTIVE.map((m) => m.id));
  const felder = herzAlarm().fields.filter((f) => f.key.startsWith('anim_'));
  assert.equal(felder.length, Object.keys(cfg.anim).length);
  for (const f of felder) {
    const art = f.key.slice(5);
    const werte = (f.options ?? []).map((o) => o.value);
    assert.ok(werte.includes(String(cfg.anim[art])), `Standard „${cfg.anim[art]}" steht bei ${f.key} nicht zur Auswahl`);
    for (const v of werte) {
      if (v === 'motiv' || v === 'eigen') continue;
      if (v.startsWith('motiv:')) {
        assert.ok(motive.has(v.slice(6)), `${f.key}: Herz-Motiv „${v}" gibt es in herz-alarm.js nicht`);
        continue;
      }
      const a = ANIMATIONEN[v];
      assert.ok(a, `${f.key}: Animation „${v}" fehlt in ANIMATIONEN (alarm-anim.js)`);
      assert.ok(a.fuer.includes(art), `${f.key}: „${v}" ist laut ANIMATIONEN nicht für „${art}" gedacht`);
    }
  }
});
