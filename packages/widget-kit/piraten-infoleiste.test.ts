// piraten-infoleiste.test.ts — welches Schild füllt welches Ereignis, Plattform-
// Filter, Geschenk-Abo-Text, Wiederherstellen per Sticky-Replay, und dass
// Kaputtes nie wirft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installiereFakeDom, type FakeElement } from './fake-dom.test-helfer.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const { default: Infoleiste, eintragAus, slotListe, STANDARD_SLOTS } = await import('./piraten-infoleiste.js');

function alle(el: FakeElement): FakeElement[] { return el.children.flatMap((k) => [k, ...alle(k)]); }
function tafel(root: FakeElement, slot: string): FakeElement {
  const t = alle(root).find((x) => x.classList.contains('bx-pi-tafel') && x.dataset.slot === slot);
  assert.ok(t, `Schild ${slot} fehlt`);
  return t!;
}
const name = (root: FakeElement, slot: string) => tafel(root, slot).querySelector('.bx-pi-name')!.textContent;
const wert = (root: FakeElement, slot: string) => tafel(root, slot).querySelector('.bx-pi-wert')!.textContent;
const user = (nickname: string) => ({ id: nickname, nickname });

test('eintragAus: jede Ereignisart landet im passenden Schild', () => {
  assert.deepEqual(eintragAus({ type: 'follow', user: user('Mia') }), { slot: 'follow', name: 'Mia', wert: '' });
  assert.deepEqual(eintragAus({ type: 'cheer', plattform: 'twitch', user: user('Goldzahn'), cheer: { bits: 1500 } }),
    { slot: 'cheer', name: 'Goldzahn', wert: '1.500 Bits' });
  assert.equal(eintragAus({ type: 'cheer', plattform: 'twitch', user: user('A'), cheer: { bits: 1 } })!.wert, '1 Bit');
  assert.deepEqual(eintragAus({ type: 'raid', plattform: 'twitch', user: user('Kraken'), raid: { viewers: 42 } }),
    { slot: 'raid', name: 'Kraken', wert: '42 Piraten' });
  assert.equal(eintragAus({ type: 'raid', plattform: 'twitch', user: user('K'), raid: { viewers: 1 } })!.wert, '1 Pirat');
  assert.deepEqual(eintragAus({ type: 'gift', plattform: 'tiktok', user: user('Nova'), gift: { slug: 'Rose', count: 5, coinsPerUnit: 1, totalCoins: 5 } }),
    { slot: 'gift', name: 'Nova', wert: '5 Coins' });
  assert.deepEqual(eintragAus({ type: 'sub', plattform: 'twitch', user: user('Blaubär'), subMonths: 7 }),
    { slot: 'sub', name: 'Blaubär', wert: '7 Monate' });
  assert.equal(eintragAus({ type: 'sub', plattform: 'twitch', user: user('Neu'), subMonths: 1 })!.wert, 'neu');
  for (const type of ['chat', 'like', 'join', 'share', 'viewer_count', 'timer', 'superfan']) {
    assert.equal(eintragAus({ type, user: user('x') }), null, type);
  }
});

test('Abo nur von Twitch — TikToks Superfan-Abo bleibt draußen', () => {
  assert.equal(eintragAus({ type: 'sub', plattform: 'tiktok', user: user('Fan') }), null);
  assert.equal(eintragAus({ type: 'sub', user: user('Fan') }), null);
});

test('Geschenk-Abo: „Name · 5 verschenkt", anonym heißt Anonym', () => {
  assert.deepEqual(eintragAus({ type: 'sub', plattform: 'twitch', user: user('Planke'), subGeschenk: { anzahl: 5, tier: '1000', anonym: false } }),
    { slot: 'sub', name: 'Planke', wert: '5 verschenkt' });
  assert.deepEqual(eintragAus({ type: 'sub', plattform: 'twitch', user: { id: 'twitch:anonym', nickname: 'Anonym' }, subGeschenk: { anzahl: 1000, anonym: true } }),
    { slot: 'sub', name: 'Anonym', wert: '1.000 verschenkt' });
  // Kaputte Anzahl → mindestens eins.
  assert.equal(eintragAus({ type: 'sub', plattform: 'twitch', user: user('P'), subGeschenk: { anzahl: 'viele' } })!.wert, '1 verschenkt');
});

