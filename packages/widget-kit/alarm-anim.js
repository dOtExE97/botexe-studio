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
 *
 * Felder von `daten` (erzeugeRenderer) — alle optional, Fehlendes wird abgefangen:
 *   name        Anzeigename (alle)
 *   bild        Profilbild-URL (alle; fehlt/lädt nicht → Initiale)
 *   art         'team' | 'gifter' — Farbschema der Level-Up-Stile (Gifter: Gold/Blau)
 *   alt, neu    Stufen. Level-Up: Rolle alt → neu (alt fehlt → neu−1).
 *   stufe       vip-gold: Geschenke-Stufe („GESCHENKE-STUFE {stufe}"; fehlt → neu, fehlt auch das →
 *               „WILLKOMMEN, VIP")
 *   titel       superfan-premium, vip-gold, truhe-premium, ziel-erreicht: ersetzt den Titel
 *               („SUPERFAN" / „VIP IST DA" / „SCHATZTRUHE!" / „ZIEL ERREICHT!"), Großbuchstaben
 *   neuAbo      superfan-premium: nur bei === true steht „NEUER" über „SUPERFAN"
 *   unterzeile  superfan-premium (Standard „WILLKOMMEN IM SUPERFAN-CLUB", vom Alarm z. B.
 *               „SUPERFAN VERLÄNGERT" / „SUPERFAN IST DA"), truhe-premium (Standard
 *               „COINS ZUM SCHNAPPEN", Superfan-Truhe „SUPERFAN-TRUHE"), vip-gold (ersetzt die
 *               Stufen-Zeile), ziel-erreicht (Geschenkname bzw. Beschreibung; gekürzt auf
 *               28 Zeichen + „…", Großbuchstaben; fehlt → „LIVE-ZIEL")
 *   coins       truhe-premium: Zähler-Endstand (fehlt, null oder '' → Zähler ausgeblendet)
 *   fortschritt, ziel   ziel-erreicht: Pille „{fortschritt}/{ziel}" (fortschritt fehlt → ziel/ziel;
 *               ziel fehlt → nur fortschritt; beides fehlt → „✓")
 */
export const ANIMATIONEN = {
  'lvl-herzschlag': { label: 'Herzschlag', fuer: ['level_team', 'level_gifter'], dauer: 5.6, sound: 'botexe-levelup-herzschlag.wav' },
  'lvl-goldherz': { label: 'Goldherz mit Flügeln', fuer: ['level_team', 'level_gifter'], dauer: 5.6, sound: 'botexe-levelup-goldherz.wav' },
  'lvl-neon': { label: 'Neon', fuer: ['level_team', 'level_gifter'], dauer: 5.6, sound: 'botexe-levelup-neon.wav' },
  'lvl-tiktok': { label: 'TikTok-Stil', fuer: ['level_team', 'level_gifter'], dauer: 5.8, sound: 'botexe-levelup-tiktok.wav' },
  'lvl-tiktok-neon': { label: 'TikTok-Neon', fuer: ['level_team', 'level_gifter'], dauer: 5.8, sound: 'botexe-levelup-tiktok-neon.wav' },
  'superfan-premium': { label: 'Superfan Premium', fuer: ['superfan', 'superfan_betritt', 'vip'], dauer: 7.6, sound: 'botexe-superfan.wav' },
  'vip-gold': { label: 'VIP Gold', fuer: ['vip'], dauer: 7.6, sound: 'botexe-superfan.wav' },
  'truhe-premium': { label: 'Schatztruhe Premium', fuer: ['truhe'], dauer: 6.8, sound: 'botexe-truhe.wav' },
  'ziel-erreicht': { label: 'Ziel erreicht', fuer: ['ziel'], dauer: 5.8, sound: 'botexe-levelup-tiktok-neon.wav' },
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

function star4(ctx, x, y, r, rot, innen = 0.28) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * innen : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
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
// Erst wahr, wenn BxInter wirklich geladen und registriert ist. NICHT über
// document.fonts.check() prüfen: das meldet für eine nie registrierte Familie
// ebenfalls „bereit" (CSS Font Loading: nichts zu laden = fertig) — die
// vorgebackenen Textebenen blieben dann für immer in der Ersatzschrift.
let schriftGeladen = false;
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
    .then((f) => { document.fonts.add(f); schriftGeladen = true; })
    .catch(() => { schriftVersprechen = null; });
  return schriftVersprechen;
}
function schriftBereit() {
  return schriftGeladen;
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
/** Vorgebackene Ebenen freigeben: Größe 0 gibt den Pixelspeicher sofort zurück. */
function freigeben(ebenen) {
  if (!ebenen) return;
  for (const v of Object.values(ebenen)) {
    const liste = v instanceof Map ? [...v.values()] : Array.isArray(v) ? v : [v];
    for (const sp of liste) {
      if (sp && sp.c) { try { sp.c.width = 0; sp.c.height = 0; } catch { /* egal */ } }
    }
  }
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

  return { dauer: DUR, zuruecksetzen, schritt, zeichne, vergissText: () => { freigeben(ebenen); freigeben({ zahlCache }); ebenen = null; zahlCache.clear(); } };
}

// ------------------------------------------ Level-Up V4/V5 (TikTok-Stil) ---

/** Häkchen-Kachel am Profilbild (Ziel erreicht). */
function haekchenKachel(ctx) {
  const kg = ctx.createLinearGradient(0, -36, 0, 36); kg.addColorStop(0, '#5cf0a0'); kg.addColorStop(1, '#14a85c');
  ctx.fillStyle = kg; ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-46, -36, 92, 72, 22); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-20, 1); ctx.lineTo(-5, 16); ctx.lineTo(21, -14); ctx.stroke();
}

/** Text auf höchstens `max` Zeichen (Graphem-sicher) + „…", in Großbuchstaben. */
function kuerze(text, max = 28) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('de-DE');
  const zeichen = Array.from(s);
  return zeichen.length > max ? zeichen.slice(0, max).join('').trimEnd() + '…' : s;
}

// modus 'level' = Level-Up (Stufenrolle 11 → 12), 'ziel' = LIVE-Ziel erreicht
// (Titel „ZIEL ERREICHT!", Pille fortschritt/ziel, Häkchen-Kachel).
function stilTikTok(MIX, d, S, bild, modus = 'level') {
  const ZIEL = modus === 'ziel';
  const DUR = 5.8, CX = 540, BY = 700, HS = 470;
  const T_LAND = 0.75, T_CHARGE = 1.1, T_BURST = 1.9, T_JUMP = 0.62, T_OUT = 4.95;
  const CORAL = ['#ff6b5e', '#ff8a7a', '#ff4b4b', '#ffb3a7'];
  const GOLDS = ['#ffe8a3', '#ffd26a', '#ffffff', '#ffc14d'];
  const CORAL_COLS = ['#ffb8a8', '#ff6a5c', '#e8343f', '#a3172a'];
  const GOLD_COLS = ['#fff5cf', '#ffd46e', '#d9952a', '#8a5310'];
  const OLD = d.alt, NEW = d.neu, NAME = d.name;
  const TITEL = ZIEL ? (d.titel || 'ZIEL ERREICHT!') : 'LEVEL UP!';
  const UNTER = ZIEL ? (kuerze(d.unterzeile) || 'LIVE-ZIEL')
    : S.gifter ? `GESCHENKE-STUFE ${OLD} → ${NEW}` : `TEAM-LEVEL ${OLD} → ${NEW}`;
  // Ziel-Pille: „fortschritt/ziel" (ohne Zielwert nur der Stand, ohne beides ein Häkchen).
  const PILLE_TEXT = !ZIEL ? '' : d.ziel !== null ? `${d.fortschritt ?? d.ziel}/${d.ziel}` : d.fortschritt !== null ? String(d.fortschritt) : '✓';
  const heartPath = (ctx, s, ox = 0, oy = 0) => polyPfad(ctx, HP_TIKTOK, s, ox, oy);
  // Pillenbreite: 330 wie in der Probe; der Ziel-Bruch bekommt bei Bedarf mehr Platz.
  let PILLE_W = 330;
  if (ZIEL) { const m = leinwand(4, 4)?.x; if (m) { m.letterSpacing = '0px'; m.font = fnt(96); PILLE_W = Math.min(720, Math.max(330, Math.ceil(m.measureText(PILLE_TEXT).width) + 190)); } }
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
    e.pille = backe(PILLE_W + 120, 132 + 130, (x) => pillGrund(x, PILLE_W, 132));
    e.unter = backe(1140, 170, unterLive);
    const mx = leinwand(4, 4)?.x;
    e.nameMass = mx ? nameMass(mx) : { font: 64, tw: NAME.length * 34 };
    e.name = backe(e.nameMass.tw + 160, 160, (x) => nameLive(x, e.nameMass));
    e.ring = backe(2 * (R_AV + 10 + NEON_RAND(0.55)), 2 * (R_AV + 10 + NEON_RAND(0.55)), (x) => ringLive(x, 1));
    e.kachel = backe(140, 100, (x) => (ZIEL ? haekchenKachel(x) : kachel(x, NEW, S, heartPath)));
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
    const h = 132, w = PILLE_W;
    g.save();
    const pop = t >= T_BURST + 0.15 ? 1 + 0.25 * Math.exp(-(t - T_BURST - 0.15) * 7) * Math.cos((t - T_BURST - 0.15) * 18) : 1;
    g.scale(pop, pop);
    if (ebenen.pille) setze(g, ebenen.pille, 0, 0); else pillGrund(g, w, h);
    g.save(); g.beginPath(); g.rect(-w / 2 + 125, -h / 2 + 6, w - 140, h - 12); g.clip();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = S.zahl; g.letterSpacing = '0px';
    if (ZIEL) {
      // Text mittig im Feld rechts vom Herz (Feld: -w/2+135 … w/2-20), nie unter das Herz.
      g.font = fnt(passendeGroesse(g, PILLE_TEXT, 96, w - 175));
      g.fillText(PILLE_TEXT, 57.5, 6);
      g.restore(); g.restore();
      return;
    }
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
      if (ebenen.kachel) setze(g, ebenen.kachel, 0, 0); else if (ZIEL) haekchenKachel(g); else kachel(g, NEW, S, heartPath);
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

  return { dauer: DUR, zuruecksetzen, schritt, zeichne, vergissText: () => { freigeben(ebenen); ebenen = null; } };
}

