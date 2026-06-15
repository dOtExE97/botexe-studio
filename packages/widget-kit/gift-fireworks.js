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
    // Neon-Name des Schenkenden im Explosionszentrum (TikFinity-Style), default an.
    this.showName = props.showName !== false;
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
  }

  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    if (event.gift.totalCoins < this.minCoins) return;
    this.launch(event.gift, event.user?.nickname);
  }

  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    const p = action.params || {};
    this.launch({ totalCoins: Number(p.coins ?? 100), count: Number(p.count ?? 1), icon: p.icon }, p.name);
  }

  // Eine Combo (z.B. 10x Rose) fächert in mehrere Raketen auf — Anzahl & Stärke
  // kommen aus comboPlan (count + Coin-Wert), nicht mehr nur aus totalCoins.
  launch(gift, name) {
    const plan = comboPlan(gift, this.maxRockets, { mode: this.comboMode, burstScale: this.burstScale });
    const img = loadImage(gift.icon);
    const showName = this.showName && name ? String(name) : '';
    for (let i = 0; i < plan.rockets; i++) {
      if (i === 0) {
        // Name nur an der ersten Rakete → erscheint einmal zentral, nicht pro Burst.
        this.spawnRocket(plan.power, gift.icon, img, showName);
      } else {
        // Volley: leicht gestaffelt für den „peng-peng-peng"-Effekt.
        const t = setTimeout(() => {
          this.pendingTimers.delete(t);
          this.spawnRocket(plan.power, gift.icon, img, '');
        }, i * this.staggerMs);
        this.pendingTimers.add(t);
      }
    }
  }

  spawnRocket(power, icon, img, name = '') {
    if (this.rockets.length >= this.rocketCap) return; // backpressure
    // Aufstiegs-Pfeifen (Server dedupliziert mehrfaches Auslösen einer Salve).
    if (this.whistleSound) this.host.playSound?.(this.whistleSound);
    this.rockets.push({
      x: this.w * (0.18 + Math.random() * 0.64),
      y: this.h + 6,
      vx: (Math.random() - 0.5) * 1.4,
      vy: -(this.h * 0.012 + this.h * 0.006 * power) - Math.random() * 2,
      targetY: this.h * (0.42 - 0.22 * power) + Math.random() * this.h * 0.1,
      palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      power,
      icon,
      img,
      name,
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
    const pal2 = PALETTES[(PALETTES.indexOf(r.palette) + 2 + Math.floor(Math.random() * 2)) % PALETTES.length];
    this.burst(r.x, r.y, r.power, r.palette, pal2, 1);
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
      img.style.width = `${58 + 64 * r.power}px`;
      img.style.height = img.style.width;
      this.el.appendChild(img);
      setTimeout(() => img.remove(), 1500);
    }
    if (r.name) {
      const nm = document.createElement('div');
      nm.className = 'bx-fw-name';
      nm.textContent = r.name;
      nm.style.left = `${(r.x / this.w) * 100}%`;
      nm.style.top = `${(r.y / this.h) * 100}%`;
      nm.style.fontSize = `${26 + 26 * r.power}px`;
      this.el.appendChild(nm);
      setTimeout(() => nm.remove(), 1750);
    }
  }

  // Ein Burst: farbiger Außenring (zwei Paletten gemischt) + heller Kern +
  // funkelnde Glitzer-Sterne. amount skaliert Anzahl (für Nach-Bursts kleiner).
  burst(x, y, power, palA, palB, amount) {
    const scale = (this.perf ? 0.6 : 1) * amount;
    const ring = Math.round((60 + 150 * power) * scale);
    const core = Math.round((26 + 60 * power) * scale);
    const twinkles = Math.round((10 + 26 * power) * scale);
    let free = () => this.particleCap - this.particles.length;

    for (let i = 0; i < Math.min(ring, free()); i++) {
      const angle = (Math.PI * 2 * i) / ring + Math.random() * 0.14;
      const speed = (3.6 + Math.random() * 6.4) * (0.9 + power * 1.6);
      const pal = i % 2 === 0 ? palA : palB; // zwei Farben pro Ring
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
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

  // Kurzer, sehr heller Lichtblitz (eine schnell verglühende Riesen-Funke).
  flash(x, y, radius) {
    if (this.particles.length >= this.particleCap) return;
    this.particles.push({
      x, y, vx: 0, vy: 0, life: 1, decay: 0.07,
      color: '#ffffff', r: radius, flash: true,
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
    if (this.cancelFrame) this.cancelFrame();
    // Delta-Time: bei niedriger FPS (TTLS!) bewegt sich alles gleich schnell,
    // nur mit weniger Zwischenbildern — statt in Zeitlupe zu ruckeln.
    const dt = Math.min(4, this.lastT ? (now - this.lastT) / 16.67 : 1);
    this.lastT = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

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
      const size = 30 + 22 * r.power;
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
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.05 * dt; // gravity
      p.vx *= Math.pow(0.985, dt);
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      let alpha = Math.max(0, p.life);
      // Glitzer-Sterne blitzen rhythmisch auf (sin-Flacker) → Funkel-Effekt.
      if (p.twinkle !== undefined) {
        p.twinkle += 0.55 * dt;
        alpha *= 0.45 + 0.55 * Math.abs(Math.sin(p.twinkle));
      }
      const radius = p.r * (0.4 + p.life * 0.6);
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

    if (this.rockets.length > 0 || this.particles.length > 0) {
      this.cancelFrame = scheduleFrame(this.frame);
    } else {
      ctx.clearRect(0, 0, this.w, this.h);
      this.running = false; // idle: keine CPU
    }
  }

  destroy() {
    if (this.cancelFrame) this.cancelFrame();
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.clear();
    this.observer.disconnect();
    this.rockets = [];
    this.particles = [];
    this.el.remove();
  }
}