test('Plattform-Filter: fremde Plattform raus, ohne Plattform (Test, Timer) immer drin', () => {
  const tw = { type: 'follow', plattform: 'twitch', user: user('Tw') };
  const tt = { type: 'follow', plattform: 'tiktok', user: user('Tt') };
  const ohne = { type: 'follow', user: user('Test') };
  assert.ok(eintragAus(tw, 'twitch'));
  assert.equal(eintragAus(tt, 'twitch'), null);
  assert.ok(eintragAus(tt, 'tiktok'));
  assert.equal(eintragAus(tw, 'tiktok'), null);
  for (const f of ['alle', 'twitch', 'tiktok'] as const) assert.ok(eintragAus(ohne, f), f);
  assert.ok(eintragAus(tw, 'alle') && eintragAus(tt, 'alle'));
});

test('Kaputtes und Unbekanntes wirft nie', () => {
  for (const e of [null, undefined, 0, 'follow', [], {}, { type: 'follow' }, { type: 'cheer' }, { type: 'raid', raid: null },
    { type: 'gift', gift: 'Rose' }, { type: 'sub', plattform: 'twitch', subGeschenk: null }, { type: 'follow', user: 'Mia' },
    { type: 'follow', user: { nickname: 42 } }, { type: 'cheer', cheer: { bits: -5 } }, { type: 'quatsch', plattform: 'mars' }]) {
    assert.doesNotThrow(() => eintragAus(e as any), JSON.stringify(e));
  }
  assert.equal(eintragAus({ type: 'follow' })!.name, 'Jemand');
  assert.equal(eintragAus({ type: 'cheer', user: user('x'), cheer: { bits: -5 } })!.wert, '');

  const root = installiereFakeDom();
  const w: any = new Infoleiste(root, {}, {});
  for (const e of [null, undefined, 'x', 7, {}, { type: 'raid' }, { type: 'gift', gift: null, user: null }, { type: 'sub', plattform: 'twitch' }]) {
    assert.doesNotThrow(() => w.onEvent(e), JSON.stringify(e));
  }
  w.destroy();
  assert.doesNotThrow(() => w.onEvent({ type: 'follow', user: user('nach destroy') }));
});

test('slotListe: Reihenfolge wie gespeichert, Doppeltes/Unbekanntes raus, leer → Standard', () => {
  assert.deepEqual(slotListe(['raid', 'follow', 'raid', 'quatsch', 7]), ['raid', 'follow']);
  assert.deepEqual(slotListe(undefined), STANDARD_SLOTS);
  assert.deepEqual(slotListe('follow,sub'), STANDARD_SLOTS);
  assert.deepEqual(slotListe([]), STANDARD_SLOTS);
});

test('Widget: Schilder leer mit Platzhalter, Ereignisse füllen das passende Schild und feiern', () => {
  const root = installiereFakeDom();
  const w: any = new Infoleiste(root, { slots: ['raid', 'sub', 'follow'] }, {});
  const tafeln = alle(root).filter((x) => x.classList.contains('bx-pi-tafel'));
  assert.deepEqual(tafeln.map((t) => t.dataset.slot), ['raid', 'sub', 'follow']);
  assert.ok(tafel(root, 'follow').classList.contains('bx-pi-leer'));
  assert.equal(name(root, 'follow'), '—');
  assert.equal(wert(root, 'follow'), 'Noch keiner – sei der Erste!');

  w.onEvent({ type: 'follow', ts: 10, plattform: 'twitch', user: user('Muschelmia') });
  assert.equal(name(root, 'follow'), 'Muschelmia');
  assert.equal(wert(root, 'follow'), '');
  assert.ok(!tafel(root, 'follow').classList.contains('bx-pi-leer'));
  assert.ok(tafel(root, 'follow').classList.contains('bx-pi-schwung'));
  assert.ok(tafel(root, 'follow').classList.contains('bx-pi-frisch'));

  w.onEvent({ type: 'sub', ts: 11, plattform: 'twitch', user: user('Planke'), subGeschenk: { anzahl: 5 } });
  assert.equal(name(root, 'sub'), 'Planke');
  assert.equal(wert(root, 'sub'), '5 verschenkt');
  // Kein Schild für Cheers gewählt → nichts passiert, nichts wirft.
  w.onEvent({ type: 'cheer', ts: 12, plattform: 'twitch', user: user('X'), cheer: { bits: 100 } });
  // Test-Ereignisse (synthetic) zählen ganz normal.
  w.onEvent({ type: 'raid', ts: 13, synthetic: true, user: user('Testkapitän'), raid: { viewers: 7 } });
  assert.equal(name(root, 'raid'), 'Testkapitän');
  assert.equal(wert(root, 'raid'), '7 Piraten');
  w.destroy();
});

