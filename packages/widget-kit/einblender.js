// einblender.js — Werbe-Spot „IHR WOLLT SUPPORTEN?" → Tippen / Teilen / Folgen → DANKE.
//
// Ein kurzer Motion-Design-Spot (7,5 s), der mit zwei Farbbändern reinwischt,
// zwischen den Szenen mit schrägen Wischern umschaltet und wieder rauswischt.
// Gezeichnet auf EINEM Canvas — der Ablauf ist 1:1 die freigegebene Probe
// docs/superpowers/specs/2026-11-10-proben/einblender-spot.html (Streamer hat
// zwei einfachere Fassungen als „zu billig" abgelehnt; die Probe ist die Latte).
// Der Ton (botexe-einblender.wav) ist auf genau diesen Ablauf geschnitten.
//
// Abspielen:
//   - per Regel (onAction fire_alert) sofort — läuft schon einer: ignorieren
//   - nach Zeitplan (intervallMin > 0: alle N Minuten)
//   - von allein bei „Like-Flaute" (auto): genug Zuschauer, aber kaum Likes
//
// props: {
//   look: 'neon' | 'gold'
//   szenen: Array<'tippen'|'teilen'|'folgen'>   (Häkchen; Reihenfolge ist fest)
//   intro: string        letztes Wort groß, der Rest klein darüber
//   abschluss: string    großes Schlusswort (Standard DANKE)
//   handle: string       leer = keine Handle-Zeile
//   intervallMin: number 0 = kein Zeitplan
//   auto, autoMinZuschauer, autoMinuten, autoLikesUnter, autoPauseMin
//   sound: 'standard' | 'custom' | 'off',  soundId (nur bei custom)
// }
//
// WENIGER SZENEN: Die Struktur bleibt (Intro → Szenen → Abschluss); jede
// fehlende Mittelszene nimmt ihren 1,44-s-Platz aus dem Ablauf, alles danach
// rückt nach vorn. Ein Spot mit einer Szene dauert also 7,5 − 2·1,44 = 4,62 s.
// Der Ton läuft dabei unverändert 7,5 s — ab der vorgezogenen Abschlussszene
// passt er nicht mehr bildgenau (Abwägung vom Streamer so akzeptiert).
import { baueUrl } from './herz-alarm.js';

// ── Reine Rechnung ─────────────────────────────────────────────────────────

/**
 * Like-Flaute? Reine Rechnung, damit testbar.
 *   likes:         Array<{ts, anzahl}> der letzten Zeit
 *   zuschauer:     zuletzt gemeldete Zuschauerzahl
 *   jetzt:         ms
 *   letzterSpot:   ms des letzten Spots (0/null = noch keiner)
 *   verbundenSeit: ms seit Verbindungsbeginn (null = unbekannt → nie)
 * Wahr, wenn genug Leute zusehen, im Fenster (autoMinuten) weniger als
 * autoLikesUnter Likes kamen, die Pause seit dem letzten Spot um ist UND die
 * Verbindung schon ein ganzes Fenster lang steht — sonst feuert es direkt beim
 * Start, weil die Like-Liste da naturgemäß leer ist.
 */
export function likeFlaute({ likes, zuschauer, jetzt, letzterSpot, verbundenSeit, cfg }) {
  const c = cfg || {};
  const fenster = Math.max(0, Number(c.autoMinuten) || 0) * 60000;
  if (verbundenSeit == null || !Number.isFinite(Number(verbundenSeit))) return false;
  if (jetzt - Number(verbundenSeit) < fenster) return false;
  if ((Number(zuschauer) || 0) < (Number(c.autoMinZuschauer) || 0)) return false;
  if (letzterSpot && jetzt - letzterSpot < (Number(c.autoPauseMin) || 0) * 60000) return false;
  let summe = 0;
  for (const l of likes || []) if (l && l.ts >= jetzt - fenster) summe += Number(l.anzahl) || 0;
  return summe < (Number(c.autoLikesUnter) || 0);
}

const FPS = 30;
export const DUR_VOLL = 7.5;
const SLOT = 1.44; // Abstand zweier Mittelszenen in der Probe
const REIHENFOLGE = ['tippen', 'teilen', 'folgen'];

/**
 * Ablaufplan für die gewählten Szenen. Mit allen drei ergeben sich exakt die
 * Zeiten der Probe (SC, WIPES, T_EXIT, DUR).
 */
