// ereignis-alarm.test.ts — Modus „Ereignisse" des Herz-Alarms: Zuordnung,
// Doppelt-Sperren, Warteschlange und Ablauf (mit Ersatz-DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alarmArt, alarmDaten, cheerText, Warteschlange, normalisiereCfg, neuerMerker, waehleAnimation, wuerfleKiste } from './ereignis-alarm.js';
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

// ---- Twitch-Piraten: Sub, Bits, Raid ----

test('Twitch-Arten sind standardmäßig aus — bestehende Overlays bleiben unverändert', () => {
  const cfg = normalisiereCfg({ modus: 'ereignisse' });
  for (const art of ['twitch_sub', 'cheer', 'raid']) assert.equal(cfg.ereignisse.has(art), false, art);
  const u = { id: 'twitch:1', nickname: 'Pirat' };
  assert.equal(alarmArt({ type: 'cheer', plattform: 'twitch', cheer: { bits: 100 }, user: u }, cfg, neuerMerker()), null);
  assert.equal(alarmArt({ type: 'raid', plattform: 'twitch', raid: { viewers: 5 }, user: u }, cfg, neuerMerker()), null);
  // Ein Twitch-Sub ist NICHT das Superfan-Abo — auch wenn „superfan" (Standard) an ist.
  assert.equal(alarmArt({ type: 'sub', plattform: 'twitch', subMonths: 1, user: u }, cfg, neuerMerker()), null);
  assert.equal(cfg.piratenGroesse, 75);
});

test('Twitch-Sub nur bei plattform twitch; TikToks sub bleibt Superfan — kein Doppel-Alarm', () => {
  const cfg = normalisiereCfg({ modus: 'ereignisse', ereignisse: ['superfan', 'twitch_sub'] });
  assert.equal(alarmArt({ type: 'sub', plattform: 'twitch', subMonths: 3, user: { id: 'twitch:1' } }, cfg, neuerMerker()), 'twitch_sub');
  assert.equal(alarmArt({ type: 'sub', plattform: 'twitch', subGeschenk: { anzahl: 5 }, user: { id: 'twitch:anonym' } }, cfg, neuerMerker()), 'twitch_sub');
  assert.equal(alarmArt({ type: 'sub', plattform: 'tiktok', superfanNeu: true, user: { id: 'a' } }, cfg, neuerMerker()), 'superfan');
  assert.equal(alarmArt({ type: 'sub', superfanNeu: true, user: { id: 'b' } }, cfg, neuerMerker()), 'superfan');
  // Nur twitch_sub an: TikTok-Sub bleibt stumm.
  const nurTwitch = normalisiereCfg({ modus: 'ereignisse', ereignisse: ['twitch_sub'] });
  assert.equal(alarmArt({ type: 'sub', superfanNeu: true, user: { id: 'c' } }, nurTwitch, neuerMerker()), null);
  assert.equal(nurTwitch.anim.twitch_sub, 'piraten-sub');
});

test('Bits und Raid: eigene Arten, Standard-Animationen', () => {
  const cfg = normalisiereCfg({ modus: 'ereignisse', ereignisse: ['cheer', 'raid'] });
  assert.equal(alarmArt({ type: 'cheer', cheer: { bits: 1 } }, cfg), 'cheer');
  assert.equal(alarmArt({ type: 'raid', raid: { viewers: 0 } }, cfg), 'raid');
  assert.equal(cfg.anim.cheer, 'piraten-bits');
  assert.equal(cfg.anim.raid, 'piraten-raid');
  // Keine Zuordnung zu anderen Arten.
  assert.equal(alarmArt({ type: 'cheer', cheer: { bits: 1 } }, normalisiereCfg({ ereignisse: ['truhe', 'teamherz', 'superfan'] })), null);
});

