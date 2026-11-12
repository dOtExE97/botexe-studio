// ereignis-alarm.test.ts — Modus „Ereignisse" des Herz-Alarms: Zuordnung,
// Doppelt-Sperren, Warteschlange und Ablauf (mit Ersatz-DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alarmArt, alarmDaten, Warteschlange, normalisiereCfg, neuerMerker, waehleAnimation, wuerfleKiste } from './ereignis-alarm.js';
import EreignisAlarm from './ereignis-alarm.js';
import HerzAlarm from './herz-alarm.js';
import { ANIMATIONEN } from './alarm-anim.js';
import { installiereFakeDom } from './fake-dom.test-helfer.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALLE = ['teamherz', 'level_team', 'level_gifter', 'superfan', 'superfan_betritt', 'truhe', 'vip', 'ziel'];
const cfgMit = (extra: Record<string, unknown> = {}) => normalisiereCfg({ modus: 'ereignisse', ereignisse: ALLE, ...extra });

test('Standard-Arten: vip, superfan_betritt und level_gifter sind aus', () => {
  const cfg = normalisiereCfg({ modus: 'ereignisse' });
  assert.deepEqual([...cfg.ereignisse].sort(), ['level_team', 'superfan', 'teamherz', 'truhe', 'ziel']);
  assert.equal(cfg.minVip, 20);
  assert.equal(cfg.minLevelUp, 0);
  assert.equal(cfg.superfanVerlaengert, true);
});

test('Level-Up: Mindeststufe greift, Teamherz und Gifter getrennt', () => {
  const e = { type: 'level_up', levelUp: { art: 'team', neu: 5 } };
  assert.equal(alarmArt(e, cfgMit({ minLevelUp: 6 })), null);
  assert.equal(alarmArt(e, cfgMit({ minLevelUp: 5 })), 'level_team');
  assert.equal(alarmArt({ type: 'level_up', levelUp: { art: 'gifter', neu: 30 } }, cfgMit()), 'level_gifter');
  // Gifter standardmäßig aus.
  assert.equal(alarmArt({ type: 'level_up', levelUp: { art: 'gifter', neu: 30 } }, normalisiereCfg({})), null);
});

test('sub ist das Superfan-Abo — nicht Teamherz', () => {
  const cfg = cfgMit();
  assert.equal(alarmArt({ type: 'sub', user: { id: 'a' } }, cfg), 'superfan');
  assert.equal(alarmArt({ type: 'sub', user: { id: 'b' }, superfanNeu: true }, cfg), 'superfan');
  // Verlängerung nur mit Häkchen.
  assert.equal(alarmArt({ type: 'sub', user: { id: 'c' }, superfanNeu: false }, cfg), 'superfan');
  assert.equal(alarmArt({ type: 'sub', user: { id: 'd' }, superfanNeu: false }, cfgMit({ superfanVerlaengert: false })), null);
  // Teamherz-Geschenk bleibt Teamherz.
  assert.equal(alarmArt({ type: 'gift', gift: { giftId: 7934 } }, cfg), 'teamherz');
  // Ohne superfan in der Liste kein Alarm für sub, auch nicht als Teamherz.
  assert.equal(alarmArt({ type: 'sub' }, normalisiereCfg({ ereignisse: ['teamherz'] })), null);
});

test('superfan-Ereignis: Abo, Verlängerung, Betreten', () => {
  const cfg = cfgMit();
  assert.equal(alarmArt({ type: 'superfan', superfanArt: 'abo_neu', user: { id: 'x1' } }, cfg), 'superfan');
  assert.equal(alarmArt({ type: 'superfan', superfanArt: 'abo_verlaengert', user: { id: 'x2' } }, cfg), 'superfan');
  assert.equal(alarmArt({ type: 'superfan', superfanArt: 'abo_verlaengert' }, cfgMit({ superfanVerlaengert: false })), null);
  assert.equal(alarmArt({ type: 'superfan', superfanArt: 'betritt' }, cfg), 'superfan_betritt');
  assert.equal(alarmArt({ type: 'superfan', superfanArt: 'betritt' }, normalisiereCfg({})), null, 'betritt ist standardmäßig aus');
});

test('Superfan doppelt (sub + Banner) innerhalb 60 s → ein Alarm', () => {
  const cfg = cfgMit(), m = neuerMerker();
  assert.equal(alarmArt({ type: 'sub', user: { id: 'u' } }, cfg, m, 1000), 'superfan');
  assert.equal(alarmArt({ type: 'superfan', superfanArt: 'abo_neu', user: { id: 'u' } }, cfg, m, 30_000), null);
  assert.equal(alarmArt({ type: 'sub', user: { id: 'u' } }, cfg, m, 62_000), 'superfan');
});

