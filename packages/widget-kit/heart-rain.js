// heart-rain.js — Like-Fontäne im TikFinity-Stil: bei Likes steigen bunte Herzen
// (+ Funken + ab und zu das Profilbild des Likers) ÜBER DIE GANZE BREITE verteilt,
// leicht versetzt, sanft schwingend und hoch hinaus auf. Transparent, deckt nichts zu.
// props: { emojis?, accent?, maxPerBurst?, source?, mode? }
//
// Default: gerenderte Herz-/Funken-Sprites als Inline-SVG (Gradient + Glow). Setzt
// der User eigene Emojis (≠ Default), werden diese genutzt. Like-Fluten-Cap bleibt.
const STYLE_ID = 'bx-hr-style';
const DEFAULT_EMOJIS = '❤️,💖,💕,✨,🔥';
const CSS = `
.bx-hr { position: absolute; inset: 0; overflow: hidden; pointer-events: none; container-type: size; }
/* Schriftgröße wächst mit der Box mit (Referenz: 1000px kurze Seite ⇒ 3.4cqmin
   ≈ die früheren 34px), bleibt aber lesbar gedeckelt. */
.bx-hr-e { position: absolute; bottom: -6%; opacity: 0;
  font-size: calc(clamp(18px, 3.4cqmin, 96px) * var(--bx-fs, 1)); line-height: 1; display: block;
  filter: drop-shadow(0 0 9px var(--bx-glow, rgba(255,94,138,.6))) drop-shadow(0 2px 6px rgba(0,0,0,.4));
  animation: bx-hr-rise var(--dur,5s) cubic-bezier(.33,.32,.36,1) forwards; }
.bx-hr-e svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* Profilbild des Likers — runde Scheibe mit Akzent-Ring. Baut auf .bx-av aus
   widget-base.css auf (Initiale + Farbton als Fallback), ergänzt nur den Ring. */
.bx-hr-pb { box-shadow: 0 0 0 2.5px var(--bx-pbring, #ff5e8a), 0 0 16px -2px var(--bx-pbring, #ff5e8a); }
/* Aufstieg in cqh = relativ zur WIDGET-Höhe (nicht zur Herz-Größe!) → die Herzen
   steigen über die ganze Box hinaus, nicht nur 1-2 cm. */
@keyframes bx-hr-rise {
  0%   { opacity: 0; transform: translateY(0) translateX(0) scale(.4) rotate(0); }
  9%   { opacity: 1; transform: translateY(-8cqh) scale(1); }
  /* Sanftes Schlängeln: Drift kehrt mehrfach um → S-Kurve statt schräger Linie. */
  35%  { transform: translateY(-38cqh) translateX(calc(var(--drift,0px) * -.55)) scale(1.04); }
  62%  { opacity: 1; transform: translateY(-68cqh) translateX(calc(var(--drift,0px) * .7)) scale(1.04); }
  85%  { opacity: .96; transform: translateY(-95cqh) translateX(calc(var(--drift,0px) * -.35)) scale(1); }
  100% { opacity: 0; transform: translateY(-118cqh) translateX(var(--drift,0px)) scale(.92) rotate(var(--rot,0deg)); }
}
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

// Bunte Basis-Töne (wie die TikFinity-Gems): Pink/Rot/Gold/Türkis/Lila/Blau.
const HEART_COLORS = ['#ff5e8a', '#ff3b6b', '#ffd23e', '#28e0c4', '#b06cff', '#5b8cff', '#ff7a3d'];

let GRAD_SEQ = 0;

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

// Herz-Sprite als Inline-SVG. base/accent steuern den Farbverlauf, id macht den
// Gradient eindeutig, hue dreht das Herz leicht.
function heartSVG(id, hue, base, accent) {
  return `<svg viewBox="0 0 32 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><radialGradient id="hg${id}" cx="38%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#fff" stop-opacity=".95"/>
    <stop offset="34%" stop-color="${accent}"/>
    <stop offset="100%" stop-color="${base}"/>
  </radialGradient></defs>
  <g transform="rotate(${hue} 16 15)">
    <path d="M16 28.2C5.2 20.9 1 15.6 1 9.9 1 5.4 4.5 2 8.8 2c2.9 0 5.5 1.6 7.2 4 1.7-2.4 4.3-4 7.2-4C27.5 2 31 5.4 31 9.9c0 5.7-4.2 11-15 18.3z" fill="url(#hg${id})"/>
    <ellipse cx="11.5" cy="9.5" rx="3.4" ry="2.4" fill="#fff" opacity=".5"/>
  </g></svg>`;
}

// Funken-/Sternchen-Sprite für dezente Abwechslung.
function sparkSVG(id, base, accent) {
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><radialGradient id="sg${id}" cx="50%" cy="50%" r="55%">
    <stop offset="0%" stop-color="#fff"/><stop offset="55%" stop-color="${accent}"/><stop offset="100%" stop-color="${base}"/>
  </radialGradient></defs>
  <path d="M16 1c1.2 6.6 2.4 7.8 9 9-6.6 1.2-7.8 2.4-9 9-1.2-6.6-2.4-7.8-9-9 6.6-1.2 7.8-2.4 9-9z" fill="url(#sg${id})"/>
</svg>`;
}

