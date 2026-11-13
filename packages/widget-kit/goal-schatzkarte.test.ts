// goal-schatzkarte.test.ts — Goal-Bar: Metrik „twitch_follower" (Stand per
// follower_stand, +1 je Twitch-Follow) und Stil „Schatzkarte" (Zahlen, Ziel,
// Feiern nur beim echten Anstieg, Replay ohne Feier, Aufräumen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installiereFakeDom, type FakeElement } from './fake-dom.test-helfer.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
installiereFakeDom();
const { default: GoalBar, followerNach } = await import('./goal-bar.js');
const { kartenZahl, schiffsPosition } = await import('./goal-schatzkarte.js');

const stand = (anzahl: unknown, extra: Record<string, unknown> = {}) => ({ type: 'follower_stand', followerStand: { anzahl }, ...extra });
const follow = (plattform?: string, extra: Record<string, unknown> = {}) => ({ type: 'follow', user: { id: 'u', nickname: 'Mia' }, ...(plattform ? { plattform } : {}), ...extra });
const KARTE = { style: 'schatzkarte', metric: 'twitch_follower', target: 50, label: 'Auf dem Weg zum Affiliate', einheit: 'Follower' };

function baue(props: Record<string, unknown>, ctx?: unknown) {
  const root = (globalThis as any).document.createElement('div') as FakeElement;
  const bar: any = new GoalBar(root, props, ctx);
  return { root, bar };
}
const text = (root: FakeElement, sel: string) => root.querySelector(sel)?.textContent;
const karte = (root: FakeElement) => root.querySelector('.bx-sk')!;

test('followerNach: Stand setzt absolut, auch als Replay', () => {
  assert.equal(followerNach(null, stand(23)), 23);
  assert.equal(followerNach(40, stand(12)), 12);
  assert.equal(followerNach(null, stand(7.9, { sticky: true })), 7);
  assert.equal(followerNach(null, stand(0)), 0);
});

test('followerNach: Twitch-Follow zählt +1 — nur mit bekanntem Stand, nie als Replay', () => {
  assert.equal(followerNach(23, follow('twitch')), 24);
  assert.equal(followerNach(null, follow('twitch')), undefined, 'ohne Stand nicht raten');
  assert.equal(followerNach(23, follow('twitch', { sticky: true })), undefined, 'Replay zählt nicht doppelt');
  assert.equal(followerNach(23, follow('tiktok')), undefined, 'TikTok-Follow ist kein Twitch-Follower');
  assert.equal(followerNach(23, follow()), undefined, 'Test-Follow ohne Plattform zählt nicht');
});

test('followerNach: Kaputtes und Fremdes ändert nichts', () => {
  for (const e of [null, undefined, 'x', {}, { type: 'follower_stand' }, stand('viele'), stand(-3), stand(Number.NaN), { type: 'chat' }]) {
    assert.equal(followerNach(5, e), undefined, JSON.stringify(e));
  }
});

test('twitch_follower im Glas-Stil: „– / 50", dann Stand und +1', () => {
  const { root, bar } = baue({ metric: 'twitch_follower', target: 50 });
  assert.ok(root.querySelector('.bx-gb')!.innerHTML.includes('– / 50'), 'Startanzeige ohne bekannten Stand');
  assert.equal(text(root, '.bx-gb-label'), 'Auf dem Weg zum Affiliate');
  bar.onEvent(stand(23, { sticky: true }));
  assert.equal(text(root, '.bx-gb-nums'), '23 / 50');
  bar.onEvent(follow('twitch'));
  assert.equal(text(root, '.bx-gb-nums'), '24 / 50');
  // Session-Stats lassen den Kanal-Stand in Ruhe.
  bar.onStats({ totals: { follows: 3 } });
  assert.equal(text(root, '.bx-gb-nums'), '24 / 50');
  bar.destroy();
});

test('Schatzkarte: Titel, Einheit, „– / 50" bis der Stand kommt', () => {
  const { root, bar } = baue(KARTE);
  assert.ok(karte(root), 'Szene fehlt');
  assert.equal(text(root, '.bx-sk-titel'), 'Auf dem Weg zum Affiliate');
  assert.equal(text(root, '.bx-sk-einheit'), 'Follower');
  assert.equal(text(root, '.bx-sk-ist'), '–');
  assert.equal(text(root, '.bx-sk-soll'), '/ 50');
  bar.onEvent(stand(23, { sticky: true }));
  assert.equal(text(root, '.bx-sk-ist'), '23');
  assert.equal(root.querySelectorAll('.bx-sk-punkt').filter((p) => p.classList.contains('gefahren')).length > 0, true);
  bar.destroy();
});