test('Truhe: Doppelt-Sperre über envelopeId, sonst Name+Coins 30 s', () => {
  const cfg = cfgMit(), m = neuerMerker();
  const e = { type: 'envelope', envelope: { envelopeId: '7', coins: 500 } };
  assert.equal(alarmArt(e, cfg, m), 'truhe');
  assert.equal(alarmArt(e, cfg, m), null, 'gleiche envelopeId → zweites Mal nichts');
  assert.equal(alarmArt({ type: 'envelope', envelope: { envelopeId: '8', coins: 500 } }, cfg, m), 'truhe');
  const ohneId = { type: 'envelope', user: { nickname: 'Mia' }, envelope: { coins: 99 } };
  assert.equal(alarmArt(ohneId, cfg, m, 0), 'truhe');
  assert.equal(alarmArt(ohneId, cfg, m, 10_000), null);
  assert.equal(alarmArt(ohneId, cfg, m, 31_000), 'truhe');
});

test('VIP: ab Mindeststufe, je Nutzer einmal', () => {
  const cfg = cfgMit(), m = neuerMerker();
  assert.equal(alarmArt({ type: 'vip_betritt', user: { id: 'v' }, vip: { stufe: 19 } }, cfg, m), null);
  assert.equal(alarmArt({ type: 'vip_betritt', user: { id: 'v' }, vip: { stufe: 25 } }, cfg, m), 'vip');
  assert.equal(alarmArt({ type: 'vip_betritt', user: { id: 'v' }, vip: { stufe: 25 } }, cfg, m), null);
  assert.equal(alarmArt({ type: 'vip_betritt', user: { id: 'v' }, vip: { stufe: 25 } }, normalisiereCfg({})), null, 'standardmäßig aus');
});

test('LIVE-Ziel: nur beim Sprung auf erreicht (geradeErreicht), einmal je Ziel-id', () => {
  const cfg = cfgMit(), m = neuerMerker();
  const z = (erreicht: boolean, id = 'g1', geradeErreicht = erreicht) => ({ type: 'live_ziel', ziel: { id, fortschritt: erreicht ? 10 : 3, ziel: 10, erreicht, geradeErreicht } });
  assert.equal(alarmArt(z(false), cfg, m), null);
  // Weiteres Update eines schon erreichten Ziels (z. B. nach Overlay-Neuladen,
  // frischer Merker) — kein Alarm, weil der Main-Prozess keine Flanke meldet.
  assert.equal(alarmArt(z(true, 'g1', false), cfg, neuerMerker()), null);
  assert.equal(alarmArt({ type: 'live_ziel', ziel: { id: 'g0', fortschritt: 10, ziel: 10, erreicht: true } }, cfg, m), null, 'ohne Flanke nie');
  assert.equal(alarmArt(z(true), cfg, m), 'ziel');
  // Zweites Netz: dieselbe id mit Flanke (doppelt zugestellt) nur einmal.
  assert.equal(alarmArt(z(true), cfg, m), null);
  assert.equal(alarmArt(z(true, 'g2'), cfg, m), 'ziel');
});

test('Superfan-Daten: Neu-Abo zeigt „NEUER"-Kopfzeile, Verlängerung und Betreten ihre Unterzeile', () => {
  const u = { id: 'u', nickname: 'Mia' };
  for (const e of [
    { type: 'sub', superfanNeu: true, user: u },
    { type: 'sub', user: u },
    { type: 'superfan', superfanArt: 'abo_neu', superfanNeu: true, user: u },
  ]) {
    const d: any = alarmDaten('superfan', e);
    assert.equal(d.neuAbo, true, JSON.stringify(e));
    assert.equal(d.unterzeile, undefined, 'Renderer-Standard „WILLKOMMEN IM SUPERFAN-CLUB" bleibt');
  }
  for (const e of [
    { type: 'sub', superfanNeu: false, user: u },
    { type: 'superfan', superfanArt: 'abo_verlaengert', superfanNeu: false, user: u },
  ]) {
    const d: any = alarmDaten('superfan', e);
    assert.equal(d.neuAbo, undefined);
    assert.equal(d.unterzeile, 'SUPERFAN VERLÄNGERT');
  }
  const b: any = alarmDaten('superfan_betritt', { type: 'superfan', superfanArt: 'betritt', user: u });
  assert.equal(b.unterzeile, 'SUPERFAN IST DA');
  assert.equal(b.neuAbo, undefined);
});

