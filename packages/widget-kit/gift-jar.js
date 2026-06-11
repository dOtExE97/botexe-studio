// gift-jar.js — Coin-Glas im TikFinity-Stil: ein Einmachglas mit Deckel,
// das sich mit HUNDERTEN kleiner, bunter Münzen füllt (Konfetti-Haufen).
// props: { target?, label?, accent? }. Canvas-Physik, rAF nur bei Bewegung.

const STYLE_ID = 'bx-jar-style';
const CSS = `
.bx-jar { position: absolute; inset: 0; font-family: var(--bx-font-display); }
.bx-jar canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-jar-count { position: absolute; left: 0; right: 0; bottom: 1%; text-align: center;
  font-family: var(--bx-font-mono); font-weight: 700; font-size: 22px; color: #fff;
  -webkit-text-stroke: 2px #08090d; paint-order: stroke fill; text-shadow: 0 2px 5px rgba(0,0,0,.7); }
.bx-jar-label { position: absolute; left: 0; right: 0; top: 1%; text-align: center;
  font-size: 17px; letter-spacing: .14em; text-transform: uppercase; color: var(--bx-gold);
  -webkit-text-stroke: 2px #08090d; paint-order: stroke fill; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
// Bunte Münz-/Konfetti-Palette wie bei TikFinity
const COINS = ['#ffd23e','#ff8a3d','#ff5436','#ff5e8a','#c45cff','#5c9dff','#28e0c4','#7dff8a','#ffffff'];
const MAX_COINS = 420;

export default class GiftJar {
  constructor(root, props) {
    ensureStyle();
    root.style.setProperty('--bx-accent', props.accent || '#ffd23e');
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.coinsValue = 0;
    this.falling = [];
    this.resting = [];
    this.running = false;
    this.el = document.createElement('div');
    this.el.className = 'bx-jar';
    this.el.innerHTML = `<canvas></canvas><div class="bx-jar-label"></div><div class="bx-jar-count">0 / ${fmt(this.target)}</div>`;
    this.el.querySelector('.bx-jar-label').textContent = props.label || 'Coin-Glas';
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this); this.frame = this.frame.bind(this);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(root);
    this.resize();
  }
  resize() {
    const r = this.el.getBoundingClientRect(); if (r.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
    // Einmachglas-Geometrie: Deckel oben, leicht bauchiger Körper
    const jw = Math.min(this.w * 0.7, this.h * 0.56);
    this.jar = {
      cx: this.w / 2, lidY: this.h * 0.14, neckY: this.h * 0.2,
      top: this.h * 0.2, bottom: this.h * 0.88,
      topW: jw, botW: jw * 0.92, lidW: jw * 1.06,
    };
    this.coinR = Math.max(4, Math.min(8, jw / 24));
    this.draw();
  }
  halfW(y) {
    const { top, bottom, topW, botW } = this.jar;
    const t = Math.max(0, Math.min(1, (y - top) / (bottom - top)));
    return (topW + (botW - topW) * t) / 2;
  }
  // Füllgrad 0..1 → Anzahl Münzen im Haufen (dicht gepackt, von unten)
  fillRatio() { return Math.min(1, this.coinsValue / this.target); }
  targetCoinCount() { return Math.min(MAX_COINS, Math.round(this.fillRatio() * MAX_COINS)); }
  // Münze an normalisierter Position (rx in [-1,1], ry 0=Boden..1=Deckel) → canvas-Punkt
  coinPos(rx, ry) {
    const y = this.jar.bottom - ry * (this.jar.bottom - this.jar.top);
    const hw = this.halfW(y) - this.coinR - 3;
    return { x: this.jar.cx + rx * hw, y };
  }
  makeCoin(maxRy) {
    return { rx: (Math.random() * 2 - 1) * 0.96, ry: Math.random() * maxRy,
      r: this.coinR * (0.78 + Math.random() * 0.5), color: COINS[Math.floor(Math.random() * COINS.length)] };
  }
  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    this.coinsValue += event.gift.totalCoins;
    this.el.querySelector('.bx-jar-count').textContent = `${fmt(this.coinsValue)} / ${fmt(this.target)}`;
    this.refill();
  }
  onStats(stats) {
    const v = Number(stats?.totals?.coins ?? 0);
    if (v > this.coinsValue) { this.coinsValue = v; this.el.querySelector('.bx-jar-count').textContent = `${fmt(v)} / ${fmt(this.target)}`; this.refill(); }
  }
  refill() {
    const fill = this.fillRatio();
    const want = this.targetCoinCount();
    while (this.resting.length < want) this.resting.push(this.makeCoin(fill)); // haufen auffüllen
    if (this.resting.length > want) this.resting.length = want;
    // ein paar fallende münzen oben rein für Leben
    const drops = Math.min(18, want - (this.dropped || 0));
    for (let i = 0; i < Math.max(0, drops); i++) {
      this.falling.push({ rx: (Math.random()*2-1)*0.6, y: this.jar.top - 10 - Math.random()*40, vy: 1+Math.random()*2,
        targetRy: fill * (0.7 + Math.random()*0.3), r: this.coinR*(0.8+Math.random()*0.4), color: COINS[Math.floor(Math.random()*COINS.length)] });
    }
    this.dropped = want;
    this.kick();
  }
  kick() { if (!this.running) { this.running = true; requestAnimationFrame(this.frame); } }
  frame() {
    for (const c of this.falling) {
      c.vy += 0.25; c.y += c.vy;
      const landY = this.coinPos(0, c.targetRy).y;
      if (c.y >= landY) { c.y = landY; c.dead = true; }
    }
    this.falling = this.falling.filter((c) => !c.dead);
    this.draw();
    if (this.falling.length > 0) requestAnimationFrame(this.frame); else this.running = false;
  }
  draw() {
    const ctx = this.ctx; const J = this.jar;
    ctx.clearRect(0, 0, this.w, this.h);
    // Münzhaufen (dicht gepackt, von unten) + fallende oben
    for (const c of this.resting) { const pos = this.coinPos(c.rx, c.ry); this.drawCoinAt(pos.x, pos.y, c.r, c.color); }
    for (const c of this.falling) { const x = this.jar.cx + c.rx * (this.halfW(c.y) - c.r - 3); this.drawCoinAt(x, c.y, c.r, c.color); }
    // Glas-Körper (über den Münzen → wirkt davor)
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(210,230,255,.6)';
    ctx.beginPath();
    ctx.moveTo(J.cx - J.topW / 2, J.top);
    ctx.lineTo(J.cx - J.botW / 2, J.bottom - 12);
    ctx.quadraticCurveTo(J.cx - J.botW / 2, J.bottom + 4, J.cx - J.botW / 2 + 14, J.bottom + 4);
    ctx.lineTo(J.cx + J.botW / 2 - 14, J.bottom + 4);
    ctx.quadraticCurveTo(J.cx + J.botW / 2, J.bottom + 4, J.cx + J.botW / 2, J.bottom - 12);
    ctx.lineTo(J.cx + J.topW / 2, J.top);
    ctx.stroke();
    // Deckel (Schraubdeckel)
    ctx.fillStyle = 'rgba(120,140,170,.85)';
    roundRect(ctx, J.cx - J.lidW / 2, J.lidY, J.lidW, J.neckY - J.lidY + 6, 6); ctx.fill();
    ctx.fillStyle = 'rgba(160,180,210,.9)';
    roundRect(ctx, J.cx - J.lidW / 2, J.lidY, J.lidW, 7, 4); ctx.fill();
    // Glanz-Streifen links
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath(); ctx.moveTo(J.cx - J.topW / 2 + 14, J.top + 16); ctx.lineTo(J.cx - J.botW / 2 + 14, J.bottom - 24); ctx.stroke();
  }
  drawCoinAt(x, y, r, color) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.34, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  }
  destroy() { this.observer.disconnect(); this.falling = []; this.resting = []; this.el.remove(); }
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
