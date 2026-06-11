// gift-jar.js — das Geschenke-Glas: Coins fallen physikalisch ins Glas,
// der Füllstand wächst Richtung Ziel (wie bei TikFinity's Coin Jar).
// props: { target?: number, label?: string }
//
// Performance (TTLS!): ein Canvas, rAF läuft NUR solange Coins fliegen;
// gelandete Coins werden in eine statische Ebene gebacken. Max 40 aktive.

const STYLE_ID = 'bx-jar-style';
const CSS = `
.bx-jar { position: absolute; inset: 0; font-family: 'Arial Black', Impact, sans-serif; }
.bx-jar canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-jar-label {
  position: absolute; left: 0; right: 0; top: 2%;
  text-align: center; font-size: 15px; letter-spacing: .32em;
  color: #ffd23e; text-transform: uppercase;
  text-shadow: 0 0 14px rgba(255,210,62,.5), 0 2px 4px rgba(0,0,0,.8);
}
.bx-jar-count {
  position: absolute; left: 0; right: 0; bottom: 3%;
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
const COIN_COLORS = ['#ffd23e', '#ffb52e', '#ff9d2e'];

export default class GiftJar {
  constructor(root, props) {
    ensureStyle();
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.coins = 0;
    this.fill = 0; // animierter füllstand 0..1
    this.active = []; // fliegende coins
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
    // Glas-Geometrie: zentriert, leicht konisch
    const jw = Math.min(this.w * 0.72, this.h * 0.62);
    this.jar = {
      topW: jw,
      botW: jw * 0.82,
      top: this.h * 0.16,
      bottom: this.h * 0.88,
      cx: this.w / 2,
    };
    this.draw();
  }

  onStats(stats) {
    const total = Number(stats?.totals?.coins ?? 0);
    if (total > this.coins) this.spawn(Math.min(14, Math.max(1, Math.round((total - this.coins) / 25))));
    this.coins = total;
    this.el.querySelector('.bx-jar-count').textContent = `${fmt(this.coins)} / ${fmt(this.target)}`;
    this.el.classList.remove('bx-jar-burst');
    void this.el.offsetWidth; // animation neu triggern
    this.el.classList.add('bx-jar-burst');
    this.kick();
  }

  spawn(count) {
    for (let i = 0; i < count && this.active.length < 40; i++) {
      this.active.push({
        x: this.jar.cx + (Math.random() - 0.5) * this.jar.topW * 0.6,
        y: -10 - Math.random() * 40,
        vy: 1 + Math.random() * 2,
        vx: (Math.random() - 0.5) * 1.2,
        r: 5 + Math.random() * 4,
        color: COIN_COLORS[Math.floor(Math.random() * COIN_COLORS.length)],
        spin: Math.random() * Math.PI,
      });
    }
  }

  kick() {
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.frame);
    }
  }

  frame() {
    const targetFill = Math.min(1, this.coins / this.target);
    const fillMoves = Math.abs(targetFill - this.fill) > 0.0005;
    if (fillMoves) this.fill += (targetFill - this.fill) * 0.06;

    const floorY = this.surfaceY();
    for (const c of this.active) {
      c.vy += 0.18; // gravity
      c.y += c.vy;
      c.x += c.vx;
      c.spin += 0.1;
      if (c.y >= floorY - c.r) {
        c.y = floorY - c.r;
        if (Math.abs(c.vy) > 1.2) c.vy = -c.vy * 0.35; // kleiner bounce
        else c.dead = true;
      }
    }
    this.active = this.active.filter((c) => !c.dead);

    this.draw();

    if (this.active.length > 0 || fillMoves) {
      requestAnimationFrame(this.frame);
    } else {
      this.running = false; // idle: kein rAF, keine CPU
    }
  }

  surfaceY() {
    const { top, bottom } = this.jar;
    return bottom - (bottom - top) * this.fill * 0.92;
  }

  jarX(y, side) {
    // Glaswand-x an höhe y (konisch)
    const { top, bottom, topW, botW, cx } = this.jar;
    const t = (y - top) / (bottom - top);
    const halfW = (topW + (botW - topW) * t) / 2;
    return cx + side * halfW;
  }

  draw() {
    const ctx = this.ctx;
    const { top, bottom, cx } = this.jar;
    ctx.clearRect(0, 0, this.w, this.h);

    // Füllung (Coin-Gold mit Schimmer)
    const surf = this.surfaceY();
    if (this.fill > 0.005) {
      ctx.beginPath();
      ctx.moveTo(this.jarX(surf, -1), surf);
      ctx.lineTo(this.jarX(bottom, -1), bottom);
      ctx.lineTo(this.jarX(bottom, 1), bottom);
      ctx.lineTo(this.jarX(surf, 1), surf);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, surf, 0, bottom);
      grad.addColorStop(0, 'rgba(255,210,62,.95)');
      grad.addColorStop(1, 'rgba(255,140,40,.9)');
      ctx.fillStyle = grad;
      ctx.fill();
      // Oberfläche
      ctx.beginPath();
      ctx.ellipse(cx, surf, this.jarX(surf, 1) - cx, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,236,150,.95)';
      ctx.fill();
    }

    // fliegende Coins
    for (const c of this.active) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.spin);
      ctx.scale(1, Math.abs(Math.cos(c.spin)) * 0.5 + 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-c.r * 0.3, -c.r * 0.3, c.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fill();
      ctx.restore();
    }

    // Glas (Wände + Boden + Glanz) — über der Füllung, wirkt wie davor
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(220,235,255,.55)';
    ctx.beginPath();
    ctx.moveTo(this.jarX(top, -1) - 6, top - 8);
    ctx.lineTo(this.jarX(top, -1), top);
    ctx.lineTo(this.jarX(bottom, -1), bottom - 8);
    ctx.quadraticCurveTo(cx - 10, bottom + 6, cx, bottom + 6);
    ctx.quadraticCurveTo(cx + 10, bottom + 6, this.jarX(bottom, 1), bottom - 8);
    ctx.lineTo(this.jarX(top, 1), top);
    ctx.lineTo(this.jarX(top, 1) + 6, top - 8);
    ctx.stroke();
    // Glanz-Streifen links
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.moveTo(this.jarX(top, -1) + 12, top + 14);
    ctx.lineTo(this.jarX(bottom, -1) + 12, bottom - 20);
    ctx.stroke();
  }

  destroy() {
    this.observer.disconnect();
    this.active = [];
    this.el.remove();
  }
}