test('Twitch-Daten für den Renderer: Monate, Geschenk, Bits, Nachricht, Zuschauer, Größe', () => {
  const ex = { groesse: 60, tokenBild: 't.png' };
  const neu: any = alarmDaten('twitch_sub', { type: 'sub', plattform: 'twitch', user: { nickname: 'Mia' } }, ex);
  assert.equal(neu.monate, 1);
  assert.equal(neu.geschenk, undefined);
  assert.equal(neu.groesse, 60);
  const re: any = alarmDaten('twitch_sub', { type: 'sub', subMonths: 14, user: { nickname: 'Mia' } }, ex);
  assert.equal(re.monate, 14);
  const gs: any = alarmDaten('twitch_sub', { type: 'sub', subGeschenk: { anzahl: 5, anonym: true }, user: { nickname: 'Anonym' } }, ex);
  assert.equal(gs.geschenk, 5);
  assert.equal(gs.monate, undefined);
  assert.equal(gs.name, 'Anonym');
  const ch: any = alarmDaten('cheer', { type: 'cheer', cheer: { bits: 1500 }, text: 'Cheer100 Ahoi\u0007 Käptn! Kappa50', user: { nickname: 'Ben' } }, ex);
  assert.equal(ch.bits, 1500);
  assert.equal(ch.nachricht, 'Ahoi Käptn!');
  assert.equal(ch.tokenBild, 't.png');
  const ohne: any = alarmDaten('cheer', { type: 'cheer' });
  assert.equal(ohne.bits, 0);
  assert.equal(ohne.nachricht, '');
  assert.equal(ohne.groesse, 75);
  const rd: any = alarmDaten('raid', { type: 'raid', raid: { viewers: 42 }, user: { nickname: 'Kalle' } }, ex);
  assert.equal(rd.zuschauer, 42);
  assert.equal(rd.name, 'Kalle');
});

test('cheerText: Cheermotes und Steuerzeichen raus, gekürzt', () => {
  assert.equal(cheerText('Cheer100 hallo welt'), 'hallo welt');
  assert.equal(cheerText('nur Cheer1 Cheer1'), 'nur');
  assert.equal(cheerText('a\u202eb\nc'), 'a b c');
  assert.equal(cheerText(undefined), '');
  assert.equal(cheerText('Cheer500'), '');
  const lang = cheerText('x'.repeat(200), 44);
  assert.equal(lang.length, 44);
  assert.ok(lang.endsWith('…'));
});

test('piratenGroesse: Standard 75, Grenzen 40–100', () => {
  assert.equal(normalisiereCfg({ piratenGroesse: 10 }).piratenGroesse, 40);
  assert.equal(normalisiereCfg({ piratenGroesse: 500 }).piratenGroesse, 100);
  assert.equal(normalisiereCfg({ piratenGroesse: 'x' }).piratenGroesse, 75);
});

test('Twitch-Ablauf: Sub, Bits, Raid laufen nacheinander mit Größe und Münzbild', () => {
  const root = installiereFakeDom();
  const w: any = new EreignisAlarm(root, { modus: 'ereignisse', ereignisse: ['twitch_sub', 'cheer', 'raid'], piratenGroesse: 90, orakelToken: 'tok.png' }, { baseUrl: 'http://x/overlay', token: 'k', notify: () => {} });
  w.onEvent({ type: 'sub', plattform: 'twitch', subMonths: 2, user: { id: 'twitch:1', nickname: 'Anna' } });
  w.onEvent({ type: 'cheer', plattform: 'twitch', cheer: { bits: 100 }, user: { id: 'twitch:2', nickname: 'Ben' } });
  w.onEvent({ type: 'raid', plattform: 'twitch', raid: { viewers: 9 }, user: { id: 'twitch:3', nickname: 'Cleo' } });
  assert.equal(w.aktuell.art, 'twitch_sub');
  assert.equal(w.aktuell.extra.groesse, 90);
  assert.equal(w.aktuell.extra.tokenBild, 'http://x/media/tok.png?token=k');
  assert.deepEqual(w.schlange.liste.map((e: any) => e.art), ['cheer', 'raid']);
  assert.equal(w.schlange.liste[1].extra.groesse, 90);
  w.destroy();
});

test('Editor-Vorschau: Demo-Ereignisse der Twitch-Arten ergeben ihre Art', () => {
  const root = installiereFakeDom();
  const w: any = new EreignisAlarm(root, { modus: 'ereignisse', ereignisse: ['twitch_sub', 'cheer', 'raid'] }, { preview: true, baseUrl: 'http://x/overlay', token: 'k' });
  assert.equal(w.aktuell.art, 'twitch_sub');
  const cfg = normalisiereCfg({ ereignisse: ['twitch_sub', 'cheer', 'raid'] });
  assert.equal(alarmArt(w.aktuell.event, cfg), 'twitch_sub', 'Demo-Sub muss als Twitch-Sub zählen');
  w.destroy();
});
