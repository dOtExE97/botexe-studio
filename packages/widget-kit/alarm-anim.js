// alarm-anim.js — Live-Renderer der Vollbild-Alarm-Animationen (Canvas 2D).
//
// Portiert aus den abgenommenen Wegwerf-Proben
//   docs/superpowers/specs/2026-11-10-proben/levelup-v1-v3.html  (?v=1/2/3)
//   docs/superpowers/specs/2026-11-10-proben/levelup-v4-v5.html  (?typ=herz[&mix=1])
// Die Optik und die Zeitachsen (T_BURST usw.) sind 1:1 übernommen — die
// mitgelieferten Sounds (sounds/botexe-levelup-*.wav) sind auf genau diese
// Zeitpunkte getaktet. Wer hier eine Zeit ändert, verschiebt den Knall gegen
// den Ton.
//
// Unterschiede zur Probe (bewusst):
// - Platzhalter (Initiale „S", „Schwester Mary", 11 → 12) kommen aus `daten`.
// - Gezeichnet wird in eine Designfläche 1080×1920, mittig in w×h eingepasst.
// - Partikel laufen in festen 30-Hz-Schritten (wie die Probe Bild für Bild),
//   gezeichnet wird zwischen zwei Schritten interpoliert — so ist es bei 60 Hz
//   flüssig und trotzdem deterministisch (gleiches t → gleiches Bild).
// - Zufall beim Zeichnen (Flackern, Blitze) kommt aus einem je 30-Hz-Bild neu
//   gesäten Generator, damit er nicht vom Bildtakt des Overlays abhängt.
// - Teure Glows (shadowBlur) sind einmalig in Offscreen-Ebenen vorgebacken:
//   Konfetti, Neonröhren nach dem Aufbau, Titel, Unterzeile, Namensleiste,
//   Zahlen, Glut. Fehlt OffscreenCanvas/document, wird live gezeichnet.
// - Der Neon-Ring am Profilbild (TikTok-Neon) blendet mit aus; in der Probe
//   blieb er bis zum letzten Bild voll hell und verschwand dann schlagartig.

import { baueUrl } from './herz-alarm.js';

const W = 1080, H = 1920, FPS = 30;
const SCHRIFT = 'BxInter';
const fnt = (px) => `900 ${px}px ${SCHRIFT}, sans-serif`;

/**
 * Katalog: id → { label, fuer, dauer (Sekunden), sound }.
 * `fuer` sagt, bei welchen Ereignissen der Stil zur Auswahl steht.
 */
export const ANIMATIONEN = {
  'lvl-herzschlag': { label: 'Herzschlag', fuer: ['level_team', 'level_gifter'], dauer: 5.6, sound: 'botexe-levelup-herzschlag.wav' },
  'lvl-goldherz': { label: 'Goldherz mit Flügeln', fuer: ['level_team', 'level_gifter'], dauer: 5.6, sound: 'botexe-levelup-goldherz.wav' },
  'lvl-neon': { label: 'Neon', fuer: ['level_team', 'level_gifter'], dauer: 5.6, sound: 'botexe-levelup-neon.wav' },
  'lvl-tiktok': { label: 'TikTok-Stil', fuer: ['level_team', 'level_gifter'], dauer: 5.8, sound: 'botexe-levelup-tiktok.wav' },
  'lvl-tiktok-neon': { label: 'TikTok-Neon', fuer: ['level_team', 'level_gifter'], dauer: 5.8, sound: 'botexe-levelup-tiktok-neon.wav' },
};

// ---------------------------------------------------------------- Helfer ---

/** Seed-PRNG der Proben (mulberry32). */
function prng(seed) {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eOutC = (x) => 1 - Math.pow(1 - x, 3);
const eInC = (x) => x * x * x;
const eInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eOutBack = (x, k = 1.9) => { const c3 = k + 1; return 1 + c3 * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };
const eOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
function eOutBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
const zufall = (rnd) => ({ R: (a, b) => a + (b - a) * rnd(), pick: (arr) => arr[(rnd() * arr.length) | 0] });

// Herzform (klassische Parameterkurve), normiert auf Breite 1.
function herzPunkte(pummelig) {
  const P = [];
  for (let i = 0; i < 160; i++) {
    const a = i / 160 * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    P.push([x / 32, (y - 2.5) / 32]);
  }
  // TikTok-Stil: etwas „pummeliger" als die Lehrbuchform — wirkt niedlicher.
  if (pummelig) for (const p of P) { p[0] *= 1.04; p[1] = p[1] * 0.96 + (p[1] > 0 ? -0.02 * p[1] : 0); }
  return P;
}
const HP_KLASSIK = herzPunkte(false);
const HP_TIKTOK = herzPunkte(true);
const HERZ_HALB = 0.53; // halbe Ausdehnung beider Herzformen (gemessen: 0.52) + Luft
function umfang(P) { let L = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; L += Math.hypot(q[0] - p[0], q[1] - p[1]); } return L; }
const HLEN_KLASSIK = umfang(HP_KLASSIK);
const HLEN_TIKTOK = umfang(HP_TIKTOK);
function polyPfad(ctx, P, s, ox = 0, oy = 0) {
  ctx.beginPath(); ctx.moveTo(ox + P[0][0] * s, oy + P[0][1] * s);
  for (let i = 1; i < P.length; i++) ctx.lineTo(ox + P[i][0] * s, oy + P[i][1] * s);
  ctx.closePath();
}

function star4(ctx, x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/** Mehrlagige Neonröhre (aus den Proben). */
function neonStroke(ctx, pfad, col, core, alpha, w = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [lw, al, blur, cc] of [[38 * w, 0.14, 40, col], [18 * w, 0.35, 24, col], [8 * w, 0.85, 10, col], [3.2 * w, 1, 4, core]]) {
    ctx.globalAlpha = alpha * al; ctx.strokeStyle = cc; ctx.lineWidth = lw; ctx.shadowColor = col; ctx.shadowBlur = blur; pfad(); ctx.stroke();
  }
  ctx.restore();
}

function goldGrad(ctx, y0, y1) {
  const gr = ctx.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.28, '#ffd76a'); gr.addColorStop(0.5, '#c27a16');
  gr.addColorStop(0.62, '#ffe49a'); gr.addColorStop(1, '#8a4a0a');
  return gr;
}

/**
 * Erstes sichtbares Zeichen eines Namens (Emoji-sicher, ganze Graphem-Gruppe),
 * Buchstaben groß. Leer/unsichtbar → '?'.
 */
export function initiale(name) {
  const s = String(name ?? '').replace(/^[\s\p{Cc}\p{Cf}\p{Z}]+/u, '');
  if (!s) return '?';
  let erstes;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    erstes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next().value?.segment;
  }
  if (!erstes) erstes = Array.from(s)[0];
  return erstes ? erstes.toUpperCase() : '?';
}

let schriftVersprechen = null;
/**
 * Registriert Inter Black als 'BxInter' (900) aus inter-black.woff2 — einmalig.
 * Der Overlay-Server verlangt den Schlüssel auch für Schriften (`token`).
 * Scheitert das Laden, löst das Versprechen trotzdem auf (Ersatzschrift),
 * und ein späterer Aufruf versucht es erneut.
 */
export function ladeSchrift(baseUrl, token) {
  if (schriftVersprechen) return schriftVersprechen;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const url = baueUrl(baseUrl, token, '/widgets/inter-black.woff2');
  if (!url) return Promise.resolve();
  const ff = new FontFace(SCHRIFT, `url("${url}") format("woff2")`, { weight: '900' });
  schriftVersprechen = ff.load()
    .then((f) => { document.fonts.add(f); })
    .catch(() => { schriftVersprechen = null; });
  return schriftVersprechen;
}
function schriftBereit() {
  try { return typeof document !== 'undefined' && !!document.fonts && document.fonts.check(fnt(50)); } catch { return false; }
}

/** Offscreen-Leinwand (OffscreenCanvas, sonst <canvas>), oder null. */
function leinwand(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
      if (x) return { c, x, w, h };
    }
  } catch { /* nächster Weg */ }
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      if (x) return { c, x, w, h };
    }
  } catch { /* keine Leinwand */ }
  return null;
}
/** Vorbacken: zeichnet `fn(ctx)` um die Mitte einer w×h-Ebene. → Sprite oder null. */
function backe(w, h, fn) {
  const lw = leinwand(w, h);
  if (!lw) return null;
  lw.x.translate(lw.w / 2, lw.h / 2);
  fn(lw.x);
  return lw;
}
/** Sprite mittig bei (x, y) mit Maßstab sc. */
function setze(g, sp, x, y, sc = 1) {
  g.drawImage(sp.c, x - sp.w / 2 * sc, y - sp.h / 2 * sc, sp.w * sc, sp.h * sc);
}
/**
 * Neon-Sprite additiv mit Stärke `alpha` setzen. Die Probe ließ alpha bis 1.7
 * steigen (Aufladen/Knall) — mehr als volle Deckkraft geht nur über einen
 * zweiten additiven Durchgang.
 */
function setzeHell(g, sp, x, y, sc, alpha) {
  if (!(alpha > 0)) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let a = alpha; a > 0.001; a -= 1) { g.globalAlpha = Math.min(1, a); setze(g, sp, x, y, sc); }
  g.restore();
}
const NEON_RAND = (w) => 19 * w + 64; // halbe Linienbreite + 1.5 × Blur + Luft

/** Profilbild rund (cover) oder Platzhalter-Verlauf mit Initiale. */
function zeichneAvatar(g, bild, r, verlauf, init, initFont, glanz) {
  g.save(); g.beginPath(); g.arc(0, 0, r, 0, 7); g.clip();
  const img = bild.bereit();
  let ok = false;
  if (img) {
    try {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.max(2 * r / iw, 2 * r / ih);
      g.drawImage(img, -iw * k / 2, -ih * k / 2, iw * k, ih * k); ok = true;
    } catch { ok = false; }
  }
  if (!ok) {
    const ag = g.createLinearGradient(-r, -r, r, r); ag.addColorStop(0, verlauf[0]); ag.addColorStop(1, verlauf[1]);
    g.fillStyle = ag; g.fillRect(-r, -r, 2 * r, 2 * r);
    if (glanz) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.45, r * 0.6, r * 0.3, -0.4, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.font = fnt(initFont); g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '0px';
    g.fillText(init, 0, initFont * 0.066);
  }
  g.restore();
}

/** Schriftgröße so verkleinern, dass `text` höchstens `max` breit ist. */
function passendeGroesse(ctx, text, px, max) {
  ctx.font = fnt(px);
  const tw = ctx.measureText(text).width;
  return tw > max ? Math.max(8, Math.floor(px * max / tw)) : px;
}

// ------------------------------------------------------------ Farbschema ---
// Teamherz: Pink/Cyan wie in den Proben. Gifter (Geschenke-Stufe): Gold/Blau.

