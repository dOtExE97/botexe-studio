// heart-rain.js — Bei Likes steigen Partikel auf (TikTok-Signature). Transparent,
// am unteren Rand, deckt nichts zu. props: { emojis?, accent?, maxPerBurst? }
//
// Premium-Default: gerenderte Herz-/Funken-Sprites als Inline-SVG mit Gradient
// + weichem Glow (drop-shadow). Setzt der User eigene Emojis (≠ Default), werden
// diese mit Glow weiterverwendet. Like-Fluten-Cap bleibt erhalten (TTLS-schonend).
const STYLE_ID = 'bx-hr-style';
// Default aus dem Widget-Registry — exakt dieser String zählt als "nicht angepasst".
const DEFAULT_EMOJIS = '❤️,💖,💕,✨,🔥';
const CSS = `
.bx-hr { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.bx-hr-e { position: absolute; bottom: -8%; opacity: 0; will-change: transform, opacity;
  font-size: 34px; line-height: 1; display: block;
  filter: drop-shadow(0 0 8px var(--bx-glow, rgba(255,94,138,.65))) drop-shadow(0 2px 6px rgba(0,0,0,.4));
  animation: bx-hr-rise var(--dur,3.4s) ease-in forwards; }
.bx-hr-e svg { display: block; width: 100%; height: 100%; overflow: visible; }
@keyframes bx-hr-rise {
  0% { opacity: 0; transform: translateY(0) translateX(0) scale(.6) rotate(0); }
  10% { opacity: 1; transform: translateY(-10%) scale(1); }
  /* Sanftes Schwingen: Drift kehrt zur Mitte um → S-Kurve statt schräger Linie. */
  50% { opacity: 1; transform: translateY(-55%) translateX(calc(var(--drift,0px) * -.4)) scale(1.05); }
  85% { opacity: 1; transform: translateY(-92%) translateX(calc(var(--drift,0px) * .7)) scale(1.05); }
  100% { opacity: 0; transform: translateY(-122%) translateX(var(--drift,0px)) scale(1.08) rotate(var(--rot,0deg)); }
}
/* Fontäne (TikFinity-Style): viele Mini-Herzen aus EINER Quelle unten, steigen in
   einem sanften Schlängelbogen hoch HINAUS und faden erst ganz oben aus. */
.bx-hr-e.fount { bottom: var(--src-y, 3%); animation: bx-hr-fount var(--dur,3s) cubic-bezier(.22,.62,.36,1) forwards; }
@keyframes bx-hr-fount {
  0%   { opacity: 0; transform: translate(0,0) scale(.35) rotate(0); }
  10%  { opacity: 1; transform: translate(calc(var(--drift) * .18), -12%) scale(var(--scale,1)); }
  45%  { opacity: 1; transform: translate(calc(var(--drift) * -.35), -52%) scale(var(--scale,1)) rotate(calc(var(--rot,0deg) * .5)); }
  80%  { opacity: .95; transform: translate(calc(var(--drift) * .55), -90%) scale(var(--scale,1)); }
  100% { opacity: 0; transform: translate(var(--drift), -124%) scale(.6) rotate(var(--rot,0deg)); }
}
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

// Eindeutige Gradient-IDs pro Instanz, damit mehrere Overlays sich nicht stören.
let GRAD_SEQ = 0;

// Herz-Sprite als Inline-SVG. hue verschiebt den Farbton leicht (Pink↔Rot),
// base/accent kommen aus den Design-Tokens. id macht den Gradient eindeutig.
function heartSVG(id, hue, base, accent) {
  return `<svg viewBox="0 0 32 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="hg${id}" cx="38%" cy="32%" r="78%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".95"/>
      <stop offset="32%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${base}"/>
    </radialGradient>
  </defs>
  <g transform="rotate(${hue} 16 15)">
    <path d="M16 28.2C5.2 20.9 1 15.6 1 9.9 1 5.4 4.5 2 8.8 2c2.9 0 5.5 1.6 7.2 4 1.7-2.4 4.3-4 7.2-4C27.5 2 31 5.4 31 9.9c0 5.7-4.2 11-15 18.3z"
      fill="url(#hg${id})"/>
    <ellipse cx="11.5" cy="9.5" rx="3.4" ry="2.4" fill="#fff" opacity=".5"/>
  </g>
</svg>`;
}

// Funken-/Sternchen-Sprite (Vier-Strahl-Stern) für dezente Abwechslung.
function sparkSVG(id, base, accent) {
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="sg${id}" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="55%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${base}"/>
    </radialGradient>
  </defs>
  <path d="M16 1c1.2 6.6 2.4 7.8 9 9-6.6 1.2-7.8 2.4-9 9-1.2-6.6-2.4-7.8-9-9 6.6-1.2 7.8-2.4 9-9z"
    fill="url(#sg${id})"/>
</svg>`;
}

/** Wie viele Herzen pro Like-Event spawnen. Großzügige Untergrenze, damit auch
 *  ein einzelner Like einen sichtbaren Schwung wirft, skaliert mit der Like-Zahl,
 *  gedeckelt durch maxPerBurst. Reine Logik → testbar. */
export function heartsForLike(likeCount, mode, maxPerBurst) {
  const L = Math.max(0, Number(likeCount) || 0);
  const fount = mode === 'fountain';
  const divisor = fount ? 1.5 : 2.5;
  const floor = fount ? 4 : 3;
  const cap = Math.max(1, Number(maxPerBurst) || 14);
  return Math.max(floor, Math.min(cap, Math.round(L / divisor)));
}

