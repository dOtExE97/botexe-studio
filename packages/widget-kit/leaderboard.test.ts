// leaderboard.test.ts — Quelle „twitch" (Bits + Subs) und Stil „schatz".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installiereFakeDom, type FakeElement } from './fake-dom.test-helfer.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
g.requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0);
g.Image ??= class { onload: (() => void) | null = null; src = ''; };

const { default: Leaderboard, twitchWert } = await import('./leaderboard.js');

function alle(el: FakeElement): FakeElement[] { return el.children.flatMap((k) => [k, ...alle(k)]); }
const mitKlasse = (el: FakeElement, k: string) => alle(el).filter((x) => x.classList.contains(k));

const stats = {
  topGifters: [{ id: 'g1', nickname: 'TikTokTom', coins: 99999 }],
  topLikers: [{ id: 'l1', nickname: 'LikeLu', likes: 5000 }],
  topTwitch: [
    { id: 'twitch:a', nickname: 'Goldzahn', punkte: 1800, bits: 1300, subs: 1 },
    { id: 'twitch:b', nickname: 'Blaubär', punkte: 1500, bits: 0, subs: 3 },
    { id: 'twitch:c', nickname: 'Möwe', punkte: 900, bits: 900, subs: 0 },
  ],
};

test('twitchWert: Bits, Subs oder beides — deutsch formatiert', () => {
  assert.equal(twitchWert({ bits: 1500, subs: 0 }), '1.500 Bits');
  assert.equal(twitchWert({ bits: 0, subs: 3 }), '3 Subs');
  assert.equal(twitchWert({ bits: 0, subs: 1 }), '1 Sub');
  assert.equal(twitchWert({ bits: 300, subs: 2 }), '2 Subs + 300 Bits');
  assert.equal(twitchWert({}), '0');
});

test('Quelle twitch: zeigt die Twitch-Liste, TikTok-Gifter und -Liker tauchen nicht auf', () => {
  const root = installiereFakeDom();
  const w: any = new Leaderboard(root, { source: 'twitch', style: 'glas' }, {});
  const el = root.children[0]!;
  assert.ok(el.classList.contains('bx-lb-twitch'));
  assert.equal(mitKlasse(el, 'bx-lb-title')[0]!.textContent, 'Top Supporter');
  w.onStats(stats);
  assert.deepEqual(mitKlasse(el, 'bx-lb-name').map((n) => n.textContent), ['Goldzahn', 'Blaubär', 'Möwe']);
  assert.deepEqual(mitKlasse(el, 'bx-lb-val').map((n) => n.textContent), ['1 Sub + 1.300 Bits', '3 Subs', '900 Bits']);
  // Nur TikTok-Daten (keine topTwitch) → Platzhalter, keine Zeilen.
  w.onStats({ topGifters: stats.topGifters, topLikers: stats.topLikers });
  assert.equal(mitKlasse(el, 'bx-lb-row').length, 0);
  assert.equal(mitKlasse(el, 'bx-lb-empty')[0]!.textContent, 'Noch keine Bits oder Subs');
  w.destroy();
});

test('Bestehende Quellen bleiben: gifts liest topGifters, likes topLikers', () => {
  for (const [source, name] of [['gifts', 'TikTokTom'], ['likes', 'LikeLu'], [undefined, 'TikTokTom']] as const) {
    const root = installiereFakeDom();
    const w: any = new Leaderboard(root, source ? { source } : {}, {});
    w.onStats(stats);
    assert.deepEqual(mitKlasse(root, 'bx-lb-name').map((n) => n.textContent), [name], String(source));
    assert.ok(!root.children[0]!.classList.contains('bx-lb-twitch'));
    w.destroy();
  }
});

test('Stil schatz: eigene Klasse, Plakette „Top Piraten", Schriften nur ohne eigene Wahl', () => {
  const root = installiereFakeDom();
  const w: any = new Leaderboard(root, { source: 'twitch', style: 'schatz' }, { preview: true });
  const el = root.children[0]!;
  assert.ok(el.classList.contains('bx-st-schatz'));
  assert.equal(mitKlasse(el, 'bx-lb-title')[0]!.textContent, 'Top Piraten');
  assert.match(el.style.getPropertyValue('--bx-font-display'), /Lilita One/);
  assert.ok(mitKlasse(el, 'bx-lb-row').length > 0, 'Vorschau zeigt Demo-Supporter');
  w.destroy();
  const zwei = installiereFakeDom();
  const v: any = new Leaderboard(zwei, { style: 'schatz', title: 'Beute-Kapitäne', fontFamily: 'bebas' }, {});
  assert.equal(mitKlasse(zwei, 'bx-lb-title')[0]!.textContent, 'Beute-Kapitäne');
  assert.equal(zwei.children[0]!.style.getPropertyValue('--bx-font-display'), '');
  v.destroy();
  // Unbekannter Stil fällt wie bisher auf glas zurück.
  const drei = installiereFakeDom();
  const x: any = new Leaderboard(drei, { style: 'gibtsnicht' }, {});
  assert.ok(drei.children[0]!.classList.contains('bx-st-glas'));
  x.destroy();
});