function schema(gifter) {
  if (!gifter) {
    return {
      gifter: false,
      // klassisch (V1–V3)
      neonFunken: ['#ff3d9a', '#ff8cc6', '#7df9ff', '#ffffff', '#c77dff'],
      akzentFunken: ['#ff7fb0', '#ff4f8b', '#ffc2da', '#ffffff'],
      glutNeon: ['#ff7fc4', '#8af3ff'], glutWarm2: '#ff8fbd',
      ekg: ['255,60,140', '255,110,170', '255,90,160'],
      herzGlow: '255,60,130', konfettiGlow: 'rgba(255,90,150,0.7)',
      strahlenV1: '255,120,170',
      ringeNeon: ['255,46,147', '125,249,255'], ringeWarm: ['255,214,120', '255,110,170'],
      roehre1: ['#ff2e93', '#ffe3f1'], roehre2: ['#a855ff', '#f1e4ff'], innen: '255,60,160',
      cyan: '#7df9ff', cyanRgb: '125,249,255', pink: '#ff2e93', pinkRgb: '255,46,147', pinkKern: '#fff0f8',
      blitzNeon: '255,190,235',
      titelGlowV1: 'rgba(255,70,140,0.8)',
      unterGlow: 'rgba(255,60,130,0.9)', unterFuell: '#ffe1ee',
      leisteNeon: ['rgba(255,46,147,0.7)', '#ff5fb0'],
      avatarVerlauf: ['#ff6aa0', '#7b2cbf'], avatarVerlaufTT: ['#ff8a7a', '#7b2cbf'],
      // TikTok (V4/V5)
      neon: ['#ff2e93', '#ffe3f1', '#7df9ff', '#effeff'], ttRinge: ['255,46,147', '125,249,255'], ttStrahl: '255,70,170',
      ttGlow: '#ff2e93', ttUnterGlow: '#7df9ff', ttFunken: ['#ff3d9a', '#7df9ff', '#ffffff', '#c77dff'],
      zahl: '#ff3b4a',
    };
  }
  return {
    gifter: true,
    neonFunken: ['#ffc93c', '#ffe08a', '#2fd8ff', '#ffffff', '#8fd8ff'],
    akzentFunken: ['#7fe6ff', '#2fd8ff', '#c2f3ff', '#ffffff'],
    glutNeon: ['#ffd66b', '#6fe3ff'], glutWarm2: '#8fe3ff',
    ekg: ['255,180,40', '255,214,110', '255,200,80'],
    herzGlow: '255,190,60', konfettiGlow: 'rgba(255,190,80,0.7)',
    strahlenV1: '255,200,100',
    ringeNeon: ['255,201,60', '47,216,255'], ringeWarm: ['255,214,120', '110,210,255'],
    roehre1: ['#ffc93c', '#fff3d6'], roehre2: ['#2fd8ff', '#e0f9ff'], innen: '255,190,60',
    cyan: '#2fd8ff', cyanRgb: '47,216,255', pink: '#ffc93c', pinkRgb: '255,201,60', pinkKern: '#fffaf0',
    blitzNeon: '255,235,190',
    titelGlowV1: 'rgba(255,170,50,0.8)',
    unterGlow: 'rgba(255,170,50,0.9)', unterFuell: '#fff4dc',
    leisteNeon: ['rgba(255,201,60,0.7)', '#ffd45f'],
    avatarVerlauf: ['#ffc93c', '#1f6fd6'], avatarVerlaufTT: ['#ffc93c', '#1f6fd6'],
    neon: ['#ffc93c', '#fff3d6', '#2fd8ff', '#e6fbff'], ttRinge: ['255,201,60', '47,216,255'], ttStrahl: '255,190,60',
    ttGlow: '#ffc93c', ttUnterGlow: '#2fd8ff', ttFunken: ['#ffc93c', '#2fd8ff', '#ffffff', '#8fd8ff'],
    zahl: '#1f8fe0',
  };
}

/** Gifter-Medaille: Goldscheibe, blauer Kern, weißer Stern (statt Herz in der Pille). */
function stufenMedaille(ctx, s) {
  ctx.fillStyle = '#b8731c'; ctx.beginPath(); ctx.arc(0.04 * s, 0.03 * s, s / 2, 0, 7); ctx.fill();
  let gr = ctx.createLinearGradient(0, -s / 2, 0, s / 2); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.45, '#ffd25a'); gr.addColorStop(1, '#c47f12');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, 7); ctx.fill();
  gr = ctx.createLinearGradient(0, -s * 0.36, 0, s * 0.36); gr.addColorStop(0, '#7fe9ff'); gr.addColorStop(1, '#1d6fd0');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; star4(ctx, 0, 0, s * 0.24, 0);
}

/** Kachel am Profilbild: Teamherz = Herz + Stufe, Gifter = Stufen-Plakette (Stern + Stufe). */
function kachel(ctx, neu, S, herzPfad) {
  const kg = ctx.createLinearGradient(0, -36, 0, 36);
  if (S.gifter) { kg.addColorStop(0, '#5fe6ff'); kg.addColorStop(1, '#1d7fe0'); } else { kg.addColorStop(0, '#ff9a5c'); kg.addColorStop(1, '#ff5a3c'); }
  ctx.fillStyle = kg; ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-58, -36, 116, 72, 22); ctx.fill(); ctx.stroke();
  if (S.gifter) { ctx.fillStyle = '#ffd25a'; star4(ctx, -26, 1, 24, 0); } else { ctx.fillStyle = '#fff'; ctx.save(); ctx.translate(-24, 2); herzPfad(ctx, 44); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#fff'; ctx.font = fnt(passendeGroesse(ctx, String(neu), 42, 52)); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(String(neu), 2, 3);
}

// ------------------------------------------- Level-Up V1–V3 (klassisch) ---

