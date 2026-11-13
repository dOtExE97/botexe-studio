// piraten-zaehler.test.ts — welche Aktion welchen Zähler wie ändert (auch die
// Form, die POST /api/zaehler schickt), Speichern über Neuladen, Reset, Feier
// nur beim Sieg, und dass Kaputtes nie wirft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installiereFakeDom, type FakeElement } from './fake-dom.test-helfer.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
installiereFakeDom();
const { default: Zaehler, wendeAn, zaehlerName } = await import('./piraten-zaehler.js');

const null0 = { siege: 0, kills: 0 };
const neu = () => (globalThis as any).document.createElement('div') as FakeElement;
function baue(props: Record<string, unknown> = {}, ctx: Record<string, unknown> = { layerId: 'L1' }) {
  const root = neu();
  const w: any = new Zaehler(root, props, ctx);
  return { root, w };
}
const zahl = (root: FakeElement, z: string) => {
  const t = root.querySelectorAll('.bx-pz-tafel').find((x) => x.dataset.zaehler === z)!;
  return t.querySelector('.bx-pz-mass')!.textContent;
};

test('zaehlerName: Aliase', () => {
  assert.equal(zaehlerName('VR'), 'siege');
  assert.equal(zaehlerName(' wins '), 'siege');
  assert.equal(zaehlerName('Kill'), 'kills');
  assert.equal(zaehlerName('tore'), null);
  assert.equal(zaehlerName(3), null);
});

test('wendeAn: counter_add trifft den Standard-Zähler, fire_alert ist ein Sieg', () => {
  assert.deepEqual(wendeAn(null0, { kind: 'counter_add', targetId: 'L1', delta: 2 }), { siege: 0, kills: 2, geaendert: 'kills', sieg: false });
  assert.deepEqual(wendeAn(null0, { kind: 'counter_add', targetId: 'L1', delta: 1 }, 'siege'), { siege: 1, kills: 0, geaendert: 'siege', sieg: true });
  assert.deepEqual(wendeAn(null0, { kind: 'fire_alert', targetId: 'L1' }), { siege: 1, kills: 0, geaendert: 'siege', sieg: true });
});

test('wendeAn: Form von POST /api/zaehler (fire_alert + params)', () => {
  const s = { siege: 2, kills: 9 };
  assert.deepEqual(wendeAn(s, { kind: 'fire_alert', targetId: 'L1', params: { zaehler: 'kills', delta: 1 } }), { siege: 2, kills: 10, geaendert: 'kills', sieg: false });
  assert.deepEqual(wendeAn(s, { kind: 'fire_alert', targetId: 'L1', params: { zaehler: 'siege', delta: -1 } }), { siege: 1, kills: 9, geaendert: 'siege', sieg: false });
  assert.deepEqual(wendeAn(s, { kind: 'fire_alert', targetId: 'L1', params: { zaehler: 'kills', wert: 0 } }), { siege: 2, kills: 0, geaendert: 'kills', sieg: false });
  // Nichts geändert (schon 0, minus) → geaendert null, keine Feier.
  assert.equal(wendeAn(null0, { kind: 'fire_alert', params: { zaehler: 'kills', delta: -1 } })!.geaendert, null);
});

test('wendeAn: Fremdes und Kaputtes → null', () => {
  for (const a of [null, 'x', {}, { kind: 'spin_wheel' }, { kind: 'counter_add' }, { kind: 'counter_add', delta: 'viel' }]) {
    assert.equal(wendeAn(null0, a as any), null, JSON.stringify(a));
  }
  // Grenzen
  assert.equal(wendeAn({ siege: 0, kills: 99999 }, { kind: 'counter_add', delta: 5 })!.kills, 99999);
});

test('Widget: Aktion klappt die Ziffer um, Stand überlebt Neuladen', () => {
  const a = baue();
  assert.equal(zahl(a.root, 'kills'), '0');
  a.w.onAction({ kind: 'counter_add', targetId: 'L1', delta: 1 });
  assert.equal(a.w.stand.kills, 1);
  assert.ok(a.root.querySelectorAll('.bx-pz-klappe').length === 2, 'Klappen laufen');
  a.w.onAction({ kind: 'fire_alert', targetId: 'L1' });
  assert.ok(a.root.querySelector('.bx-pz-band')!.classList.contains('zeigen'), 'Victory-Royale-Band');
  assert.ok(a.root.querySelectorAll('.bx-pz-konfetti').length > 0);
  a.w.destroy();
  const b = baue();
  assert.deepEqual(b.w.stand, { siege: 1, kills: 1 });
  assert.equal(zahl(b.root, 'siege'), '1');
  b.w.destroy();
});

test('Widget: Kill feiert nicht wie ein Sieg', () => {
  const { root, w } = baue({}, { layerId: 'L2' });
  w.onAction({ kind: 'counter_add', targetId: 'L2', delta: 1 });
  assert.equal(root.querySelector('.bx-pz-band')!.classList.contains('zeigen'), false);
  assert.equal(root.querySelectorAll('.bx-pz-konfetti').length, 0);
  w.destroy();
});

test('Widget: neuer Stream setzt zurück — außer abgeschaltet', () => {
  const a = baue({}, { layerId: 'L3' });
  a.w.onAction({ kind: 'counter_add', delta: 4 });
  a.w.onReset();
  assert.deepEqual(a.w.stand, null0);
  a.w.destroy();
  const b = baue({ zuruecksetzen: false }, { layerId: 'L4' });
  b.w.onAction({ kind: 'counter_add', delta: 4 });
  b.w.onReset();
  assert.equal(b.w.stand.kills, 4);
  b.w.destroy();
});

test('Widget: eigene Beschriftung, Vorschau mit Demo, nach destroy wirft nichts', () => {
  const { root, w } = baue({ labelSiege: 'Siege', labelKills: 'Erledigt' }, { preview: true, layerId: 'L5' });
  const titel = root.querySelectorAll('.bx-pz-titel').map((t) => t.textContent);
  assert.deepEqual(titel, ['Siege', 'Erledigt']);
  assert.deepEqual(w.stand, { siege: 3, kills: 12 });
  assert.ok(w.demoTimer);
  w.onAction({ kind: 'counter_add', delta: 1 });
  assert.equal(w.demoTimer, null, 'echte Aktion beendet die Vorführung');
  w.destroy();
  w.onAction({ kind: 'fire_alert' });
  w.onReset();
});
