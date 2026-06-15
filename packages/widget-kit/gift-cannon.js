// gift-cannon.js — Geschenke-Kanone: bei einem Gift werden die Profilbilder der
// Zuschauer (mit Gift-Icon) in einer Wurfparabel ins Bild geschossen, fallen mit
// Schwerkraft und sammeln sich unten. Eine Combo (10x Rose) feuert mehrere Bälle.
// props: { position?: 'left'|'center'|'right', minCoins?, maxBalls?, style?:
//          'cannon'|'fountain'|'rain', soundId?, accent?, theme? }
//
// Performance (TTLS): ein Canvas, rAF nur solange etwas in Bewegung/sichtbar ist,
// harte Ball-Obergrenze (Gift-Bombing-sicher).
import { comboPlan } from './combo.js';

const STYLE_ID = 'bx-gc-style';
const CSS = `.bx-gc { position:absolute; inset:0; pointer-events:none; }
.bx-gc canvas { position:absolute; inset:0; width:100%; height:100%; }`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

const imageCache = new Map();
function loadImage(url) {
  if (!url) return null;
  let img = imageCache.get(url);
  if (!img) { img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; imageCache.set(url, img); }
  return img;
}
const ready = (img) => img && img.complete && img.naturalWidth > 0;

function scheduleFrame(cb) {
  const raf = requestAnimationFrame(cb);
  const timer = setTimeout(() => { cancelAnimationFrame(raf); cb(performance.now()); }, 55);
  return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
}
const STYLES = new Set(['cannon', 'fountain', 'rain']);
const AVATAR_TINTS = ['#ff5e8a', '#28e0c4', '#ffd23e', '#7c6bff', '#ff9d3d', '#5ad1ff'];

