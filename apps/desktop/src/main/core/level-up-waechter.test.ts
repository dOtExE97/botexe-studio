// level-up-waechter.test.ts — Teamherz-Stufe über Abzeichen + Dedup mit Bannern.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioEvent } from '@botexe/trigger-engine';
import { LevelUpWaechter, erzeugeLevelUpVorfilter } from './level-up-waechter';
import { EventBus } from './event-bus';

test('Erstsichtung liefert null, ein Anstieg die neue Stufe', () => {
  const w = new LevelUpWaechter();
  assert.equal(w.sieheStufe('a', 5, 1), null, 'Erstsichtung ist kein Level-Up');
  assert.equal(w.sieheStufe('a', 6, 2), 6);
  assert.equal(w.sieheStufe('a', 6, 3), null, 'gleiche Stufe nochmal');
  assert.equal(w.sieheStufe('a', 5, 4), null, 'kein Abstieg');
});

test('nach einem Abstieg zählt die höchste bekannte Stufe weiter', () => {
  const w = new LevelUpWaechter();
  w.sieheStufe('a', 6, 1);
  w.sieheStufe('a', 5, 2);
  assert.equal(w.sieheStufe('a', 6, 3), null, 'zurück auf 6 ist kein neuer Anstieg');
});

test('Zuschauer werden getrennt gezählt', () => {
  const w = new LevelUpWaechter();
  w.sieheStufe('a', 5, 1);
  assert.equal(w.sieheStufe('b', 9, 2), null, 'für b ist 9 die Erstsichtung');
});

test('Banner-Level-Up merkt sich Zuschauer+Stufe 60 Sekunden lang', () => {
  const w = new LevelUpWaechter();
  w.vonBanner('a', 7, 1000);
  assert.equal(w.istDoppelt('a', 7, 50_000), true);
  assert.equal(w.istDoppelt('a', 7, 61_001), false);
  assert.equal(w.istDoppelt('a', 8, 2000), false, 'andere Stufe');
  assert.equal(w.istDoppelt('b', 7, 2000), false, 'anderer Zuschauer');
});

test('Abzeichen nach einem Banner derselben Stufe löst nichts mehr aus', () => {
  const w = new LevelUpWaechter();
  w.vonBanner('a', 7, 1000);
  assert.equal(w.sieheStufe('a', 7, 2000), null);
  assert.equal(w.sieheStufe('a', 8, 3000), 8, 'die nächste Stufe schon');
});

test('reset() macht die nächste Sichtung zur Erstsichtung und leert das Dedup', () => {
  const w = new LevelUpWaechter();
  w.sieheStufe('a', 5, 1);
  w.vonBanner('a', 7, 1000);
  w.reset();
  assert.equal(w.sieheStufe('a', 6, 2), null);
  assert.equal(w.istDoppelt('a', 7, 2000), false);
});

/** Echter Bus mit dem Vorfilter, wie studio.ts ihn einsetzt. */
function busMitVorfilter() {
  const bus = new EventBus();
  bus.setVorfilter(erzeugeLevelUpVorfilter(new LevelUpWaechter(), (e) => bus.publish(e)));
  const gesehen: StudioEvent[] = [];
  bus.subscribeAll((e) => gesehen.push(e));
  const levelUps = () => gesehen.filter((e) => e.type === 'level_up');
  return { bus, gesehen, levelUps };
}
const chat = (stufe: number, ts: number, extra: Partial<StudioEvent> = {}): StudioEvent => ({
  type: 'chat', ts, text: 'hi', user: { id: 'u1', nickname: 'Mia', teamLevel: stufe }, ...extra,
});
const banner = (stufe: number, ts: number, art: 'team' | 'gifter' = 'team'): StudioEvent => ({
  type: 'level_up', ts, user: { id: 'u1', nickname: 'Mia' }, levelUp: { art, neu: stufe },
});
const tick = () => new Promise((r) => setImmediate(r));

test('Vorfilter: Chat 6 → Chat 7 → Banner 7 binnen 60 s ergibt EIN Level-Up, nach dem Chat', async () => {
  const { bus, gesehen, levelUps } = busMitVorfilter();
  bus.publish(chat(6, 1000));
  bus.publish(chat(7, 2000));
  await tick();
  bus.publish(banner(7, 30_000));
  await tick();
  assert.equal(levelUps().length, 1);
  assert.equal(levelUps()[0]?.levelUp?.neu, 7);
  assert.notEqual(levelUps()[0]?.synthetic, true, 'abgeleitet, aber nicht als Test markiert');
  assert.deepEqual(gesehen.map((e) => e.type), ['chat', 'chat', 'level_up'], 'Auslöser zuerst, Level-Up danach, Banner verworfen');
});

test('Vorfilter: Banner zuerst, danach das Abzeichen derselben Stufe → kein zweites Level-Up', async () => {
  const { bus, levelUps } = busMitVorfilter();
  bus.publish(chat(6, 1000));
  bus.publish(banner(7, 2000));
  bus.publish(chat(7, 3000));
  await tick();
  assert.equal(levelUps().length, 1);
});

test('Vorfilter: synthetic- und sticky-Ereignisse füttern den Wächter nicht', async () => {
  const { bus, levelUps } = busMitVorfilter();
  bus.publish(chat(6, 1000, { synthetic: true }));
  bus.publish(chat(7, 2000, { sticky: true }));
  await tick();
  assert.equal(levelUps().length, 0, 'kein abgeleitetes Level-Up aus Test/Replay');
  // Erste ECHTE Sichtung ist Erstsichtung → kein Level-Up, obwohl Test-Ereignisse 6/7 meldeten.
  bus.publish(chat(8, 3000));
  await tick();
  assert.equal(levelUps().length, 0);
  // Test-Banner läuft durch, wird aber nicht gemerkt: der echte danach auch.
  bus.publish({ ...banner(9, 4000), synthetic: true });
  bus.publish(banner(9, 5000));
  assert.equal(levelUps().length, 2);
});

test('Vorfilter: Geschenke-Stufe-Banner läuft immer durch', async () => {
  const { bus, levelUps } = busMitVorfilter();
  bus.publish(banner(20, 1000, 'gifter'));
  bus.publish(banner(20, 2000, 'gifter'));
  await tick();
  assert.equal(levelUps().length, 2);
});

test('Vorfilter: abgeleitetes Level-Up erbt die Plattform des Auslösers', async () => {
  const { bus, levelUps } = busMitVorfilter();
  bus.publish(chat(6, 1000, { plattform: 'tiktok' }));
  bus.publish(chat(7, 2000, { plattform: 'tiktok' }));
  await tick();
  assert.equal(levelUps().length, 1);
  assert.equal(levelUps()[0]?.plattform, 'tiktok', 'sonst ginge der TikTok-Alarm auch ins Twitch-Overlay');
});

test('Vorfilter: Auslöser ohne Plattform → Level-Up ohne Plattform (wie bisher)', async () => {
  const { bus, levelUps } = busMitVorfilter();
  bus.publish(chat(6, 1000));
  bus.publish(chat(7, 2000));
  await tick();
  assert.equal(levelUps().length, 1);
  assert.equal('plattform' in (levelUps()[0] ?? {}), false);
});
