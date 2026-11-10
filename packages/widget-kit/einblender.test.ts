// einblender.test.ts — Like-Flaute (reine Rechnung) und der Spot-Renderer
// gegen einen prüfenden Zeichen-Kontext (DOM-frei).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likeFlaute, spotPlan, SpotRenderer, teileIntro, handleText, DUR_VOLL } from './einblender.js';

const MIN = 60000;
const CFG = { autoMinZuschauer: 5, autoMinuten: 3, autoLikesUnter: 50, autoPauseMin: 10 };
const JETZT = 10_000_000;

/** Standardlage: genug Zuschauer, 20 Likes in den letzten 3 min, letzter Spot
 *  vor 11 min, Verbindung seit 30 min. Einzelne Werte je Test überschreiben. */
function lage(over: Record<string, unknown> = {}) {
  return {
    likes: [{ ts: JETZT - 1 * MIN, anzahl: 12 }, { ts: JETZT - 2.5 * MIN, anzahl: 8 }],
    zuschauer: 6,
    jetzt: JETZT,
    letzterSpot: JETZT - 11 * MIN,
    verbundenSeit: JETZT - 30 * MIN,
    cfg: CFG,
    ...over,
  };
}

test('Like-Flaute: 6 Zuschauer, 20 Likes in 3 min, letzter Spot vor 11 min → Spot', () => {
  assert.equal(likeFlaute(lage()), true);
});

test('Like-Flaute: zu wenig Zuschauer → kein Spot', () => {
  assert.equal(likeFlaute(lage({ zuschauer: 4 })), false);
});

test('Like-Flaute: genug Likes (60) → kein Spot', () => {
  assert.equal(likeFlaute(lage({ likes: [{ ts: JETZT - MIN, anzahl: 60 }] })), false);
});

test('Like-Flaute: letzter Spot erst vor 5 min → kein Spot (Pause)', () => {
  assert.equal(likeFlaute(lage({ letzterSpot: JETZT - 5 * MIN })), false);
});

test('Like-Flaute: Likes älter als das Fenster zählen nicht', () => {
  // 100 Likes, aber vor 4 min — liegen außerhalb der 3 min, zählen also nicht.
  const likes = [{ ts: JETZT - 4 * MIN, anzahl: 100 }, { ts: JETZT - MIN, anzahl: 10 }];
  assert.equal(likeFlaute(lage({ likes })), true);
  // Gegenprobe: dieselben 100 Likes innerhalb des Fensters → keine Flaute.
  assert.equal(likeFlaute(lage({ likes: [{ ts: JETZT - 2 * MIN, anzahl: 100 }] })), false);
});

test('Like-Flaute: Verbindung erst 1 min alt → kein Spot (sonst feuert es direkt beim Start)', () => {
  assert.equal(likeFlaute(lage({ verbundenSeit: JETZT - MIN, likes: [] })), false);
  // ohne bekannte Verbindung ebenfalls nicht
  assert.equal(likeFlaute(lage({ verbundenSeit: null })), false);
});

test('Like-Flaute: noch nie ein Spot gelaufen → Pause gilt als erfüllt', () => {
  assert.equal(likeFlaute(lage({ letzterSpot: 0 })), true);
});

test('Ablaufplan: alle drei Szenen = die volle Probe (7,5 s), weniger Szenen kürzer', () => {
  assert.equal(DUR_VOLL, 7.5);
  const voll = spotPlan(['tippen', 'teilen', 'folgen']);
  assert.equal(voll.dauer, 7.5);
  assert.deepEqual(voll.szenen.map((s) => s.id), ['tippen', 'teilen', 'folgen']);
  const eins = spotPlan(['teilen']);
  assert.ok(Math.abs(eins.dauer - (7.5 - 2 * 1.44)) < 1e-9, `dauer=${eins.dauer}`);
  assert.equal(eins.szenen[0]!.id, 'teilen');
  assert.equal(eins.szenen[0]!.start, 1.74, 'die erste Szene beginnt wie in der Probe');
  // Reihenfolge ist immer die feste, egal wie die Häkchen gesetzt wurden
  assert.deepEqual(spotPlan(['folgen', 'tippen']).szenen.map((s) => s.id), ['tippen', 'folgen']);
  // Unbekanntes wird ignoriert, kein Array → alle drei
  assert.deepEqual(spotPlan(undefined).szenen.map((s) => s.id), ['tippen', 'teilen', 'folgen']);
});

test('Intro-Text: letztes Wort groß, der Rest klein darüber', () => {
  assert.deepEqual(teileIntro('IHR WOLLT SUPPORTEN?'), ['IHR WOLLT', 'SUPPORTEN?']);
  assert.deepEqual(teileIntro('  hallo  '), ['', 'HALLO']);
  assert.deepEqual(teileIntro(''), ['', '']);
});