export function spotPlan(auswahl) {
  const sel = Array.isArray(auswahl) ? auswahl : REIHENFOLGE;
  const ids = REIHENFOLGE.filter((id) => sel.includes(id));
  const k = ids.length;
  const kurz = (3 - k) * SLOT;
  const dankeStart = 1.74 + k * SLOT - 0.02; // Probe: 6.04
  const starts = [...ids.map((_, j) => 1.74 + j * SLOT), dankeStart];
  const szenen = ids.map((id, j) => ({ id, nr: j + 1, start: starts[j], ende: starts[j + 1] - 0.06 }));
  const exit = 6.85 - kurz;
  return {
    k,
    szenen,
    intro: [0.35, starts[0] - 0.06],
    danke: [dankeStart, exit + 0.1],
    exit,
    // Szenen-Wischer jeweils kurz vor jeder Szene nach dem Intro
    wipes: starts.map((s) => s - 0.19),
    dauer: DUR_VOLL - kurz,
  };
}

const gross = (s) => String(s ?? '').trim().toLocaleUpperCase('de-DE');

/** Intro in [kleine Zeile, große Zeile]: letztes Wort groß. */
export function teileIntro(text) {
  const w = gross(text).split(/\s+/).filter(Boolean);
  if (!w.length) return ['', ''];
  return [w.slice(0, -1).join(' '), w[w.length - 1]];
}

/** Handle-Zeile: leer → '', sonst '@NAME'. */
export function handleText(h) {
  const s = gross(h).replace(/^@+/, '');
  return s ? `@${s}` : '';
}

// ── Zeichnen (Port der Probe) ──────────────────────────────────────────────

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const eOutC = (x) => 1 - Math.pow(1 - x, 3);
const eInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eOutBack = (x, k = 1.7) => { const c3 = k + 1; return 1 + c3 * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };
const eOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const eInExpo = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
const eInOutExpo = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2);

const LOOKS = {
  gold: {
    gold: true, a: '#ffc93c', b: '#9b3dff', plate0: '#14061f', plate1: '#24093d', glow: 'rgba(255,190,60,0.85)',
    acc: [[0, '#fffbe8'], [0.3, '#ffe08a'], [0.48, '#d4952a'], [0.52, '#8a5310'], [0.58, '#eab84e'], [0.85, '#fff1b8'], [1, '#d39a30']],
    ring: ['#fff6d0', '#c8861c', '#ffe08a', '#7a4a08', '#fff1b8', '#b97a17', '#fff6d0'],
    tok: { tippen: ['#ff6fb0', '#c2125f', '#5a0430'], teilen: ['#8f6bff', '#4b1fd0', '#1c0a5e'], folgen: ['#2fe58a', '#0a9a5a', '#033d22'] },
  },
  neon: {
    gold: false, a: '#ff2e93', b: '#2fd8ff', plate0: '#0d0618', plate1: '#1d0832', glow: 'rgba(255,46,147,0.85)',
    acc: [[0, '#ffffff'], [0.35, '#ff9fd0'], [0.6, '#ff2e93'], [1, '#c22cff']],
    ring: ['#ffffff', '#ff2e93', '#ffd1ea', '#7a0f4a', '#ffffff', '#2fd8ff', '#ffffff'],
    tok: { tippen: ['#ff6fb0', '#e0156f', '#5a0430'], teilen: ['#5fe6ff', '#1a8fe0', '#08305e'], folgen: ['#2fe58a', '#0a9a5a', '#033d22'] },
  },
};

// Design-Fläche: 1080×560, die schräg gestellte Platte mittig.
export const DESIGN_W = 1080;
export const DESIGN_H = 560;
const GX = 540, GY = 280, GR = -0.07, PH = 250;
const IX = -300, IY = -20, TX = -110; // Plakette / Textblock der Mittelszenen
const FONT = 'BxInter, "Arial Black", sans-serif';
const GRUEN = '#2fe58a';

const HP = [];
for (let i = 0; i < 120; i++) {
  const a = (i / 120) * Math.PI * 2;
  HP.push([(16 * Math.pow(Math.sin(a), 3)) / 32, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a) - 2.5) / 32]);
}
function heartPath(g, s) { g.beginPath(); HP.forEach(([a, b], i) => (i ? g.lineTo(a * s, b * s) : g.moveTo(a * s, b * s))); g.closePath(); }
function arrowPath(g, s) {
  g.beginPath(); g.moveTo(-0.5 * s, 0.38 * s);
  g.bezierCurveTo(-0.5 * s, -0.12 * s, -0.15 * s, -0.2 * s, 0.12 * s, -0.2 * s);
  g.lineTo(0.12 * s, -0.42 * s); g.lineTo(0.55 * s, -0.05 * s); g.lineTo(0.12 * s, 0.32 * s); g.lineTo(0.12 * s, 0.1 * s);
  g.bezierCurveTo(-0.15 * s, 0.1 * s, -0.36 * s, 0.17 * s, -0.5 * s, 0.38 * s); g.closePath();
}
function para(g, xa, xb, sk, h = PH) { g.beginPath(); g.moveTo(xa + sk, -h); g.lineTo(xb + sk, -h); g.lineTo(xb - sk, h); g.lineTo(xa - sk, h); g.closePath(); }