test('sticky und leere Ereignisse lösen nie aus', () => {
  assert.equal(alarmArt({ type: 'level_up', levelUp: { art: 'team', neu: 9 }, sticky: true }, cfgMit()), null);
  assert.equal(alarmArt(null, cfgMit()), null);
  assert.equal(alarmArt({ type: 'level_up' }, cfgMit()), 'level_team', 'nacktes Level-Up ohne Stufe zählt bei Mindeststufe 0');
});

test('Warteschlange: höchstens 10, das 11. läuft über', () => {
  const w = new Warteschlange(10);
  for (let i = 0; i < 10; i++) assert.equal(w.rein(i), true);
  assert.equal(w.rein(10), false);
  assert.equal(w.laenge, 10);
  assert.equal(w.raus(), 0, 'der Reihe nach');
  assert.equal(w.laenge, 9);
  w.leeren();
  assert.equal(w.laenge, 0);
  assert.equal(w.raus(), undefined);
});

test('waehleAnimation: unbekannte id fällt auf TikTok-Neon zurück', () => {
  assert.deepEqual(waehleAnimation('lvl-neon', ANIMATIONEN), { id: 'lvl-neon', ersatz: false });
  assert.deepEqual(waehleAnimation('gibt-es-nicht', ANIMATIONEN), { id: 'lvl-tiktok-neon', ersatz: true });
});

// ── Ablauf mit Ersatz-DOM ─────────────────────────────────────────────────

test('Herz-Alarm mit modus ereignisse delegiert an EreignisAlarm', () => {
  const root = installiereFakeDom();
  const w: any = new HerzAlarm(root, { modus: 'ereignisse' }, { notify: () => {} });
  assert.ok(w.impl instanceof EreignisAlarm);
  w.onEvent({ type: 'level_up', levelUp: { art: 'team', neu: 3 }, user: { nickname: 'Mia' } });
  assert.equal(w.impl.aktuell?.art, 'level_team');
  w.onReset();
  assert.equal(w.impl.aktuell, null);
  w.destroy();
  assert.equal(w.impl.zerstoert, true);
});

test('Ereignisse laufen nacheinander: level_up, dann sub, dann envelope', () => {
  const root = installiereFakeDom();
  const sounds: string[] = [];
  const w: any = new EreignisAlarm(root, { modus: 'ereignisse' }, { playSound: (s: string) => sounds.push(s), notify: () => {} });
  w.onEvent({ type: 'level_up', levelUp: { art: 'team', neu: 12 }, user: { nickname: 'Mia' } });
  w.onEvent({ type: 'sub', user: { id: 'm', nickname: 'Mia' } });
  w.onEvent({ type: 'envelope', envelope: { envelopeId: '1', coins: 500 }, user: { nickname: 'Mia' } });
  assert.equal(w.aktuell.art, 'level_team');
  assert.equal(w.schlange.laenge, 2);
  assert.deepEqual(w.schlange.liste.map((e: any) => e.art), ['superfan', 'truhe']);
  w.destroy();
});

test('sticky-Ereignis wird nicht eingereiht', () => {
  const root = installiereFakeDom();
  const w: any = new EreignisAlarm(root, { modus: 'ereignisse' }, {});
  w.onEvent({ type: 'level_up', levelUp: { art: 'team', neu: 12 }, sticky: true });
  assert.equal(w.aktuell, null);
  assert.equal(w.schlange.laenge, 0);
  w.destroy();
});

test('Überlauf wird verworfen und gemeldet', () => {
  const root = installiereFakeDom();
  const meldungen: string[] = [];
  const w: any = new EreignisAlarm(root, { modus: 'ereignisse' }, { notify: (t: string) => meldungen.push(t) });
  for (let i = 0; i < 12; i++) w.onEvent({ type: 'level_up', levelUp: { art: 'team', neu: i }, user: { nickname: `N${i}` } });
  assert.equal(w.schlange.laenge, 10);
  assert.ok(meldungen.some((t) => /verworfen/i.test(t)), meldungen.join(' | '));
  w.destroy();
});

test('Ereignis nach destroy() tut nichts', () => {
  const root = installiereFakeDom();
  const w: any = new EreignisAlarm(root, { modus: 'ereignisse' }, {});
  w.destroy();
  w.onEvent({ type: 'level_up', levelUp: { art: 'team', neu: 2 } });
  assert.equal(w.aktuell, null);
});

