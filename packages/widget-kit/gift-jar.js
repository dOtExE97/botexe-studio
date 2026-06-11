// gift-jar.js — das Geschenke-Glas: jedes Gift fällt als KUGEL MIT DEM
// ECHTEN GESCHENK-BILD ins Glas und stapelt sich dort (TikFinity-Style).
// props: { target?: number, label?: string }
//
// Stapel-Trick: das Glas ist in Kugel-Slots aufgeteilt (Reihen von unten
// nach oben). Jede neue Kugel fällt physikalisch auf ihren Slot und bleibt
// liegen. Volles Glas → älteste Kugeln unten verschwinden (Cap).
// Performance (TTLS!): rAF läuft NUR solange Kugeln fliegen.

const STYLE_ID = 'bx-jar-style';
const CSS = `
.bx-jar { position: absolute; inset: 0; font-family: 'Arial Black', Impact, sans-serif; }
.bx-jar canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-jar-label {
  position: absolute; left: 0; right: 0; top: 1%;
  text-align: center; font-size: 15px; letter-spacing: .32em;
  color: #ffd23e; text-transform: uppercase;
  text-shadow: 0 0 14px rgba(255,210,62,.5), 0 2px 4px rgba(0,0,0,.8);
}
.bx-jar-count {
  position: absolute; left: 0; right: 0; bottom: 1%;
  text-align: center; font-family: Consolas, Menlo, monospace; font-weight: 700;
  font-size: 20px; color: #fff; text-shadow: 0 0 12px rgba(255,210,62,.6), 0 2px 4px rgba(0,0,0,.9);
}
.bx-jar.bx-jar-burst .bx-jar-count { animation: bx-jar-pop 500ms cubic-bezier(.2,1.8,.4,1); }
@keyframes bx-jar-pop { 50% { transform: scale(1.35); } }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));
const FALLBACK_COLORS = ['#ffd23e', '#ff8a3d', '#21e6c1', '#ff5e8a'];
const MAX_BALLS = 80;

// Bild-Cache: pro URL ein Image, geteilt über alle Widget-Instanzen.
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

export default class GiftJar {
  constructor(root, props) {
    ensureStyle();
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.coins = 0;
    this.falling = [];
    this.resting = [];
    this.running = false;

    this.el = document.createElement('div');
    this.el.className = 'bx-jar';
    this.el.innerHTML = `<canvas></canvas><div class="bx-jar-label"></div><div class="bx-jar-count">0 / ${fmt(this.target)}</div>`;
    this.el.querySelector('.bx-jar-label').textContent = props.label || 'Gift-Glas';
    root.appendChild(this.el);

    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
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
    const jw = Math.min(this.w * 0.74, this.h * 0.6);
    this.jar = { topW: jw, botW: jw * 0.84, top: this.h * 0.14, bottom: this.h * 0.9, cx: this.w / 2 };
    this.ballR = Math.max(9, Math.min(17, this.jar.botW / 9));
    this.layoutSlots();
    this.draw();
  }

  /** Kugel-Slots reihenweise von unten nach oben, der Glasform folgend. */
  layoutSlots() {
    this.slots = [];
    const r = this.ballR;
    const rowH = r * 1.74; // leicht versetzt gestapelt
    for (let y = this.jar.bottom - r - 2; y > this.jar.top + r * 2; y -= rowH) {
      const half = this.jarHalfW(y) - r - 3;
      if (half < r) continue;
      const count = Math.max(1, Math.floor((half * 2) / (r * 2.02)));
      const offset = (this.slots.length === 0 ? 0 : (this.slots.at(-1)?.row ?? 0) + 1) % 2 ? r * 0.5 : 0;
      for (let i = 0; i < count; i++) {
        const x = this.jar.cx - half + r + i * ((half * 2 - r * 2) / Math.max(1, count - 1) || 0) + offset * 0;
        this.slots.push({ x: count === 1 ? this.jar.cx : x, y, row: this.slots.length });
      }
      if (this.slots.length >= MAX_BALLS) break;
    }
  }

  jarHalfW(y) {
    const { top, bottom, topW, botW } = this.jar;
    const t = (y - top) / (bottom - top);
    return (topW + (botW - topW) * t) / 2;
  }

  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    const drops = Math.min(6, Math.max(1, event.gift.count));
    for (let i = 0; i < drops; i++) {
      setTimeout(() => this.drop(event.gift.icon), i * 130);
    }
  }

  onStats(stats) {
    this.coins = Number(stats?.totals?.coins ?? 0);
    this.el.querySelector('.bx-jar-count').textContent = `${fmt(this.coins)} / ${fmt(this.target)}`;
    this.el.classList.remove('bx-jar-burst');
    void this.el.offsetWidth;
    this.el.classList.add('bx-jar-burst');
  }

  drop(iconUrl) {
    // Volles Glas: älteste Kugel raus, alle rücken im Slot-Raster nach unten.
    if (this.resting.length + this.falling.length >= Math.min(MAX_BALLS, this.slots.length)) {
      this.resting.shift();
      this.resting.forEach((b, i) => {
        const slot = this.slots[i];
        if (slot) {
          b.x = slot.x + b.jx;
          b.y = slot.y;
        }
      });
    }
    const slotIndex = this.resting.length + this.falling.length;
    const slot = this.slots[Math.min(slotIndex, this.slots.length - 1)];
    if (!slot) return;
    const jx = (Math.random() - 0.5) * this.ballR * 0.5;
    this.falling.push({
      x: this.jar.cx + (Math.random() - 0.5) * this.jar.topW * 0.4,
      y: -this.ballR - Math.random() * 30,
      vy: 1.5 + Math.random() * 1.5,
      vx: 0,
      targetX: slot.x + jx,
      targetY: slot.y,
      jx,
      rot: (Math.random() - 0.5) * 0.8,
      img: loadImage(iconUrl),
      color: FALLBACK_COLORS[Math.floor(Math.random() * FALLBACK_COLORS.length)],
    });
    this.kick();
  }

  kick() {
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.frame);
    }
  }

  frame() {
    for (const b of this.falling) {
      b.vy += 0.22;
      b.y += b.vy;
      // sanft zum ziel-slot steuern
      b.x += (b.targetX - b.x) * 0.08;
      if (b.y >= b.targetY) {
        b.y = b.targetY;
        if (Math.abs(b.vy) > 1.6) {
          b.vy = -b.vy * 0.3; // settle-bounce
        } else {
          b.landed = true;
          b.x = b.targetX;
        }
      }
    }
    const landed = this.falling.filter((b) => b.landed);
    if (landed.length > 0) {
      this.resting.push(...landed);
      this.falling = this.falling.filter((b) => !b.landed);
    }

    this.draw();

    if (this.falling.length > 0) {
      requestAnimationFrame(this.frame);
    } else {
      this.running = false; // idle: keine CPU
    }
  }

  drawBall(b) {
    const ctx = this.ctx;
    const r = this.ballR;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    // Kugel-Grund (leichter Schatten + Rand)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,13,18,.85)';
    ctx.fill();
    // Gift-Bild kreisförmig geclippt — die "Kugel"
    if (b.img && b.img.complete && b.img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(b.img, -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
    }
    // Glanzpunkt + dünner Rand → "Glaskugel"-Look
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.32, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.stroke();
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    const { top, bottom, cx } = this.jar;
    ctx.clearRect(0, 0, this.w, this.h);

    for (const b of this.resting) this.drawBall(b);
    for (const b of this.falling) this.drawBall(b);

    // Glas davor: Wände, Boden, Glanz
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(220,235,255,.55)';
    ctx.beginPath();
    ctx.moveTo(cx - this.jarHalfW(top) - 6, top - 8);
    ctx.lineTo(cx - this.jarHalfW(top), top);
    ctx.lineTo(cx - this.jarHalfW(bottom), bottom - 8);
    ctx.quadraticCurveTo(cx - 10, bottom + 6, cx, bottom + 6);
    ctx.quadraticCurveTo(cx + 10, bottom + 6, cx + this.jarHalfW(bottom), bottom - 8);
    ctx.lineTo(cx + this.jarHalfW(top), top);
    ctx.lineTo(cx + this.jarHalfW(top) + 6, top - 8);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath();
    ctx.moveTo(cx - this.jarHalfW(top) + 12, top + 14);
    ctx.lineTo(cx - this.jarHalfW(bottom) + 12, bottom - 20);
    ctx.stroke();
  }

  destroy() {
    this.observer.disconnect();
    this.falling = [];
    this.resting = [];
    this.el.remove();
  }
}