export class SpotRenderer {
  constructor({ look, szenen, intro, abschluss, handle } = {}) {
    this.th = LOOKS[look] || LOOKS.neon;
    this.plan = spotPlan(szenen);
    this.dauer = this.plan.dauer;
    [this.introKlein, this.introGross] = teileIntro(intro ?? 'IHR WOLLT SUPPORTEN?');
    this.abschluss = gross(abschluss);
    this.handle = handleText(handle);
    this.marq = ['SUPPORT', ...this.plan.szenen.map((s) => s.id.toUpperCase()), this.abschluss || 'DANKE'];
    // Zeitpunkte der „Tipps" (Herz-Pumpen, Ringe) und Partikel-Ausbrüche je Szene
    this.taps = [];
    this.bursts = [];
    for (const s of this.plan.szenen) {
      if (s.id === 'tippen') for (const d of [0.41, 0.68, 0.95]) { this.taps.push(s.start + d); this.bursts.push({ t: s.start + d, art: 'herzen' }); }
      if (s.id === 'teilen') this.bursts.push({ t: s.start + 0.6, art: 'teilen' });
      if (s.id === 'folgen') { this.taps.push(s.start + 0.55); this.bursts.push({ t: s.start + 0.55, art: 'folgen' }); }
    }
    this.bursts.push({ t: this.plan.danke[0] + 0.08, art: 'danke' });
    for (const b of this.bursts) b.fi = Math.round(b.t * FPS);
    this.reset();
  }

  reset() { this.seed = 5150; this.partikel = []; this.simFrame = -1; }

  rnd() {
    let s = this.seed | 0; s = (s + 0x6d2b79f5) | 0; this.seed = s;
    let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  R(a, b) { return a + (b - a) * this.rnd(); }
  pick(arr) { return arr[(this.rnd() * arr.length) | 0]; }

  /** Ein Simulationsschritt (30 fps) — Partikel entstehen frame-genau wie in der Probe. */
  schritt(fi) {
    const th = this.th, P = this.partikel;
    for (const b of this.bursts) {
      if (b.fi !== fi) continue;
      if (b.art === 'herzen') for (let i = 0; i < 7; i++) { const a = this.R(-2.3, -0.8), sp = this.R(9, 18); P.push({ k: 'h', x: IX, y: IY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: this.R(26, 46), rot: this.R(-0.5, 0.5), life: 0, max: this.R(20, 30) }); }
      if (b.art === 'teilen') for (let i = 0; i < 22; i++) { const a = this.R(-1.2, 0.2), sp = this.R(10, 28); P.push({ k: 'd', x: IX, y: IY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: this.R(4, 9), col: this.pick([th.b, '#ffffff', th.a]), life: 0, max: this.R(18, 32) }); }
      if (b.art === 'folgen') for (let i = 0; i < 26; i++) { const a = this.R(0, 6.28), sp = this.R(8, 20); P.push({ k: 'd', x: IX, y: IY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: this.R(4, 8), col: this.pick([GRUEN, '#ffffff', th.a]), life: 0, max: this.R(16, 28) }); }
      if (b.art === 'danke') for (let i = 0; i < 40; i++) { const a = this.R(0, 6.28), sp = this.R(8, 24); const hk = this.rnd() < 0.4; P.push({ k: hk ? 'h' : 'd', x: this.R(-320, 320), y: this.R(-60, 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: hk ? this.R(24, 40) : this.R(3, 6), rot: this.R(-0.5, 0.5), col: this.pick([th.a, th.b, '#ffffff']), life: 0, max: this.R(22, 40) }); }
    }
    for (const p of P) { p.life++; p.vx *= 0.93; p.vy = p.vy * 0.93 + 0.25; p.x += p.vx; p.y += p.vy; }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].life > P[i].max) P.splice(i, 1);
  }

  /** Zeichnet den Spot zum Zeitpunkt t (s) in Design-Koordinaten (1080×560).
   *  Der Aufrufer setzt die Skalierung und löscht die Fläche. */
  zeichne(g, t) {
    t = clamp(Number(t) || 0, 0, this.dauer);
    const fi = Math.round(t * FPS);
    if (fi < this.simFrame) this.reset();
    while (this.simFrame < fi) { this.simFrame++; this.schritt(this.simFrame); }
    g.save();
    try { this.bild(g, t); } finally { g.restore(); }
  }

  accGrad(g, y0, y1) { const gr = g.createLinearGradient(0, y0, 0, y1); this.th.acc.forEach(([p, s]) => gr.addColorStop(p, s)); return gr; }

