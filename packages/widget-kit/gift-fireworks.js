// gift-fireworks.js — Geschenke-Feuerwerk: pro Gift steigt eine Rakete auf
// und explodiert in einem Partikel-Burst. Größe/Anzahl skaliert mit dem
// Coin-Wert, das Gift-Bild erscheint im Zentrum der Explosion.
// props: { minCoins?: number, maxRockets?: number }
//
// Performance (TTLS!): ein Canvas, rAF nur solange etwas fliegt,
// harte Caps für Raketen & Partikel (Gift-Bombing-sicher, H6).

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
  return () => clearTimeout(timer);
}

export default class GiftFireworks {
  constructor(root, props) {
    ensureStyle();
    this.minCoins = Number(props.minCoins ?? 0);
    this.maxRockets = Math.min(6, Math.max(1, Number(props.maxRockets ?? 3)));
    this.rockets = [];
    this.particles = [];
    this.running = false;
    this.lastT = 0;
    // Schnell-Modus (TTLS ohne GPU): weniger Partikel, gleicher Look.
    this.perf = document.documentElement.classList.contains('bx-perf');
    this.particleCap = this.perf ? 240 : 460;

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
    this.launch(event.gift);
  }

  onAction(action) {
    if (action.kind !== 'fire_alert') return;
    const p = action.params || {};
    this.launch({ totalCoins: Number(p.coins ?? 100), icon: p.icon });
  }

  launch(gift) {
    if (this.rockets.length >= this.maxRockets) return; // backpressure
    const coins = gift.totalCoins ?? 1;
    // Wert skaliert die Show: 1 coin = klein, 1000+ = monster-burst
    const power = Math.min(1, Math.log10(Math.max(1, coins)) / 3);
    this.rockets.push({
      x: this.w * (0.25 + Math.random() * 0.5),
      y: this.h + 6,
      vx: (Math.random() - 0.5) * 1.4,
      vy: -(this.h * 0.012 + this.h * 0.006 * power) - Math.random() * 2,
      targetY: this.h * (0.42 - 0.22 * power) + Math.random() * this.h * 0.1,
      palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      power,
      icon: gift.icon,
      img: loadImage(gift.icon),
      wobble: Math.random() * Math.PI * 2,
      trail: 0,
    });
    this.kick();
  }

  explode(r) {
    // Doppel-Burst: farbiger Außenring (gleichmäßig, schnell) + heller Kern
    // (chaotisch, langsamer) — deutlich größer und satter als vorher.
    const scale = this.perf ? 0.6 : 1;
    const ring = Math.round((44 + 110 * r.power) * scale);
    const core = Math.round((18 + 40 * r.power) * scale);
    let free = this.particleCap - this.particles.length; // hartes partikel-cap

    for (let i = 0; i < Math.min(ring, free); i++) {
      const angle = (Math.PI * 2 * i) / ring + Math.random() * 0.12;
      const speed = (3.2 + Math.random() * 5.5) * (0.9 + r.power * 1.5);
      this.particles.push({
        x: r.x,
        y: r.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.008 + Math.random() * 0.009,
        color: r.palette[i % r.palette.length],
        r: 1.8 + Math.random() * 2.4 + r.power * 1.8,
      });
    }
    free = this.particleCap - this.particles.length;
    for (let i = 0; i < Math.min(core, free); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1 + Math.random() * 2.4) * (0.8 + r.power);
      this.particles.push({
        x: r.x,
        y: r.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.014 + Math.random() * 0.012,
        color: r.palette[2], // hellster Palettenton = leuchtender Kern
        r: 2.4 + Math.random() * 2.6 + r.power * 2,
      });
    }
    if (r.icon) {
      const img = document.createElement('img');
      img.className = 'bx-fw-icon';
      img.src = r.icon;
      img.style.left = `${(r.x / this.w) * 100}%`;
      img.style.top = `${(r.y / this.h) * 100}%`;
      img.style.width = `${48 + 56 * r.power}px`;
      img.style.height = img.style.width;
      this.el.appendChild(img);
      setTimeout(() => img.remove(), 1500);
    }
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
      // Funken-Schweif
      if (this.particles.length < this.particleCap) {
        this.particles.push({
          x: r.x + (Math.random() - 0.5) * 3,
          y: r.y + 6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1 + Math.random(),
          life: 0.55,
          decay: 0.04,
          color: r.palette[2],
          r: 1.4,
        });
      }
      // Die Rakete IST das Geschenk: bild mit glow steigt auf
      r.wobble += 0.18 * dt;
      const size = 24 + 16 * r.power;
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
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.05 * dt; // gravity
      p.vx *= Math.pow(0.985, dt);
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      const alpha = Math.max(0, p.life);
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
    this.observer.disconnect();
    this.rockets = [];
    this.particles = [];
    this.el.remove();
  }
}