test('Handle: leer → keine Zeile, sonst mit @ und in Großbuchstaben', () => {
  assert.equal(handleText(''), '');
  assert.equal(handleText('   '), '');
  assert.equal(handleText('dotexe_97'), '@DOTEXE_97');
  assert.equal(handleText('@dotexe_97'), '@DOTEXE_97');
});

// ── Renderer gegen einen prüfenden Kontext ─────────────────────────────────
// Ein echter Canvas wirft bei negativem Radius (arc/ellipse/RadialGradient)
// und bei addColorStop außerhalb 0..1; NaN-Koordinaten zeichnen stumm nichts.
// Der Prüf-Kontext macht beides laut.
function pruefKontext() {
  const fehler: string[] = [];
  const pruefe = (name: string, args: unknown[]) => {
    args.forEach((a, i) => {
      if (typeof a === 'number' && !Number.isFinite(a)) fehler.push(`${name}[${i}]=${a}`);
    });
  };
  const verlauf = (name: string) => ({
    addColorStop(p: number, c: string) {
      pruefe(`${name}.addColorStop`, [p]);
      if (p < 0 || p > 1) fehler.push(`${name}.addColorStop p=${p}`);
      if (typeof c !== 'string' || !c) fehler.push(`${name}.addColorStop Farbe=${c}`);
    },
  });
  const state: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1, lineWidth: 1 };
  const fns: Record<string, (...a: number[]) => unknown> = {
    measureText: (t: unknown) => {
      const px = Number(/([\d.]+)px/.exec(String(state.font))?.[1] ?? 10);
      return { width: String(t).length * px * 0.62 };
    },
    createLinearGradient: (...a) => { pruefe('createLinearGradient', a); return verlauf('lin'); },
    createRadialGradient: (...a) => {
      pruefe('createRadialGradient', a);
      if (a[2]! < 0 || a[5]! < 0) fehler.push(`createRadialGradient r<0 (${a[2]}, ${a[5]})`);
      return verlauf('rad');
    },
    createConicGradient: (...a) => { pruefe('createConicGradient', a); return verlauf('con'); },
    arc: (...a) => { pruefe('arc', a); if (a[2]! < 0) fehler.push(`arc r=${a[2]}`); },
    ellipse: (...a) => { pruefe('ellipse', a); if (a[2]! < 0 || a[3]! < 0) fehler.push(`ellipse r=${a[2]},${a[3]}`); },
  };
  const g = new Proxy(state, {
    get(t, k: string) {
      if (k in fns) return fns[k];
      if (k in t) return t[k];
      return (...a: unknown[]) => pruefe(k, a);
    },
    set(t, k: string, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) fehler.push(`${k}=${v}`);
      t[k] = v;
      return true;
    },
  });
  return { g, fehler };
}

const KOMBIS: string[][] = [['teilen'], ['tippen', 'teilen', 'folgen'], ['tippen'], ['folgen'], ['tippen', 'folgen'], []];

for (const look of ['neon', 'gold']) {
  for (const szenen of KOMBIS) {
    test(`Renderer ${look} [${szenen.join(',') || 'keine'}]: t∈{0, 3, dauer} und jeder Frame ohne Wurf/NaN`, () => {
      const r = new SpotRenderer({ look, szenen, intro: 'IHR WOLLT SUPPORTEN?', abschluss: 'DANKE', handle: 'dotexe_97' });
      assert.ok(r.dauer > 0 && r.dauer <= 7.5);
      for (const t of [0, 3, r.dauer]) {
        const { g, fehler } = pruefKontext();
        r.zeichne(g as unknown as CanvasRenderingContext2D, t);
        assert.deepEqual(fehler, [], `t=${t}`);
      }
      // Ganzer Ablauf frameweise (30 fps), wie im Overlay
      const r2 = new SpotRenderer({ look, szenen, intro: 'IHR WOLLT SUPPORTEN?', abschluss: 'DANKE', handle: '' });
      const { g, fehler } = pruefKontext();
      for (let i = 0; i <= Math.round(r2.dauer * 30); i++) r2.zeichne(g as unknown as CanvasRenderingContext2D, i / 30);
      assert.deepEqual(fehler.slice(0, 5), []);
    });
  }
}

test('Renderer: Partikel sind deterministisch — Rücksprung in der Zeit liefert dasselbe Bild', () => {
  const r = new SpotRenderer({ look: 'neon', szenen: ['tippen', 'teilen', 'folgen'], intro: 'IHR WOLLT SUPPORTEN?', abschluss: 'DANKE', handle: '' });
  const { g } = pruefKontext();
  r.zeichne(g as unknown as CanvasRenderingContext2D, 2.5);
  const a = JSON.stringify(r.partikel);
  r.zeichne(g as unknown as CanvasRenderingContext2D, 6.5);
  r.zeichne(g as unknown as CanvasRenderingContext2D, 2.5);
  assert.equal(JSON.stringify(r.partikel), a);
  assert.ok(r.partikel.length > 0, 'bei 2,5 s fliegen Herzen');
});