test('Follow ist standardmäßig aus — bestehende Overlays bleiben unverändert', () => {
  const cfg = normalisiereCfg({ modus: 'ereignisse' });
  assert.equal(cfg.ereignisse.has('follow'), false);
  assert.equal(alarmArt({ type: 'follow', user: { id: 'a' } }, cfg, neuerMerker()), null);
});

test('Follow: je Zuschauer einmal pro Stream, ohne Merker immer', () => {
  const cfg = normalisiereCfg({ modus: 'ereignisse', ereignisse: ['follow'] });
  const m = neuerMerker();
  assert.equal(alarmArt({ type: 'follow', user: { id: 'a' } }, cfg, m), 'follow');
  assert.equal(alarmArt({ type: 'follow', user: { id: 'a' } }, cfg, m), null);
  assert.equal(alarmArt({ type: 'follow', user: { id: 'b' } }, cfg, m), 'follow');
  assert.equal(alarmArt({ type: 'follow', user: { id: 'a' } }, cfg, neuerMerker()), 'follow');
  assert.equal(cfg.anim.follow, 'piraten-orakel');
});

test('wuerfleKiste: Randwerte und geometrische Verteilung', () => {
  assert.equal(wuerfleKiste(137500, () => 0), 1);
  assert.ok(wuerfleKiste(137500, () => 0.999999999999) <= 99_999_999);
  assert.equal(wuerfleKiste(2, () => 0.4), 1);
  assert.equal(wuerfleKiste(2, () => 0.6), 2);
  assert.equal(wuerfleKiste('quatsch' as any, () => 0), 1);
  // Median der Geometrischen ≈ chance · ln 2
  const med = wuerfleKiste(137500, () => 0.5);
  assert.ok(Math.abs(med - 137500 * Math.LN2) < 5, `Median ${med}`);
});

test('Follow-Daten: Kiste und Orakel-Einstellungen gehen an den Renderer', () => {
  const d: any = alarmDaten('follow', { type: 'follow', user: { nickname: 'Lisa' } }, { kiste: 84213, chance: 1000, glueckBis: 5, groesse: 60, tokenBild: 't', kisteBild: 'k' });
  assert.equal(d.name, 'Lisa');
  assert.equal(d.kiste, 84213);
  assert.equal(d.chance, 1000);
  assert.equal(d.glueckBis, 5);
  assert.equal(d.groesse, 60);
  assert.equal(d.tokenBild, 't');
  assert.equal(d.kisteBild, 'k');
});

test('Orakel-Einstellungen: Standard und Grenzen', () => {
  const c = normalisiereCfg({});
  assert.equal(c.orakelChance, 137500);
  assert.equal(c.orakelGlueck, 1000);
  assert.equal(c.orakelGroesse, 75);
  const k = normalisiereCfg({ orakelChance: 1, orakelGlueck: -5, orakelGroesse: 500 });
  assert.equal(k.orakelChance, 2);
  assert.equal(k.orakelGlueck, 0);
  assert.equal(k.orakelGroesse, 100);
});

test('Follow-Ablauf: Kiste wird beim Eintreffen gewürfelt, auch in der Warteschlange', () => {
  const root = installiereFakeDom();
  const w: any = new EreignisAlarm(root, { modus: 'ereignisse', ereignisse: ['follow'], orakelChance: 500, orakelToken: 'tok.png' }, { baseUrl: 'http://x/overlay', token: 'k', notify: () => {} });
  w.onEvent({ type: 'follow', user: { id: 'a', nickname: 'Anna' } });
  w.onEvent({ type: 'follow', user: { id: 'b', nickname: 'Ben' } });
  w.onEvent({ type: 'follow', user: { id: 'a', nickname: 'Anna' } }); // doppelt → nichts
  assert.equal(w.aktuell.art, 'follow');
  assert.ok(Number.isInteger(w.aktuell.extra.kiste) && w.aktuell.extra.kiste >= 1);
  assert.equal(w.aktuell.extra.chance, 500);
  assert.equal(w.aktuell.extra.tokenBild, 'http://x/media/tok.png?token=k');
  assert.equal(w.aktuell.extra.kisteBild, '');
  assert.equal(w.schlange.laenge, 1);
  assert.ok(Number.isInteger(w.schlange.liste[0].extra.kiste));
  w.destroy();
});