  // Maskierte Zeile: fährt aus einer Kante hoch rein und oben raus
  mline(g, t, text, x, y, size, tin, tout, o = {}) {
    if (!text) return;
    const pi = eOutExpo(seg(t, tin, tin + 0.6)), po = eInExpo(seg(t, tout - 0.32, tout));
    if (pi <= 0 || po >= 1) return;
    g.save(); g.font = `${size}px ${FONT}`; g.letterSpacing = (o.ls ?? 0) + 'px';
    let w = g.measureText(text).width;
    if (o.maxW && w > o.maxW) { size *= o.maxW / w; g.font = `${size}px ${FONT}`; w = o.maxW; }
    const x0 = o.center ? x - w / 2 : x;
    g.beginPath(); g.rect(x0 - 60, y - size * 0.66, w + 140, size * 1.3); g.clip();
    g.translate(x0, y + size * 1.25 * (1 - pi) - size * 1.25 * po); g.transform(1, 0, -0.17, 1, 0, 0);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    if (o.acc) {
      g.shadowColor = this.th.glow; g.shadowBlur = 30; g.fillStyle = this.accGrad(g, -size * 0.42, size * 0.42); g.fillText(text, 0, size * 0.04);
    } else {
      g.fillStyle = o.col || '#ffffff'; g.globalAlpha = o.alpha ?? 1; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 12; g.fillText(text, 0, size * 0.04);
    }
    g.restore();
  }

  outlineText(g, text, x, y, size, alpha) {
    g.save(); g.font = `${size}px ${FONT}`; g.letterSpacing = '6px'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.strokeStyle = `rgba(255,255,255,${alpha})`; g.lineWidth = 2.5; g.transform(1, 0, -0.17, 1, 0, 0); g.strokeText(text, x, y); g.restore();
  }

