// gift-fireworks.js — Geschenke-Feuerwerk: pro Gift steigt eine Rakete auf
// und explodiert in einem Partikel-Burst. Größe/Anzahl skaliert mit dem
// Coin-Wert, das Gift-Bild erscheint im Zentrum der Explosion.
// props: { minCoins?: number, maxRockets?: number }
//
// Performance (TTLS!): ein Canvas, rAF nur solange etwas fliegt,
// harte Caps für Raketen & Partikel (Gift-Bombing-sicher, H6).

import { comboPlan } from './combo.js';

const STYLE_ID = 'bx-fw-style';
const CSS = `
.bx-fw { position: absolute; inset: 0; pointer-events: none; }
.bx-fw canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-fw-icon {
  position: absolute; width: 72px; height: 72px; margin: -36px 0 0 -36px;
  object-fit: contain; pointer-events: none;
  filter: drop-shadow(0 0 18px rgba(255,255,255,.7));
  animation: bx-fw-icon 1400ms cubic-bezier(.2,1.4,.4,1) forwards;
}
@keyframes bx-fw-icon {
  0% { transform: scale(.2); opacity: 0; }
  18% { transform: scale(1.25); opacity: 1; }
  30% { transform: scale(1); }
  78% { transform: scale(1); opacity: 1; }
  100% { transform: scale(.6) translateY(-20px); opacity: 0; }
}
/* Neon-Name im Explosionszentrum (TikFinity-Style): leuchtender Script-Schriftzug. */
.bx-fw-name {
  position: absolute; transform: translate(-50%,-50%); margin-top: 52px;
  font-family: var(--bx-font-display); font-style: italic; font-weight: 700; white-space: nowrap;
  color: var(--bx-accent, #ffd23e); pointer-events: none; letter-spacing: .01em;
  text-shadow: 0 0 10px var(--bx-accent,#ffd23e), 0 0 22px var(--bx-accent,#ffd23e), 0 2px 6px rgba(0,0,0,.7);
  animation: bx-fw-name 1700ms cubic-bezier(.2,1.4,.4,1) forwards;
}
@keyframes bx-fw-name {
  0% { transform: translate(-50%,-50%) scale(.3); opacity: 0; }
  20% { transform: translate(-50%,-50%) scale(1.12); opacity: 1; }
  32% { transform: translate(-50%,-50%) scale(1); }
  80% { opacity: 1; }
  100% { transform: translate(-50%,-50%) scale(1) translateY(-16px); opacity: 0; }
}
/* Profilbild + Name als EINE Leiste im Explosionszentrum.
   Bewusst eine EIGENE Klasse statt .bx-fw-name umzubauen: Wer kein Profilbild
   eingeschaltet hat (Standard), bekommt exakt die bisherige freistehende
   Schrift — bestehende Overlays dürfen sich nicht verändern. */
.bx-fw-tag {
  position: absolute; transform: translate(-50%,-50%); margin-top: 56px;
  display: flex; align-items: center; gap: .42em; white-space: nowrap; pointer-events: none;
  animation: bx-fw-name 1700ms cubic-bezier(.2,1.4,.4,1) forwards;
}
/* Gleiche Typografie wie .bx-fw-name, aber ohne Positionierung/Animation —
   die übernimmt die Leiste. */
.bx-fw-nm {
  font-family: var(--bx-font-display); font-style: italic; font-weight: 700;
  color: var(--bx-accent, #ffd23e); letter-spacing: .01em;
  text-shadow: 0 0 10px var(--bx-accent,#ffd23e), 0 0 22px var(--bx-accent,#ffd23e), 0 2px 6px rgba(0,0,0,.7);
}
/* Runde Scheibe mit Leuchtring. Baut auf .bx-av aus widget-base.css auf
   (Initiale + Farbton als Rückfall, wenn TikTok kein Bild mitschickt). */
.bx-fw-pb {
  flex: none; border-radius: 50%; object-fit: cover;
  box-shadow: 0 0 0 2.5px var(--bx-accent, #ffd23e), 0 0 18px -2px var(--bx-accent, #ffd23e);
}
`;