export default class HeartRain {
  constructor(root, props) {
    ensureStyle();
    const raw = props.emojis == null ? '' : String(props.emojis);
    const trimmed = raw.trim();
    // "Angepasst" = nicht leer UND nicht der unveränderte Default → Emojis nutzen.
    this.useEmojis = trimmed !== '' && trimmed !== DEFAULT_EMOJIS;
    this.emojis = this.useEmojis
      ? trimmed.split(',').map((e) => e.trim()).filter(Boolean)
      : [];
    if (this.useEmojis && this.emojis.length === 0) this.useEmojis = false;

    // Akzentfarbe respektieren (steuert Glow + SVG-Gradient).
    const accent = props.accent && String(props.accent).trim();
    if (accent) root.style.setProperty('--bx-accent', accent);
    // Glow-Farbe aus Akzent ableiten; sonst Pink-Token.
    root.style.setProperty('--bx-glow',
      accent ? `color-mix(in srgb, ${accent} 70%, transparent)` : 'var(--bx-pink, rgba(255,94,138,.65))');
    this.accent = accent || '';

    this.maxPerBurst = Math.min(28, Math.max(1, Number(props.maxPerBurst ?? 14)));
    // Fontäne (TikFinity-Style, Default) vs. verteilter Regen.
    this.mode = props.mode === 'rain' ? 'rain' : 'fountain';
    // Quelle der Fontäne unten: Mitte / links / rechts (wie der Like-Button).
    this.sourceX = props.source === 'left' ? 18 : props.source === 'right' ? 82 : 50;
    this.gradBase = `${++GRAD_SEQ}-${Math.random().toString(36).slice(2, 7)}`;
    this.gradN = 0;

    this.el = document.createElement('div');
    this.el.className = 'bx-hr';
    root.appendChild(this.el);
    this.live = 0; // cap gegen like-fluten
    this.timers = new Set();
  }
  onEvent(event) {
    if (event.type !== 'like') return;
    const n = heartsForLike(event.likeCount, this.mode, this.maxPerBurst);
    // Dichter Strom: kleinere Lücke zwischen den Herzen.
    const gap = this.mode === 'fountain' ? 45 : 75;
    for (let i = 0; i < n; i++) {
      const t = setTimeout(() => { this.timers.delete(t); this.spawn(); }, i * gap);
      this.timers.add(t);
    }
  }
  // SVG-Herz/Funken (Default) — Token-Farben mit leichter Hue-Variation pro Sprite.
  spriteHtml() {
    const id = `${this.gradBase}-${this.gradN++}`;
    // ~1 von 6 wird ein Funken, der Rest ein Herz → dezente Abwechslung.
    if (Math.random() < 0.17) {
      return sparkSVG(id, 'var(--bx-gold, #ffd23e)', 'var(--bx-accent-2, #ff9d3d)');
    }
    // Farbton variiert zwischen Pink (Token) und Akzent/Rot.
    const toPink = Math.random();
    const base = this.accent
      ? `color-mix(in srgb, var(--bx-pink, #ff5e8a) ${Math.round(toPink * 100)}%, var(--bx-accent))`
      : `color-mix(in srgb, var(--bx-pink, #ff5e8a) ${Math.round(40 + toPink * 60)}%, var(--bx-accent, #ff5436))`;
    const accent = 'color-mix(in srgb, #ffffff 35%, var(--bx-pink, #ff5e8a))';
    const tilt = (Math.random() - 0.5) * 16; // kleine Rotation im Sprite selbst
    return heartSVG(id, tilt.toFixed(1), base, accent);
  }
  spawn() {
    if (this.live > 130) return; // harte obergrenze (TTLS-schonend, jetzt großzügiger)
    const e = document.createElement('div');
    const fount = this.mode === 'fountain';
    e.className = fount ? 'bx-hr-e fount' : 'bx-hr-e';
    // Fontäne: kleine Mini-Herzen. Regen: groß für 1080×1920.
    const size = fount ? 18 + Math.random() * 18 : 38 + Math.random() * 34;
    if (this.useEmojis) {
      e.textContent = this.emojis[Math.floor(Math.random() * this.emojis.length)] || '❤️';
      e.style.fontSize = `${size}px`;
    } else {
      e.style.width = `${size}px`;
      e.style.height = `${size}px`;
      e.innerHTML = this.spriteHtml();
    }
    if (fount) {
      // Alle aus EINER Quelle unten, fächern seitlich auf.
      e.style.left = `${this.sourceX + (Math.random() - 0.5) * 6}%`;
      e.style.setProperty('--src-y', '3%');
      e.style.setProperty('--dur', `${2.4 + Math.random() * 1.4}s`);
      e.style.setProperty('--drift', `${(Math.random() - 0.5) * 240}px`);
      e.style.setProperty('--scale', `${0.85 + Math.random() * 0.4}`);
      e.style.setProperty('--rot', `${(Math.random() - 0.5) * 40}deg`);
    } else {
      e.style.left = `${6 + Math.random() * 88}%`;
      e.style.setProperty('--dur', `${3 + Math.random() * 1.8}s`);
      e.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
      e.style.setProperty('--rot', `${(Math.random() - 0.5) * 50}deg`);
    }
    this.el.appendChild(e);
    this.live++;
    const t = setTimeout(() => { this.timers.delete(t); e.remove(); this.live--; }, 5200);
    this.timers.add(t);
  }
  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el.remove();
  }
}