  // 3D-Plakette, dreht sich (Münzwurf) zwischen den Szenen
  token(g, t, r, flipK, cols, symbol) {
    const th = this.th, k = Math.max(0.03, Math.abs(flipK));
    g.save(); g.scale(k, 1);
    // Kante (Dicke) — sichtbar beim Drehen
    g.fillStyle = th.gold ? '#7a4a08' : '#5a0d3a'; g.beginPath(); g.ellipse((1 - k) * 18 * Math.sign(flipK || 1), 10, r + 14, r + 14, 0, 0, 7); g.fill();
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 40; g.shadowOffsetY = 18;
    let ring;
    if (typeof g.createConicGradient === 'function') {
      ring = g.createConicGradient(t * 1.4, 0, 0); th.ring.forEach((s, i, a) => ring.addColorStop(i / (a.length - 1), s));
    } else { // ältere Browserquellen ohne Conic-Verlauf
      ring = g.createLinearGradient(-r, -r, r, r); th.ring.forEach((s, i, a) => ring.addColorStop(i / (a.length - 1), s));
    }
    g.fillStyle = ring; g.beginPath(); g.arc(0, 0, r + 14, 0, 7); g.fill(); g.shadowColor = 'transparent';
    const rg = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.05); rg.addColorStop(0, cols[0]); rg.addColorStop(0.55, cols[1]); rg.addColorStop(1, cols[2]);
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
    // Symbol
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12; g.shadowOffsetY = 6;
    const wg = g.createLinearGradient(0, -r * 0.5, 0, r * 0.5); wg.addColorStop(0, '#ffffff'); wg.addColorStop(1, '#ffe3f1');
    g.fillStyle = wg; g.strokeStyle = '#fff';
    symbol(r);
    g.restore();
    // Glanzlicht
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, 7); g.clip();
    const hg = g.createLinearGradient(0, -r, 0, 0); hg.addColorStop(0, 'rgba(255,255,255,0.35)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg; g.beginPath(); g.ellipse(-r * 0.1, -r * 0.55, r * 0.95, r * 0.55, -0.2, 0, 7); g.fill();
    g.restore();
    g.restore();
  }

  bild(g, t) {
    const th = this.th, plan = this.plan, SZ = plan.szenen;
    const zoom = 1 + (0.025 * t) / DUR_VOLL;
    g.translate(GX, GY); g.rotate(GR); g.scale(zoom, zoom);
    // ---- Ein-/Aus-Wischer ----
    const BW = 560, SK = 120;
    const L = (t0, d) => lerp(-1100, 2300, eInOutExpo(seg(t, t0 + d, t0 + d + 0.62)));
    const inL1 = L(0, 0), inL2 = L(0, 0.07), outL1 = L(plan.exit, 0), outL2 = L(plan.exit, 0.07);
    let clipL = -2000, clipR = 2000;
    if (t < 0.8) clipR = inL2 - BW - SK;
    if (t > plan.exit) clipL = outL1 - SK;
    // ---- Platte ----
    g.save(); g.beginPath(); g.rect(Math.max(-900, clipL), -PH - 40, Math.max(0, Math.min(1800, clipR - Math.max(-900, clipL))), 2 * PH + 80); g.clip();
    const pg = g.createLinearGradient(0, -PH, 0, PH); pg.addColorStop(0, th.plate1); pg.addColorStop(1, th.plate0);
    g.fillStyle = pg; g.fillRect(-900, -PH, 1800, 2 * PH);
    g.save(); g.beginPath(); g.rect(-900, -PH, 1800, 2 * PH); g.clip();
    // Farbschleier
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, cc, r] of [[-380 + 80 * Math.sin(t * 0.8), -60, th.a, 520], [420 + 60 * Math.cos(t * 0.6), 120, th.b, 480]]) {
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, cc + '38'); rg.addColorStop(1, cc + '00'); g.fillStyle = rg; g.fillRect(-900, -PH, 1800, 2 * PH);
    }
    g.globalCompositeOperation = 'source-over';
    // Riesige Kontur-Laufschrift — Wort der gerade laufenden Szene
    const slotStarts = [...SZ.map((s) => s.start), plan.danke[0]];
    let si = 0; while (si < slotStarts.length && t >= slotStarts[si] - 0.1) si++;
    const mq = (this.marq[si] + '  ').repeat(4);
    this.outlineText(g, mq, -900 - ((t * 140) % 900), -150, 230, 0.07);
    this.outlineText(g, mq, -1300 + ((t * 110) % 900), 170, 230, 0.05);
    // feines Raster
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = -880; x < 900; x += 28) for (let y = -PH + 14; y < PH; y += 28) g.fillRect(x, y, 2, 2);
    g.restore();
    // Kantenlinien mit wanderndem Lichtpunkt
    for (const y of [-PH, PH]) {
      const lg = g.createLinearGradient(-900, 0, 900, 0); lg.addColorStop(0, th.a); lg.addColorStop(1, th.b);
      g.fillStyle = lg; g.fillRect(-900, y - 3, 1800, 6);
      const hx = -900 + ((t * 700 + (y > 0 ? 900 : 0)) % 1800);
      const hg = g.createRadialGradient(hx, y, 0, hx, y, 120); hg.addColorStop(0, 'rgba(255,255,255,0.95)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = hg; g.fillRect(hx - 120, y - 8, 240, 16); g.restore();
    }
    // ---- Inhalte ----
    // Intro: kleine Zeile / große Zeile mit Akzentverlauf + Unterstreichung
    const [i0, i1] = plan.intro;
    this.mline(g, t, this.introKlein, -400, -95, 84, i0, i1, { ls: 2, maxW: 860 });
    this.mline(g, t, this.introGross, -400, 40, 168, i0 + 0.12, i1 + 0.04, { acc: 1, maxW: 860, ls: 1 });
    {
      const p = eOutExpo(seg(t, i0 + 0.4, i0 + 0.9)), q = eInExpo(seg(t, i1 - 0.3, i1));
      if (p > 0 && q < 1) { g.fillStyle = th.a; g.fillRect(-400 + 820 * q, 140, 820 * p * (1 - q), 10); g.fillStyle = th.b; g.fillRect(-400 + 820 * q, 156, 520 * p * (1 - q), 5); }
    }
    // Plakette (Mittelszenen), Münzwurf beim Szenenwechsel
    if (SZ.length) this.plakette(g, t);
    // Text-Block je Szene
    const TXT = { tippen: ['TIPPEN', 'TIPP AUFS DISPLAY = HERZ'], teilen: ['TEILEN', 'BRING DEINE LEUTE MIT'], folgen: ['FOLGEN', 'VERPASS KEIN LIVE MEHR'] };
    const n = String(SZ.length).padStart(2, '0');
    for (const s of SZ) {
      const [big, sub] = TXT[s.id];
      this.mline(g, t, `${String(s.nr).padStart(2, '0')} / ${n}`, TX, -128, 40, s.start + 0.05, s.ende, { col: s.id === 'folgen' ? GRUEN : th.b, ls: 6 });
      this.mline(g, t, big, TX, -10, 172, s.start + 0.1, s.ende + 0.02, { acc: 1, maxW: 600, ls: 1 });
      this.mline(g, t, sub, TX, 118, 38, s.start + 0.22, s.ende + 0.04, { ls: 4, alpha: 0.9 });
    }
    // Abschluss: DANKE + Handle
    const [d0, d1] = plan.danke;
    this.mline(g, t, this.abschluss, 0, -30, 210, d0, d1, { acc: 1, center: 1, ls: 4, maxW: 900 });
    { const p = eOutExpo(seg(t, d0 + 0.25, d0 + 0.75)); if (p > 0) { g.save(); g.translate(0, 110); g.fillStyle = th.a; g.fillRect(-260 * p, -3, 520 * p, 6); g.restore(); } }
    if (this.handle) this.mline(g, t, `♥  ${this.handle}  ♥`, 0, 165, 46, d0 + 0.3, d1, { center: 1, ls: 6, col: '#ffffff', maxW: 900 });
    // Partikel
    for (const p of this.partikel) {
      const a = 1 - p.life / p.max; g.save(); g.globalAlpha = clamp(a); g.translate(p.x, p.y);
      if (p.k === 'h') {
        g.rotate(p.rot); const hg = g.createLinearGradient(0, -p.s / 2, 0, p.s / 2); hg.addColorStop(0, '#ffd0e6'); hg.addColorStop(1, th.a); g.fillStyle = hg; heartPath(g, p.s); g.fill();
      } else {
        g.globalCompositeOperation = 'lighter'; g.fillStyle = p.col; g.shadowColor = p.col; g.shadowBlur = 10; g.beginPath(); g.arc(0, 0, p.s, 0, 7); g.fill();
      }
      g.restore();
    }
    g.restore(); // Ende Platten-Clip
    // ---- Szenen-Wischer innerhalb der Platte ----
    for (const w0 of plan.wipes) {
      const p = seg(t, w0, w0 + 0.42); if (p <= 0 || p >= 1) continue;
      const x = lerp(-1300, 1500, eInOutExpo(p));
      g.save(); g.beginPath(); g.rect(-900, -PH, 1800, 2 * PH); g.clip();
      g.fillStyle = th.b; para(g, x - 380, x - 300, 140); g.fill();
      const bg = g.createLinearGradient(x - 300, 0, x, 0); bg.addColorStop(0, th.a); bg.addColorStop(1, th.gold ? '#ffe9a8' : '#ff8ac6');
      g.fillStyle = bg; para(g, x - 290, x, 140); g.fill();
      g.restore();
    }
    // ---- Ein-/Aus-Bänder ----
    for (const [L0, col, hh] of [[inL1, th.a, PH + 30], [inL2, th.b, PH + 10], [outL1, th.a, PH + 30], [outL2, th.b, PH + 10]]) {
      if (L0 <= -1099 || L0 >= 2299) continue;
      g.save(); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 30; para(g, L0 - BW, L0, SK, hh); g.fill();
      g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,0.35)'; para(g, L0 - 26, L0, SK, hh); g.fill(); g.restore();
    }
    // Lichtblitz an der Oberkante beim Einfahren
    const fl = seg(t, 0.45, 0.9);
    if (fl > 0 && fl < 1) {
      g.save(); g.globalCompositeOperation = 'lighter'; const fx = lerp(-700, 800, eOutC(fl));
      const fg = g.createRadialGradient(fx, -PH, 0, fx, -PH, 380); fg.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - fl)})`); fg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = fg; g.fillRect(fx - 380, -PH - 60, 760, 120); g.restore();
    }
  }

  plakette(g, t) {
    const th = this.th, SZ = this.plan.szenen, wipes = this.plan.wipes;
    const erste = SZ[0], letzte = SZ[SZ.length - 1];
    const tokIn = eOutBack(seg(t, erste.start, erste.start + 0.45), 1.8), tokOut = eInExpo(seg(t, letzte.ende - 0.3, letzte.ende));
    // seg()==0 ausdrücklich: eOutBack(0) ist rechnerisch ~1e-16, nicht 0.
    if (t <= erste.start || !(tokIn > 0 && tokOut < 1)) return;
    // Welche Szene zeigt die Plakette? Wechsel jeweils mitten im Münzwurf.
    let idx = 0, flip = 1;
    for (let j = 1; j < SZ.length; j++) {
      const w = wipes[j];
      if (t >= w + 0.22) idx = j;
      const f = seg(t, w + 0.05, w + 0.4);
      if (f > 0 && f < 1) flip = Math.cos(Math.PI * 2 * eInOut(f));
    }
    const sz = SZ[idx];
    let pump = 0;
    for (const tp of this.taps) if (t > tp) pump = Math.max(pump, Math.exp(-(t - tp) * 9) * 0.14);
    g.save(); g.translate(IX, IY + 30 * tokOut);
    const s = tokIn * (1 - tokOut) * (1 + pump); g.scale(s, s * (1 - pump * 0.4)); g.rotate(-GR * 0.5 + (1 - clamp(tokIn)) * -0.6);
    this.token(g, t, 150, flip, th.tok[sz.id], (r) => {
      const S = sz.start;
      if (sz.id === 'tippen') { g.save(); g.translate(0, 6); g.scale(1 + pump, 1 + pump); heartPath(g, r * 1.05); g.fill(); g.restore(); }
      else if (sz.id === 'teilen') {
        const lp = seg(t, S + 0.44, S + 0.74), fly = eInExpo(lp);
        if (lp < 1) { g.save(); g.translate(300 * fly, -220 * fly); g.rotate(-0.35 * Math.sin(Math.PI * seg(t, S + 0.27, S + 0.44)) - 0.3 * fly); g.globalAlpha *= 1 - fly; arrowPath(g, r * 1.1); g.fill(); g.restore(); }
        if (lp > 0.55) { const q = Math.max(0, eOutBack(seg(t, S + 0.6, S + 0.87), 2.2)); g.save(); g.scale(q, q); arrowPath(g, r * 1.1); g.fill(); g.restore(); }
      } else {
        const tp = S + 0.55, d = eOutBack(seg(t, tp, tp + 0.3), 2);
        g.lineWidth = r * 0.2; g.lineCap = 'round'; g.lineJoin = 'round';
        if (t < tp) { g.beginPath(); g.moveTo(-r * 0.45, 0); g.lineTo(r * 0.45, 0); g.moveTo(0, -r * 0.45); g.lineTo(0, r * 0.45); g.stroke(); }
        else { const q = clamp(d * 1.2); g.beginPath(); g.moveTo(-r * 0.42, r * 0.02); g.lineTo(-r * 0.12, r * 0.32); if (q > 0.3) g.lineTo(-r * 0.12 + (r * 0.6 * (q - 0.3)) / 0.7, r * 0.32 - (r * 0.7 * (q - 0.3)) / 0.7); g.stroke(); }
      }
    });
    g.restore();
    // Tipp-Ringe
    for (const tp of this.taps) {
      const p = seg(t, tp, tp + 0.5); if (p <= 0 || p >= 1) continue;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [d, w] of [[0, 7], [0.15, 3]]) {
        const q = clamp((p - d) / (1 - d)); if (q <= 0) continue;
        g.strokeStyle = `rgba(255,255,255,${(1 - q) * 0.85})`; g.lineWidth = w; g.beginPath(); g.arc(IX, IY, 170 + 130 * eOutC(q), 0, 7); g.stroke();
      }
      g.restore();
    }
    // Leuchtspur beim Teilen
    const teilen = SZ.find((x) => x.id === 'teilen');
    if (teilen && t > teilen.start + 0.44 && t < teilen.start + 0.77) {
      const lp = seg(t, teilen.start + 0.44, teilen.start + 0.74), e = eInExpo(lp);
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = th.b; g.lineWidth = 14 * (1 - lp) + 2; g.shadowColor = th.b; g.shadowBlur = 24; g.globalAlpha = 1 - lp;
      g.beginPath(); g.moveTo(IX, IY); g.quadraticCurveTo(IX + 160, IY - 30, IX + 300 * e + 30, IY - 220 * e); g.stroke(); g.restore();
    }
  }
}

// ── Schrift ────────────────────────────────────────────────────────────────
// Inter Black liegt gebündelt im Baukasten. Im Overlay über den Server
// (/widgets/<datei>?token=…), sonst (Prüf-Harness ohne baseUrl) relativ zum Modul.
let schrift = null;
function ladeSchrift(ctx) {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  if (!schrift) {
    let url = baueUrl(ctx.baseUrl, ctx.token, '/widgets/inter-black.woff2');
    if (!url) { try { url = new URL('./inter-black.woff2', import.meta.url).href; } catch { url = 'inter-black.woff2'; } }
    const ff = new FontFace('BxInter', `url("${url}")`);
    document.fonts.add(ff);
    schrift = ff.load().catch(() => { schrift = null; /* Rückfall: Arial Black */ });
  }
  return schrift;
}

// ── Widget ─────────────────────────────────────────────────────────────────
const VORSCHAU_STANDBILD = 2.6; // TIPPEN voll im Bild
const SOUND_STANDARD = 'botexe-einblender.wav';
const zahl = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export default class Einblender {
  constructor(root, props, ctx) {
    this.root = root;
    this.props = props || {};
    this.ctx = ctx || {};
    const p = this.props;
    this.renderer = new SpotRenderer({ look: p.look, szenen: p.szenen, intro: p.intro, abschluss: p.abschluss ?? 'DANKE', handle: p.handle });
    this.cfg = {
      autoMinZuschauer: zahl(p.autoMinZuschauer, 5), autoMinuten: zahl(p.autoMinuten, 3),
      autoLikesUnter: zahl(p.autoLikesUnter, 50), autoPauseMin: zahl(p.autoPauseMin, 10),
    };
    const modus = ['standard', 'custom', 'off'].includes(p.sound) ? p.sound : 'standard';
    this.soundId = modus === 'standard' ? SOUND_STANDARD : modus === 'custom' ? String(p.soundId || '') : '';

    this.timers = new Set();
    this.intervalle = [];
    this.raf = 0;
    this.laeuft = false;
    this.tot = false;
    this.likes = [];
    this.zuschauer = 0;
    this.verbundenSeit = null;
    this.letztesEreignis = 0;
    this.letzterSpot = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bx-einblender';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    root.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { this.resize(); if (!this.laeuft && this.ctx.preview) this.standbild(); });
      this.ro.observe(root);
    }
    ladeSchrift(this.ctx).then(() => { if (!this.tot && !this.laeuft && this.ctx.preview) this.standbild(); });

    if (this.ctx.preview) {
      // Editor: sofort ein Standbild (headless/Galerie feuert kein rAF), dann Dauerschleife.
      this.standbild();
      this.nachher(1500, () => this.spiele({ stumm: true }));
    } else {
      const min = zahl(p.intervallMin, 0);
      if (min > 0) this.intervalle.push(setInterval(() => this.spiele(), min * 60000));
      if (p.auto === true) this.intervalle.push(setInterval(() => this.pruefeFlaute(), 15000));
    }
  }

  nachher(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.tot) fn(); }, ms);
    this.timers.add(id);
  }

  resize() {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    if (!this.w || !this.h) return;
    const cw = Math.round(this.w * dpr), ch = Math.round(this.h * dpr);
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
  }

  leeren() {
    if (!this.g) return;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Ein Bild zum Zeitpunkt t — Design 1080×560 per contain in die Box. */
  bild(t) {
    if (!this.w || !this.h) { this.resize(); if (!this.w || !this.h) return; }
    if (!this.g) return;
    this.leeren();
    const s = Math.min(this.w / DESIGN_W, this.h / DESIGN_H) * this.dpr;
    const ox = (this.canvas.width - DESIGN_W * s) / 2, oy = (this.canvas.height - DESIGN_H * s) / 2;
    this.g.setTransform(s, 0, 0, s, ox, oy);
    this.renderer.zeichne(this.g, t);
  }

  standbild() {
    try { this.bild(Math.min(VORSCHAU_STANDBILD, this.renderer.dauer * 0.5)); } catch (e) { console.warn('[einblender] Standbild fehlgeschlagen:', e); }
  }

  /** Spot abspielen. Läuft schon einer → ignorieren (false). */
  spiele({ stumm = false } = {}) {
    if (this.tot || this.laeuft) return false;
    this.laeuft = true;
    this.letzterSpot = Date.now();
    this.renderer.reset();
    if (!stumm && this.soundId && this.ctx.playSound) this.ctx.playSound(this.soundId);
    const t0 = performance.now();
    const frame = () => {
      this.raf = 0;
      if (this.tot) return;
      try {
        const t = (performance.now() - t0) / 1000;
        if (t >= this.renderer.dauer) { this.ende(); return; }
        this.bild(t);
      } catch (e) {
        // Sperre MUSS fallen, sonst ist das Widget für den Abend tot. Nicht weiterplanen.
        this.laeuft = false;
        try { this.leeren(); } catch { /* egal */ }
        console.warn('[einblender] Abspielen abgebrochen:', e);
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    return true;
  }

  ende() {
    this.laeuft = false;
    this.leeren();
    if (this.ctx.preview) this.nachher(1200, () => this.spiele({ stumm: true }));
  }

  pruefeFlaute() {
    const jetzt = Date.now();
    const fenster = this.cfg.autoMinuten * 60000;
    this.likes = this.likes.filter((l) => l.ts >= jetzt - fenster);
    if (likeFlaute({ likes: this.likes, zuschauer: this.zuschauer, jetzt, letzterSpot: this.letzterSpot, verbundenSeit: this.verbundenSeit, cfg: this.cfg })) {
      this.spiele();
    }
  }

  onEvent(e) {
    if (!e || this.ctx.preview) return;
    if (e.type === 'viewer_count') this.zuschauer = Number(e.viewerCount) || 0;
    if (e.sticky) return; // Reconnect-Replay: nur Anzeigen, keine Zähler
    const jetzt = Date.now();
    // Verbindungsbeginn: erstes Ereignis — oder erstes nach einer langen Funkstille
    // (neu verbunden). Bis ein ganzes Fenster vorbei ist, feuert die Flaute nicht.
    if (this.verbundenSeit == null || jetzt - this.letztesEreignis >= this.cfg.autoMinuten * 60000) this.verbundenSeit = jetzt;
    this.letztesEreignis = jetzt;
    if (e.type === 'like') {
      this.likes.push({ ts: jetzt, anzahl: Math.max(1, Number(e.likeCount) || 1) });
      if (this.likes.length > 2000) this.likes.splice(0, this.likes.length - 2000);
    }
  }

  onAction(action) {
    const art = action && (action.kind ?? action.type);
    if (art !== 'fire_alert') return;
    if (!this.spiele()) console.info('[einblender] Spot läuft schon — Auslöser ignoriert.');
  }

  onReset() {
    this.likes = [];
    this.verbundenSeit = null;
    this.letztesEreignis = 0;
  }

  destroy() {
    this.tot = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const i of this.intervalle) clearInterval(i);
    this.intervalle = [];
    if (this.ro) this.ro.disconnect();
    this.canvas.remove();
  }
}