test('Schatzkarte: Replay feiert nicht, ein echter Follow schon', () => {
  const { root, bar } = baue(KARTE);
  bar.onEvent(stand(30, { sticky: true }));
  assert.equal(karte(root).classList.contains('bx-sk-schub'), false, 'Laden ist kein Anstieg');
  bar.onEvent(follow('twitch'));
  assert.equal(text(root, '.bx-sk-ist'), '31');
  assert.equal(karte(root).classList.contains('bx-sk-schub'), true, 'Schiff macht einen Satz');
  assert.ok(root.querySelectorAll('.bx-sk-tropfen').length > 0, 'Gold spritzt');
  bar.destroy();
});

test('Schatzkarte: Ziel erreicht → Truhe offen, Feuerwerk, Titel „ZIEL ERREICHT!"', () => {
  const { root, bar } = baue(KARTE);
  bar.onEvent(stand(49, { sticky: true }));
  bar.onEvent(follow('twitch'));
  const k = karte(root);
  assert.equal(k.classList.contains('bx-sk-fertig'), true);
  assert.equal(k.classList.contains('bx-sk-ziel-fx'), true);
  assert.equal(text(root, '.bx-sk-titel'), 'ZIEL ERREICHT!');
  assert.ok(root.querySelectorAll('.bx-sk-konfetti').length > 0);
  assert.ok(root.querySelector('.bx-sk-meldung')!.classList.contains('zeigen'));
  bar.destroy();
});

test('Schatzkarte: schon erreicht beim Laden → offen, aber ohne Feuerwerk', () => {
  const { root, bar } = baue(KARTE);
  bar.onEvent(stand(52, { sticky: true }));
  assert.equal(karte(root).classList.contains('bx-sk-fertig'), true);
  assert.equal(karte(root).classList.contains('bx-sk-ziel-fx'), false);
  assert.equal(root.querySelectorAll('.bx-sk-konfetti').length, 0);
  bar.destroy();
});

test('Schatzkarte: Vorschau zeigt 23 / 50 sofort, ein echter Stand beendet die Vorführung', () => {
  const { root, bar } = baue(KARTE, { preview: true });
  assert.equal(text(root, '.bx-sk-ist'), '23');
  assert.ok(bar.demoTimer, 'Vorführung läuft');
  bar.onEvent(stand(5));
  assert.equal(bar.demoTimer, null);
  assert.equal(text(root, '.bx-sk-ist'), '5');
  bar.destroy();
  assert.equal(root.querySelector('.bx-sk'), null, 'destroy räumt die Szene ab');
  // Nach destroy wirft nichts.
  bar.onEvent(stand(9));
  bar.onEvent(follow('twitch'));
});

test('Schatzkarte mit TikTok-Ziel und Coins: Titel und Zahlen kommen an', () => {
  const a = baue({ style: 'schatzkarte', metric: 'tiktok-ziel', label: '' });
  assert.equal(text(a.root, '.bx-sk-soll'), '/ –');
  a.bar.onEvent({ type: 'live_ziel', ziel: { id: 'g', fortschritt: 35, ziel: 50, erreicht: false, geschenk: { name: 'Heart Me' } } });
  assert.equal(text(a.root, '.bx-sk-ist'), '35');
  assert.equal(text(a.root, '.bx-sk-titel'), 'Heart Me');
  a.bar.destroy();
  const b = baue({ style: 'schatzkarte', metric: 'coins', target: 12500 });
  b.bar.onStats({ totals: { coins: 5750 } });
  assert.equal(text(b.root, '.bx-sk-ist'), '5.750');
  assert.equal(text(b.root, '.bx-sk-soll'), '/ 12,5K');
  b.bar.destroy();
});

test('kartenZahl und Schiffsposition', () => {
  assert.equal(kartenZahl(23), '23');
  assert.equal(kartenZahl(9999), '9.999');
  assert.equal(kartenZahl(12500), '12,5K');
  assert.equal(kartenZahl(250000), '250K');
  assert.equal(kartenZahl('quatsch'), '0');
  const a = schiffsPosition(0);
  const b = schiffsPosition(0.5);
  const c = schiffsPosition(1);
  assert.ok(a.x < b.x && b.x < c.x, 'fährt nach rechts');
  assert.deepEqual(schiffsPosition(7), c, 'über dem Ziel bleibt es vor der Truhe');
  for (const p of [a, b, c]) assert.ok(p.y > 0.3 && p.y < 0.95, 'bleibt auf der Karte');
});
