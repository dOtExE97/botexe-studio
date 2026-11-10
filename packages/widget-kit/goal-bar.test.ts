// goal-bar.test.ts — Metrik „tiktok-ziel" folgt dem live_ziel-Ereignis; alle
// anderen Metriken bleiben unverändert. Minimale DOM-Attrappe, kein jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeEl(): any {
  const cls = new Set<string>();
  const el: any = {
    textContent: '', style: { width: '', setProperty() {}, }, children: [] as any[],
    classList: {
      add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c),
      contains: (c: string) => cls.has(c), toggle: (c: string, on: boolean) => (on ? cls.add(c) : cls.delete(c)),
    },
    set className(v: string) { cls.clear(); v.split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    set innerHTML(_v: string) { el.parts = {}; },
    parts: {} as Record<string, any>,
    querySelector(sel: string) { return (el.parts[sel] ??= makeEl()); },
    appendChild() {}, remove() {}, closest: () => null,
  };
  return el;
}

const ids = new Set<string>();
(globalThis as any).document = {
  getElementById: (id: string) => (ids.has(id) ? {} : null),
  createElement: () => makeEl(),
  head: { appendChild: (s: any) => ids.add(s.id) },
};

const { default: GoalBar } = await import('./goal-bar.js');

function make(props: Record<string, unknown>, ctx?: unknown) {
  const root: any = makeEl();
  const bar: any = new GoalBar(root, props, ctx);
  const text = (sel: string) => bar.el.querySelector(sel).textContent;
  return { bar, text };
}
const zielEvent = (fortschritt: number, ziel: number, extra: Record<string, unknown> = {}) => ({
  type: 'live_ziel', ziel: { id: 'g', fortschritt, ziel, erreicht: false, geschenk: { name: 'Heart Me' }, ...extra },
});

test('tiktok-ziel: wartet bis zum ersten Ereignis', () => {
  const { text } = make({ metric: 'tiktok-ziel' });
  assert.equal(text('.bx-gb-label'), 'Warte auf TikTok-Ziel…');
});

test('tiktok-ziel: live_ziel setzt Zahlen und Geschenkname', () => {
  const { bar, text } = make({ metric: 'tiktok-ziel' });
  bar.onEvent(zielEvent(35, 50));
  assert.equal(text('.bx-gb-nums'), '35 / 50');
  assert.equal(text('.bx-gb-label'), 'Heart Me');
  assert.equal(text('.bx-gb-pct'), '70%');
});

test('tiktok-ziel: props.label gewinnt, ohne Geschenk „LIVE-Ziel"', () => {
  const a = make({ metric: 'tiktok-ziel', label: 'Mein Ziel' });
  a.bar.onEvent(zielEvent(1, 2));
  assert.equal(a.text('.bx-gb-label'), 'Mein Ziel');
  const b = make({ metric: 'tiktok-ziel' });
  b.bar.onEvent({ type: 'live_ziel', ziel: { id: 'x', fortschritt: 1, ziel: 2, erreicht: false } });
  assert.equal(b.text('.bx-gb-label'), 'LIVE-Ziel');
});

test('tiktok-ziel: erreicht markiert den Balken als done', () => {
  const { bar } = make({ metric: 'tiktok-ziel' });
  bar.onEvent(zielEvent(10, 50, { erreicht: true }));
  assert.equal(bar.el.classList.contains('done'), true);
});

test('tiktok-ziel: Vorschau zeigt Demo 35/50 „Heart Me"', () => {
  const { text } = make({ metric: 'tiktok-ziel' }, { preview: true });
  assert.equal(text('.bx-gb-nums'), '35 / 50');
  assert.equal(text('.bx-gb-label'), 'Heart Me');
});

test('tiktok-ziel: andere Ereignistypen und kaputte Daten werden ignoriert', () => {
  const { bar, text } = make({ metric: 'tiktok-ziel' });
  bar.onEvent({ type: 'gift' });
  bar.onEvent({ type: 'live_ziel' });
  assert.equal(text('.bx-gb-label'), 'Warte auf TikTok-Ziel…');
});

test('Wächter: andere Metriken ignorieren live_ziel', () => {
  const { bar, text } = make({ metric: 'coins', target: 1000 });
  bar.onEvent(zielEvent(35, 50));
  assert.equal(text('.bx-gb-label'), 'Coin-Ziel');
  assert.notEqual(text('.bx-gb-nums'), '35 / 50');
});

test('Wächter: coins zählt weiter über onStats', () => {
  const { bar, text } = make({ metric: 'coins', target: 1000 });
  bar.onStats({ totals: { coins: 500 } });
  assert.equal(text('.bx-gb-nums'), '500 / 1.0K');
  assert.equal(text('.bx-gb-pct'), '50%');
});

test('Wächter: Vorschau coins bleibt 62 %', () => {
  const { text } = make({ metric: 'coins', target: 1000 }, { preview: true });
  assert.equal(text('.bx-gb-nums'), '620 / 1.0K');
});