// Bild-Cache: pro URL ein Image, geteilt über Instanzen.
const imageCache = new Map();
function loadImage(url) {
  if (!url) return null;
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

function cssUrl(u) { return String(u || '').replace(/["\\]/g, ''); }

/** Farbton/Initiale für den .bx-av-Rückfall (kein Profilbild vorhanden).
 *  Bewusst lokal — die Widgets teilen sich kein JS-Modul (gleiches Muster wie
 *  in heart-rain.js). */
function bxAvHue(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function bxAvInitial(name) {
  const s = String(name || '').trim();
  return (s ? s[0] : '?').toUpperCase();
}

// Referenz-Box für alle Pixel-Maße (Icon, Name, Rakete) → siehe resize()/this.s.
const REF = 900;

/** ERZEUGTE Farbharmonie pro Burst (nur Stil „pro").
 *
 *  Statt fünf fest verdrahteter Paletten bekommt jede Rakete eine eigene,
 *  zufällig erzeugte — aber nicht beliebig bunt, sondern nach einer Harmonie:
 *  entweder zwei benachbarte Töne (ruhig, edel) oder Komplementärfarben
 *  (knallig). Dazu ein sehr heller Kernton aus der Mitte. Dadurch sieht kein
 *  Burst aus wie der vorige, ohne dass es nach Farbunfall aussieht. */
function erzeugePalette() {
  const h = Math.random() * 360;
  const komplementaer = Math.random() < 0.45;
  const h2 = komplementaer
    ? (h + 180 + (Math.random() - 0.5) * 40 + 360) % 360
    : (h + 22 + Math.random() * 26) % 360;
  const hm = (h + (((h2 - h + 540) % 360) - 180) / 2 + 360) % 360;
  return [
    `hsl(${h.toFixed(0)} 100% 63%)`,
    `hsl(${h2.toFixed(0)} 100% 67%)`,
    `hsl(${hm.toFixed(0)} 100% 88%)`,
  ];
}

const PALETTES = [
  ['#ffd23e', '#ff9d2e', '#fff3c4'],
  ['#21e6c1', '#6dffe3', '#d2fff5'],
  ['#ff4d2e', '#ff8a3d', '#ffd9c4'],
  ['#ff5e8a', '#ff9ab8', '#ffe1ea'],
  ['#7cc8ff', '#b8e2ff', '#ffffff'],
];

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}


// Anti-Throttle: der TTLS-Browser drosselt requestAnimationFrame auf ~1/s
// (Offscreen-Rendering). Fallback-Timer springt ein, wenn rAF nicht feuert —
// gesunder Browser läuft mit vollen FPS (Timer wird jedes Frame gecancelt).
function scheduleFrame(cb) {
  const raf = requestAnimationFrame(cb);
  const timer = setTimeout(() => { cancelAnimationFrame(raf); cb(performance.now()); }, 55);
  return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
}

export default class GiftFireworks {
  constructor(root, props, ctx) {
    ensureStyle();
    // Widget-Kontext (playSound etc.) getrennt halten — this.ctx wird unten mit
    // dem Canvas-2D-Kontext belegt, würde playSound sonst verschlucken.
    this.host = ctx || {};
    // Sounds passend zur Animation: Pfeife beim Aufstieg, Boom bei der Explosion.
    // Lokal über die App gespielt (host.playSound → WS-Backchannel, dedupliziert).
    this.whistleSound = props.whistleSoundId ?? 'botexe-pfeife.wav';
    this.boomSound = props.soundId ?? 'botexe-boom.wav';
    // Schnell-Modus (TTLS ohne GPU): weniger Partikel, gleicher Look.
    this.perf = document.documentElement.classList.contains('bx-perf');
    this.particleCap = this.perf ? 320 : 620;
    this.minCoins = Number(props.minCoins ?? 0);
    // maxRockets = wie viele Raketen eine Combo höchstens auffächert (10x Rose
    // → 10 Raketen). Default deutlich höher als früher (war 3 → „1 Rakete"-Bug).
    this.maxRockets = Math.min(20, Math.max(1, Number(props.maxRockets ?? 12)));
    // Im Editor einstellbar: Combo-Verhalten + Burst-Größe.
    this.comboMode = props.comboMode === 'single' ? 'single' : 'fan';
    this.burstScale = Number(props.burstScale ?? 1) || 1;
    // Burst-Form: klassischer Kugel-Burst · Herz · Stern (Explosion entlang der Form).
    this.shape = ['kreis', 'herz', 'stern', 'spirale', 'blume'].includes(props.shape) ? props.shape : 'kreis';
    // Neon-Name des Schenkenden im Explosionszentrum (TikFinity-Style), default an.
    this.showName = props.showName !== false;
    // NEUE OPTIK als eigener Stil-Wert — 'klassisch' bleibt Standard, damit sich
    // bestehende Overlays durch ein Update nicht verändern.
    // 'pro' ergänzt: Druckwelle beim Knall, nachglühende Trauerweiden-Schweife,
    // Knistern (crackle) kurz nach dem Burst und einen dichteren Kometen-Schweif.
    this.stil = props.stil === 'pro' ? 'pro' : 'klassisch';
    // Was steigt auf: klassische Rakete, eine Boden-FONTÄNE (sprüht vom unteren
    // Rand nach oben) oder beides zusammen.
    this.typ = ['rakete', 'fontaene', 'beides'].includes(props.typ) ? props.typ : 'rakete';
    // Profilbild des Schenkenden neben dem Namen. Standard AUS → unveränderte Optik.
    this.showPb = props.showPb === true;
    // Partikel-Dichte als Regler (skaliert Ring/Kern/Glitzer gemeinsam).
    this.dichte = Math.min(2, Math.max(0.4, Number(props.dichte ?? 1) || 1));
    this.fountains = [];
    // Harte Obergrenze gleichzeitig fliegender Raketen (Gift-Bombing-sicher).
    this.rocketCap = this.perf ? 16 : 28;
    this.staggerMs = 70; // Combo-Raketen fächern als Volley auf
    this.rockets = [];
    this.particles = [];
    this.running = false;
    this.lastT = 0;
    this.pendingTimers = new Set();

    this.el = document.createElement('div');
    this.el.className = 'bx-fw';
    this.el.innerHTML = '<canvas></canvas>';
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.frame = this.frame.bind(this);
    this.resize = this.resize.bind(this);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(root);
    this.resize();
    // Editor-Vorschau: von selbst feuern, sonst ist die Box im Editor leer und
    // man kann Größe/Position des Effekts nicht beurteilen.
    if (this.host.preview) {
      const names = ['Mia', 'LeonGG', 'Nova', 'ExE'];
      let i = 0;
      const shot = () => this.launch({ totalCoins: 600, count: 3, icon: '' }, names[i++ % names.length]);
      const t0 = setTimeout(shot, 300);
      this.pendingTimers.add(t0);
      this.demoInterval = setInterval(shot, 2400);
    }
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    if (r.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width;
    this.h = r.height;
    // Größen-Faktor gegen die Referenz-Box (900px kurze Seite): Gift-Bild,
    // Neon-Name und Raketen-Sprite wachsen mit dem Widget mit statt fix zu bleiben.
    this.s = Math.max(0.45, Math.min(2.6, Math.min(r.width, r.height) / REF));
  }

  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'gift' || !event.gift) return;
    if (event.gift.totalCoins < this.minCoins) return;
    this.launch(event.gift, event.user?.nickname, event.user?.profilePic);
  }

  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    const p = action.params || {};
    this.launch({ totalCoins: Number(p.coins ?? 100), count: Number(p.count ?? 1), icon: p.icon }, p.name, p.pb);
  }

  // Eine Combo (z.B. 10x Rose) fächert in mehrere Raketen auf — Anzahl & Stärke
  // kommen aus comboPlan (count + Coin-Wert), nicht mehr nur aus totalCoins.
  launch(gift, name, pb) {
    const plan = comboPlan(gift, this.maxRockets, { mode: this.comboMode, burstScale: this.burstScale });
    const img = loadImage(gift.icon);
    const showName = this.showName && name ? String(name) : '';
    // Die Fontäne sprüht vom unteren Rand — sie braucht keine Rakete und
    // explodiert nicht. Bei „beides" läuft sie zusätzlich zum Raketen-Volley.
    if (this.typ === 'fontaene' || this.typ === 'beides') {
      this.spawnFountain(plan.power, showName, pb);
    }
    if (this.typ === 'fontaene') return;
    for (let i = 0; i < plan.rockets; i++) {
      if (i === 0) {
        // Name nur an der ersten Rakete → erscheint einmal zentral, nicht pro Burst.
        // Bei „beides" trägt die Fontäne den Namen schon → hier nicht doppelt.
        const n = this.typ === 'beides' ? '' : showName;
        this.spawnRocket(plan.power, gift.icon, img, n, this.typ === 'beides' ? '' : pb);
      } else {
        // Volley: leicht gestaffelt für den „peng-peng-peng"-Effekt.
        const t = setTimeout(() => {
          this.pendingTimers.delete(t);
          this.spawnRocket(plan.power, gift.icon, img, '', '');
        }, i * this.staggerMs);
        this.pendingTimers.add(t);
      }
    }
  }

  /** Boden-Fontäne: sprüht über ~1–1,7 s einen Funkenkegel nach oben, der durch
   *  die Schwerkraft wieder herabfällt. Kein Aufstieg, kein Knall — der ruhige
   *  Bruder der Rakete, gut für Dauerbetrieb ohne Krach. */
  spawnFountain(power, name = '', pb = '') {
    if (!this.w || !this.h) { this.resize(); if (!this.w || !this.h) return; }
    if (this.fountains.length >= (this.perf ? 3 : 6)) return; // backpressure
    const x = this.w * (0.14 + Math.random() * 0.72);
    this.fountains.push({
      x,
      y: this.h * 0.98,
      power,
      // Stil „pro": frisch erzeugte Farbharmonie je Burst. „klassisch" behält
      // die fünf festen Paletten, damit sich Bestehendes nicht verändert.
      palette: this.stil === 'pro' ? erzeugePalette() : PALETTES[Math.floor(Math.random() * PALETTES.length)],
      // Ende an der WANDUHR, nicht an dt heruntergezählt: Liefern zwei Bilder
      // denselben Zeitstempel (rAF und der Fallback-Timer aus scheduleFrame
      // kommen aus verschiedenen Quellen), ist dt = 0 — eine über dt
      // heruntergezählte Restzeit stünde dann still, die Fontäne sprühte
      // endlos und die Animationsschleife liefe für immer weiter. Lautlos.
      endeAt: performance.now() + 900 + 800 * power,
    });
    // Name/Profilbild einmal über der Fontäne einblenden.
    if (name || (this.showPb && pb)) this.zeigeTag(x, this.h * 0.62, power, name, pb);
    this.kick();
  }

  spawnRocket(power, icon, img, name = '', pb = '') {
    // Ohne vermessene Fläche keine Rakete (Vorbild: spawn() in gift-jar.js).
    // Ist die Ebene beim Overlay-Start ausgeblendet, liefert getBoundingClientRect
    // 0 → resize() steigt aus → this.w/this.h bleiben undefiniert. Die Raketen
    // bekämen dann NaN-Koordinaten, explodierten nie, würden nie aufgeräumt —
    // nach ~28 Stück war der Deckel voll und das Feuerwerk für den Rest des
    // Streams tot, während die Animationsschleife dauerhaft weiterlief (CPU).
    if (!this.w || !this.h) { this.resize(); if (!this.w || !this.h) return; }
    if (this.rockets.length >= this.rocketCap) return; // backpressure
    // Aufstiegs-Pfeifen (Server dedupliziert mehrfaches Auslösen einer Salve).
    if (this.whistleSound) this.host.playSound?.(this.whistleSound);
    this.rockets.push({
      // Im Stil „pro" fliegen die Funken als lange Striche viel weiter — startet
      // die Rakete zu weit außen, wird der halbe Burst vom Rand abgeschnitten.
      // Deshalb dort ein engerer Startbereich. „klassisch" bleibt unverändert.
      x: this.w * (this.stil === 'pro' ? 0.3 + Math.random() * 0.4 : 0.18 + Math.random() * 0.64),
      y: this.h + 6,
      vx: (Math.random() - 0.5) * 1.4,
      vy: -(this.h * 0.012 + this.h * 0.006 * power) - Math.random() * 2,
      targetY: this.h * (0.42 - 0.22 * power) + Math.random() * this.h * 0.1,
      // Stil „pro": frisch erzeugte Farbharmonie je Burst. „klassisch" behält
      // die fünf festen Paletten, damit sich Bestehendes nicht verändert.
      palette: this.stil === 'pro' ? erzeugePalette() : PALETTES[Math.floor(Math.random() * PALETTES.length)],
      power,
      icon,
      img,
      name,
      pb,
      wobble: Math.random() * Math.PI * 2,
      trail: 0,
    });
    this.kick();
  }

  explode(r) {
    // Boom passend zur Explosion (Server dedupliziert die Salve auf ~1 Knall).
    if (this.boomSound) this.host.playSound?.(this.boomSound);
    // Heller Initial-Blitz im Zentrum.
    this.flash(r.x, r.y, 26 + 60 * r.power);
    // Mehrfarbig: zweite Palette dazu → bunter „Verbund"-Look.
    // Zweite Ringfarbe. Im Pro-Stil ebenfalls erzeugt — sonst liefe
    // PALETTES.indexOf() auf einer erzeugten Palette ins Leere (-1) und mischte
    // eine fremde feste Farbe in die Harmonie.
    const pal2 = this.stil === 'pro'
      ? erzeugePalette()
      : PALETTES[(PALETTES.indexOf(r.palette) + 2 + Math.floor(Math.random() * 2)) % PALETTES.length];
    this.burst(r.x, r.y, r.power, r.palette, pal2, 1);
    // Stil „pro": Druckwelle, herabfallende Weiden-Bögen und Knistern obendrauf.
    if (this.stil === 'pro') {
      this.schockwelle(r.x, r.y, r.power);
      this.weide(r.x, r.y, r.power, r.palette);
      this.knistern(r.x, r.y, r.power);
    }
    // Verbund: kräftige Raketen brechen oben in mehrere kleine Nach-Bursts
    // („multi-break shell") — leicht versetzt in Ort und Zeit.
    if (r.power > 0.45 && !this.perf) {
      const breaks = 2 + Math.floor(r.power * 3);
      for (let i = 0; i < breaks; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = (24 + Math.random() * 46) * (0.6 + r.power);
        const bx = r.x + Math.cos(ang) * dist;
        const by = r.y + Math.sin(ang) * dist;
        const t = setTimeout(() => {
          this.pendingTimers.delete(t);
          this.flash(bx, by, 14 + 24 * r.power);
          this.burst(bx, by, r.power * 0.55, pal2, r.palette, 0.7);
          this.kick();
        }, 160 + i * 90);
        this.pendingTimers.add(t);
      }
    }
    if (r.icon) {
      const img = document.createElement('img');
      img.className = 'bx-fw-icon';
      img.src = r.icon;
      img.style.left = `${(r.x / this.w) * 100}%`;
      img.style.top = `${(r.y / this.h) * 100}%`;
      img.style.width = `${((58 + 64 * r.power) * (this.s || 1)).toFixed(0)}px`;
      img.style.height = img.style.width;
      this.el.appendChild(img);
      setTimeout(() => img.remove(), 1500);
    }
    if (r.name || (this.showPb && r.pb)) this.zeigeTag(r.x, r.y, r.power, r.name, r.pb);
  }

  /**
   * Name (+ optional Profilbild) des Schenkenden einblenden.
   *
   * OHNE Profilbild wird exakt das bisherige freistehende Neon-Schild gebaut —
   * gleiche Klasse, gleiche Animation. Erst mit eingeschaltetem Profilbild
   * entsteht die Leiste aus Scheibe + Name. So verändert das Update keine
   * bestehende Einrichtung.
   */
  zeigeTag(x, y, power, name, pb) {
    const groesse = ((26 + 26 * power) * (this.s || 1)).toFixed(0);
    const links = `${(x / this.w) * 100}%`;
    const oben = `${(y / this.h) * 100}%`;

    if (!this.showPb) {
      if (!name) return;
      const nm = document.createElement('div');
      nm.className = 'bx-fw-name';
      nm.textContent = name;
      nm.style.left = links;
      nm.style.top = oben;
      nm.style.fontSize = `${groesse}px`;
      this.el.appendChild(nm);
      const t = setTimeout(() => { this.pendingTimers.delete(t); nm.remove(); }, 1750);
      this.pendingTimers.add(t);
      return;
    }

    const tag = document.createElement('div');
    tag.className = 'bx-fw-tag';
    tag.style.left = links;
    tag.style.top = oben;
    tag.style.fontSize = `${groesse}px`;

    const scheibe = document.createElement('div');
    // .bx-av liefert Initiale + Farbton, wenn kein Bild da ist — besser als eine
    // leere Scheibe (gleiches Muster wie in der Like-Fontäne).
    scheibe.className = 'bx-av bx-fw-pb';
    scheibe.style.width = `${(Number(groesse) * 1.5).toFixed(0)}px`;
    scheibe.style.height = scheibe.style.width;
    scheibe.style.setProperty('--bx-av-h', String(bxAvHue(name)));
    scheibe.setAttribute('data-initial', bxAvInitial(name));
    if (pb) {
      scheibe.classList.add('bx-av-img');
      scheibe.style.backgroundImage = `url("${cssUrl(pb)}")`;
    }
    tag.appendChild(scheibe);

    if (name) {
      const nm = document.createElement('span');
      nm.className = 'bx-fw-nm';
      nm.textContent = name;
      tag.appendChild(nm);
    }
    this.el.appendChild(tag);
    const t = setTimeout(() => { this.pendingTimers.delete(t); tag.remove(); }, 1750);
    this.pendingTimers.add(t);
  }

  // Ein Burst: farbiger Außenring (zwei Paletten gemischt) + heller Kern +
  // funkelnde Glitzer-Sterne. amount skaliert Anzahl (für Nach-Bursts kleiner).
  /** Richtungs-Vektor für Ring-Partikel i/n je nach Burst-Form. Herz/Stern:
   *  Radius folgt der Kurve — die Explosion zeichnet die Form in den Himmel. */
  ringVector(i, n) {
    const t = (Math.PI * 2 * i) / n + Math.random() * 0.08;
    if (this.shape === 'herz') {
      // Parametrische Herzkurve (klassisch), normiert auf ~1.
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return { dx: hx / 17, dy: -hy / 17 };
    }
    if (this.shape === 'stern') {
      // 5-zackiger Stern: Radius pulsiert zwischen Spitze (1) und Kerbe (0.45).
      const rr = 0.45 + 0.55 * Math.abs(Math.cos(2.5 * t));
      return { dx: Math.cos(t) * rr, dy: Math.sin(t) * rr };
    }
    if (this.shape === 'spirale') {
      // Galaxie-Spirale: Radius wächst mit dem Index, Winkel dreht mehrfach.
      const rr = 0.2 + 0.8 * (i / n);
      const a = t * 3;
      return { dx: Math.cos(a) * rr, dy: Math.sin(a) * rr };
    }
    if (this.shape === 'blume') {
      // Blüte: 6 Blütenblätter (Rosenkurve).
      const rr = 0.4 + 0.6 * Math.abs(Math.cos(3 * t));
      return { dx: Math.cos(t) * rr, dy: Math.sin(t) * rr };
    }
    return { dx: Math.cos(t), dy: Math.sin(t) };
  }

  burst(x, y, power, palA, palB, amount) {
    const scale = (this.perf ? 0.6 : 1) * amount * this.dichte;
    const ring = Math.round((60 + 150 * power) * scale);
    const core = Math.round((26 + 60 * power) * scale);
    const twinkles = Math.round((10 + 26 * power) * scale);
    let free = () => this.particleCap - this.particles.length;

    for (let i = 0; i < Math.min(ring, free()); i++) {
      const v = this.ringVector(i, ring);
      // Bei Formen weniger Streuung in der Geschwindigkeit — sonst verschmiert die Kontur.
      const speed = this.shape === 'kreis'
        ? (3.6 + Math.random() * 6.4) * (0.9 + power * 1.6)
        : (5.2 + Math.random() * 1.6) * (0.9 + power * 1.4);
      const pal = i % 2 === 0 ? palA : palB; // zwei Farben pro Ring
      this.particles.push({
        x, y, vx: v.dx * speed, vy: v.dy * speed,
        life: 1, decay: 0.007 + Math.random() * 0.008,
        color: pal[i % pal.length], r: 2 + Math.random() * 2.6 + power * 2.2,
      });
    }
    for (let i = 0; i < Math.min(core, free()); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1 + Math.random() * 2.6) * (0.8 + power);
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, decay: 0.014 + Math.random() * 0.012,
        color: palA[2], r: 2.6 + Math.random() * 2.8 + power * 2.2,
      });
    }
    // Glitzer: langlebige, langsam fallende Funken, die hell AUFBLITZEN (twinkle).
    for (let i = 0; i < Math.min(twinkles, free()); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.5 + Math.random() * 5) * (0.8 + power);
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, decay: 0.004 + Math.random() * 0.005,
        color: Math.random() < 0.5 ? '#ffffff' : palB[2],
        r: 1.4 + Math.random() * 1.8, twinkle: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Druckwelle: ein dünner Ring, der aus dem Knall herausläuft und verblasst.
   *  Der Effekt, der einem Feuerwerk erst Wucht gibt — vorher gab es nur den
   *  weichen Blitz. Nur im Stil „pro". */
  schockwelle(x, y, power) {
    if (this.particles.length >= this.particleCap) return;
    this.particles.push({
      x, y, vx: 0, vy: 0, life: 1, decay: 0.045,
      color: '#ffffff', r: (30 + 120 * power) * (this.s || 1), ring: true,
    });
  }

  /** Trauerweide: wenige, langlebige Funken mit kräftiger Schwerkraft — sie
   *  fallen in langen, golden nachglühenden Bögen herab. Das ist der Effekt,
   *  den man von echten Großfeuerwerken kennt. */
  weide(x, y, power, palette) {
    const n = Math.round((this.perf ? 10 : 22) * (0.5 + power) * this.dichte);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.particleCap) return;
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const speed = (3.4 + Math.random() * 3.2) * (0.8 + power);
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 1.2, // leicht nach oben, damit der Bogen hoch ansetzt
        life: 1, decay: 0.0026 + Math.random() * 0.002,
        color: Math.random() < 0.7 ? '#ffd9a0' : palette[0],
        r: 1.8 + Math.random() * 1.6,
        weide: true,
      });
    }
  }

  /** Knistern: kurz NACH dem Burst blitzen viele winzige Funken auf und
   *  verlöschen sofort — das „Prasseln" einer Crackle-Kugel. */
  knistern(x, y, power) {
    const t = setTimeout(() => {
      this.pendingTimers.delete(t);
      const n = Math.round((this.perf ? 16 : 40) * (0.4 + power) * this.dichte);
      for (let i = 0; i < n; i++) {
        if (this.particles.length >= this.particleCap) break;
        const ang = Math.random() * Math.PI * 2;
        const dist = (10 + Math.random() * 70) * (0.6 + power);
        this.particles.push({
          x: x + Math.cos(ang) * dist,
          y: y + Math.sin(ang) * dist,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          life: 1, decay: 0.055 + Math.random() * 0.05,
          color: '#ffffff', r: 1.2 + Math.random() * 1.4,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
      this.kick();
    }, 320);
    this.pendingTimers.add(t);
  }

  // Kurzer, sehr heller Lichtblitz (eine schnell verglühende Riesen-Funke).
  flash(x, y, radius) {
    if (this.particles.length >= this.particleCap) return;
    this.particles.push({
      x, y, vx: 0, vy: 0, life: 1,
      // Im Stil „pro" deutlich kleiner und schneller weg: Zwischen den scharfen
      // Funken-Strichen wirkte die große weiche Scheibe wie ein grauer Fleck.
      decay: this.stil === 'pro' ? 0.12 : 0.07,
      color: '#ffffff', r: this.stil === 'pro' ? radius * 0.45 : radius, flash: true,
    });
  }

  kick() {
    if (!this.running) {
      this.running = true;
      this.lastT = 0;
      this.cancelFrame = scheduleFrame(this.frame);
    }
  }

  frame(now) {
    // Die Sperre `running` fällt sonst NUR am regulären Ende dieser Schleife.
    // Stolpert das Zeichnen dazwischen (negativer Radius bei sehr flach
    // gezogener Box, NaN-Geometrie bei ausgeblendeter Ebene), bliebe sie für
    // den Rest der Sitzung stehen: Ein neues Geschenk ruft kick(), das sieht
    // running=true und plant kein Bild mehr — das Widget ist tot, ohne dass
    // irgendwo etwas im Log steht (ein Wurf im Animations-Callback läuft an
    // allen try/catch der Runtime vorbei). Gleiches Muster wie in wheel.js.
    try {
      this.frameIntern(now);
    } catch (err) {
      this.running = false;
      if (this.cancelFrame) { this.cancelFrame(); this.cancelFrame = null; }
      this.host?.notify?.(`Feuerwerk: Bild abgebrochen — ${err && err.message ? err.message : err}`);
    }
  }

  frameIntern(now) {
    if (this.cancelFrame) this.cancelFrame();
    // Delta-Time: bei niedriger FPS (TTLS!) bewegt sich alles gleich schnell,
    // nur mit weniger Zwischenbildern — statt in Zeitlupe zu ruckeln.
    // Untere Schranke 0 ist PFLICHT: rAF und der Fallback-Timer aus scheduleFrame
    // liefern Zeitstempel aus verschiedenen Quellen — gewinnt der Timer, kann
    // now < lastT sein. Ohne max(0,…) wird dt negativ: Partikel laufen rückwärts
    // und p.life STEIGT statt zu verfallen → blasse, kaum bewegte Funken.
    const dt = Math.max(0, Math.min(4, this.lastT ? (now - this.lastT) / 16.67 : 1));
    this.lastT = now;
    const ctx = this.ctx;
    if (this.stil === 'pro') {
      // NACHGLÜHEN statt hartem Löschen: Das Bild des letzten Frames wird nicht
      // weggeworfen, sondern nur ETWAS DURCHSICHTIGER gemacht. Dadurch zieht
      // jeder Funke eine verglühende Spur hinter sich her — das ist der
      // Unterschied zwischen „fliegende Punkte" und echtem Feuerwerk.
      //
      // ZWINGEND über 'destination-out': Ein halbtransparentes SCHWARZ mit
      // 'source-over' würde im Overlay einen schwarzen Kasten über das
      // Videobild legen. 'destination-out' senkt ausschließlich die
      // Deckkraft des schon Gezeichneten — der Hintergrund bleibt sauber
      // durchsichtig.
      ctx.globalCompositeOperation = 'destination-out';
      // An die Bildrate gekoppelt, sonst verblasst die Spur bei wenigen
      // Bildern je Sekunde (TTLS!) viel zu langsam und alles verschmiert.
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, 0.14 * dt)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.clearRect(0, 0, this.w, this.h);
    }

    // Raketen
    for (const r of this.rockets) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vy += 0.06 * dt;
      // Funken-Schweif — goldene Glitzer, die hinter der Rakete herrieseln.
      if (this.particles.length < this.particleCap) {
        const spark = Math.random() < 0.4;
        this.particles.push({
          x: r.x + (Math.random() - 0.5) * 3,
          y: r.y + 6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1 + Math.random(),
          life: 0.55,
          decay: 0.04,
          color: spark ? '#fff3c4' : r.palette[2],
          r: 1.4,
          ...(spark ? { twinkle: Math.random() * Math.PI * 2 } : {}),
        });
      }
      // Die Rakete IST das Geschenk: bild mit glow steigt auf
      r.wobble += 0.18 * dt;
      const size = (30 + 22 * r.power) * (this.s || 1);
      ctx.save();
      ctx.translate(r.x + Math.sin(r.wobble) * 2, r.y);
      ctx.rotate(Math.sin(r.wobble) * 0.12);
      if (!this.perf) {
        ctx.shadowColor = r.palette[0];
        ctx.shadowBlur = 18;
      }
      if (r.img && r.img.complete && r.img.naturalWidth > 0) {
        ctx.drawImage(r.img, -size / 2, -size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.restore();
      if (r.y <= r.targetY || r.vy >= -0.5) {
        this.explode(r);
        r.dead = true;
      }
    }
    this.rockets = this.rockets.filter((r) => !r.dead);

    // FONTÄNEN: sprühen laufend einen Funkenkegel nach oben. Die Schwerkraft
    // weiter unten holt die Funken zurück — daraus entsteht der typische Bogen.
    for (const f of this.fountains) {
      if (now >= f.endeAt) { f.dead = true; continue; }
      const proFrame = Math.round((this.perf ? 2 : 4) * this.dichte);
      for (let i = 0; i < proFrame; i++) {
        if (this.particles.length >= this.particleCap) break;
        // Enger Kegel nach oben (−90°), leicht gestreut.
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.62;
        const speed = (6.5 + Math.random() * 5.5) * (0.75 + f.power * 0.9);
        const pal = f.palette;
        this.particles.push({
          x: f.x + (Math.random() - 0.5) * 8 * (this.s || 1),
          y: f.y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          life: 1, decay: 0.008 + Math.random() * 0.008,
          color: pal[i % pal.length],
          r: 1.6 + Math.random() * 2.2,
          ...(Math.random() < 0.25 ? { twinkle: Math.random() * Math.PI * 2 } : {}),
        });
      }
    }
    this.fountains = this.fountains.filter((f) => !f.dead);

    // Partikel — additiv gezeichnet ('lighter'): überlappende Funken LEUCHTEN
    // statt sich zu überdecken. Glow als zweiter, großer transparenter Kreis
    // (deutlich billiger als shadowBlur pro Partikel).
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.flash) {
        // Blitz: bleibt am Ort, verglüht schnell als großer weicher Schein.
        p.life -= p.decay * dt;
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, p.life) * 0.6;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + (1 - p.life) * 0.8), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (p.ring) {
        // Druckwelle: bleibt am Ort, wächst als dünner Ring nach außen.
        p.life -= p.decay * dt;
        if (p.life <= 0) continue;
        const wachstum = 1 - p.life;
        ctx.globalAlpha = Math.max(0, p.life) * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 7 * p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.r * wachstum), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Weiden-Funken fallen deutlich schwerer — daher der lange Bogen nach unten.
      p.vy += (p.weide ? 0.11 : 0.05) * dt; // gravity
      p.vx *= Math.pow(p.weide ? 0.993 : 0.985, dt);
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      let alpha = Math.max(0, p.life);
      // Glitzer-Sterne blitzen rhythmisch auf (sin-Flacker) → Funkel-Effekt.
      if (p.twinkle !== undefined) {
        p.twinkle += 0.55 * dt;
        alpha *= 0.45 + 0.55 * Math.abs(Math.sin(p.twinkle));
      }
      const radius = p.r * (0.4 + p.life * 0.6);

      // STIL „PRO": Funken als kurze Striche IN FLUGRICHTUNG statt als runde
      // Scheiben. Das ist der eigentliche Unterschied zwischen „bunte Punkte"
      // und „Feuerwerk" — ein Funke ist eine glühende Bahn, kein Ball. Die
      // Länge kommt aus der Geschwindigkeit: schnelle Funken ziehen lange
      // Striche, austrudelnde werden von selbst wieder zu Pünktchen.
      if (this.stil === 'pro') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.28;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.7, radius * 1.05);
        ctx.lineCap = 'round';
        ctx.beginPath();
        // Kürzer als ohne Nachglühen: Die verglühende Spur zeichnet den
        // Schweif inzwischen selbst, ein langer Strich obendrauf verschmierte.
        ctx.moveTo(p.x - p.vx * 1.7, p.y - p.vy * 1.7);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        // Heißer Kopf: Ein echter Funke ist vorn fast weiß und kühlt nach
        // hinten aus. Solange er frisch ist (life hoch), sitzt vorn ein heller
        // Punkt — das gibt dem Burst Tiefe statt flacher Farbstriche.
        if (p.life > 0.45) {
          ctx.globalAlpha = alpha * (p.life - 0.45) * 1.6;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }

      ctx.fillStyle = p.color;
      // Außen-Glow
      ctx.globalAlpha = alpha * 0.22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
      // Kern
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.particles = this.particles.filter((p) => p.life > 0);

    if (this.rockets.length > 0 || this.particles.length > 0 || this.fountains.length > 0) {
      this.cancelFrame = scheduleFrame(this.frame);
    } else {
      ctx.clearRect(0, 0, this.w, this.h);
      this.running = false; // idle: keine CPU
    }
  }

  destroy() {
    if (this.cancelFrame) this.cancelFrame();
    clearInterval(this.demoInterval);
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.clear();
    this.observer.disconnect();
    this.rockets = [];
    this.particles = [];
    this.fountains = [];
    this.el.remove();
  }
}