function stilKlassik(V, d, S, bild) {
  const DUR = 5.6, CX = 540, BY = 770;
  const T_CHARGE = 0.9, T_BURST = 1.8, T_OUT = 4.75;
  const GOLD = ['#fff6d0', '#ffd96a', '#ffb43a', '#ffe9a8', '#ffffff'];
  const SPARK = V === 3 ? S.neonFunken : null;
  const heartPath = (ctx, s, ox = 0, oy = 0) => polyPfad(ctx, HP_KLASSIK, s, ox, oy);
  const HLEN = HLEN_KLASSIK;
  const BEATS = [[0.45, 0.07], [0.62, 0.045], [1.0, 0.08], [1.16, 0.05], [1.4, 0.09], [1.53, 0.06], [1.68, 0.1]];
  const OLD = d.alt, NEW = d.neu, NAME = d.name;
  const UNTER = S.gifter ? `GESCHENKE-STUFE ${OLD} → ${NEW}` : `TEAMHERZ · STUFE ${NEW}`;

  // Glänzendes 3D-Herz um (0,0)
  function glossyHeart(ctx, s) {
    let gr = ctx.createRadialGradient(-0.22 * s, -0.3 * s, 0.02 * s, -0.05 * s, 0, 0.85 * s);
    gr.addColorStop(0, '#ffa3c6'); gr.addColorStop(0.35, '#ff2f6d'); gr.addColorStop(0.72, '#c3093f'); gr.addColorStop(1, '#5e021e');
    ctx.fillStyle = gr; heartPath(ctx, s); ctx.fill();
    ctx.save(); heartPath(ctx, s); ctx.clip();
    gr = ctx.createLinearGradient(0, 0.05 * s, 0, 0.5 * s); gr.addColorStop(0, 'rgba(60,0,20,0)'); gr.addColorStop(1, 'rgba(60,0,20,0.55)');
    ctx.fillStyle = gr; ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.lineWidth = 0.05 * s; ctx.strokeStyle = 'rgba(255,190,215,0.55)'; heartPath(ctx, s * 0.985); ctx.stroke();
    ctx.save(); ctx.translate(-0.24 * s, -0.27 * s); ctx.rotate(-0.65);
    gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.17 * s); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.scale(1, 0.5); ctx.beginPath(); ctx.arc(0, 0, 0.17 * s, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(0.27 * s, -0.3 * s); ctx.rotate(0.5);
    gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.07 * s); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, 0.07 * s, 0, 7); ctx.fill(); ctx.restore();
    gr = ctx.createRadialGradient(0.18 * s, 0.22 * s, 0, 0.18 * s, 0.22 * s, 0.3 * s); gr.addColorStop(0, 'rgba(255,120,170,0.35)'); gr.addColorStop(1, 'rgba(255,120,170,0)');
    ctx.fillStyle = gr; ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.restore();
  }
  function bigNumberLive(ctx, num, size, neon) {
    ctx.font = fnt(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.letterSpacing = '0px';
    if (neon) {
      for (const [w, col] of [[28, `rgba(${S.cyanRgb},0.18)`], [14, `rgba(${S.cyanRgb},0.45)`], [5, S.gifter ? '#e6fbff' : '#e9feff']]) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.shadowColor = S.cyan; ctx.shadowBlur = w > 10 ? 30 : 10; ctx.strokeText(String(num), 0, 6);
      }
    } else {
      ctx.lineWidth = size * 0.08; ctx.strokeStyle = 'rgba(70,0,30,0.8)'; ctx.strokeText(String(num), 0, 6);
      const gr = ctx.createLinearGradient(0, -size * 0.42, 0, size * 0.45); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#fff2c4'); gr.addColorStop(1, '#ffc75a');
      ctx.fillStyle = gr; ctx.shadowColor = 'rgba(255,220,140,0.9)'; ctx.shadowBlur = 22; ctx.fillText(String(num), 0, 6);
    }
  }
  // Zahl im Herz: Basisgröße je Stil, vorgebacken je Zahl.
  const ZAHL_S = V === 1 ? 520 : V === 2 ? 390 : 560, ZAHL_K = V === 2 ? 0.4 : 0.36;
  const zahlCache = new Map();
  function bigNumber(ctx, num, s, scale) {
    const size = ZAHL_K * ZAHL_S, neon = V === 3;
    let sp = zahlCache.get(num);
    if (sp === undefined) {
      sp = backe(size * 0.8 * String(num).length + 220, size + 220, (x) => bigNumberLive(x, num, size, neon));
      zahlCache.set(num, sp);
    }
    ctx.save(); ctx.scale(scale, scale);
    if (sp) setze(ctx, sp, 0, 0, s / ZAHL_S);
    else bigNumberLive(ctx, num, ZAHL_K * s, neon);
    ctx.restore();
  }

  let rnd, R, pick, sparks, hearts, embers, rings, burstDone;
  function zuruecksetzen() {
    rnd = prng(4242 + V); ({ R, pick } = zufall(rnd));
    sparks = []; hearts = []; embers = []; rings = []; burstDone = false;
    if (V === 1) for (const [b, a] of BEATS) if (a >= 0.07) rings.push({ t0: b, k: 0.35, big: false });
  }
  function spawnBurst(i) {
    const pal = SPARK || GOLD;
    for (let n = 0; n < 280; n++) {
      const a = R(0, Math.PI * 2), sp = Math.pow(rnd(), 0.6) * 32 + 6;
      sparks.push({ x: CX + Math.cos(a) * 70, y: BY + Math.sin(a) * 70, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: R(40, 90), col: rnd() < 0.75 ? pick(pal) : pick(S.akzentFunken), w: R(2, 5.5), n: i });
    }
    const nh = V === 3 ? 18 : 38;
    for (let n = 0; n < nh; n++) {
      const a = R(0, Math.PI * 2), sp = R(7, 19);
      hearts.push({ x: CX, y: BY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, rot: R(-0.6, 0.6), vr: R(-0.1, 0.1), s: R(26, 56), life: 0, max: R(65, 110), n: i });
    }
    for (const [dd, k] of [[0, 1], [0.12, 0.7], [0.24, 0.45]]) rings.push({ t0: T_BURST + dd, k, big: true });
  }
  function schritt(t, i) {
    if (t >= T_BURST && !burstDone) { burstDone = true; spawnBurst(i); }
    if (t >= T_BURST && t < T_OUT) for (let n = 0; n < 3; n++) embers.push({ x: CX + R(-400, 400), y: BY + R(60, 560), vy: R(-1.2, -3.4), ph: R(0, 6.28), r: R(1.6, 4.2), life: 0, max: R(70, 130), col: V === 3 ? pick(S.glutNeon) : (rnd() < 0.7 ? '#ffd27a' : S.glutWarm2), n: i });
    for (const p of sparks) { p.ox = p.x; p.oy = p.y; p.ovx = p.vx; p.ovy = p.vy; p.vx *= 0.935; p.vy = p.vy * 0.935 + 0.32; p.x += p.vx; p.y += p.vy; p.life++; }
    for (const p of hearts) { p.ox = p.x; p.oy = p.y; p.orot = p.rot; p.vx *= 0.95; p.vy = p.vy * 0.95 + 0.22; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++; }
    for (const p of embers) { p.ox = p.x; p.oy = p.y; p.y += p.vy; p.x += Math.sin(p.ph + p.life * 0.06) * 0.8; p.life++; }
    for (const arr of [sparks, hearts, embers]) for (let k = arr.length - 1; k >= 0; k--) if (arr[k].life > arr[k].max) arr.splice(k, 1);
  }
  function pulse(t) {
    let p = 0;
    for (const [b, a] of BEATS) { const dd = t - b; if (dd >= 0) p += a * (dd < 0.06 ? dd / 0.06 : Math.pow(Math.max(0, 1 - (dd - 0.06) / 0.22), 2)); }
    return p;
  }

  // ---- vorgebackene Ebenen (einmal je Renderer, lazy) ----
  let ebenen = null;
  function baueEbenen() {
    const e = {};
    // Konfetti-Herzen
    const KS = 56;
    if (V === 3) {
      const rand = NEON_RAND(0.35);
      const herzNeon = (col) => backe(KS + 2 * rand, KS + 2 * rand, (x) => neonStroke(x, () => heartPath(x, KS), col, '#ffffff', 1, 0.35));
      e.konfetti = [herzNeon(S.pink), herzNeon(S.cyan)];
    } else {
      e.konfetti = [backe(KS + 64, KS + 64, (x) => { x.shadowColor = S.konfettiGlow; x.shadowBlur = 12; glossyHeart(x, KS); })];
    }
    // Glut
    e.glut = new Map();
    // Neonröhren V3 (nach dem Aufbau statisch)
    if (V === 3) {
      const s = 560, h1 = s * HERZ_HALB + NEON_RAND(1), h2 = s * 0.82 * HERZ_HALB + NEON_RAND(0.75);
      e.roehre1 = backe(2 * h1, 2 * h1, (x) => neonStroke(x, () => heartPath(x, s), S.roehre1[0], S.roehre1[1], 1, 1));
      e.roehre2 = backe(2 * h2, 2 * h2, (x) => neonStroke(x, () => heartPath(x, s * 0.82), S.roehre2[0], S.roehre2[1], 1, 0.75));
      e.roehreS = s;
    }
    // „LEVEL UP!"
    const TW = 1240, TH_ = 420;
    if (V === 3) {
      const titel = (x) => { x.font = fnt(172); x.textAlign = 'center'; x.textBaseline = 'middle'; x.letterSpacing = '2px'; x.lineJoin = 'round'; };
      e.titelChroma = backe(TW, TH_, (x) => {
        titel(x); x.globalCompositeOperation = 'lighter';
        for (const [dx, cc] of [[-4, `rgba(${S.cyanRgb},0.55)`], [4, `rgba(${S.pinkRgb},0.55)`]]) { x.lineWidth = 5; x.strokeStyle = cc; x.strokeText('LEVEL UP!', dx, 0); }
      });
      e.titelGlow = backe(TW, TH_, (x) => {
        titel(x); x.globalCompositeOperation = 'lighter';
        for (const [lw, al, blur] of [[26, 0.18, 40], [12, 0.45, 22], [4, 1, 6]]) {
          x.globalAlpha = al; x.lineWidth = lw; x.strokeStyle = lw === 4 ? S.pinkKern : S.pink; x.shadowColor = S.pink; x.shadowBlur = blur; x.strokeText('LEVEL UP!', 0, 0);
        }
      });
    } else {
      e.titelRueck = backe(TW, TH_, (x) => {
        x.font = fnt(172); x.textAlign = 'center'; x.textBaseline = 'middle'; x.letterSpacing = '2px'; x.lineJoin = 'round';
        x.lineWidth = 22; x.strokeStyle = '#2a0614'; x.shadowColor = V === 1 ? S.titelGlowV1 : 'rgba(255,150,60,0.75)'; x.shadowBlur = 50; x.strokeText('LEVEL UP!', 0, 0);
        x.shadowBlur = 0; x.lineWidth = 6; x.strokeStyle = '#ffeaa8'; x.strokeText('LEVEL UP!', 0, 0);
      });
      e.off = leinwand(W, 400);
    }
    // Unterzeile
    e.unter = backe(1140, 160, (x) => {
      x.letterSpacing = '9px'; x.font = fnt(passendeGroesse(x, UNTER, 50, 980)); x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = V === 3 ? S.cyan : S.unterGlow; x.shadowBlur = 22; x.fillStyle = V === 3 ? (S.gifter ? '#e6fbff' : '#e6fdff') : S.unterFuell;
      x.fillText(UNTER, 0, 0);
    });
    // Namensleiste (ohne Profilbild — das kann später nachladen)
    const m = leiste();
    e.leiste = backe(m.pw + 100, m.ph + 100, (x) => {
      x.translate(-m.pw / 2, -m.ph / 2);
      leisteLive(x, m, 0);
    });
    return e;
  }
  function leiste() {
    const ctx = leinwand(4, 4)?.x;
    let font = 54, tw = NAME.length * 30;
    if (ctx) { ctx.letterSpacing = '0px'; font = passendeGroesse(ctx, NAME, 54, 810); ctx.font = fnt(font); tw = ctx.measureText(NAME).width; }
    return { font, tw, pw: tw + 150 + 60, ph: 124 };
  }
  function leisteLive(g, m, py) {
    const px = 0;
    g.beginPath(); g.roundRect(px, py, m.pw, m.ph, m.ph / 2);
    g.fillStyle = V === 3 ? 'rgba(10,4,26,0.85)' : 'rgba(24,4,16,0.82)'; g.shadowColor = V === 3 ? S.leisteNeon[0] : 'rgba(0,0,0,0.5)'; g.shadowBlur = 30; g.fill(); g.shadowBlur = 0;
    g.lineWidth = 4; g.strokeStyle = V === 3 ? S.leisteNeon[1] : goldGrad(g, py, py + m.ph); g.stroke();
    const ax = px + 14 + 48, ay = py + m.ph / 2;
    g.fillStyle = '#fff'; g.font = fnt(m.font); g.letterSpacing = '0px'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(NAME, ax + 70, ay + 3);
  }

  // ---- Mittelstücke ----
  function ecgY(x) { // EKG-Kurve, Periode 440 px
    const p = ((x % 440) + 440) % 440;
    if (p > 60 && p < 110) return -14 * Math.sin((p - 60) / 50 * Math.PI);
    if (p >= 150 && p < 162) return (p - 150) / 12 * 18;
    if (p >= 162 && p < 178) return 18 - (p - 162) / 16 * 168;
    if (p >= 178 && p < 196) return -150 + (p - 178) / 18 * 200;
    if (p >= 196 && p < 206) return 50 - (p - 196) / 10 * 50;
    if (p > 260 && p < 340) return -26 * Math.sin((p - 260) / 80 * Math.PI);
    return 0;
  }
  function drawECG(g, t, F) {
    const a = clamp(seg(t, 0.1, 0.4) - seg(t, T_BURST + 0.1, T_BURST + 0.7)) * F;
    if (a <= 0) return;
    const head = (t * 760) % (W + 600) - 100, len = 650;
    const x0 = Math.max(0, head - len), x1 = Math.min(W, head);
    if (x1 < x0) return;
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    const gr = g.createLinearGradient(head - len, 0, head, 0); gr.addColorStop(0, `rgba(${S.ekg[0]},0)`); gr.addColorStop(1, `rgba(${S.ekg[1]},1)`);
    for (const [w, al] of [[16, 0.18], [7, 0.45], [3, 1]]) {
      g.globalAlpha = a * al; g.strokeStyle = gr; g.lineWidth = w;
      g.beginPath();
      for (let x = x0; x <= x1; x += 3) { const y = BY + ecgY(x); x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    if (head > 0 && head < W) { const hy = BY + ecgY(head), rg = g.createRadialGradient(head, hy, 0, head, hy, 26); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, `rgba(${S.ekg[2]},0)`); g.globalAlpha = a; g.fillStyle = rg; g.beginPath(); g.arc(head, hy, 26, 0, 7); g.fill(); }
    g.restore();
  }
  function zahlScale(t) { return t >= T_BURST ? 1 + 0.5 * (1 - eOutBack(seg(t, T_BURST, T_BURST + 0.5))) : 1; }
  function drawHeartbeat(g, t, F, pb) {
    drawECG(g, t, F);
    let s = 520 * eOutBack(seg(t, 0.05, 0.55)) * (1 + pulse(t));
    if (t >= T_BURST) s *= 1 + 0.22 * (1 - eOutC(pb));
    s *= 1 + 0.1 * eInC(seg(t, T_OUT, DUR));
    if (s < 1) return;
    g.save(); g.translate(CX, BY); g.globalAlpha = F;
    const glow = 0.4 + 0.6 * clamp(pulse(t) * 8);
    g.shadowColor = `rgba(${S.herzGlow},${glow})`; g.shadowBlur = 70;
    glossyHeart(g, s); g.shadowBlur = 0;
    bigNumber(g, t < T_BURST ? OLD : NEW, s, zahlScale(t));
    g.restore();
  }
  function feather(ctx, len, wid) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid, -len * 0.25, wid * 0.8, -len * 0.8, 0, -len);
    ctx.bezierCurveTo(-wid * 0.5, -len * 0.75, -wid * 0.6, -len * 0.25, 0, 0); ctx.closePath();
  }
  const FLUEGEL = [
    { n: 11, len: [400, 175], a0: 0.62, a1: 2.1, wid: 46, dark: 0.0 },
    { n: 8, len: [250, 125], a0: 0.8, a1: 1.95, wid: 42, dark: 0.12 },
    { n: 6, len: [140, 85], a0: 0.95, a1: 1.8, wid: 36, dark: 0.22 },
  ];
  function wing(ctx, u, flap) {
    // rechter Flügel; Wurzel bei (0,0), wächst nach rechts oben
    for (const r of FLUEGEL) {
      for (let i = r.n - 1; i >= 0; i--) {
        const f = i / (r.n - 1);
        const ang = (r.a0 + (r.a1 - r.a0) * f) * u + flap * (0.5 + f);
        const len = (r.len[0] + (r.len[1] - r.len[0]) * Math.pow(f, 0.8)) * (0.3 + 0.7 * u);
        if (!(len > 0)) continue;
        ctx.save(); ctx.rotate(ang); ctx.translate(0, -18);
        const gr = ctx.createLinearGradient(0, 0, 0, -len);
        gr.addColorStop(0, `rgb(${170 - r.dark * 200},${100 - r.dark * 120},${20})`); gr.addColorStop(0.4, '#ffd76a'); gr.addColorStop(0.75, '#fff3c4'); gr.addColorStop(1, '#ffe08a');
        ctx.fillStyle = gr; feather(ctx, len, r.wid); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(110,55,0,0.55)'; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(r.wid * 0.25, -len * 0.5, 0, -len * 0.92); ctx.stroke();
        ctx.restore();
      }
    }
  }
  function drawWinged(g, t, F, pb) {
    let s = 390 * eOutBack(seg(t, 0.05, 0.6));
    s *= 1 + 0.03 * Math.sin(t * 7) * seg(t, 0.6, 1);
    if (t > T_CHARGE && t < T_BURST) s *= 1 + 0.06 * seg(t, T_CHARGE, T_BURST);
    if (t >= T_BURST) s *= 1 + 0.18 * (1 - eOutC(pb));
    s *= 1 + 0.1 * eInC(seg(t, T_OUT, DUR));
    if (s < 1) return;
    const u = t < T_BURST ? 0.12 * seg(t, 0.3, 0.8) + 0.08 * seg(t, T_CHARGE, T_BURST) : 0.2 + 0.8 * eOutBack(seg(t, T_BURST, T_BURST + 0.7), 1.4);
    const flap = t >= T_BURST + 0.7 ? Math.sin((t - T_BURST - 0.7) * 4.2) * 0.07 : 0;
    g.save(); g.translate(CX, BY); g.globalAlpha = F; const k = s / 390;
    g.save(); g.shadowColor = 'rgba(255,200,90,0.6)'; g.shadowBlur = 30;
    g.save(); g.translate(0.3 * s, -0.08 * s); g.scale(k, k); wing(g, u, flap); g.restore();
    g.save(); g.translate(-0.3 * s, -0.08 * s); g.scale(-k, k); wing(g, u, flap); g.restore();
    g.restore();
    // Goldrand
    g.shadowColor = 'rgba(255,190,90,0.9)'; g.shadowBlur = 60;
    g.fillStyle = goldGrad(g, -0.5 * s, 0.5 * s); heartPath(g, s * 1.1); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(90,40,0,0.6)'; g.lineWidth = 3; heartPath(g, s * 1.035); g.stroke();
    glossyHeart(g, s);
    // Glanzstreifen über das Herz
    for (const q of [seg(t, 0.35, 0.95), seg(t, T_BURST + 0.25, T_BURST + 1.05)]) if (q > 0 && q < 1) {
      g.save(); heartPath(g, s * 1.1); g.clip(); g.rotate(0.35); const x = -0.8 * s + 1.6 * s * q;
      const gr = g.createLinearGradient(x - 60, 0, x + 60, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(-s, -s, 2 * s, 2 * s); g.restore();
    }
    bigNumber(g, t < T_BURST ? OLD : NEW, s, zahlScale(t));
    g.restore();
  }
  function drawNeon(g, t, F, pb, rf) {
    let s = 560 * (1 + 0.04 * Math.sin(t * 6) * seg(t, 0.9, 1.2));
    if (t >= T_BURST) s *= 1 + 0.16 * (1 - eOutC(pb));
    s *= 1 + 0.08 * eInC(seg(t, T_OUT, DUR));
    const draw = eOutC(seg(t, 0.08, 0.8));
    let fl = 1;
    if (t > 0.8 && t < 1.05) fl = rf() < 0.35 ? 0.25 : 1;
    const hot = t >= T_BURST ? 1 + 1.2 * (1 - eOutC(pb)) : 1 + 0.5 * seg(t, T_CHARGE, T_BURST);
    const a1 = F * fl * Math.min(1.6, hot), a2 = F * fl * 0.85 * Math.min(1.6, hot);
    g.save(); g.translate(CX, BY);
    if (draw >= 1 && ebenen.roehre1 && ebenen.roehre2) {
      setzeHell(g, ebenen.roehre1, 0, 0, s / ebenen.roehreS, a1);
      setzeHell(g, ebenen.roehre2, 0, 0, s / ebenen.roehreS, a2);
    } else if (draw > 0) {
      // Röhre außen (pink), zeichnet sich selbst
      g.setLineDash([HLEN * s * draw, HLEN * s * 2]);
      neonStroke(g, () => heartPath(g, s), S.roehre1[0], S.roehre1[1], a1, 1);
      g.setLineDash([HLEN * s * 0.82 * draw, HLEN * s * 2]); g.lineDashOffset = -HLEN * s * 0.82 * 0.5;
      neonStroke(g, () => heartPath(g, s * 0.82), S.roehre2[0], S.roehre2[1], a2, 0.75);
      g.setLineDash([]); g.lineDashOffset = 0;
    }
    // Innenleuchten
    const ig = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.5); ig.addColorStop(0, `rgba(${S.innen},${clamp(0.22 * draw * F * hot)})`); ig.addColorStop(1, `rgba(${S.innen},0)`);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = ig; g.beginPath(); g.arc(0, 0, s * 0.5, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    // Stromblitze beim Aufladen
    if (t > T_CHARGE && t < T_BURST + 0.15) {
      const Rf = (a, b) => a + (b - a) * rf();
      const n = 2 + Math.round(4 * seg(t, T_CHARGE, T_BURST));
      for (let k = 0; k < n; k++) {
        const p0 = HP_KLASSIK[(rf() * HP_KLASSIK.length) | 0];
        const ang = Math.atan2(p0[1], p0[0]), r1 = Rf(60, 220);
        const x0 = p0[0] * s, y0 = p0[1] * s, x1 = x0 + Math.cos(ang) * r1, y1 = y0 + Math.sin(ang) * r1;
        g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'miter';
        for (const [lw, col, al] of [[9, S.cyan, 0.3], [2.5, '#ffffff', 1]]) {
          g.strokeStyle = col; g.globalAlpha = al * F; g.lineWidth = lw; g.shadowColor = S.cyan; g.shadowBlur = 18;
          g.beginPath(); g.moveTo(x0, y0);
          for (let j = 1; j <= 7; j++) { const f = j / 7; g.lineTo(x0 + (x1 - x0) * f + Rf(-22, 22), y0 + (y1 - y0) * f + Rf(-22, 22)); }
          g.stroke();
        }
        g.restore();
      }
    }
    if (draw > 0.6) {
      g.globalAlpha = F * fl * clamp((draw - 0.6) * 3);
      bigNumber(g, t < T_BURST ? OLD : NEW, s, zahlScale(t));
      g.globalAlpha = 1;
    }
    g.restore();
  }

  function zeichne(g, t, a, rf, ziel) {
    if (!ebenen) ebenen = baueEbenen();
    const lebt = (p) => p.n < ziel; // im Vorgriff geborene erst im nächsten Bild zeigen
    const F = 1 - eInC(seg(t, T_OUT, DUR));
    const appear = eOutC(seg(t, 0, 0.5));
    const pb = seg(t, T_BURST, T_BURST + 0.45);
    const shake = t >= T_BURST ? (1 - pb) * 16 : (t > T_CHARGE ? 5 * Math.pow(seg(t, T_CHARGE, T_BURST), 2) : 0);
    g.translate(Math.sin(t * 97) * shake, Math.cos(t * 83) * shake);

    // Abdunkeln für Kontrast
    let gr = g.createRadialGradient(CX, BY + 250, 50, CX, BY + 250, 1000);
    const dk = V === 3 ? 0.78 : 0.62, col = V === 3 ? '8,2,22' : '18,2,14';
    gr.addColorStop(0, `rgba(${col},${dk * appear * F})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(-50, -50, W + 100, H + 100);

    // Lichtstrahlen (nicht bei Neon)
    if (V !== 3) {
      g.globalCompositeOperation = 'lighter';
      const rayI = (t < T_BURST ? 0.2 + 0.35 * seg(t, 0.2, T_BURST) : 0.6 + 0.6 * (1 - eOutC(seg(t, T_BURST, T_BURST + 1.2)))) * appear * F;
      const rc = V === 1 ? S.strahlenV1 : '255,205,110';
      g.save(); g.translate(CX, BY); g.rotate(t * 0.22);
      for (let i = 0; i < 18; i++) {
        g.rotate(Math.PI * 2 / 18);
        const len = 950 + (i % 3) * 120, wdt = 0.07 + (i % 2) * 0.04;
        gr = g.createRadialGradient(0, 0, 120, 0, 0, len); gr.addColorStop(0, `rgba(${rc},${0.32 * rayI})`); gr.addColorStop(1, `rgba(${rc},0)`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, len, -wdt, wdt); g.closePath(); g.fill();
      }
      g.restore(); g.globalCompositeOperation = 'source-over';
    }

    // Herzförmige Schockwellen
    for (const r of rings) {
      const p = seg(t, r.t0, r.t0 + (r.big ? 1.0 : 0.6));
      if (p <= 0 || p >= 1) continue;
      const sc = r.big ? 520 + 1500 * eOutExpo(p) : 520 + 260 * eOutC(p);
      const cl = V === 3 ? (r.k > 0.8 ? S.ringeNeon[0] : S.ringeNeon[1]) : (r.k > 0.8 ? S.ringeWarm[0] : S.ringeWarm[1]);
      g.save(); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(${cl},${(1 - p) * (r.big ? 0.6 : 0.85) * r.k * F})`; g.lineWidth = (r.big ? 28 : 14) * (1 - p) + 1;
      heartPath(g, sc, CX, BY); g.stroke(); g.restore();
    }

    // Funken
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const p of sparks) {
      if (!lebt(p)) continue;
      const x = p.ox + (p.x - p.ox) * a, y = p.oy + (p.y - p.oy) * a;
      const vx = p.ovx + (p.vx - p.ovx) * a, vy = p.ovy + (p.vy - p.ovy) * a;
      const al = clamp(1 - (p.life - 1 + a) / p.max) * F, sp = Math.hypot(vx, vy);
      g.strokeStyle = p.col; g.globalAlpha = al; g.lineWidth = p.w * (0.6 + 0.4 * al);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - vx * 2.2, y - vy * 2.2); g.stroke();
      if (sp > 4) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, p.w * 0.55, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

    // Herzchen-Konfetti
    for (const p of hearts) {
      if (!lebt(p)) continue;
      const x = p.ox + (p.x - p.ox) * a, y = p.oy + (p.y - p.oy) * a, rot = p.orot + (p.rot - p.orot) * a;
      const al = Math.min(1, clamp(1 - (p.life - 1 + a) / p.max) * 1.6) * F;
      g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = al;
      if (V === 3) {
        const sp = ebenen.konfetti[rf() < 0.5 ? 0 : 1];
        if (sp) { g.globalCompositeOperation = 'lighter'; setze(g, sp, 0, 0, p.s / 56); }
        else neonStroke(g, () => heartPath(g, p.s), rf() < 0.5 ? S.pink : S.cyan, '#ffffff', al, 0.35);
      } else if (ebenen.konfetti[0]) setze(g, ebenen.konfetti[0], 0, 0, p.s / 56);
      else { g.shadowColor = S.konfettiGlow; g.shadowBlur = 12; glossyHeart(g, p.s); }
      g.restore();
    }
    g.globalAlpha = 1;

    // Mittelstück
    if (V === 1) drawHeartbeat(g, t, F, pb); else if (V === 2) drawWinged(g, t, F, pb); else drawNeon(g, t, F, pb, rf);

    // Blitz
    if (pb > 0 && pb < 1) {
      g.globalCompositeOperation = 'lighter';
      gr = g.createRadialGradient(CX, BY, 0, CX, BY, 780);
      const fc = V === 3 ? S.blitzNeon : '255,250,235';
      gr.addColorStop(0, `rgba(${fc},${(1 - eOutC(seg(t, T_BURST, T_BURST + 0.35))) * 0.95})`); gr.addColorStop(1, `rgba(${fc},0)`);
      g.fillStyle = gr; g.fillRect(-50, -50, W + 100, H + 100); g.globalCompositeOperation = 'source-over';
    }

    // „LEVEL UP!"
    const pt = seg(t, T_BURST + 0.05, T_BURST + 0.42);
    const TY = 1130;
    if (pt > 0) {
      const ts = (1 + 1.4 * (1 - eOutC(pt))) * (1 + 0.1 * eInC(seg(t, T_OUT, DUR)));
      const ta = clamp(pt * 3) * F;
      g.save(); g.globalAlpha = ta; g.translate(CX, TY); g.scale(ts, ts);
      g.font = fnt(172); g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '2px'; g.lineJoin = 'round';
      if (V === 3) {
        const fl2 = (t > T_BURST + 0.5 && t < T_BURST + 0.62) ? 0.4 : 1;
        g.globalCompositeOperation = 'lighter';
        if (ebenen.titelChroma && ebenen.titelGlow) {
          setze(g, ebenen.titelChroma, 0, 0);
          g.globalAlpha = ta * fl2; setze(g, ebenen.titelGlow, 0, 0);
        } else {
          for (const [dx, cc] of [[-4, `rgba(${S.cyanRgb},0.55)`], [4, `rgba(${S.pinkRgb},0.55)`]]) { g.lineWidth = 5; g.strokeStyle = cc; g.strokeText('LEVEL UP!', dx, 0); }
          for (const [lw, al, blur] of [[26, 0.18, 40], [12, 0.45, 22], [4, 1, 6]]) {
            g.globalAlpha = ta * al * fl2; g.lineWidth = lw; g.strokeStyle = lw === 4 ? S.pinkKern : S.pink; g.shadowColor = S.pink; g.shadowBlur = blur; g.strokeText('LEVEL UP!', 0, 0);
          }
        }
      } else {
        if (ebenen.titelRueck) setze(g, ebenen.titelRueck, 0, 0);
        else {
          g.lineWidth = 22; g.strokeStyle = '#2a0614'; g.shadowColor = V === 1 ? S.titelGlowV1 : 'rgba(255,150,60,0.75)'; g.shadowBlur = 50; g.strokeText('LEVEL UP!', 0, 0);
          g.shadowBlur = 0; g.lineWidth = 6; g.strokeStyle = '#ffeaa8'; g.strokeText('LEVEL UP!', 0, 0);
        }
        const off = ebenen.off;
        if (off) {
          const o = off.x;
          o.clearRect(0, 0, W, 400); o.font = fnt(172); o.textAlign = 'center'; o.textBaseline = 'middle'; o.letterSpacing = '2px';
          o.fillStyle = goldGrad(o, 200 - 82, 200 + 70); o.fillText('LEVEL UP!', W / 2, 200);
          const q = seg(t, T_BURST + 0.6, T_BURST + 1.5);
          if (q > 0 && q < 1) {
            o.globalCompositeOperation = 'source-atop'; const x = -200 + 1480 * q; const lg = o.createLinearGradient(x - 90, 0, x + 90, 0);
            lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
            o.fillStyle = lg; o.fillRect(0, 0, W, 400); o.globalCompositeOperation = 'source-over';
          }
          g.drawImage(off.c, -CX, -200);
        } else { g.fillStyle = goldGrad(g, -82, 70); g.fillText('LEVEL UP!', 0, 0); }
      }
      g.restore();
    }

    // Untertitel
    const ps = eOutC(seg(t, T_BURST + 0.35, T_BURST + 0.75));
    if (ps > 0) {
      g.save(); g.globalAlpha = ps * F;
      if (ebenen.unter) setze(g, ebenen.unter, CX, 1240 + 30 * (1 - ps));
      else {
        g.letterSpacing = '9px'; g.font = fnt(passendeGroesse(g, UNTER, 50, 980)); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = V === 3 ? S.cyan : S.unterGlow; g.shadowBlur = 22; g.fillStyle = V === 3 ? '#e6fdff' : S.unterFuell;
        g.fillText(UNTER, CX, 1240 + 30 * (1 - ps));
      }
      g.restore();
    }

    // Profilbild + Name
    const pn = eOutBack(seg(t, T_BURST + 0.55, T_BURST + 1.0));
    if (pn > 0) {
      const m = ebenen.leisteMass || (ebenen.leisteMass = leiste());
      g.save(); g.globalAlpha = clamp(pn) * F;
      const px = CX - m.pw / 2, py = 1315 + 40 * (1 - pn);
      g.translate(CX, py + m.ph / 2); g.scale(0.9 + 0.1 * pn, 0.9 + 0.1 * pn); g.translate(-CX, -(py + m.ph / 2));
      if (ebenen.leiste) setze(g, ebenen.leiste, CX, py + m.ph / 2);
      else { g.save(); g.translate(px, 0); leisteLive(g, m, py); g.restore(); }
      const ax = px + 14 + 48, ay = py + m.ph / 2;
      g.save(); g.translate(ax, ay);
      zeichneAvatar(g, bild, 46, S.avatarVerlauf, d.initiale, 48, false);
      g.lineWidth = 5; g.strokeStyle = V === 3 ? S.cyan : goldGrad(g, -50, 50); g.beginPath(); g.arc(0, 0, 48, 0, 7); g.stroke();
      g.restore();
      g.restore();
    }

    // Glut
    g.globalCompositeOperation = 'lighter';
    for (const p of embers) {
      if (!lebt(p)) continue;
      const x = p.ox + (p.x - p.ox) * a, y = p.oy + (p.y - p.oy) * a;
      const al = Math.sin(Math.PI * clamp((p.life - 1 + a) / p.max)) * F;
      if (!(al > 0)) continue;
      let sp = ebenen.glut.get(p.col);
      if (sp === undefined) {
        sp = backe(36, 36, (x2) => { const gg = x2.createRadialGradient(0, 0, 0, 0, 0, 16.8); gg.addColorStop(0, p.col); gg.addColorStop(1, 'rgba(255,150,60,0)'); x2.fillStyle = gg; x2.beginPath(); x2.arc(0, 0, 16.8, 0, 7); x2.fill(); });
        ebenen.glut.set(p.col, sp);
      }
      g.globalAlpha = al;
      if (sp) setze(g, sp, x, y, p.r / 4.2);
      else { gr = g.createRadialGradient(x, y, 0, x, y, p.r * 4); gr.addColorStop(0, p.col); gr.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, p.r * 4, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  return { dauer: DUR, zuruecksetzen, schritt, zeichne, vergissText: () => { ebenen = null; zahlCache.clear(); } };
}

// ------------------------------------------ Level-Up V4/V5 (TikTok-Stil) ---

function stilTikTok(MIX, d, S, bild) {
  const DUR = 5.8, CX = 540, BY = 700, HS = 470;
  const T_LAND = 0.75, T_CHARGE = 1.1, T_BURST = 1.9, T_JUMP = 0.62, T_OUT = 4.95;
  const CORAL = ['#ff6b5e', '#ff8a7a', '#ff4b4b', '#ffb3a7'];
  const GOLDS = ['#ffe8a3', '#ffd26a', '#ffffff', '#ffc14d'];
  const CORAL_COLS = ['#ffb8a8', '#ff6a5c', '#e8343f', '#a3172a'];
  const GOLD_COLS = ['#fff5cf', '#ffd46e', '#d9952a', '#8a5310'];
  const OLD = d.alt, NEW = d.neu, NAME = d.name;
  const TITEL = 'LEVEL UP!';
  const UNTER = S.gifter ? `GESCHENKE-STUFE ${OLD} → ${NEW}` : `TEAM-LEVEL ${OLD} → ${NEW}`;
  const heartPath = (ctx, s, ox = 0, oy = 0) => polyPfad(ctx, HP_TIKTOK, s, ox, oy);
  const HLEN = HLEN_TIKTOK;

  function shinyHeart(ctx, s, cols) {
    let gr = ctx.createRadialGradient(-0.2 * s, -0.28 * s, 0.02 * s, -0.04 * s, 0, 0.82 * s);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.38, cols[1]); gr.addColorStop(0.78, cols[2]); gr.addColorStop(1, cols[3]);
    ctx.fillStyle = gr; heartPath(ctx, s); ctx.fill();
    ctx.save(); heartPath(ctx, s); ctx.clip();
    gr = ctx.createLinearGradient(0, 0.05 * s, 0, 0.5 * s); gr.addColorStop(0, 'rgba(120,10,20,0)'); gr.addColorStop(1, 'rgba(120,10,20,0.35)');
    ctx.fillStyle = gr; ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.save(); ctx.translate(-0.25 * s, -0.27 * s); ctx.rotate(-0.6);
    gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.15 * s); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.scale(1, 0.48); ctx.beginPath(); ctx.arc(0, 0, 0.15 * s, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(0.28 * s, -0.29 * s); ctx.rotate(0.5);
    gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.06 * s); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, 0.06 * s, 0, 7); ctx.fill(); ctx.restore();
    ctx.restore();
  }
  function face(ctx, k, mood, blink) {
    ctx.fillStyle = 'rgba(255,170,180,0.65)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 0.25 * k, 0.07 * k, 0.07 * k, 0.04 * k, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#4a1012'; ctx.fillStyle = '#4a1012'; ctx.lineCap = 'round'; ctx.lineWidth = 0.028 * k;
    for (const sx of [-1, 1]) {
      const ex = sx * 0.15 * k, ey = -0.04 * k;
      if (mood === 2) { ctx.beginPath(); ctx.arc(ex, ey + 0.02 * k, 0.05 * k, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (mood === 1) { // zusammengekniffen: > <
        const dd = -sx; ctx.beginPath(); ctx.moveTo(ex - dd * 0.045 * k, ey - 0.04 * k); ctx.lineTo(ex + dd * 0.04 * k, ey); ctx.lineTo(ex - dd * 0.045 * k, ey + 0.04 * k); ctx.stroke();
      } else {
        const ry = 0.065 * k * (1 - 0.92 * blink);
        ctx.beginPath(); ctx.ellipse(ex, ey, 0.045 * k, Math.max(0.006 * k, ry), 0, 0, 7); ctx.fill();
        if (blink < 0.5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 0.014 * k, ey - 0.025 * k, 0.016 * k, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(ex - 0.015 * k, ey + 0.02 * k, 0.008 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#4a1012'; }
      }
    }
    if (mood === 2) {
      ctx.beginPath(); ctx.moveTo(-0.085 * k, 0.07 * k); ctx.quadraticCurveTo(0, 0.07 * k, 0.085 * k, 0.07 * k); ctx.quadraticCurveTo(0, 0.23 * k, -0.085 * k, 0.07 * k); ctx.closePath(); ctx.fillStyle = '#5a0f14'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = '#ff8a95'; ctx.beginPath(); ctx.ellipse(0, 0.17 * k, 0.05 * k, 0.035 * k, 0, 0, 7); ctx.fill(); ctx.restore();
    } else if (mood === 1) {
      ctx.beginPath(); ctx.moveTo(-0.05 * k, 0.1 * k); ctx.lineTo(0.05 * k, 0.1 * k); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0.06 * k, 0.055 * k, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }
  // Herz-Figur mit Goldrand und Gesicht; flip in [-1,1] (horizontale Drehung), mood: 0 normal, 1 angestrengt, 2 glücklich
  function heartBuddy(ctx, s, flip, mood, blink) {
    const back = flip < 0;
    ctx.save(); ctx.scale(Math.max(0.04, Math.abs(flip)), 1);
    ctx.save(); ctx.translate((back ? -1 : 1) * 0.035 * s, 0.03 * s); ctx.fillStyle = '#b8731c'; heartPath(ctx, s * 1.05); ctx.fill(); ctx.restore();
    const gr = ctx.createLinearGradient(0, -0.45 * s, 0, 0.5 * s);
    gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.35, '#ffd877'); gr.addColorStop(0.7, '#e6a23a'); gr.addColorStop(1, '#b8731c');
    ctx.fillStyle = gr; heartPath(ctx, s * 1.05); ctx.fill();
    shinyHeart(ctx, s * 0.93, back ? GOLD_COLS : CORAL_COLS);
    if (!back) face(ctx, s * 0.93, mood, blink);
    else { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff6d8'; heartPath(ctx, s * 0.32); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }

  let rnd, R, pick, sparks, hearts, stars, rings, burst;
  function zuruecksetzen() {
    rnd = prng(777); ({ R, pick } = zufall(rnd));
    sparks = []; hearts = []; stars = []; rings = []; burst = false;
  }
  function spawnBurst(i) {
    for (let n = 0; n < 200; n++) {
      const a = R(0, Math.PI * 2), sp = Math.pow(rnd(), 0.6) * 28 + 6;
      sparks.push({ x: CX + Math.cos(a) * 60, y: BY + Math.sin(a) * 60, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: R(40, 80), col: MIX ? (rnd() < 0.5 ? pick(S.ttFunken) : pick(CORAL)) : (rnd() < 0.55 ? pick(GOLDS) : pick(CORAL)), w: R(2, 5), n: i });
    }
    for (let n = 0; n < 46; n++) {
      const a = R(0, Math.PI * 2), sp = R(8, 21);
      hearts.push({ x: CX, y: BY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, rot: R(-0.6, 0.6), vr: R(-0.1, 0.1), s: R(24, 60), life: 0, max: R(70, 115), gold: rnd() < 0.25, n: i });
    }
    for (const [dd, k] of [[0, 1], [0.12, 0.65]]) rings.push({ t0: T_BURST + dd, k });
  }
  function schritt(t, i) {
    if (t >= T_BURST && !burst) { burst = true; spawnBurst(i); }
    if (t >= T_BURST && t < T_OUT && rnd() < 0.7) stars.push({ x: CX + R(-420, 420), y: BY + R(-300, 650), r: R(8, 22), life: 0, max: R(25, 45), rot: R(0, 1), col: pick(['#fff', '#ffe08a', '#ffc2b8']), n: i });
    for (const p of sparks) { p.ox = p.x; p.oy = p.y; p.ovx = p.vx; p.ovy = p.vy; p.vx *= 0.935; p.vy = p.vy * 0.935 + 0.32; p.x += p.vx; p.y += p.vy; p.life++; }
    for (const p of hearts) { p.ox = p.x; p.oy = p.y; p.orot = p.rot; p.vx *= 0.955; p.vy = p.vy * 0.955 + 0.24; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++; }
    for (const p of stars) p.life++;
    for (const arr of [sparks, hearts, stars]) for (let k = arr.length - 1; k >= 0; k--) if (arr[k].life > arr[k].max) arr.splice(k, 1);
  }

  function heartPose(t) {
    let y = 0, sx = 1, sy = 1, flip = 1, mood = 0;
    if (t < T_LAND) { const p = seg(t, 0, T_LAND); y = -1100 * (1 - eOutBounce(p)); }
    const imp = Math.exp(-Math.max(0, t - T_LAND * 0.36) * 9) * (t > T_LAND * 0.36 ? 1 : 0) * 0.18;
    sx += imp; sy -= imp;
    if (t > T_LAND && t < T_CHARGE) y += -8 * Math.sin((t - T_LAND) * 9);
    if (t >= T_CHARGE && t < T_BURST) { const p = eInOut(seg(t, T_CHARGE, T_BURST)); sx += 0.14 * p; sy -= 0.2 * p; y += 0.2 * p * HS * 0.4; mood = 1; }
    if (t >= T_BURST) {
      mood = 2;
      const p = seg(t, T_BURST, T_BURST + T_JUMP);
      if (p < 1) { y = -330 * Math.sin(Math.PI * p); sx = 1 - 0.08 * Math.sin(Math.PI * p); sy = 1 + 0.14 * Math.sin(Math.PI * Math.min(1, p * 2)); flip = Math.cos(Math.PI * 2 * eInOut(p)); }
      const l = t - (T_BURST + T_JUMP);
      if (l > 0) { const im = Math.exp(-l * 8) * 0.16 * Math.cos(l * 22); sx += im; sy -= im; y = 0; }
      if (t > T_BURST + T_JUMP + 0.4) y = -10 * Math.sin((t - T_BURST) * 5);
    }
    return { y, sx, sy, flip, mood };
  }
  function blinkAt(t) { for (const b of [0.95, 2.9, 4.1]) { const dd = Math.abs(t - b); if (dd < 0.08) return 1 - dd / 0.08; } return 0; }

  // ---- vorgebackene Ebenen ----
  let ebenen = null;
  const FS = HS * 1.42; // Neonrahmen
  function pillGrund(ctx, w, h) {
    ctx.shadowColor = 'rgba(80,0,10,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
    ctx.save(); ctx.translate(-w / 2 + 78, 2);
    if (S.gifter) stufenMedaille(ctx, 92); else shinyHeart(ctx, 92, CORAL_COLS);
    ctx.restore();
  }
  function titelSetup(x) {
    x.font = fnt(150); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.letterSpacing = '1px';
    const tw0 = x.measureText(TITEL).width; if (tw0 > 960) x.font = fnt(Math.floor(150 * 960 / tw0));
  }
  function titelChroma(x) {
    for (const [dx, cc] of [[-4, `rgba(${S.cyanRgb},0.6)`], [4, `rgba(${S.pinkRgb},0.6)`]]) { x.lineWidth = 5; x.strokeStyle = cc; x.strokeText(TITEL, dx, 0); }
  }
  function titelGlow(x, a0, fl2) {
    for (const [lw, al, blur] of [[26, 0.2, 40], [12, 0.5, 22], [4, 1, 6]]) { x.globalAlpha = a0 * al * fl2; x.lineWidth = lw; x.strokeStyle = lw === 4 ? '#fffaf0' : S.ttGlow; x.shadowColor = S.ttGlow; x.shadowBlur = blur; x.strokeText(TITEL, 0, 0); }
  }
  function titelWarm(x) {
    x.shadowColor = 'rgba(90,0,15,0.45)'; x.shadowOffsetY = 10; x.shadowBlur = 20;
    x.lineWidth = 30; x.strokeStyle = '#e8343f'; x.strokeText(TITEL, 0, 0);
    x.shadowColor = 'transparent'; x.shadowOffsetY = 0; x.lineWidth = 12; x.strokeStyle = '#ff7a6b'; x.strokeText(TITEL, 0, 0);
    const gr = x.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#ffe3dc');
    x.fillStyle = gr; x.fillText(TITEL, 0, 0);
  }
  function unterLive(x) {
    x.letterSpacing = '6px'; x.font = fnt(passendeGroesse(x, UNTER, 58, 980)); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = MIX ? S.ttUnterGlow : 'rgba(255,90,80,0.9)'; x.shadowBlur = 22;
    x.fillStyle = MIX ? (S.gifter ? '#e6fbff' : '#e6fdff') : '#fff1ec'; x.fillText(UNTER, 0, 0);
  }
  function nameMass(x) {
    x.letterSpacing = '0px';
    const font = passendeGroesse(x, NAME, 64, 920); x.font = fnt(font);
    return { font, tw: x.measureText(NAME).width };
  }
  function nameLive(x, m) {
    x.font = fnt(m.font); x.textAlign = 'center'; x.textBaseline = 'middle'; x.letterSpacing = '0px';
    x.fillStyle = 'rgba(20,6,12,0.6)'; x.beginPath(); x.roundRect(-m.tw / 2 - 40, -50, m.tw + 80, 100, 50); x.fill();
    x.shadowColor = MIX ? S.ttGlow : 'rgba(0,0,0,0.6)'; x.shadowBlur = 16; x.fillStyle = '#fff'; x.fillText(NAME, 0, 3);
  }
  const R_AV = 112;
  function ringLive(x, alpha) {
    if (MIX) neonStroke(x, () => { x.beginPath(); x.arc(0, 0, R_AV + 10, 0, 7); }, S.neon[0], S.neon[1], alpha, 0.55);
    else { x.globalAlpha *= alpha; x.shadowColor = 'rgba(255,190,90,0.9)'; x.shadowBlur = 40; x.lineWidth = 12; x.strokeStyle = '#ffd877'; x.beginPath(); x.arc(0, 0, R_AV + 8, 0, 7); x.stroke(); x.shadowBlur = 0; }
  }
  function baueEbenen() {
    const e = {};
    e.konfetti = [backe(64, 64, (x) => shinyHeart(x, 56, CORAL_COLS)), backe(64, 64, (x) => shinyHeart(x, 56, GOLD_COLS))];
    if (MIX) {
      const h1 = FS * HERZ_HALB + NEON_RAND(1), h2 = FS * 1.1 * HERZ_HALB + NEON_RAND(0.6);
      e.rahmen1 = backe(2 * h1, 2 * h1, (x) => neonStroke(x, () => heartPath(x, FS), S.neon[0], S.neon[1], 1, 1));
      e.rahmen2 = backe(2 * h2, 2 * h2, (x) => neonStroke(x, () => heartPath(x, FS * 1.1), S.neon[2], S.neon[3], 1, 0.6));
      e.titelChroma = backe(1240, 380, (x) => { titelSetup(x); x.globalCompositeOperation = 'lighter'; titelChroma(x); });
      e.titelGlow = backe(1240, 380, (x) => { titelSetup(x); x.globalCompositeOperation = 'lighter'; titelGlow(x, 1, 1); });
    } else {
      e.titel = backe(1240, 400, (x) => { titelSetup(x); titelWarm(x); });
    }
    e.pille = backe(330 + 120, 132 + 130, (x) => pillGrund(x, 330, 132));
    e.unter = backe(1140, 170, unterLive);
    const mx = leinwand(4, 4)?.x;
    e.nameMass = mx ? nameMass(mx) : { font: 64, tw: NAME.length * 34 };
    e.name = backe(e.nameMass.tw + 160, 160, (x) => nameLive(x, e.nameMass));
    e.ring = backe(2 * (R_AV + 10 + NEON_RAND(0.55)), 2 * (R_AV + 10 + NEON_RAND(0.55)), (x) => ringLive(x, 1));
    e.kachel = backe(140, 100, (x) => kachel(x, NEW, S, heartPath));
    return e;
  }

  function neonFrame(g, t, F, pb, rf) {
    const s = FS, cy = BY - 10;
    const draw = eOutC(seg(t, 0.35, 1.05));
    let fl = 1; if (t > 1.05 && t < 1.3) fl = rf() < 0.35 ? 0.25 : 1;
    const hot = t >= T_BURST ? 1 + 1.2 * (1 - eOutC(pb)) : 1 + 0.6 * seg(t, T_CHARGE, T_BURST);
    const a1 = F * fl * Math.min(1.7, hot), a2 = F * fl * 0.7 * Math.min(1.7, hot);
    g.save(); g.translate(CX, cy);
    if (draw >= 1 && ebenen.rahmen1 && ebenen.rahmen2) {
      setzeHell(g, ebenen.rahmen1, 0, 0, 1, a1);
      setzeHell(g, ebenen.rahmen2, 0, 0, 1, a2);
    } else if (draw > 0) {
      g.setLineDash([HLEN * s * draw, HLEN * s * 2]);
      neonStroke(g, () => heartPath(g, s), S.neon[0], S.neon[1], a1, 1);
      g.setLineDash([HLEN * s * 1.1 * draw, HLEN * s * 3]); g.lineDashOffset = -HLEN * s * 1.1 * 0.5;
      neonStroke(g, () => heartPath(g, s * 1.1), S.neon[2], S.neon[3], a2, 0.6);
      g.setLineDash([]); g.lineDashOffset = 0;
    }
    if (t > T_CHARGE && t < T_BURST + 0.15) {
      const Rf = (a, b) => a + (b - a) * rf();
      const n = 2 + Math.round(5 * seg(t, T_CHARGE, T_BURST));
      for (let k = 0; k < n; k++) {
        const p0 = HP_TIKTOK[(rf() * HP_TIKTOK.length) | 0], ang = Math.atan2(p0[1], p0[0]), r1 = Rf(60, 200);
        const x0 = p0[0] * s, y0 = p0[1] * s, x1 = x0 + Math.cos(ang) * r1, y1 = y0 + Math.sin(ang) * r1;
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const [lw, col, al] of [[9, S.cyan, 0.3], [2.5, '#ffffff', 1]]) {
          g.strokeStyle = col; g.globalAlpha = al * F; g.lineWidth = lw; g.shadowColor = S.cyan; g.shadowBlur = 18;
          g.beginPath(); g.moveTo(x0, y0);
          for (let j = 1; j <= 7; j++) { const f = j / 7; g.lineTo(x0 + (x1 - x0) * f + Rf(-22, 22), y0 + (y1 - y0) * f + Rf(-22, 22)); }
          g.stroke();
        }
        g.restore();
      }
    }
    g.restore();
  }

  function pill(g, t) {
    // weiße Pille mit Herz (Gifter: Medaille) und Zahl, rollt beim Aufstieg
    const h = 132, w = 330;
    g.save();
    const pop = t >= T_BURST + 0.15 ? 1 + 0.25 * Math.exp(-(t - T_BURST - 0.15) * 7) * Math.cos((t - T_BURST - 0.15) * 18) : 1;
    g.scale(pop, pop);
    if (ebenen.pille) setze(g, ebenen.pille, 0, 0); else pillGrund(g, w, h);
    g.save(); g.beginPath(); g.rect(-w / 2 + 125, -h / 2 + 6, w - 140, h - 12); g.clip();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = S.zahl; g.letterSpacing = '0px';
    g.font = fnt(passendeGroesse(g, String(Math.max(OLD, NEW)), 96, w - 150));
    const roll = eOutBack(seg(t, T_BURST + 0.15, T_BURST + 0.55), 1.6), tx = 52;
    if (roll <= 0) g.fillText(String(OLD), tx, 6);
    else { const ga = g.globalAlpha; g.globalAlpha = ga * clamp(1 - roll); g.fillText(String(OLD), tx, 6 - 120 * roll); g.globalAlpha = ga; g.fillText(String(NEW), tx, 6 + 120 * (1 - roll)); }
    g.restore();
    g.restore();
  }

  function zeichne(g, t, a, rf, ziel) {
    if (!ebenen) ebenen = baueEbenen();
    const lebt = (p) => p.n < ziel;
    const F = 1 - eInC(seg(t, T_OUT, DUR));
    const appear = eOutC(seg(t, 0, 0.5));
    const pb = seg(t, T_BURST, T_BURST + 0.45);

    // weiches Abdunkeln
    let gr = g.createRadialGradient(CX, BY + 300, 50, CX, BY + 300, 1000);
    const dcol = MIX ? '14,3,24' : '40,6,12'; gr.addColorStop(0, `rgba(${dcol},${(MIX ? 0.75 : 0.55) * appear * F})`); gr.addColorStop(1, `rgba(${dcol},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);

    // warme Strahlen
    g.globalCompositeOperation = 'lighter';
    const rayI = (t < T_BURST ? 0.15 + 0.3 * seg(t, T_LAND, T_BURST) : 0.55 + 0.6 * (1 - eOutC(seg(t, T_BURST, T_BURST + 1.3)))) * appear * F;
    g.save(); g.translate(CX, BY); g.rotate(t * 0.2);
    for (let i = 0; i < 16; i++) {
      g.rotate(Math.PI * 2 / 16); const len = 1000 + (i % 3) * 120, wd = 0.08 + (i % 2) * 0.05;
      gr = g.createRadialGradient(0, 0, 100, 0, 0, len); gr.addColorStop(0, MIX ? `rgba(${S.ttStrahl},${0.22 * rayI})` : `rgba(255,170,130,${0.3 * rayI})`); gr.addColorStop(1, 'rgba(255,120,100,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, len, -wd, wd); g.closePath(); g.fill();
    }
    g.restore();
    for (const r of rings) {
      const p = seg(t, r.t0, r.t0 + 1.0); if (p <= 0 || p >= 1) continue;
      g.strokeStyle = `rgba(${MIX ? (r.k > 0.8 ? S.ttRinge[0] : S.ttRinge[1]) : (r.k > 0.8 ? '255,215,130' : '255,120,110')},${(1 - p) * 0.7 * r.k * F})`; g.lineWidth = 26 * (1 - p) + 1;
      heartPath(g, HS + 1400 * eOutExpo(p), CX, BY); g.stroke();
    }
    g.lineCap = 'round';
    for (const p of sparks) {
      if (!lebt(p)) continue;
      const x = p.ox + (p.x - p.ox) * a, y = p.oy + (p.y - p.oy) * a;
      const vx = p.ovx + (p.vx - p.ovx) * a, vy = p.ovy + (p.vy - p.ovy) * a;
      g.strokeStyle = p.col; g.globalAlpha = clamp(1 - (p.life - 1 + a) / p.max) * F; g.lineWidth = p.w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - vx * 2, y - vy * 2); g.stroke();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

    if (MIX) neonFrame(g, t, F, pb, rf);
    // Schatten am Boden
    const pose = heartPose(t);
    const groundY = BY + HS * 0.46;
    const hgt = clamp(-pose.y / 600);
    g.save(); g.globalAlpha = 0.45 * appear * F * (1 - 0.6 * hgt);
    gr = g.createRadialGradient(CX, groundY, 0, CX, groundY, HS * 0.42 * (1 - 0.4 * hgt));
    gr.addColorStop(0, 'rgba(30,0,5,0.9)'); gr.addColorStop(1, 'rgba(30,0,5,0)');
    g.fillStyle = gr; g.translate(CX, groundY); g.scale(1, 0.18); g.translate(-CX, -groundY); g.beginPath(); g.arc(CX, groundY, HS * 0.45, 0, 7); g.fill(); g.restore();

    // Herzchen-Konfetti hinter der Figur
    for (const p of hearts) {
      if (!lebt(p)) continue;
      const x = p.ox + (p.x - p.ox) * a, y = p.oy + (p.y - p.oy) * a, rot = p.orot + (p.rot - p.orot) * a;
      g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = Math.min(1, clamp(1 - (p.life - 1 + a) / p.max) * 1.6) * F;
      const sp = ebenen.konfetti[p.gold ? 1 : 0];
      if (sp) setze(g, sp, 0, 0, p.s / 56); else shinyHeart(g, p.s, p.gold ? GOLD_COLS : CORAL_COLS);
      g.restore();
    }
    g.globalAlpha = 1;

    // Figur (Füße = Boden, damit die Stauchung „auf dem Boden" passiert)
    const sc = (t < T_OUT ? 1 : 1 - 0.85 * eInC(seg(t, T_OUT, DUR)));
    g.save(); g.translate(CX, groundY + pose.y); g.scale(pose.sx * sc, pose.sy * sc); g.translate(0, -HS * 0.46);
    g.globalAlpha = F;
    g.shadowColor = 'rgba(255,120,100,0.6)'; g.shadowBlur = 50 + 40 * (t >= T_BURST ? 1 - pb : seg(t, T_CHARGE, T_BURST));
    heartBuddy(g, HS, pose.flip, pose.mood, blinkAt(t));
    g.restore();
    // Angestrengt: Zittern-Linien
    if (pose.mood === 1) {
      const p = seg(t, T_CHARGE, T_BURST);
      g.save(); g.globalAlpha = F * clamp(p * 3); g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
      for (const sxn of [-1, 1]) for (let i = 0; i < 3; i++) {
        const an = (-0.5 + i * 0.5) * 0.6, r0 = HS * 0.62, r1 = r0 + 30 + 20 * Math.sin(t * 40 + i);
        const bx = CX + sxn * Math.cos(an) * r0, by = BY + Math.sin(an) * r0;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(CX + sxn * Math.cos(an) * r1, BY + Math.sin(an) * r1); g.stroke();
      }
      g.restore();
    }
    // Funkelsterne
    for (const p of stars) {
      if (!lebt(p)) continue;
      g.globalAlpha = Math.sin(Math.PI * clamp((p.life - 1 + a) / p.max)) * F; g.fillStyle = p.col; star4(g, p.x, p.y, p.r, p.rot);
    }
    g.globalAlpha = 1;

    // Blitz
    if (pb > 0 && pb < 1) {
      g.globalCompositeOperation = 'lighter';
      gr = g.createRadialGradient(CX, BY, 0, CX, BY, 700); gr.addColorStop(0, `rgba(255,240,225,${(1 - eOutC(seg(t, T_BURST, T_BURST + 0.3))) * 0.9})`); gr.addColorStop(1, 'rgba(255,200,170,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    }

    // Stufen-Pille
    const pa = eOutBack(seg(t, 0.55, 0.95));
    if (pa > 0) { g.save(); g.globalAlpha = clamp(pa) * F; g.translate(CX, 1050); g.scale(pa, pa); pill(g, t); g.restore(); }

    // „LEVEL UP!"
    const pt = seg(t, T_BURST + 0.1, T_BURST + 0.45);
    if (pt > 0) {
      const TY = 1210, ts = (1 + 1.2 * (1 - eOutC(pt))) * (1 + 0.08 * eInC(seg(t, T_OUT, DUR)));
      const ta = clamp(pt * 3) * F;
      g.save(); g.globalAlpha = ta; g.translate(CX, TY); g.scale(ts, ts); g.rotate(-0.04 * (1 - eOutC(pt)));
      titelSetup(g);
      if (MIX) {
        const fl2 = (t > T_BURST + 0.55 && t < T_BURST + 0.66) ? 0.4 : 1;
        g.globalCompositeOperation = 'lighter';
        if (ebenen.titelChroma && ebenen.titelGlow) { setze(g, ebenen.titelChroma, 0, 0); g.globalAlpha = ta * fl2; setze(g, ebenen.titelGlow, 0, 0); }
        else { titelChroma(g); titelGlow(g, ta, fl2); }
      } else if (ebenen.titel) setze(g, ebenen.titel, 0, 0);
      else titelWarm(g);
      g.restore();
    }

    // TEAM-LEVEL- bzw. GESCHENKE-STUFE-Zeile
    const pl = eOutC(seg(t, T_BURST + 0.35, T_BURST + 0.75));
    if (pl > 0) {
      g.save(); g.globalAlpha = pl * F; g.translate(CX, 1318 + 30 * (1 - pl));
      if (ebenen.unter) setze(g, ebenen.unter, 0, 0); else unterLive(g);
      g.restore();
    }

    // Großes Profilbild
    const pa2 = eOutBack(seg(t, T_BURST + 0.5, T_BURST + 0.95), 2.2);
    if (pa2 > 0) {
      const r = R_AV;
      g.save(); g.globalAlpha = clamp(pa2) * F; g.translate(CX, 1500); g.scale(pa2, pa2);
      // Leuchtring (blendet mit F aus — siehe Kopfkommentar)
      if (ebenen.ring) { if (MIX) setzeHell(g, ebenen.ring, 0, 0, 1, clamp(pa2) * F); else setze(g, ebenen.ring, 0, 0); }
      else ringLive(g, MIX ? clamp(pa2) * F : 1);
      // drehender Glanz um den Ring
      g.save(); g.rotate(t * 2.2); g.globalCompositeOperation = 'lighter';
      const cg = g.createConicGradient(0, 0, 0); cg.addColorStop(0, 'rgba(255,255,255,0.9)'); cg.addColorStop(0.12, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = cg; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, r + 9, 0, 7); g.stroke(); g.restore();
      zeichneAvatar(g, bild, r, S.avatarVerlaufTT, d.initiale, 120, true);
      // Kachel unten rechts: Teamherz = Herz + Stufe, Gifter = Stufen-Plakette
      g.save(); g.translate(r * 0.62, r * 0.7);
      if (ebenen.kachel) setze(g, ebenen.kachel, 0, 0); else kachel(g, NEW, S, heartPath);
      g.restore();
      g.restore();
    }

    // Name darunter
    const pn = eOutC(seg(t, T_BURST + 0.75, T_BURST + 1.1));
    if (pn > 0) {
      g.save(); g.globalAlpha = pn * F; g.translate(CX, 1690 + 25 * (1 - pn));
      if (ebenen.name) setze(g, ebenen.name, 0, 0); else nameLive(g, ebenen.nameMass);
      g.restore();
    }
  }

  return { dauer: DUR, zuruecksetzen, schritt, zeichne, vergissText: () => { ebenen = null; } };
}

// -------------------------------------------------------------- Renderer ---

const STILE = {
  'lvl-herzschlag': (d, S, b) => stilKlassik(1, d, S, b),
  'lvl-goldherz': (d, S, b) => stilKlassik(2, d, S, b),
  'lvl-neon': (d, S, b) => stilKlassik(3, d, S, b),
  'lvl-tiktok': (d, S, b) => stilTikTok(false, d, S, b),
  'lvl-tiktok-neon': (d, S, b) => stilTikTok(true, d, S, b),
};

const ganz = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(9999, Math.round(n))) : null; };

/** Ereignis-Daten auf sichere Werte bringen (TikTok lässt Felder weg). */
function normalisiere(daten) {
  const dd = daten && typeof daten === 'object' ? daten : {};
  const name = String(dd.name ?? '').replace(/\s+/g, ' ').trim();
  let neu = ganz(dd.neu), alt = ganz(dd.alt);
  if (neu === null) neu = alt !== null ? alt + 1 : 1;
  if (alt === null) alt = Math.max(0, neu - 1);
  return { name, initiale: initiale(name), alt, neu, gifter: dd.art === 'gifter', bild: typeof dd.bild === 'string' ? dd.bild : '' };
}

/** Profilbild laden (ohne crossOrigin: nur zeichnen, nie auslesen). */
function ladeBild(url) {
  let img = null, ok = false;
  if (url && typeof Image !== 'undefined') {
    try {
      img = new Image();
      img.onload = () => { ok = (img.naturalWidth || img.width) > 0; };
      img.onerror = () => { ok = false; };
      img.src = url;
    } catch { img = null; }
  }
  return {
    bereit: () => (ok && img ? img : null),
    weg: () => { if (img) { img.onload = null; img.onerror = null; try { img.src = ''; } catch { /* egal */ } } img = null; ok = false; },
  };
}

/**
 * Renderer für eine Animation.
 * @param {string} id   Schlüssel aus ANIMATIONEN
 * @param {{name?:string,bild?:string,alt?:number,neu?:number,coins?:number,art?:'team'|'gifter',unterzeile?:string}} daten
 * @returns {{dauer:number, zeichne(ctx:CanvasRenderingContext2D,t:number,w:number,h:number):void, destroy():void}}
 */
export function erzeugeRenderer(id, daten) {
  const fabrik = STILE[id];
  if (!fabrik) throw new Error(`Unbekannte Alarm-Animation: ${id}`);
  const d = normalisiere(daten);
  const bild = ladeBild(d.bild);
  const stil = fabrik(d, schema(d.gifter), bild);
  const N = Math.round(stil.dauer * FPS);
  let simBild = -1, zerstoert = false, schriftStand = schriftBereit();
  stil.zuruecksetzen();

  /** Partikel bis Bild `ziel` (Vorgriff um eins, für die Interpolation). */
  function simuliere(ziel) {
    if (ziel < simBild) { stil.zuruecksetzen(); simBild = -1; }
    while (simBild < ziel) { simBild++; stil.schritt(simBild / FPS, simBild); }
  }

  return {
    dauer: stil.dauer,
    zeichne(ctx, t, w, h) {
      if (zerstoert || !ctx || !(w > 0) || !(h > 0)) return;
      t = clamp(Number(t) || 0, 0, stil.dauer);
      const bildNr = Math.min(N, Math.floor(t * FPS + 1e-6));
      const ziel = Math.min(N, bildNr + 1);
      simuliere(ziel);
      const a = clamp(t * FPS - (ziel - 1));
      // Schrift kam nach dem Vorbacken → Textebenen neu backen.
      const sb = schriftBereit();
      if (sb !== schriftStand) { schriftStand = sb; stil.vergissText(); }
      const rf = prng(0x9E3779B1 ^ Math.imul(bildNr + 1, 2654435761));
      const k = Math.min(w / W, h / H);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.setTransform(k, 0, 0, k, (w - W * k) / 2, (h - H * k) / 2);
      try {
        stil.zeichne(ctx, t, a, rf, ziel);
      } finally {
        ctx.restore();
      }
    },
    destroy() {
      zerstoert = true;
      bild.weg();
      stil.vergissText();
    },
  };
}
