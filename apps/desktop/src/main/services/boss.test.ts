import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BossService, bossDamageMoment, bossKillMoment, type BossState } from './boss';

test('spawn setzt hp auf maxHp nach Level 0 (Default baseHp=1000)', () => {
  const boss = new BossService();
  boss.spawn({ id: 'b1', nickname: 'Drache' });
  const s = boss.getState();
  assert.equal(s.maxHp, 1000);
  assert.equal(s.hp, 1000);
  assert.equal(s.level, 0);
  assert.deepEqual(s.currentBoss, { id: 'b1', nickname: 'Drache' });
  assert.deepEqual(s.topDamagers, []);
});

test('damage reduziert hp und liefert hpAfter', () => {
  const boss = new BossService();
  boss.spawn();
  const r = boss.damage({ id: 'u1', nickname: 'Alice' }, 300);
  assert.equal(r.killed, false);
  assert.equal(r.hpAfter, 700);
  assert.equal(boss.getState().hp, 700);
});

test('hp wird nie negativ (min 0)', () => {
  const boss = new BossService();
  boss.spawn();
  const r = boss.damage({ id: 'u1', nickname: 'Alice' }, 5000);
  assert.equal(r.hpAfter, 0);
  assert.equal(r.killed, true);
  assert.equal(boss.getState().hp, 0);
});

test('topDamagers aggregiert pro id und sortiert absteigend', () => {
  const boss = new BossService();
  boss.spawn();
  boss.damage({ id: 'u1', nickname: 'Alice' }, 100);
  boss.damage({ id: 'u2', nickname: 'Bob' }, 250);
  boss.damage({ id: 'u1', nickname: 'Alice' }, 150); // u1 jetzt 250 gesamt
  boss.damage({ id: 'u3', nickname: 'Cara' }, 250);
  const top = boss.getState().topDamagers;
  // u1=250 (zuerst gesehen), u2=250, u3=250 — stabil nach Einfügereihenfolge bei Gleichstand
  assert.equal(top.length, 3);
  assert.deepEqual(
    top.map((d) => [d.id, d.damage]),
    [['u1', 250], ['u2', 250], ['u3', 250]],
  );
});

test('topDamagers begrenzt auf Top 5, höchster zuerst', () => {
  const boss = new BossService();
  boss.spawn();
  for (let i = 1; i <= 7; i++) {
    boss.damage({ id: `u${i}`, nickname: `User${i}` }, i * 10);
  }
  const top = boss.getState().topDamagers;
  assert.equal(top.length, 5);
  assert.deepEqual(
    top.map((d) => d.id),
    ['u7', 'u6', 'u5', 'u4', 'u3'],
  );
  assert.equal(top[0]?.damage, 70);
});

test('kill bei hp 0: killed=true', () => {
  const boss = new BossService();
  boss.spawn();
  boss.damage({ id: 'u1', nickname: 'Alice' }, 600);
  const r = boss.damage({ id: 'u2', nickname: 'Bob' }, 400);
  assert.equal(r.killed, true);
  assert.equal(r.hpAfter, 0);
});

test('onKill erhöht Level und maxHp wächst (baseHp * hpGrowth^level)', () => {
  const boss = new BossService({ baseHp: 1000, hpGrowth: 1.5 });
  boss.spawn();
  boss.damage({ id: 'u1', nickname: 'Alice' }, 1000);
  const kill = boss.onKill();
  assert.equal(kill.level, 0); // besiegtes Level
  assert.equal(kill.topDamagers[0]?.id, 'u1');

  let s = boss.getState();
  assert.equal(s.level, 1);
  assert.equal(s.maxHp, 1500); // 1000 * 1.5^1

  boss.spawn();
  s = boss.getState();
  assert.equal(s.hp, 1500);
  assert.equal(s.maxHp, 1500);

  boss.damage({ id: 'u1', nickname: 'Alice' }, 1500);
  boss.onKill();
  assert.equal(boss.getState().maxHp, 2250); // 1000 * 1.5^2
});

test('spawn nach Kill setzt Damager zurück', () => {
  const boss = new BossService();
  boss.spawn();
  boss.damage({ id: 'u1', nickname: 'Alice' }, 1000);
  boss.onKill();
  boss.spawn();
  assert.deepEqual(boss.getState().topDamagers, []);
});

test('eigener baseHp/hpGrowth wird respektiert', () => {
  const boss = new BossService({ baseHp: 500, hpGrowth: 2 });
  boss.spawn();
  assert.equal(boss.getState().maxHp, 500);
  boss.damage({ id: 'u1', nickname: 'Alice' }, 500);
  boss.onKill();
  assert.equal(boss.getState().maxHp, 1000); // 500 * 2^1
});

test('bossDamageMoment hat korrekte Felder (klein, priority 50, channel boss)', () => {
  const state: BossState = { hp: 700, maxHp: 1000, level: 0, topDamagers: [] };
  const m = bossDamageMoment({ id: 'u1', nickname: 'Alice' }, 300, state);
  assert.equal(m.channel, 'boss');
  assert.equal(m.type, 'boss-damage');
  assert.equal(m.priority, 50);
  assert.equal(m.title, 'Alice');
  assert.equal(m.subtitle, '-300 HP');
  assert.deepEqual(m.user, { id: 'u1', nickname: 'Alice' });
  assert.equal(m.stats?.damage, 300);
  assert.equal(m.stats?.hp, 700);
  assert.ok(m.durationMs > 0);
  assert.ok(typeof m.id === 'string' && m.id.length > 0);
});

test('bossKillMoment hat korrekte Felder (priority 100, channel boss, level)', () => {
  const state: BossState = {
    hp: 0,
    maxHp: 1000,
    level: 3,
    currentBoss: { id: 'b1', nickname: 'Drache' },
    topDamagers: [
      { id: 'u1', nickname: 'Alice', damage: 500 },
      { id: 'u2', nickname: 'Bob', damage: 300 },
    ],
  };
  const m = bossKillMoment(state, state.topDamagers);
  assert.equal(m.channel, 'boss');
  assert.equal(m.type, 'boss-kill');
  assert.equal(m.priority, 100);
  assert.deepEqual(m.user, { id: 'b1', nickname: 'Drache' });
  assert.equal(m.title, 'Drache besiegt!');
  assert.equal(m.subtitle, 'MVP: Alice');
  assert.equal(m.level?.value, 3);
  assert.equal(m.stats?.level, 3);
  assert.equal(m.stats?.top1, 'Alice');
  assert.equal(m.stats?.top1Damage, 500);
});

test('bossKillMoment ohne currentBoss nutzt Fallback-Titel', () => {
  const state: BossState = { hp: 0, maxHp: 1000, level: 1, topDamagers: [] };
  const m = bossKillMoment(state, []);
  assert.equal(m.title, 'Boss besiegt!');
  assert.equal(m.user, undefined);
  assert.equal(m.subtitle, undefined);
});