test('Widget: Plattform-Filter greift', () => {
  const root = installiereFakeDom();
  const w: any = new Infoleiste(root, { plattform: 'tiktok', slots: ['follow'] }, {});
  w.onEvent({ type: 'follow', ts: 1, plattform: 'twitch', user: user('Twitchy') });
  assert.equal(name(root, 'follow'), '—');
  w.onEvent({ type: 'follow', ts: 2, plattform: 'tiktok', user: user('Tiki') });
  assert.equal(name(root, 'follow'), 'Tiki');
  w.destroy();
});

test('Sticky-Replay stellt den letzten Stand wieder her — ohne Feier, der jüngere Wert gewinnt', () => {
  const root = installiereFakeDom();
  const w: any = new Infoleiste(root, {}, {});
  // Der Bus liefert je Art UND Plattform einen Wert nach: hier TikTok jünger als Twitch.
  w.onEvent({ type: 'follow', ts: 2000, plattform: 'tiktok', user: user('Jung'), sticky: true });
  w.onEvent({ type: 'follow', ts: 1000, plattform: 'twitch', user: user('Alt'), sticky: true });
  w.onEvent({ type: 'cheer', ts: 1500, plattform: 'twitch', user: user('Goldzahn'), cheer: { bits: 500 }, sticky: true });
  assert.equal(name(root, 'follow'), 'Jung');
  assert.equal(name(root, 'cheer'), 'Goldzahn');
  assert.equal(wert(root, 'cheer'), '500 Bits');
  for (const s of ['follow', 'cheer']) {
    assert.ok(!tafel(root, s).classList.contains('bx-pi-schwung'), `${s}: keine Feier beim Replay`);
    assert.ok(!tafel(root, s).classList.contains('bx-pi-frisch'));
    assert.ok(!tafel(root, s).classList.contains('bx-pi-leer'));
  }
  // Ein Replay ÄLTER als ein schon gezeigtes Live-Ereignis überschreibt nichts.
  w.onEvent({ type: 'raid', ts: 5000, plattform: 'twitch', user: user('Live'), raid: { viewers: 3 } });
  w.onEvent({ type: 'raid', ts: 4000, plattform: 'twitch', user: user('Replay'), raid: { viewers: 9 }, sticky: true });
  assert.equal(name(root, 'raid'), 'Live');
  w.destroy();
});

test('Vorschau: alle Schilder mit Demo-Namen, Timer beim Zerstören weg', () => {
  const root = installiereFakeDom();
  const w: any = new Infoleiste(root, { slots: ['follow', 'sub', 'cheer', 'raid', 'gift'] }, { preview: true });
  for (const s of ['follow', 'sub', 'cheer', 'raid', 'gift']) {
    assert.ok(!tafel(root, s).classList.contains('bx-pi-leer'), s);
    assert.notEqual(name(root, s), '—', s);
  }
  assert.ok(w.demoTimer);
  w.destroy();
  assert.equal(w.demoTimer, null);
  assert.equal(w.timers.size, 0);
});