export default class GiftCannon {
  constructor(root, props, ctx) {
    ensureStyle();
    this.host = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.perf = document.documentElement.classList.contains('bx-perf');
    this.style = STYLES.has(props.style) ? props.style : 'cannon';
    this.minCoins = Number(props.minCoins ?? 0);
    this.maxBalls = Math.min(80, Math.max(4, Number(props.maxBalls ?? 28)));
    this.maxPerGift = this.perf ? 10 : 18; // Combo-Cap
    this.soundId = props.soundId || '';
    const pos = props.position === 'left' ? 0.16 : props.position === 'right' ? 0.84 : 0.5;
    this.srcX = pos;
    this.balls = [];
    this.recoil = 0;
    this.muzzle = 0;
    this.running = false;
    this.lastT = 0;
    this.tintN = 0;
    this.pendingTimers = new Set();

    this.el = document.createElement('div');
    this.el.className = 'bx-gc';
    this.el.innerHTML = '<canvas></canvas>';
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.cx = this.canvas.getContext('2d');
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
    this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }

  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    if ((event.gift.totalCoins ?? 0) < this.minCoins) return;
    const plan = comboPlan(event.gift, this.maxPerGift, {});
    const avatar = loadImage(event.user?.profilePic);
    const gift = loadImage(event.gift.icon);
    const tint = AVATAR_TINTS[this.tintN++ % AVATAR_TINTS.length];
    if (this.soundId) this.host.playSound?.(this.soundId);
    for (let i = 0; i < plan.rockets; i++) {
      if (i === 0) this.shoot(avatar, gift, tint);
      else {
        const t = setTimeout(() => { this.pendingTimers.delete(t); this.shoot(avatar, gift, tint); }, i * 90);
        this.pendingTimers.add(t);
      }
    }
  }

  shoot(avatar, gift, tint) {
    if (this.balls.length >= this.maxBalls) this.balls.shift(); // ältesten verdrängen
    const r = (this.perf ? 22 : 26) + Math.random() * 8;
    let x, y, vx, vy;
    if (this.style === 'rain') {
      x = this.w * (0.1 + Math.random() * 0.8); y = -r; vx = (Math.random() - 0.5) * 2; vy = 2 + Math.random() * 2;
    } else if (this.style === 'fountain') {
      x = this.w * this.srcX + (Math.random() - 0.5) * 24; y = this.h + r;
      vx = (Math.random() - 0.5) * 3.5; vy = -(this.h * 0.018 + Math.random() * 4);
    } else { // cannon: schräg aus der Mündung
      const aimRight = this.srcX < 0.5;
      x = this.w * this.srcX; y = this.h - 14;
      const dir = aimRight ? 1 : -1;
      vx = dir * (3 + Math.random() * 3.5);
      vy = -(this.h * 0.016 + Math.random() * 4);
      this.recoil = 1; this.muzzle = 1;
    }
    this.balls.push({ x, y, vx, vy, r, avatar, gift, tint, rest: false, restT: 0, life: 1, rot: (Math.random() - 0.5) * 0.4, vr: (Math.random() - 0.5) * 0.12 });
    this.kick();
  }

  kick() { if (!this.running) { this.running = true; this.lastT = 0; this.cancelFrame = scheduleFrame(this.frame); } }

  frame(now) {
    if (this.cancelFrame) this.cancelFrame();
    const dt = Math.min(4, this.lastT ? (now - this.lastT) / 16.67 : 1);
    this.lastT = now;
    const cx = this.cx;
    cx.clearRect(0, 0, this.w, this.h);
    this.recoil = Math.max(0, this.recoil - 0.08 * dt);
    this.muzzle = Math.max(0, this.muzzle - 0.12 * dt);

    const floor = this.h - 4;
    for (const b of this.balls) {
      if (!b.rest) {
        b.vy += 0.42 * dt; // gravity
        b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
        // Wände
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x > this.w - b.r) { b.x = this.w - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
        // Boden: dämpfen, zur Ruhe kommen
        if (b.y >= floor - b.r) {
          b.y = floor - b.r; b.vy = -b.vy * 0.36; b.vx *= 0.7; b.vr *= 0.5;
          if (Math.abs(b.vy) < 1.4) { b.rest = true; b.vy = 0; b.vx = 0; b.restT = now; }
        }
      } else if (now - b.restT > 3000) {
        b.life -= 0.02 * dt; // nach Ruhe ausfaden (CPU/Performance)
      }
      this.drawBall(b);
    }
    if (this.style === 'cannon') this.drawCannon();
    this.balls = this.balls.filter((b) => b.life > 0);

    // Solange Bälle existieren (fliegend ODER ruhend bis zum Ausfaden) weiter
    // zeichnen; danach idle (keine CPU).
    if (this.balls.length) this.cancelFrame = scheduleFrame(this.frame);
    else { cx.clearRect(0, 0, this.w, this.h); this.running = false; }
  }

  drawBall(b) {
    const cx = this.cx;
    cx.save();
    cx.globalAlpha = Math.max(0, b.life);
    cx.translate(b.x, b.y);
    cx.rotate(b.rot);
    // runde Avatar-Maske
    cx.save();
    cx.beginPath(); cx.arc(0, 0, b.r, 0, Math.PI * 2); cx.closePath(); cx.clip();
    if (ready(b.avatar)) cx.drawImage(b.avatar, -b.r, -b.r, b.r * 2, b.r * 2);
    else { cx.fillStyle = b.tint; cx.fillRect(-b.r, -b.r, b.r * 2, b.r * 2); }
    cx.restore();
    // Rand
    cx.beginPath(); cx.arc(0, 0, b.r, 0, Math.PI * 2);
    cx.lineWidth = 2.5; cx.strokeStyle = '#fff';
    if (!this.perf) { cx.shadowColor = 'rgba(0,0,0,.5)'; cx.shadowBlur = 6; }
    cx.stroke();
    cx.shadowBlur = 0;
    // Gift-Icon unten rechts
    if (ready(b.gift)) { const gs = b.r * 1.05; cx.drawImage(b.gift, b.r * 0.1, b.r * 0.1, gs, gs); }
    cx.restore();
  }

  drawCannon() {
    const cx = this.cx;
    const x = this.w * this.srcX, y = this.h;
    const aimRight = this.srcX < 0.5;
    const dir = aimRight ? 1 : -1;
    cx.save();
    cx.translate(x, y - 6 + this.recoil * 6);
    cx.rotate(dir * -0.6); // schräg nach oben
    // Rohr
    cx.fillStyle = '#3a3f4d';
    cx.beginPath(); cx.roundRect ? cx.roundRect(-14, -54, 28, 60, 10) : cx.rect(-14, -54, 28, 60); cx.fill();
    cx.fillStyle = '#555b6e';
    cx.beginPath(); cx.roundRect ? cx.roundRect(-16, -58, 32, 12, 6) : cx.rect(-16, -58, 32, 12); cx.fill();
    // Mündungsblitz
    if (this.muzzle > 0) {
      cx.globalAlpha = this.muzzle;
      cx.fillStyle = '#ffd23e';
      cx.beginPath(); cx.arc(0, -60, 10 + this.muzzle * 12, 0, Math.PI * 2); cx.fill();
    }
    cx.restore();
    // Sockel
    cx.fillStyle = '#23262f';
    cx.beginPath(); cx.ellipse(x, y - 4, 26, 9, 0, 0, Math.PI * 2); cx.fill();
  }

  destroy() {
    if (this.cancelFrame) this.cancelFrame();
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.clear();
    this.observer.disconnect();
    this.balls = [];
    this.el.remove();
  }
}
