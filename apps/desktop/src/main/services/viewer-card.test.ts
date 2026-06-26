import test from 'node:test';
import assert from 'node:assert/strict';

import { ViewerCardService, type ViewerInfo } from './viewer-card';

// Bequemer Basis-Viewer, den die Tests punktuell überschreiben.
function viewer(overrides: Partial<ViewerInfo> = {}): ViewerInfo {
  return {
    id: 'u1',
    nickname: 'Alex',
    visits: 10,
    coins: 1234,
    points: 42,
    ...overrides,
  };
}

test('vip-welcome baut einen korrekten Moment (channel/priority/title/stats)', () => {
  const svc = new ViewerCardService();
  const m = svc.buildMoment('vip-welcome', viewer({ isVip: true }), 0);

  assert.ok(m, 'sollte einen Moment liefern');
  assert.equal(m.type, 'vip-welcome');
  assert.equal(m.channel, 'vip');
  assert.equal(m.priority, 70);
  assert.equal(m.durationMs, 4500);
  assert.equal(m.title, 'VIP Alex');
  assert.deepEqual(m.user, { id: 'u1', nickname: 'Alex', profilePic: undefined });
  assert.equal(m.stats?.['Besuche'], 10);
  assert.equal(m.stats?.['Coins'], 1234);
  assert.equal(m.stats?.['Punkte'], 42);
});

test('returning-viewer erst ab returningMinVisits, sonst null', () => {
  const svc = new ViewerCardService({ returningMinVisits: 5 });

  // 4 Besuche < 5 → kein Moment
  assert.equal(svc.buildMoment('returning-viewer', viewer({ visits: 4 }), 0), null);

  // 5 Besuche → Moment, korrekt getypt
  const m = svc.buildMoment('returning-viewer', viewer({ id: 'u2', visits: 5 }), 0);
  assert.ok(m);
  assert.equal(m.type, 'returning-viewer');
  assert.equal(m.channel, 'viewer');
  assert.equal(m.priority, 40);
  assert.equal(m.title, 'Alex ist zurück');
  assert.equal(m.subtitle, '5. Besuch');
});

test('per-User-Cooldown blockt den zweiten Moment desselben Users', () => {
  const svc = new ViewerCardService({ perUserCooldownMs: 10 * 60 * 1000, globalMinGapMs: 0 });

  const first = svc.buildMoment('vip-welcome', viewer(), 0);
  assert.ok(first, 'erster Moment kommt durch');

  // Innerhalb des Cooldowns → null
  assert.equal(svc.buildMoment('vip-welcome', viewer(), 5 * 60 * 1000), null);

  // Nach Ablauf des Cooldowns → wieder erlaubt
  const third = svc.buildMoment('vip-welcome', viewer(), 10 * 60 * 1000);
  assert.ok(third, 'nach Cooldown wieder erlaubt');
});

test('global gap blockt einen Moment eines ANDEREN Users zu kurz danach', () => {
  const svc = new ViewerCardService({ globalMinGapMs: 8000, perUserCooldownMs: 0 });

  const a = svc.buildMoment('vip-welcome', viewer({ id: 'a' }), 0);
  assert.ok(a);

  // Anderer User, aber nur 3 s später → globaler Gap blockt
  assert.equal(svc.buildMoment('vip-welcome', viewer({ id: 'b' }), 3000), null);

  // 8 s später → durch
  const c = svc.buildMoment('vip-welcome', viewer({ id: 'b' }), 8000);
  assert.ok(c);
});

test('manual-card ignoriert per-User- und globalen Cooldown', () => {
  const svc = new ViewerCardService({ perUserCooldownMs: 10 * 60 * 1000, globalMinGapMs: 8000 });

  const m1 = svc.buildMoment('manual-card', viewer(), 0);
  assert.ok(m1);
  assert.equal(m1.channel, 'manual');
  assert.equal(m1.priority, 50);
  assert.equal(m1.type, 'manual-card');
  assert.equal(m1.title, 'Alex');
  assert.equal(m1.subtitle, undefined);

  // Direkt danach erneut, gleicher User → trotzdem ein Moment
  const m2 = svc.buildMoment('manual-card', viewer(), 100);
  assert.ok(m2, 'manual-card ignoriert Cooldowns');
});

test('manual-card setzt globalen Gap, sodass ein folgender Auto-Moment blockt', () => {
  const svc = new ViewerCardService({ globalMinGapMs: 8000, perUserCooldownMs: 0 });

  assert.ok(svc.buildMoment('manual-card', viewer({ id: 'a' }), 0));
  // Auto-Moment 2 s später greift am globalen Gap
  assert.equal(svc.buildMoment('vip-welcome', viewer({ id: 'b' }), 2000), null);
});

test('stats lässt fehlende Felder weg', () => {
  const svc = new ViewerCardService();
  const m = svc.buildMoment('vip-welcome', { id: 'x', nickname: 'Nur Name' }, 0);
  assert.ok(m);
  assert.equal(m.stats, undefined);
});