function cssUrl(u) { return String(u || '').replace(/["\\]/g, ''); }

/** Farbton/Initiale für den .bx-av-Fallback (kein Profilbild vorhanden).
 *  Bewusst lokal dupliziert — die Widgets haben kein gemeinsames JS-Modul. */
function bxAvHue(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; // streut besser als eine reine Summe
  return h;
}
function bxAvInitial(name) {
  const s = String(name || '').trim();
  return (s ? s[0] : '?').toUpperCase();
}

export default class HeartRain {
  constructor(root, props, ctx) {
    ensureStyle();
    this.host = ctx || {};
    const raw = props.emojis == null ? '' : String(props.emojis);
    const trimmed = raw.trim();
    this.useEmojis = trimmed !== '' && trimmed !== DEFAULT_EMOJIS;
    this.emojis = this.useEmojis ? trimmed.split(',').map((e) => e.trim()).filter(Boolean) : [];
    if (this.useEmojis && this.emojis.length === 0) this.useEmojis = false;

    const accent = props.accent && String(props.accent).trim();
    if (accent) root.style.setProperty('--bx-accent', accent);
    root.style.setProperty('--bx-glow', accent ? `color-mix(in srgb, ${accent} 70%, transparent)` : 'var(--bx-pink, rgba(255,94,138,.6))');
    this.accent = accent || '';

    this.maxPerBurst = Math.min(28, Math.max(1, Number(props.maxPerBurst ?? 16)));
    this.mode = props.mode === 'rain' ? 'rain' : 'fountain';
    // Profilbild der Liker zeigen? (TikFinity-Style: ab und zu das echte Foto)
    this.showAvatars = props.avatars !== false;
    this.gradBase = `${++GRAD_SEQ}-${Math.random().toString(36).slice(2, 7)}`;
    this.gradN = 0;

    this.el = document.createElement('div');
    this.el.className = 'bx-hr';
    root.appendChild(this.el);
    this.live = 0;
    this.timers = new Set();

    // Editor-Vorschau: laufend Likes simulieren, sonst ist die Box leer und man
    // sieht weder Größe der Herzen noch die Steighöhe.
    if (this.host.preview) {
      const names = ['Mia', 'LeonGG', 'Nova', 'ExE', 'BigBen'];
      let i = 0;
      const tick = () => this.onEvent({ type: 'like', likeCount: 12, user: { nickname: names[i++ % names.length] } });
      const t0 = setTimeout(tick, 200); this.timers.add(t0);
      this.demoInterval = setInterval(tick, 900);
    }
  }

  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'like') return;
    const n = heartsForLike(event.likeCount, this.mode, this.maxPerBurst);
    const name = (event.user && event.user.nickname) || '';
    // Auch OHNE Profilbild-URL eine Scheibe mitschicken: der .bx-av-Fallback
    // (Farbton aus dem Namen + Initiale) ist besser als gar kein Liker-Zeichen.
    const avatar = this.showAvatars ? ((event.user && event.user.profilePic) || '') : null;
    // Über die ganze Breite, leicht zeitlich versetzt (kleiner Gap → dichter Strom).
    const gap = 38;
    for (let i = 0; i < n; i++) {
      // Pro Schwung ~1 Profilbild des Likers (wenn vorhanden) mitsteigen lassen.
      const withPb = avatar !== null && i === Math.floor(n / 2);
      const t = setTimeout(() => { this.timers.delete(t); this.spawn(withPb ? { url: avatar, name } : null); }, i * gap);
      this.timers.add(t);
    }
  }

  // Buntes Herz/Funken (Default) — zufälliger Farbton aus der Palette.
  spriteHtml() {
    const id = `${this.gradBase}-${this.gradN++}`;
    if (Math.random() < 0.16) {
      return sparkSVG(id, 'var(--bx-gold, #ffd23e)', 'var(--bx-accent-2, #ff9d3d)');
    }
    // Akzentfarbe gesetzt → an den Akzent halten; sonst die bunte Palette.
    const base = this.accent
      ? `color-mix(in srgb, var(--bx-accent) ${50 + Math.round(Math.random() * 40)}%, #ff5e8a)`
      : HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
    const accent = 'color-mix(in srgb, #ffffff 38%, ' + (this.accent ? 'var(--bx-accent)' : base) + ')';
    const tilt = (Math.random() - 0.5) * 16;
    return heartSVG(id, tilt.toFixed(1), base, accent);
  }

  spawn(avatar) {
    if (this.live > 150) return; // harte Obergrenze (TTLS-schonend)
    const e = document.createElement('div');
    e.className = 'bx-hr-e';
    // Über die ganze Breite verteilt — DAS ist der TikFinity-Look (nicht aus EINER Quelle).
    e.style.left = `${4 + Math.random() * 92}%`;
    // Längeres, höheres Aufsteigen + sanftes Schwingen.
    e.style.setProperty('--dur', `${4.4 + Math.random() * 2.2}s`);
    e.style.setProperty('--drift', `${(Math.random() - 0.5) * 150}px`);
    e.style.setProperty('--rot', `${(Math.random() - 0.5) * 36}deg`);

    if (avatar) {
      // Größen in cqmin statt px → wachsen mit der Widget-Box mit (Referenz:
      // 1000px kurze Seite entspricht den früheren 52–66px).
      const size = (5.2 + Math.random() * 1.4).toFixed(2);
      e.classList.add('bx-av', 'bx-hr-pb');
      e.style.width = `clamp(26px, ${size}cqmin, 150px)`;
      e.style.height = e.style.width;
      e.style.setProperty('--bx-av-h', String(bxAvHue(avatar.name)));
      e.setAttribute('data-initial', bxAvInitial(avatar.name));
      // Hintergrundbild NUR, wenn es wirklich eine URL gibt — sonst bleibt der
      // .bx-av-Fallback (Farbton + Initiale) sichtbar statt einer leeren Scheibe.
      if (avatar.url) {
        e.classList.add('bx-av-img');
        e.style.backgroundImage = `url("${cssUrl(avatar.url)}")`;
      }
      const ring = this.accent ? 'var(--bx-accent)' : HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
      e.style.setProperty('--bx-pbring', ring);
    } else {
      const size = (2.4 + Math.random() * 2.4).toFixed(2);
      if (this.useEmojis) {
        e.textContent = this.emojis[Math.floor(Math.random() * this.emojis.length)] || '❤️';
        // Bugfix: Inline-Style überschrieb bisher die --bx-fs-skalierte CSS-Regel
        // (.bx-hr-e) OHNE selbst den Faktor zu berücksichtigen — die Textgröße
        // (fontScale) hatte bei eigenen Emojis dadurch keinerlei sichtbaren Effekt.
        e.style.fontSize = `calc(clamp(14px, ${size}cqmin, 110px) * var(--bx-fs, 1))`;
      } else {
        e.style.width = `clamp(14px, ${size}cqmin, 110px)`;
        e.style.height = e.style.width;
        e.innerHTML = this.spriteHtml();
      }
    }
    this.el.appendChild(e);
    this.live++;
    const t = setTimeout(() => { this.timers.delete(t); e.remove(); this.live--; }, 6800);
    this.timers.add(t);
  }

  destroy() {
    clearInterval(this.demoInterval);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el.remove();
  }
}