// -------------------------- Superfan / VIP / Schatztruhe (Premium-Alarme) ---
// Probe: docs/superpowers/specs/2026-11-10-proben/superfan-truhe.html (?typ=superfan|truhe).
// VIP = Superfan-Renderer im Gold-Schema (Gold/Bernstein statt Violett).

const PAL_V = ['#fbf2ff', '#e2b8ff', '#c07bff', '#9a3dff', '#6f19d6', '#46089a', '#24044f'];
const PAL_R = ['#fff0f0', '#ffb3b8', '#ff5a6a', '#e0162f', '#a3071c', '#62020e', '#3a0108'];
const PAL_E = ['#effff4', '#a8f5c4', '#38d97a', '#10a352', '#067034', '#03421f', '#022612'];
const PAL_B = ['#eef6ff', '#a9d0ff', '#4f9dff', '#1c62e0', '#0b3ea3', '#062466', '#03143a'];
const PAL_G = ['#fffbe8', '#ffe7a3', '#ffc34d', '#ff9d1a', '#e06a00', '#9a4200', '#4f2000']; // VIP: golden-orange
const lerp = (a, b, k) => a + (b - a) * k;

function glint(ctx, x, y, r, a) {
  if (a <= 0.01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 0.9); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; star4(ctx, x, y, r, 0, 0.22); ctx.restore();
}
// Brillant im Seitenschnitt, Facetten funkeln mit der Zeit
function gem(ctx, a, pal, t, ph = 0) {
  const hc = 0.42 * a, hp = 0.95 * a, tb = 0.55 * a;
  ctx.save(); ctx.translate(0, -0.265 * a);
  const T = [], G = []; for (let i = 0; i <= 4; i++) { T.push([-tb + 2 * tb * i / 4, -hc]); G.push([-a + 2 * a * i / 4, 0]); }
  const C = [0, hp];
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = Math.max(1, a * 0.014);
  let k = 0;
  const tri = (p, q, r) => {
    const b = 0.5 + 0.5 * Math.sin(t * 2.4 + k * 1.93 + ph);
    const idx = clamp(Math.round((1 - b) * (pal.length - 3)) + (k % 3 === 0 ? 0 : 1) + (p[1] > 0.3 * a ? 1 : 0), 0, pal.length - 1);
    ctx.fillStyle = pal[idx]; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(r[0], r[1]); ctx.closePath(); ctx.fill(); ctx.stroke(); k++;
  };
  for (let i = 0; i < 4; i++) { tri(T[i], T[i + 1], G[i + 1]); tri(T[i], G[i + 1], G[i]); }
  for (let i = 0; i < 4; i++) { const m = [(G[i][0] + G[i + 1][0]) / 2 * 0.45, hp * 0.55]; tri(G[i], G[i + 1], m); tri(G[i], m, C); tri(G[i + 1], m, C); }
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1.5, a * 0.025);
  ctx.beginPath(); ctx.moveTo(T[0][0], T[0][1]); ctx.lineTo(T[4][0], T[4][1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(30,0,40,0.55)'; ctx.lineWidth = Math.max(1.5, a * 0.03);
  ctx.beginPath(); ctx.moveTo(T[0][0], T[0][1]); ctx.lineTo(T[4][0], T[4][1]); ctx.lineTo(G[4][0], 0); ctx.lineTo(0, hp); ctx.lineTo(G[0][0], 0); ctx.closePath(); ctx.stroke();
  const gl = [[T[1][0], T[1][1]], [G[3][0] * 0.7, 0.12 * a], [-0.2 * a, 0.45 * a], [T[3][0], T[3][1]]];
  gl.forEach((p, j) => glint(ctx, p[0], p[1], a * 0.32, Math.pow(Math.max(0, Math.sin(t * 1.6 + j * 2.3 + ph)), 10)));
  ctx.restore();
}
/** Münz-Verlauf in Einheitsgröße (−0,5…0,5), je Kontext und Seite nur EINMAL gebaut —
 *  der Münzhaufen zeichnet bis zu 95 Münzen je Bild. Skaliert wird beim Füllen. */
const muenzVerlauf = new WeakMap();
function muenzGr(ctx, back) {
  let v = muenzVerlauf.get(ctx);
  if (!v) {
    const bau = (mitte) => { const gr = ctx.createLinearGradient(-0.5, -0.5, 0.5, 0.5); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.35, mitte); gr.addColorStop(0.7, '#d9952a'); gr.addColorStop(1, '#8a5310'); return gr; };
    v = { vorn: bau('#ffd56b'), hinten: bau('#e8a93a') };
    muenzVerlauf.set(ctx, v);
  }
  return back ? v.hinten : v.vorn;
}
function muenze(ctx, s, ph) {
  const k = Math.cos(ph), back = k < 0; ctx.save(); ctx.scale(Math.max(0.1, Math.abs(k)), 1);
  ctx.fillStyle = '#8a5310'; ctx.beginPath(); ctx.arc(0.05 * s * Math.sign(k || 1), 0, s / 2, 0, 7); ctx.fill();
  ctx.save(); ctx.scale(s, s); ctx.fillStyle = muenzGr(ctx, back); ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, 7); ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(122,74,8,0.8)'; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.arc(0, 0, s * 0.37, 0, 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,220,0.7)'; ctx.lineWidth = s * 0.025; ctx.beginPath(); ctx.arc(0, 0, s * 0.47, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  ctx.fillStyle = back ? 'rgba(122,74,8,0.55)' : 'rgba(255,250,225,0.9)'; star4(ctx, 0, 0, s * 0.24, 0, 0.22);
  ctx.restore();
}
function goldConic(ctx, x, y, rot) {
  const cg = ctx.createConicGradient(rot, x, y);
  const st = ['#fff6d0', '#c8861c', '#ffe08a', '#7a4a08', '#fff1b8', '#b97a17', '#ffe9a8', '#8a5310', '#fff6d0'];
  st.forEach((s, i) => cg.addColorStop(i / (st.length - 1), s)); return cg;
}
function goldLin(ctx, x0, y0, x1, y1) {
  const gr = ctx.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.3, '#ffd56b'); gr.addColorStop(0.55, '#b9771a'); gr.addColorStop(0.75, '#ffe08a'); gr.addColorStop(1, '#7a4a08'); return gr;
}
function strahlen(g, cx, cy, n, len, rot, rgb, I, wd = 0.07) {
  if (I <= 0.005) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.translate(cx, cy); g.rotate(rot);
  for (let i = 0; i < n; i++) {
    g.rotate(Math.PI * 2 / n); const L = len * (0.75 + 0.25 * ((i * 7) % 5) / 4), w = wd * (0.6 + 0.8 * ((i * 3) % 4) / 3);
    const gr = g.createRadialGradient(0, 0, 40, 0, 0, L); gr.addColorStop(0, `rgba(${rgb},${0.5 * I})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, L, -w, w); g.closePath(); g.fill();
  }
  g.restore();
}
/** Chromgold-Schrift in eine 1080×420-Ebene (Glanzstreifen per source-atop). */
function chromeText(o, text, size, shine, ls = 2, maxW = 990) {
  o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, 1080, 420);
  o.letterSpacing = ls + 'px'; o.font = fnt(size);
  const tw = o.measureText(text).width; if (tw > maxW) { size = Math.floor(size * maxW / tw); o.font = fnt(size); }
  o.textAlign = 'center'; o.textBaseline = 'middle'; o.lineJoin = 'round';
  const y0 = 210, h = size / 2;
  o.lineWidth = size * 0.17; o.strokeStyle = '#1e0b00'; o.strokeText(text, 540, y0 + size * 0.05);
  let gr = o.createLinearGradient(0, y0 - h, 0, y0 + h); gr.addColorStop(0, '#ffe9a6'); gr.addColorStop(0.5, '#a8650f'); gr.addColorStop(1, '#4a2803');
  o.lineWidth = size * 0.1; o.strokeStyle = gr; o.strokeText(text, 540, y0);
  gr = o.createLinearGradient(0, y0 - h * 0.8, 0, y0 + h * 0.8);
  [[0, '#fffbe8'], [0.28, '#ffe08a'], [0.47, '#d4952a'], [0.5, '#7a4a08'], [0.54, '#eab84e'], [0.78, '#fff1b8'], [1, '#c98a1e']].forEach(([p, s]) => gr.addColorStop(p, s));
  o.fillStyle = gr; o.fillText(text, 540, y0);
  if (shine > 0 && shine < 1) {
    o.globalCompositeOperation = 'source-atop';
    const sx = -250 + shine * 1580;
    const sg = o.createLinearGradient(sx - 140, 0, sx + 140, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    o.save(); o.transform(1, 0, -0.45, 1, 95, 0); o.fillStyle = sg; o.fillRect(-400, 0, 1900, 420); o.restore();
    o.globalCompositeOperation = 'source-over';
  }
}
function shakeAt(t, list) {
  let x = 0, y = 0;
  for (const [t0, amp] of list) { if (t < t0) continue; const dd = t - t0, e = amp * Math.exp(-dd * 7); x += e * Math.sin(dd * 71 + t0); y += e * Math.cos(dd * 59 + 2 * t0); }
  return [x, y];
}

function farbenPremium(typ) {
  if (typ === 'superfan') {
    return {
      implo: ['#c77dff', '#ffd56b', '#ffffff', '#9a3dff', '#ffe9a8'], kern: ['200,120,255', '120,40,255'], blitzLinie: '#b14dff',
      strahl: '190,110,255', welle: '190,110,255', hinter: ['170,80,255', '120,40,255'], scheibe: ['#7b2fd6', '#3b0b85', '#14022e'],
      facette: 'rgba(200,140,255,0.08)', steinGlow: 'rgba(200,120,255,0.9)', stein: PAL_V,
      funken: ['#ffd56b', '#fff6d0', '#c77dff', '#ffffff', '#9a3dff'], steine: [PAL_V, PAL_V, PAL_B, PAL_R],
      konfetti: ['#ffd56b', '#fff1b8', '#d9952a', '#b14dff', '#ffe9a8'], funkeln: ['#fff', '#ffe9a8', '#e2b8ff'],
      dunkel: '10,2,22', flash: ['245,225,255', '180,100,255'], chromGlow: '#a640ff', textGlow: '#b14dff',
      avatarGlow: 'rgba(170,80,255,0.9)', schild: 'rgba(22,6,40,0.82)', nameGlow: '#b14dff',
    };
  }
  if (typ === 'vip') {
    return {
      implo: ['#ffb627', '#ffd56b', '#ffffff', '#ff8a00', '#ffe9a8'], kern: ['255,190,90', '255,140,20'], blitzLinie: '#ff9d00',
      strahl: '255,170,60', welle: '255,170,60', hinter: ['255,170,50', '255,120,0'], scheibe: ['#c26a12', '#6e3204', '#2a1000'],
      facette: 'rgba(255,200,120,0.08)', steinGlow: 'rgba(255,170,60,0.9)', stein: PAL_G,
      funken: ['#ffd56b', '#fff6d0', '#ffb627', '#ffffff', '#ff8a00'], steine: [PAL_G, PAL_G, PAL_B, PAL_R],
      konfetti: ['#ffd56b', '#fff1b8', '#d9952a', '#ff9d00', '#ffe9a8'], funkeln: ['#fff', '#ffe9a8', '#ffd9a0'],
      dunkel: '22,10,2', flash: ['255,240,215', '255,170,60'], chromGlow: '#ff8a00', textGlow: '#ff9d00',
      avatarGlow: 'rgba(255,170,40,0.9)', schild: 'rgba(34,14,4,0.82)', nameGlow: '#ff9d00',
    };
  }
  return { chromGlow: '#ff8a00', textGlow: '#ff8a00', avatarGlow: 'rgba(255,170,40,0.9)', schild: 'rgba(34,14,4,0.82)', nameGlow: '#ff9d00', stein: PAL_V };
}

function stilPremium(typ, d, bild) {
  const SF = typ !== 'truhe', VIP = typ === 'vip';
  const DUR = SF ? 7.6 : 6.8;
  const C = farbenPremium(typ);
  const CX = 540;
  const NAME = d.name;
  const KOPF = typ === 'superfan' && d.neuAbo ? 'NEUER' : '';
  const TITEL = d.titel || (VIP ? 'VIP IST DA' : SF ? 'SUPERFAN' : 'SCHATZTRUHE!');
  const vipStufe = d.stufe ?? (d.neuBekannt ? d.neu : null);
  const UNTER = d.unterzeile ? kuerze(d.unterzeile, 40)
    : VIP ? (vipStufe !== null ? `GESCHENKE-STUFE ${vipStufe}` : 'WILLKOMMEN, VIP')
      : SF ? 'WILLKOMMEN IM SUPERFAN-CLUB' : 'COINS ZUM SCHNAPPEN';
  const COINS = d.coins; // null → Zähler ausblenden

  // Superfan-Zeitachse
  const MY = 600, MR = 215;
  const SF_B = 1.4, SF_CROWN = 2.05, SF_TITLE = 2.35, SF_OUT = 6.7;
  // Truhen-Zeitachse und Maße
  const GY = 1000, TW = 640, HB = 300, TD = 300, TR = TD / 2, PZ = 0.0007, KY = 0.35;
  const TB = 1.65, T_LAND = 0.55, TT_TITLE = TB + 0.3, T_OUTT = 5.95;
  const PY = (y, z) => -y + KY * (z - TD / 2);
  const WOOD_LO = [40, 15, 4], WOOD_HI = [156, 80, 36], GOLD_LO = [96, 54, 6], GOLD_HI = [255, 222, 130], IN_LO = [22, 8, 2];
  const rgbS = (a, b, k) => `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;

  // ---- Zufall + Partikel (Reihenfolge der Zufallszüge wie in der Probe) ----
  let rnd, R, pick, P, implo, grain, heap;
  function zuruecksetzen() {
    rnd = prng(4242); ({ R, pick } = zufall(rnd));
    P = []; implo = [];
    if (SF) for (let i = 0; i < 150; i++) implo.push({ a: R(0, 6.283), r0: R(650, 1150), d: R(0.15, 0.75), col: pick(C.implo), w: R(2, 5) });
    grain = []; for (let p = 0; p < 3; p++) for (let i = 0; i < 6; i++) grain.push({ p, y: R(0.12, 0.88), a: R(1.5, 5), f: R(0.006, 0.02), ph: R(0, 6), dark: rnd() < 0.7 });
    heap = []; for (let i = 0; i < 70; i++) { const v = Math.pow(rnd(), 0.8), u = R(-1, 1); heap.push({ u, v, rot: R(-0.5, 0.5), gem: rnd() < 0.12 ? pick([PAL_R, PAL_E, PAL_B, PAL_V]) : null }); }
    heap.sort((a, b) => a.v - b.v);
  }
  function stepSuperfan(t, fi) {
    const neu = (p) => { p.n = fi; P.push(p); };
    if (fi === Math.round(SF_B * FPS)) {
      for (let i = 0; i < 260; i++) { const a = R(0, 6.283), sp = Math.pow(rnd(), 0.6) * 34 + 8; neu({ kind: 'spark', x: CX + Math.cos(a) * 40, y: MY + Math.sin(a) * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.93, grav: 0.3, life: 0, max: R(40, 85), col: pick(C.funken), w: R(2, 6), layer: 1 }); }
      for (let i = 0; i < 26; i++) { const a = R(0, 6.283), sp = R(10, 26); neu({ kind: 'gem', x: CX, y: MY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, drag: 0.96, grav: 0.45, rot: R(-1, 1), vr: R(-0.12, 0.12), s: R(16, 30), pal: pick(C.steine), ph: R(0, 6), life: 0, max: R(70, 110), layer: 1 }); }
    }
    if (fi === Math.round(SF_TITLE * FPS)) for (let i = 0; i < 90; i++) { const a = R(0, 6.283), sp = R(8, 26); neu({ kind: 'spark', x: CX + R(-300, 300), y: 1100, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, drag: 0.92, grav: 0.2, life: 0, max: R(25, 50), col: pick(['#ffd56b', '#fff6d0', '#ffffff']), w: R(2, 5), layer: 1 }); }
    if (t >= SF_B && t < SF_OUT) {
      for (let i = 0; i < 3; i++) neu({ kind: 'conf', x: R(0, W), y: R(-60, -20), vx: R(-1, 1), vy: R(5, 10), drag: 1, grav: 0.02, rot: R(0, 6), vr: R(-0.1, 0.1), s: R(10, 17), ph: R(0, 6), col: pick(C.konfetti), life: 0, max: 260, fade: 6, layer: 0 });
      if (rnd() < 0.8) neu({ kind: 'twinkle', x: R(60, W - 60), y: R(150, 1750), s: R(10, 26), rot: R(0, 1), col: pick(C.funkeln), life: 0, max: R(20, 40), layer: 1 });
    }
  }
  function stepTruhe(t, fi) {
    const neu = (p) => { p.n = fi; P.push(p); };
    if (fi === Math.round(T_LAND * FPS)) for (let i = 0; i < 46; i++) { const sx = rnd() < 0.5 ? -1 : 1; neu({ kind: 'dust', x: CX + sx * R(150, 360), y: GY + R(-20, 10), vx: sx * R(2, 9), vy: R(-3, 0), drag: 0.94, grav: 0, s: R(40, 90), rgb: pick(['140,110,90', '110,85,70', '170,140,110']), life: 0, max: R(30, 55), layer: 0, fade: 1.3 }); }
    if (fi === Math.round(TB * FPS)) {
      for (let i = 0; i < 95; i++) neu({ kind: 'coin', x: CX + R(-200, 200), y: GY - HB - 30, vx: R(-14, 14), vy: R(-46, -20), drag: 0.995, grav: 1.05, ph: R(0, 6.28), vph: R(0.15, 0.45), rot: R(-0.3, 0.3), s: R(34, 62), life: 0, max: R(80, 130), layer: 1 });
      for (let i = 0; i < 22; i++) neu({ kind: 'gem', x: CX + R(-150, 150), y: GY - HB - 30, vx: R(-11, 11), vy: R(-42, -22), drag: 0.995, grav: 1.0, rot: R(-1, 1), vr: R(-0.15, 0.15), s: R(18, 30), pal: pick([PAL_R, PAL_E, PAL_B, PAL_V]), ph: R(0, 6), life: 0, max: R(80, 120), layer: 1 });
      for (let i = 0; i < 160; i++) { const a = R(Math.PI * 1.05, Math.PI * 1.95), sp = Math.pow(rnd(), 0.6) * 30 + 8; neu({ kind: 'spark', x: CX + R(-150, 150), y: GY - HB - 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.93, grav: 0.35, life: 0, max: R(40, 80), col: pick(['#ffd56b', '#fff6d0', '#ffffff', '#ffb627']), w: R(2, 6), layer: 1 }); }
    }
    if (t > TB && t < T_OUTT) {
      for (let i = 0; i < 2; i++) neu({ kind: 'spark', x: CX + R(-250, 250), y: GY - HB - R(0, 40), vx: R(-1, 1), vy: R(-6, -2), drag: 0.98, grav: -0.02, life: 0, max: R(30, 60), col: pick(['#ffd56b', '#fff6d0']), w: R(2, 4), layer: 1 });
      if (rnd() < 0.7) neu({ kind: 'twinkle', x: R(80, W - 80), y: R(250, 1800), s: R(10, 24), rot: R(0, 1), col: pick(['#fff', '#ffe9a8', '#ffd56b']), life: 0, max: R(20, 40), layer: 1 });
    }
    if (t > T_LAND + 0.3 && t < TB && rnd() < 0.5) neu({ kind: 'spark', x: CX + R(-300, 300), y: GY - HB, vx: R(-2, 2), vy: R(-5, -2), drag: 0.97, grav: 0, life: 0, max: R(15, 30), col: '#ffd56b', w: R(1.5, 3), layer: 1 });
  }
  function schritt(t, i) {
    if (SF) stepSuperfan(t, i); else stepTruhe(t, i);
    for (const p of P) {
      p.ox = p.x; p.oy = p.y; p.ovx = p.vx; p.ovy = p.vy; p.orot = p.rot; p.oph = p.ph;
      p.life++;
      if (p.vx === undefined) continue; // Funkelsterne stehen still (siehe drawP)
      p.vx *= p.drag ?? 1; p.vy = p.vy * (p.drag ?? 1) + (p.grav ?? 0); p.x += p.vx; p.y += p.vy;
      if (p.vr) p.rot += p.vr; if (p.vph) p.ph += p.vph;
    }
    for (let k = P.length - 1; k >= 0; k--) if (P[k].life > P[k].max) P.splice(k, 1);
  }
  function drawP(g, F, layer, a, ziel) {
    for (const p of P) {
      if ((p.layer || 0) !== layer || p.n >= ziel || p.kind === 'twinkle') continue;
      const L = p.life - 1 + a, k = clamp(L / p.max), al = Math.min(1, (1 - k) * (p.fade ?? 2)) * F;
      if (al <= 0) continue;
      const x = p.ox + (p.x - p.ox) * a, y = p.oy + (p.y - p.oy) * a;
      const rot = p.rot === undefined ? 0 : p.orot + (p.rot - p.orot) * a;
      const ph = p.ph === undefined ? 0 : p.oph + (p.ph - p.oph) * a;
      g.save(); g.globalAlpha = al;
      if (p.kind === 'spark') {
        const vx = p.ovx + (p.vx - p.ovx) * a, vy = p.ovy + (p.vy - p.ovy) * a;
        g.globalCompositeOperation = 'lighter'; g.strokeStyle = p.col; g.lineWidth = p.w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - vx * 2.2, y - vy * 2.2); g.stroke();
      } else if (p.kind === 'coin') { g.translate(x, y); g.rotate(rot); muenze(g, p.s, ph); }
      else if (p.kind === 'gem') { g.translate(x, y); g.rotate(rot); gem(g, p.s, p.pal, L / 30, ph); }
      else if (p.kind === 'conf') { g.translate(x + Math.sin(L * 0.12 + ph) * 18, y); g.rotate(rot); g.scale(1, Math.cos(L * 0.2 + ph)); g.fillStyle = p.col; g.fillRect(-p.s / 2, -p.s * 0.9, p.s, p.s * 1.8); }
      // 'twinkle' wird bewusst NICHT gezeichnet: In der Probe hatten Funkelsterne keine
      // Geschwindigkeit, stepP machte ihre Position zu NaN — sie waren in den abgenommenen
      // Videos nie zu sehen. Erzeugt werden sie trotzdem (gleiche Zufallsfolge wie die Probe).
      else if (p.kind === 'dust') { const r = p.s * (0.4 + 1.2 * eOutC(k)); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${p.rgb},0.5)`); gr.addColorStop(1, `rgba(${p.rgb},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      g.restore();
    }
  }
  function lightning(g, rf, x0, y0, x1, y1, col, F) {
    const Rf = (a, b) => a + (b - a) * rf();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [lw, cc, al] of [[10, col, 0.3], [3, '#ffffff', 1]]) {
      g.strokeStyle = cc; g.globalAlpha = al * F; g.lineWidth = lw; g.shadowColor = col; g.shadowBlur = 20; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x0, y0);
      for (let j = 1; j <= 8; j++) { const f = j / 8; g.lineTo(x0 + (x1 - x0) * f + Rf(-26, 26) * (j < 8), y0 + (y1 - y0) * f + Rf(-26, 26) * (j < 8)); }
      g.stroke();
    }
    g.restore();
  }

  // ---- vorgebackene Ebenen: Titel (Chromgold mit Glow), Textzeilen, Namensschild ----
  let ebenen = null;
  function spacedLive(x, text, size, col, glow, ls) {
    x.font = fnt(size); x.letterSpacing = ls + 'px'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const tw = x.measureText(text).width; if (tw > 990) x.font = fnt(Math.floor(size * 990 / tw));
    x.shadowColor = glow; x.shadowBlur = 24; x.fillStyle = col; x.fillText(text, 0, 0);
  }
  function schildMass(x) {
    x.letterSpacing = '1px';
    const font = passendeGroesse(x, NAME, 62, 890); x.font = fnt(font);
    return { font, tw: x.measureText(NAME).width };
  }
  function schildLive(x, m) {
    x.font = fnt(m.font); x.letterSpacing = '1px'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = m.tw + 96, h = 104;
    x.fillStyle = C.schild; x.beginPath(); x.roundRect(-w / 2, -h / 2, w, h, 52); x.fill();
    x.strokeStyle = goldLin(x, -w / 2, -h / 2, w / 2, h / 2); x.lineWidth = 5; x.stroke();
    x.fillStyle = '#fff'; x.shadowColor = C.nameGlow; x.shadowBlur = 18; x.fillText(NAME, 0, 3);
  }
  function baueEbenen() {
    const e = { zeilen: new Map() };
    e.oc = leinwand(1080, 420);
    if (e.oc) {
      chromeText(e.oc.x, TITEL, SF ? 200 : 160, 0, SF ? 4 : 3);
      e.titel = backe(1080 + 180, 420 + 180, (x) => { x.shadowColor = C.chromGlow; x.shadowBlur = 45; x.drawImage(e.oc.c, -540, -210); });
    }
    const m = leinwand(4, 4)?.x;
    e.schildMass = m ? schildMass(m) : { font: 62, tw: NAME.length * 34 };
    e.schild = backe(e.schildMass.tw + 96 + 80, 104 + 80, (x) => schildLive(x, e.schildMass));
    return e;
  }
  function drawChrome(g, size, x, y, sc, alpha, shine, ls) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.scale(sc, sc);
    if (shine > 0 && shine < 1 && ebenen.oc) {
      chromeText(ebenen.oc.x, TITEL, size, shine, ls);
      g.shadowColor = C.chromGlow; g.shadowBlur = 45; g.drawImage(ebenen.oc.c, -540, -210); g.shadowBlur = 0;
    } else if (ebenen.titel) setze(g, ebenen.titel, 0, 0);
    else {
      g.font = fnt(size); g.letterSpacing = ls + 'px'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(TITEL).width; if (tw > 990) g.font = fnt(Math.floor(size * 990 / tw));
      g.shadowColor = C.chromGlow; g.shadowBlur = 45; g.fillStyle = goldLin(g, 0, -size / 2, 0, size / 2); g.fillText(TITEL, 0, 0);
    }
    g.restore();
  }
  function spaced(g, text, size, x, y, alpha, col, glow, ls = 8) {
    if (alpha <= 0 || !text) return;
    const key = `${text}|${size}|${col}|${glow}|${ls}`;
    let sp = ebenen.zeilen.get(key);
    if (sp === undefined) { sp = backe(1100, size * 1.5 + 90, (x2) => spacedLive(x2, text, size, col, glow, ls)); ebenen.zeilen.set(key, sp); }
    g.save(); g.globalAlpha = alpha;
    if (sp) setze(g, sp, x, y); else { g.translate(x, y); spacedLive(g, text, size, col, glow, ls); }
    g.restore();
  }
  function namePlate(g, y, alpha) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha;
    if (ebenen.schild) setze(g, ebenen.schild, CX, y); else { g.translate(CX, y); schildLive(g, ebenen.schildMass); }
    g.restore();
  }
  function avatar(g, x, y, r, sc, alpha, t, badge) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.scale(sc, sc);
    g.shadowColor = C.avatarGlow; g.shadowBlur = 50;
    g.fillStyle = goldConic(g, 0, 0, t * 0.8); g.beginPath(); g.arc(0, 0, r + 20, 0, 7); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(60,30,0,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r + 20, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, r + 2, 0, 7); g.stroke();
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; g.fillStyle = i % 2 ? '#fff6d0' : '#8a5310'; g.beginPath(); g.arc(Math.cos(a) * (r + 11), Math.sin(a) * (r + 11), 3.2, 0, 7); g.fill(); }
    zeichneAvatar(g, bild, r, ['#ff8a7a', '#7b2cbf'], d.initiale, Math.round(r * 1.05), true);
    // Glanz läuft um den Ring
    g.save(); g.rotate(t * 2.2); g.globalCompositeOperation = 'lighter';
    const cg = g.createConicGradient(0, 0, 0); cg.addColorStop(0, 'rgba(255,255,255,0.95)'); cg.addColorStop(0.1, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = cg; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, r + 11, 0, 7); g.stroke(); g.restore();
    if (badge) badge(r);
    g.restore();
  }
  function crownShape(ctx, w, h, t, gemPal) {
    // edle Krone: Reif + 5 Zacken mit Kugeln + Steine
    ctx.save(); ctx.lineJoin = 'round';
    const p = [[-w / 2, h * 0.32], [-w / 2 - w * 0.04, -h * 0.55], [-w * 0.28, -h * 0.12], [-w * 0.15, -h * 0.82], [0, -h * 0.2], [w * 0.15, -h * 0.82], [w * 0.28, -h * 0.12], [w / 2 + w * 0.04, -h * 0.55], [w / 2, h * 0.32]];
    ctx.fillStyle = goldLin(ctx, -w / 2, -h, w / 2, h * 0.4);
    ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.shadowColor = 'rgba(255,200,80,0.8)'; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#5c3204'; ctx.lineWidth = w * 0.018; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.12, -h * 0.25); ctx.lineTo(0, -h * 1.05); ctx.lineTo(w * 0.12, -h * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = goldLin(ctx, 0, h * 0.05, 0, h * 0.45); ctx.beginPath(); ctx.roundRect(-w / 2 - w * 0.03, h * 0.05, w * 1.06, h * 0.36, h * 0.08); ctx.fill(); ctx.stroke();
    for (const [x, y] of [[-w / 2 - w * 0.04, -h * 0.55], [-w * 0.15, -h * 0.82], [0, -h * 1.05], [w * 0.15, -h * 0.82], [w / 2 + w * 0.04, -h * 0.55]]) {
      const gr = ctx.createRadialGradient(x - w * 0.012, y - w * 0.012, 0, x, y, w * 0.045); gr.addColorStop(0, '#fffbe8'); gr.addColorStop(1, '#c47f12');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, w * 0.04, 0, 7); ctx.fill();
    }
    [[-w * 0.3, PAL_R, 0], [0, gemPal, 1], [w * 0.3, PAL_R, 2]].forEach(([x, pal, j]) => { ctx.save(); ctx.translate(x, h * 0.23); gem(ctx, j === 1 ? w * 0.09 : w * 0.06, pal, t, j * 1.3); ctx.restore(); });
    ctx.restore();
  }

  // ---- Superfan / VIP ----
  function featherWing(g, side, unfold, t) {
    const rows = [
      { n: 11, l0: 210, l1: 400, a0: -0.62, a1: 1.22, off: 0, dark: 0.0 },
      { n: 9, l0: 140, l1: 255, a0: -0.5, a1: 1.05, off: 14, dark: 0.12 },
      { n: 8, l0: 80, l1: 140, a0: -0.35, a1: 0.95, off: 26, dark: 0.22 },
    ];
    g.save(); g.translate(CX + side * MR * 0.78, MY + 10); g.scale(side, 1);
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const f = i / (row.n - 1);
        const u = clamp(unfold * 1.7 - (1 - f) * 0.7);
        const uu = eOutBack(u, 1.4);
        let L = lerp(row.l0, row.l1, Math.pow(f, 0.85)); if (f > 0.82) L *= 1 - 0.35 * (f - 0.82) / 0.18;
        L *= 0.35 + 0.65 * clamp(uu, 0, 1.1);
        if (!(L > 0)) continue;
        const ang = lerp(-1.5, lerp(row.a0, row.a1, f), uu) + 0.035 * Math.sin(t * 3.2 + f * 2);
        const w = Math.min(54, L * 0.2);
        g.save(); g.translate(row.off * Math.cos(ang), -row.off * Math.sin(ang)); g.rotate(-ang);
        const gr = g.createLinearGradient(0, 0, L, 0);
        gr.addColorStop(0, '#4a2803'); gr.addColorStop(0.3, '#a8650f'); gr.addColorStop(0.62, '#e8a93a'); gr.addColorStop(0.85, '#ffd56b'); gr.addColorStop(1, '#fff1b8');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(0, -w * 0.25); g.quadraticCurveTo(L * 0.55, -w * 1.05, L, -w * 0.05); g.quadraticCurveTo(L * 0.6, w * 0.75, 0, w * 0.3); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(70,35,0,0.75)'; g.lineWidth = 2.2; g.stroke();
        g.strokeStyle = 'rgba(255,240,190,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, 0); g.quadraticCurveTo(L * 0.55, -w * 0.3, L * 0.95, -w * 0.06); g.stroke();
        if (row.dark > 0) { g.fillStyle = `rgba(60,20,0,${row.dark})`; g.beginPath(); g.moveTo(0, -w * 0.25); g.quadraticCurveTo(L * 0.3, -w * 0.6, L * 0.4, 0); g.quadraticCurveTo(L * 0.3, w * 0.4, 0, w * 0.3); g.fill(); }
        g.restore();
      }
    }
    g.restore();
  }
  function medallion(g, t, sc) {
    g.save(); g.translate(CX, MY); g.scale(sc, sc);
    let gr = g.createRadialGradient(0, 0, MR * 0.4, 0, 0, MR * 1.9); gr.addColorStop(0, `rgba(${C.hinter[0]},0.75)`); gr.addColorStop(1, `rgba(${C.hinter[1]},0)`);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, MR * 1.9, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30; g.shadowOffsetY = 12;
    g.fillStyle = goldConic(g, 0, 0, t * 0.35); g.beginPath(); g.arc(0, 0, MR, 0, 7); g.fill();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.strokeStyle = '#4a2803'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, MR - 2, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,250,225,0.8)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, MR - 7, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
    // Ein Nieten-Verlauf um den Ursprung statt 28 je Bild; jede Niete wird dorthin verschoben.
    const rg = g.createRadialGradient(-2, -2, 0, 0, 0, 7); rg.addColorStop(0, '#fffbe8'); rg.addColorStop(1, '#8a5310');
    g.fillStyle = rg;
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, x = Math.cos(a) * MR * 0.885, y = Math.sin(a) * MR * 0.885;
      g.translate(x, y); g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.translate(-x, -y);
    }
    g.fillStyle = '#3a1d00'; g.beginPath(); g.arc(0, 0, MR * 0.775, 0, 7); g.fill();
    gr = g.createRadialGradient(-MR * 0.15, -MR * 0.2, 0, 0, 0, MR * 0.76); gr.addColorStop(0, C.scheibe[0]); gr.addColorStop(0.6, C.scheibe[1]); gr.addColorStop(1, C.scheibe[2]);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, MR * 0.75, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, MR * 0.75, 0, 7); g.clip(); g.globalCompositeOperation = 'lighter';
    g.rotate(-t * 0.6);
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillStyle = C.facette; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, MR, -0.09, 0.09); g.closePath(); g.fill(); }
    g.restore();
    g.strokeStyle = 'rgba(255,214,110,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, MR * 0.68, 0, 7); g.stroke();
    g.save(); g.translate(0, MR * 0.02); g.shadowColor = C.steinGlow; g.shadowBlur = 40; gem(g, MR * 0.52, C.stein, t, 0); g.restore();
    g.restore();
  }
  function zeichneSuperfan(g, t, a, rf, ziel) {
    const F = 1 - eInC(seg(t, SF_OUT, DUR));
    const appear = eOutC(seg(t, 0, 0.5));
    const pb = seg(t, SF_B, SF_B + 0.5);
    const [shx, shy] = shakeAt(t, [[SF_B, 30], [SF_TITLE, 12], [SF_CROWN, 6]]);
    g.translate(shx, shy);
    // Kino-Abdunkeln
    let gr = g.createRadialGradient(CX, 900, 100, CX, 900, 1300); gr.addColorStop(0, `rgba(${C.dunkel},${0.82 * appear * F})`); gr.addColorStop(1, `rgba(${C.dunkel},${0.35 * appear * F})`);
    g.fillStyle = gr; g.fillRect(-50, -50, W + 100, H + 100);
    // Implosion
    if (t < SF_B + 0.05) {
      const core = seg(t, 0.2, SF_B);
      for (const p of implo) {
        const k = seg(t, 0.15 + p.d * 0.6, SF_B), k0 = seg(t - 0.07, 0.15 + p.d * 0.6, SF_B);
        if (k <= 0 || k >= 1) continue;
        const rr = p.r0 * (1 - eInC(k)), r0 = p.r0 * (1 - eInC(k0)), an = p.a + 2.2 * k, a0 = p.a + 2.2 * k0;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp(k * 3) * F; g.strokeStyle = p.col; g.lineWidth = p.w; g.lineCap = 'round'; g.shadowColor = p.col; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(CX + Math.cos(an) * rr, MY + Math.sin(an) * rr); g.lineTo(CX + Math.cos(a0) * r0, MY + Math.sin(a0) * r0); g.stroke(); g.restore();
      }
      g.save(); g.globalCompositeOperation = 'lighter';
      const cr = 30 + 170 * eInC(core);
      gr = g.createRadialGradient(CX, MY, 0, CX, MY, cr); gr.addColorStop(0, `rgba(255,255,255,${0.9 * core})`); gr.addColorStop(0.35, `rgba(${C.kern[0]},${0.8 * core})`); gr.addColorStop(1, `rgba(${C.kern[1]},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(CX, MY, cr, 0, 7); g.fill(); g.restore();
      if (t > 0.75) { const n = 1 + Math.round(4 * seg(t, 0.75, SF_B)); for (let i = 0; i < n; i++) { const an = rf() * 6.28, l = 120 + 200 * rf(); lightning(g, rf, CX, MY, CX + Math.cos(an) * l, MY + Math.sin(an) * l, C.blitzLinie, F); } }
    }
    // Strahlen + Schockwellen
    const rI = t < SF_B ? 0 : (0.55 + 0.9 * (1 - eOutC(seg(t, SF_B, SF_B + 1.4)))) * F;
    strahlen(g, CX, MY, 18, 1500, t * 0.18, C.strahl, rI, 0.06);
    strahlen(g, CX, MY, 12, 1200, -t * 0.12, '255,210,120', rI * 0.8, 0.045);
    for (const [dd, k, col] of [[0, 1, '255,214,110'], [0.08, 0.8, C.welle], [0.2, 0.55, '255,255,255']]) {
      const p = seg(t, SF_B + dd, SF_B + dd + 1.1); if (p <= 0 || p >= 1) continue;
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(${col},${(1 - p) * 0.8 * k * F})`; g.lineWidth = 40 * (1 - p) + 2;
      g.beginPath(); g.arc(CX, MY, MR + 1500 * eOutExpo(p), 0, 7); g.stroke(); g.restore();
    }
    drawP(g, F, 0, a, ziel);
    if (t >= SF_B) {
      const ms = eOutBack(seg(t, SF_B, SF_B + 0.5), 2.2) * (1 + 0.025 * Math.sin((t - SF_B) * 2.5)) * (t > SF_OUT ? 1 + 0.25 * eInC(seg(t, SF_OUT, DUR)) : 1);
      const un = seg(t, SF_B + 0.12, SF_B + 1.0);
      g.save(); g.globalAlpha = F;
      g.translate(CX, MY); g.scale(ms, ms); g.translate(-CX, -MY);
      featherWing(g, 1, un, t); featherWing(g, -1, un, t);
      g.restore();
      if (ms > 0) { g.save(); g.globalAlpha = F; medallion(g, t, ms); g.restore(); }
      // Umlaufende Funken
      for (let i = 0; i < 3; i++) {
        const an = t * (1.6 + i * 0.4) + i * 2.1, ex = Math.cos(an) * MR * (1.25 + i * 0.12), ey = Math.sin(an) * MR * (0.42 + i * 0.1);
        g.save(); g.translate(CX, MY); g.rotate(-0.35 + i * 0.35); g.globalAlpha = F * clamp((t - SF_B - 0.4) * 2); glint(g, ex, ey, 26, 1); g.restore();
      }
      // Krone fällt drauf
      const cp = seg(t, SF_CROWN - 0.35, SF_CROWN);
      if (cp > 0) {
        const cy = MY - MR * ms - 70 - 520 * (1 - eInC(cp)) * (cp < 1 ? 1 : 0);
        const land = t > SF_CROWN ? Math.exp(-(t - SF_CROWN) * 8) * Math.sin((t - SF_CROWN) * 30) * 0.08 : 0;
        g.save(); g.globalAlpha = F * clamp(cp * 4); g.translate(CX, cy + 40); g.scale(ms * (1 + land), ms * (1 - land)); g.rotate(0.04 * Math.sin(t * 2)); g.translate(0, -40);
        crownShape(g, MR * 1.25, MR * 0.62, t, C.stein); g.restore();
      }
    }
    drawP(g, F, 1, a, ziel);
    // Blitz
    if (pb > 0 && pb < 1) { g.save(); g.globalCompositeOperation = 'lighter'; gr = g.createRadialGradient(CX, MY, 0, CX, MY, 1100); gr.addColorStop(0, `rgba(${C.flash[0]},${(1 - eOutC(seg(t, SF_B, SF_B + 0.35))) * 1})`); gr.addColorStop(1, `rgba(${C.flash[1]},0)`); g.fillStyle = gr; g.fillRect(-50, -50, W + 100, H + 100); g.restore(); }
    // Texte
    const pn = eOutC(seg(t, SF_TITLE - 0.25, SF_TITLE + 0.1));
    spaced(g, KOPF, 58, CX, 968 + 20 * (1 - pn), pn * F, '#fff4d6', C.textGlow, 22);
    const pt = seg(t, SF_TITLE, SF_TITLE + 0.28);
    if (pt > 0) {
      const ts = (1 + 1.6 * (1 - eOutExpo(pt))) * (1 + 0.06 * eInC(seg(t, SF_OUT, DUR)));
      const sh = t < SF_TITLE + 0.9 ? seg(t, SF_TITLE + 0.35, SF_TITLE + 0.9) : seg(t, 5.0, 5.55);
      drawChrome(g, 200, CX, 1100, ts, clamp(pt * 3) * F, sh, 4);
      if (pt < 1) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - pt) * 0.6 * F; gr = g.createRadialGradient(CX, 1100, 0, CX, 1100, 600); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,200,100,0)'); g.fillStyle = gr; g.fillRect(0, 700, W, 800); g.restore(); }
    }
    const ps = eOutC(seg(t, SF_TITLE + 0.45, SF_TITLE + 0.85));
    spaced(g, UNTER, 50, CX, 1228 + 25 * (1 - ps), ps * F, '#ffe9a8', C.textGlow, 7);
    const pa = eOutBack(seg(t, SF_TITLE + 0.65, SF_TITLE + 1.1), 2);
    avatar(g, CX, 1445, 122, pa, clamp(pa) * F, t, (r) => {
      const cp = seg(t, SF_TITLE + 1.0, SF_TITLE + 1.3); if (cp <= 0) return;
      const y = -r - 34 - 260 * (1 - eInC(cp)) * (cp < 1 ? 1 : 0);
      g.save(); g.globalAlpha *= clamp(cp * 4); g.translate(0, y); g.rotate(-0.12); crownShape(g, r * 1.0, r * 0.5, t, C.stein); g.restore();
    });
    const pm = eOutC(seg(t, SF_TITLE + 0.95, SF_TITLE + 1.3));
    namePlate(g, 1655 + 25 * (1 - pm), pm * F);
  }

  // ---- Schatztruhe ----
  function lidStrips(g, theta, glowIn) {
    const M = 46, hz = -TR, hy = HB, ct = Math.cos(theta), st = Math.sin(theta);
    const pts = [];
    for (let j = 0; j <= M; j++) {
      const ph = Math.PI * j / M, z0 = TR * Math.cos(ph), y0 = HB + 0.82 * TR * Math.sin(ph);
      const dz = z0 - hz, dy = y0 - hy;
      let nz = Math.cos(ph) / TR, ny = Math.sin(ph) / (0.82 * TR); const nl = Math.hypot(nz, ny); nz /= nl; ny /= nl;
      pts.push({ z: hz + dz * ct - dy * st, y: hy + dz * st + dy * ct, nz: nz * ct - ny * st, ny: nz * st + ny * ct, j });
    }
    const segs = [];
    for (let j = 0; j < M; j++) {
      const p = pts[j], q = pts[j + 1], nz = (p.nz + q.nz) / 2, ny = (p.ny + q.ny) / 2;
      segs.push({ a: p, b: q, j, f: 0.33 * ny + 0.944 * nz, d: 0.33 * (p.y + q.y) / 2 + 0.944 * (p.z + q.z) / 2 });
    }
    segs.sort((p, q) => p.d - q.d);
    const hw0 = TW / 2 + 10;
    for (const s of segs) {
      const { a: pa, b: pb, j, f } = s, outer = f > 0;
      const xa = hw0 * (1 + PZ * pa.z), xb = hw0 * (1 + PZ * pb.z), ya = PY(pa.y, pa.z), yb = PY(pb.y, pb.z);
      const quad = (u0, u1) => { g.beginPath(); g.moveTo(u0 * xa, ya); g.lineTo(u1 * xa, ya); g.lineTo(u1 * xb, yb); g.lineTo(u0 * xb, yb); g.closePath(); g.fill(); g.stroke(); };
      let col;
      if (outer) {
        let L = clamp(0.25 + 0.85 * f); if (j % 9 === 0) L *= 0.55;
        const lip = j < 3 || j > M - 2;
        col = lip ? rgbS(GOLD_LO, GOLD_HI, L) : rgbS(WOOD_LO, WOOD_HI, L);
        g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.2; quad(-1, 1);
        if (!lip) { const gc = rgbS(GOLD_LO, GOLD_HI, clamp(0.2 + 0.95 * f)); g.fillStyle = gc; g.strokeStyle = gc; for (const sx of [-1, 1]) { quad(sx * 0.255, sx * 0.345); } quad(-0.05, 0.05); }
        if (j % 9 === 4 && !lip) { g.fillStyle = rgbS(GOLD_LO, GOLD_HI, clamp(0.5 + 0.6 * f)); for (const ux of [-0.3, 0, 0.3]) { g.beginPath(); g.arc(ux * (xa + xb) / 2, (ya + yb) / 2, 5, 0, 7); g.fill(); } }
      } else {
        const lip = j < 3 || j > M - 2;
        let L = clamp(0.2 + 0.25 * (-f) + glowIn * 0.45 * Math.pow(1 - j / M, 1.5)); if (j % 9 === 0) L *= 0.5;
        col = lip ? rgbS(GOLD_LO, GOLD_HI, clamp(0.3 + 0.5 * glowIn)) : rgbS(IN_LO, [150, 72, 30], L);
        g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.2; quad(-1, 1);
        if (!lip) { const gc = rgbS(GOLD_LO, [230, 170, 70], clamp(0.25 + 0.4 * glowIn * (1 - j / M))); g.fillStyle = gc; g.strokeStyle = gc; for (const sx of [-1, 1]) quad(sx * 0.255, sx * 0.345); }
      }
    }
  }
  function chestFront(g, t, charge, opened) {
    const fw = TW / 2 * (1 + PZ * TD / 2);
    for (let p = 0; p < 3; p++) {
      const y0 = -HB + p * HB / 3, y1 = y0 + HB / 3;
      const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#8a4520'); gr.addColorStop(0.5, '#6a3014'); gr.addColorStop(1, '#45190a');
      g.fillStyle = gr; g.fillRect(-fw, y0, 2 * fw, HB / 3);
      g.fillStyle = 'rgba(20,6,0,0.7)'; g.fillRect(-fw, y1 - 3, 2 * fw, 3);
    }
    g.save(); g.beginPath(); g.rect(-fw, -HB, 2 * fw, HB); g.clip();
    for (const q of grain) {
      const yb = -HB + q.p * HB / 3 + q.y * HB / 3;
      g.strokeStyle = q.dark ? 'rgba(25,8,0,0.35)' : 'rgba(255,190,120,0.09)'; g.lineWidth = q.dark ? 2 : 3;
      g.beginPath(); for (let x = -fw; x <= fw; x += 20) { const y = yb + Math.sin(x * q.f + q.ph) * q.a; x === -fw ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    }
    let gr = g.createLinearGradient(-fw, 0, fw, 0); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.14, 'rgba(0,0,0,0)'); gr.addColorStop(0.86, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr; g.fillRect(-fw, -HB, 2 * fw, HB);
    gr = g.createLinearGradient(0, -HB, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.fillRect(-fw, -HB, 2 * fw, HB);
    if (opened > 0) { g.globalCompositeOperation = 'lighter'; gr = g.createLinearGradient(0, -HB, 0, -HB + 120); gr.addColorStop(0, `rgba(255,170,60,${0.35 * opened})`); gr.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = gr; g.fillRect(-fw, -HB, 2 * fw, 120); g.globalCompositeOperation = 'source-over'; }
    g.restore();
    const vband = (cx, w) => { const gb = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); gb.addColorStop(0, '#6b3d06'); gb.addColorStop(0.3, '#ffe08a'); gb.addColorStop(0.5, '#fff6d0'); gb.addColorStop(0.75, '#c8861c'); gb.addColorStop(1, '#5c3204'); g.fillStyle = gb; g.fillRect(cx - w / 2, -HB, w, HB); g.strokeStyle = 'rgba(40,18,0,0.8)'; g.lineWidth = 2; g.strokeRect(cx - w / 2, -HB, w, HB); };
    const rivet = (x, y, r = 6) => { const rg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r * 1.1); rg.addColorStop(0, '#fffbe8'); rg.addColorStop(0.5, '#e0a840'); rg.addColorStop(1, '#5c3204'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    for (const sx of [-1, 1]) { vband(sx * fw * 0.3, fw * 0.09); for (let y = -HB + 40; y < -20; y += 52) rivet(sx * fw * 0.3, y, 5.5); }
    const hband = (y0, h) => { const gb = g.createLinearGradient(0, y0, 0, y0 + h); gb.addColorStop(0, '#fff6d0'); gb.addColorStop(0.35, '#ffd56b'); gb.addColorStop(0.65, '#b9771a'); gb.addColorStop(1, '#5c3204'); g.fillStyle = gb; g.beginPath(); g.roundRect(-fw - 8, y0, 2 * fw + 16, h, 6); g.fill(); g.strokeStyle = 'rgba(40,18,0,0.85)'; g.lineWidth = 2; g.stroke(); };
    hband(-HB - 4, 30); hband(-30, 32);
    for (let x = -fw + 30; x < fw - 10; x += 60) { rivet(x, -HB + 11, 5); rivet(x, -14, 5); }
    for (const sx of [-1, 1]) for (const top of [true, false]) {
      g.save(); g.translate(sx * fw, top ? -HB : 0); g.scale(sx, top ? 1 : -1);
      g.fillStyle = goldLin(g, -60, 0, 0, 60); g.beginPath(); g.moveTo(8, -6); g.lineTo(-74, -6); g.quadraticCurveTo(-74, 22, -46, 26); g.lineTo(-30, 30); g.lineTo(-26, 88); g.quadraticCurveTo(-4, 92, 8, 80); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,18,0,0.85)'; g.lineWidth = 2.5; g.stroke();
      rivet(-50, 10, 6); rivet(-12, 60, 6); g.restore();
    }
    g.save(); g.translate(0, -HB + 82);
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 14; g.shadowOffsetY = 5;
    g.fillStyle = goldLin(g, -70, -70, 70, 90);
    g.beginPath(); g.moveTo(-62, -58); g.lineTo(62, -58); g.lineTo(62, 30); g.quadraticCurveTo(62, 70, 0, 96); g.quadraticCurveTo(-62, 70, -62, 30); g.closePath(); g.fill();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; g.strokeStyle = '#4a2803'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(255,250,225,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-52, -48); g.lineTo(52, -48); g.stroke();
    for (const [x, y] of [[-48, -44], [48, -44], [-48, 26], [48, 26]]) rivet(x, y, 5);
    g.fillStyle = charge > 0 ? `rgb(${Math.round(lerp(20, 255, charge))},${Math.round(lerp(8, 230, charge))},${Math.round(lerp(0, 160, charge))})` : '#140600';
    g.beginPath(); g.arc(0, 18, 15, 0, 7); g.fill(); g.beginPath(); g.moveTo(-8, 24); g.lineTo(8, 24); g.lineTo(13, 62); g.lineTo(-13, 62); g.closePath(); g.fill();
    if (charge > 0) { g.globalCompositeOperation = 'lighter'; const kg = g.createRadialGradient(0, 35, 0, 0, 35, 140 * charge + 20); kg.addColorStop(0, `rgba(255,220,130,${0.8 * charge})`); kg.addColorStop(1, 'rgba(255,170,40,0)'); g.fillStyle = kg; g.beginPath(); g.arc(0, 35, 160, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    g.save(); g.translate(0, -24); gem(g, 22, PAL_R, t, 0.5); g.restore();
    g.restore();
  }
  function chestOpening(g, t, opened) {
    const yb = PY(HB, -TD / 2), yf = PY(HB, TD / 2), wb = TW / 2 * (1 - PZ * TD / 2), wf = TW / 2 * (1 + PZ * TD / 2);
    g.save();
    let gr = g.createLinearGradient(0, yb, 0, yf); gr.addColorStop(0, '#4a2210'); gr.addColorStop(1, '#120400');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-wb, yb); g.lineTo(wb, yb); g.lineTo(wf, yf); g.lineTo(-wf, yf); g.closePath(); g.fill();
    for (const hp of heap) {
      const y = lerp(yb + 14, yf - 4, hp.v), wl = lerp(wb, wf, hp.v) - 40, x = hp.u * wl;
      const mound = 62 * (1 - hp.u * hp.u) * (0.55 + 0.45 * Math.sin(Math.PI * clamp(hp.v * 1.1)));
      g.save(); g.translate(x, y - mound);
      if (hp.gem) { g.rotate(hp.rot); gem(g, 18, hp.gem, t, hp.u * 5); }
      else {
        g.rotate(hp.rot * 0.4);
        const cg = g.createLinearGradient(-26, -10, 26, 10); cg.addColorStop(0, '#fff6d0'); cg.addColorStop(0.45, '#ffd56b'); cg.addColorStop(1, '#a8650f');
        g.fillStyle = '#7a4a08'; g.beginPath(); g.ellipse(0, 4, 27, 11, 0, 0, 7); g.fill();
        g.fillStyle = cg; g.beginPath(); g.ellipse(0, 0, 27, 10, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(122,74,8,0.6)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 19, 6.5, 0, 0, 7); g.stroke();
      }
      g.restore();
    }
    if (opened > 0) {
      g.globalCompositeOperation = 'lighter';
      gr = g.createRadialGradient(0, (yb + yf) / 2 - 40, 0, 0, (yb + yf) / 2 - 40, 420); gr.addColorStop(0, `rgba(255,225,140,${0.75 * opened})`); gr.addColorStop(1, 'rgba(255,160,40,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, (yb + yf) / 2 - 40, 420, 200, 0, 0, 7); g.fill();
    }
    g.restore();
  }
  function lidAngle(t) {
    if (t < T_LAND + 0.15) return 0;
    if (t < TB) { const p = seg(t, T_LAND + 0.25, TB); return p * (0.03 + 0.06 * Math.abs(Math.sin(t * 37))) * (Math.sin(t * 13) > -0.2 ? 1 : 0.2); }
    const p = seg(t, TB, TB + 0.42);
    let th = 2.0 * eOutBack(p, 1.3);
    if (p >= 1) th = 2.0 + 0.06 * Math.exp(-(t - TB - 0.42) * 5) * Math.sin((t - TB - 0.42) * 18);
    return th;
  }
  function zeichneTruhe(g, t, a, rf, ziel) {
    const F = 1 - eInC(seg(t, T_OUTT, DUR));
    const appear = eOutC(seg(t, 0, 0.45));
    const [shx, shy] = shakeAt(t, [[T_LAND, 22], [TB, 24], [TT_TITLE, 9]]);
    g.translate(shx, shy);
    let gr = g.createRadialGradient(CX, 1000, 100, CX, 1000, 1300); gr.addColorStop(0, `rgba(24,10,2,${0.8 * appear * F})`); gr.addColorStop(1, `rgba(24,10,2,${0.3 * appear * F})`);
    g.fillStyle = gr; g.fillRect(-50, -50, W + 100, H + 100);
    const opened = seg(t, TB, TB + 0.3) * (1 - 0.35 * seg(t, TB + 1.5, TB + 3.5));
    const charge = t < TB ? eInC(seg(t, T_LAND + 0.25, TB)) : Math.max(0, 1 - (t - TB) * 4);
    const rI = t < TB ? 0.25 * charge : (0.5 + 0.9 * (1 - eOutC(seg(t, TB, TB + 1.6)))) * F;
    strahlen(g, CX, GY - HB - 60, 16, 1400, t * 0.15, '255,200,100', rI * appear, 0.06);
    for (const [dd, k] of [[0, 1], [0.12, 0.6]]) {
      const p = seg(t, TB + dd, TB + dd + 1.0); if (p <= 0 || p >= 1) continue;
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,214,110,${(1 - p) * 0.75 * k * F})`; g.lineWidth = 34 * (1 - p) + 2;
      g.beginPath(); g.ellipse(CX, GY - HB - 40, 300 + 1400 * eOutExpo(p), 120 + 560 * eOutExpo(p), 0, 0, 7); g.stroke(); g.restore();
    }
    // Fall + Landung
    const dp = seg(t, 0, T_LAND), dropY = t < T_LAND ? -1300 * (1 - eInC(dp)) : 0;
    const imp = t > T_LAND ? Math.exp(-(t - T_LAND) * 10) * Math.cos((t - T_LAND) * 26) * 0.07 : 0;
    const jit = t > T_LAND + 0.25 && t < TB ? Math.sin(t * 55) * 4 * charge : 0;
    const sc = t > T_OUTT ? 1 - 0.8 * eInC(seg(t, T_OUTT, DUR)) : 1;
    // Bodenschatten
    g.save(); g.globalAlpha = 0.6 * appear * F * clamp(1 + dropY / 1300 * 1.4);
    gr = g.createRadialGradient(CX, GY + 10, 0, CX, GY + 10, 420); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.translate(CX, GY + 10); g.scale(1, 0.16); g.beginPath(); g.arc(0, 0, 420, 0, 7); g.fill(); g.restore();
    drawP(g, F, 0, a, ziel);
    const th = lidAngle(t);
    g.save(); g.globalAlpha = F; g.translate(CX + jit, GY + dropY); g.scale((1 + imp) * sc, (1 - imp) * sc);
    if (th > Math.PI / 2) lidStrips(g, th, opened);
    if (th > 0.02) chestOpening(g, t, opened);
    chestFront(g, t, charge, opened);
    if (th <= Math.PI / 2) lidStrips(g, th, opened);
    // Überfall (Lasche) am Deckel, solange zu
    if (t < TB) {
      g.save(); g.translate(0, -HB - 22 - th * 60);
      g.fillStyle = goldLin(g, -24, 0, 24, 70); g.beginPath(); g.roundRect(-24, 0, 48, 78, 10); g.fill(); g.strokeStyle = '#4a2803'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = '#2a1000'; g.beginPath(); g.roundRect(-9, 44, 18, 22, 5); g.fill(); g.restore();
    }
    // Lichtspalt beim Aufladen
    if (charge > 0 && t < TB + 0.25) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const ly = PY(HB, TD / 2) - th * 40, hw = TW / 2 * 1.1;
      for (const [lw, al] of [[30, 0.25], [12, 0.5], [4, 1]]) { g.strokeStyle = `rgba(255,${200 + (lw < 10 ? 50 : 0)},120,${al * charge * F})`; g.lineWidth = lw * (0.5 + charge); g.shadowColor = '#ffb627'; g.shadowBlur = 30; g.beginPath(); g.moveTo(-hw, ly); g.lineTo(hw, ly); g.stroke(); }
      g.shadowBlur = 0;
      for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 110 + Math.sin(t * 9 + i) * 20, l = 80 + 120 * charge; const lg = g.createLinearGradient(0, ly, 0, ly - l); lg.addColorStop(0, `rgba(255,220,140,${0.5 * charge})`); lg.addColorStop(1, 'rgba(255,200,100,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(x - 10, ly); g.lineTo(x + 10, ly); g.lineTo(x + 30, ly - l); g.lineTo(x - 30, ly - l); g.closePath(); g.fill(); }
      g.restore();
    }
    g.restore();
    // Lichtsäule aus der Truhe
    const bo = seg(t, TB, TB + 0.25), bf = 1 - seg(t, TB + 1.0, TB + 2.6);
    if (bo > 0 && bf > 0) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = bo * bf * F;
      const top = GY - HB - 40, bg = g.createLinearGradient(0, top, 0, top - 1100); bg.addColorStop(0, 'rgba(255,235,170,0.95)'); bg.addColorStop(0.4, 'rgba(255,200,90,0.45)'); bg.addColorStop(1, 'rgba(255,180,60,0)');
      g.fillStyle = bg; g.beginPath(); g.moveTo(CX - 260, top); g.lineTo(CX + 260, top); g.lineTo(CX + 480, top - 1100); g.lineTo(CX - 480, top - 1100); g.closePath(); g.fill();
      const cg = g.createLinearGradient(0, top, 0, top - 1000); cg.addColorStop(0, 'rgba(255,255,240,0.9)'); cg.addColorStop(1, 'rgba(255,255,220,0)');
      g.fillStyle = cg; g.beginPath(); g.moveTo(CX - 90, top); g.lineTo(CX + 90, top); g.lineTo(CX + 160, top - 1000); g.lineTo(CX - 160, top - 1000); g.closePath(); g.fill();
      g.restore();
    }
    drawP(g, F, 1, a, ziel);
    // Blitz
    const pb = seg(t, TB, TB + 0.4);
    if (pb > 0 && pb < 1) { g.save(); g.globalCompositeOperation = 'lighter'; gr = g.createRadialGradient(CX, GY - HB, 0, CX, GY - HB, 1000); gr.addColorStop(0, `rgba(255,240,200,${(1 - eOutC(pb)) * 0.95})`); gr.addColorStop(1, 'rgba(255,190,80,0)'); g.fillStyle = gr; g.fillRect(-50, -50, W + 100, H + 100); g.restore(); }
    // Texte
    const pt = seg(t, TT_TITLE, TT_TITLE + 0.28);
    if (pt > 0) {
      const ts = (1 + 1.5 * (1 - eOutExpo(pt))) * (1 + 0.06 * eInC(seg(t, T_OUTT, DUR)));
      const sh = t < TT_TITLE + 0.9 ? seg(t, TT_TITLE + 0.35, TT_TITLE + 0.9) : seg(t, 4.6, 5.15);
      drawChrome(g, 160, CX, 1185, ts, clamp(pt * 3) * F, sh, 3);
    }
    // Coin-Zähler als Goldplakette (ohne Coins ausgeblendet)
    const pc = eOutBack(seg(t, TT_TITLE + 0.3, TT_TITLE + 0.65), 2);
    if (pc > 0 && COINS !== null) {
      const n = Math.round(COINS * eOutC(seg(t, TT_TITLE + 0.4, TT_TITLE + 1.6)));
      const pop = Math.abs(n - COINS) < 1 && t < TT_TITLE + 2.0 ? 1 + 0.12 * Math.exp(-(t - TT_TITLE - 1.6) * 8) : 1;
      g.save(); g.globalAlpha = clamp(pc) * F; g.translate(CX, 1318); g.scale(pc * pop, pc * pop);
      const w = 400, h = 116;
      g.shadowColor = 'rgba(255,150,30,0.7)'; g.shadowBlur = 35;
      g.fillStyle = 'rgba(30,12,2,0.88)'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 58); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = goldLin(g, -w / 2, -h / 2, w / 2, h / 2); g.lineWidth = 6; g.stroke();
      g.save(); g.translate(-w / 2 + 66, 0); muenze(g, 84, Math.sin(t * 3) * 0.6); g.restore();
      g.letterSpacing = '2px'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = fnt(passendeGroesse(g, String(COINS), 86, w - 150));
      const tg = g.createLinearGradient(0, -40, 0, 40); tg.addColorStop(0, '#fffbe8'); tg.addColorStop(0.5, '#ffd56b'); tg.addColorStop(1, '#d9952a');
      g.fillStyle = tg; g.shadowColor = '#ff9d00'; g.shadowBlur = 16; g.fillText(String(n), 50, 6);
      g.restore();
    }
    const ps = eOutC(seg(t, TT_TITLE + 0.55, TT_TITLE + 0.95));
    spaced(g, UNTER, 46, CX, 1418 + 20 * (1 - ps), ps * F, '#ffe9a8', '#ff8a00', 8);
    const pa = eOutBack(seg(t, TT_TITLE + 0.75, TT_TITLE + 1.2), 2);
    avatar(g, CX, 1585, 108, pa, clamp(pa) * F, t, (r) => { g.save(); g.translate(r * 0.74, r * 0.74); muenze(g, 74, Math.sin(t * 2.5) * 0.5); g.restore(); });
    const pm = eOutC(seg(t, TT_TITLE + 1.05, TT_TITLE + 1.4));
    namePlate(g, 1775 + 25 * (1 - pm), pm * F);
  }

  function zeichne(g, t, a, rf, ziel) {
    if (!ebenen) ebenen = baueEbenen();
    if (SF) zeichneSuperfan(g, t, a, rf, ziel); else zeichneTruhe(g, t, a, rf, ziel);
  }
  return { dauer: DUR, zuruecksetzen, schritt, zeichne, vergissText: () => { freigeben(ebenen); ebenen = null; } };
}

// -------------------------------------------------------------- Renderer ---

const STILE = {
  'lvl-herzschlag': (d, S, b) => stilKlassik(1, d, S, b),
  'lvl-goldherz': (d, S, b) => stilKlassik(2, d, S, b),
  'lvl-neon': (d, S, b) => stilKlassik(3, d, S, b),
  'lvl-tiktok': (d, S, b) => stilTikTok(false, d, S, b),
  'lvl-tiktok-neon': (d, S, b) => stilTikTok(true, d, S, b),
  'superfan-premium': (d, _S, b) => stilPremium('superfan', d, b),
  'vip-gold': (d, _S, b) => stilPremium('vip', d, b),
  'truhe-premium': (d, _S, b) => stilPremium('truhe', d, b),
  'ziel-erreicht': (d, S, b) => stilTikTok(true, d, S, b, 'ziel'),
};

const ganz = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(9999, Math.round(n))) : null; };

/** Ereignis-Daten auf sichere Werte bringen (TikTok lässt Felder weg). */
function normalisiere(daten) {
  const dd = daten && typeof daten === 'object' ? daten : {};
  const name = String(dd.name ?? '').replace(/\s+/g, ' ').trim();
  let neu = ganz(dd.neu), alt = ganz(dd.alt);
  if (neu === null) neu = alt !== null ? alt + 1 : 1;
  const neuBekannt = ganz(dd.neu) !== null;
  if (alt === null) alt = Math.max(0, neu - 1);
  // null und '' heißen „fehlt“: Number(null) wäre 0 und zeigte einen 0-Zähler.
  const coins = dd.coins === null || dd.coins === undefined || dd.coins === '' ? NaN : Number(dd.coins);
  return {
    name, initiale: initiale(name), alt, neu, neuBekannt,
    gifter: dd.art === 'gifter', bild: typeof dd.bild === 'string' ? dd.bild : '',
    coins: Number.isFinite(coins) && coins >= 0 ? Math.min(99999999, Math.round(coins)) : null,
    unterzeile: typeof dd.unterzeile === 'string' ? dd.unterzeile.trim() : '',
    neuAbo: dd.neuAbo === true,
    titel: typeof dd.titel === 'string' ? dd.titel.replace(/\s+/g, ' ').trim().toLocaleUpperCase('de-DE') : '',
    stufe: ganz(dd.stufe),
    fortschritt: ganz(dd.fortschritt), ziel: ganz(dd.ziel),
  };
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
 * @param {{name?:string, bild?:string, art?:'team'|'gifter', alt?:number, neu?:number, stufe?:number,
 *   titel?:string, neuAbo?:boolean, unterzeile?:string, coins?:number|null,
 *   fortschritt?:number, ziel?:number}} daten   Bedeutung je Feld: Kommentar über ANIMATIONEN
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
