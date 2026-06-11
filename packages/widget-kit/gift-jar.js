// gift-jar.js — Coin-Glas im TikFinity-Stil: jedes Gift fällt als BALL mit dem
// echten Geschenk-Bild ins Glas. Je mehr Coins, desto größer der Ball.
// Die Bälle stapeln sich (Heightmap-Physik) zu einem dichten Haufen.
// props: { target?, label?, accent? }. rAF nur bei Bewegung (TTLS-schonend).

const STYLE_ID = 'bx-jar-style';
const CSS = `
.bx-jar { position: absolute; inset: 0; font-family: var(--bx-font-display); }
.bx-jar canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-jar-badge { position: absolute; right: 5%; top: 3%; display: flex; align-items: center; gap: 6px;
  padding: 5px 14px 5px 10px; border-radius: 999px; background: linear-gradient(160deg, rgba(28,30,42,.94), rgba(13,14,20,.92));
  box-shadow: 0 6px 16px -6px rgba(0,0,0,.6), 0 0 0 1.5px color-mix(in srgb, var(--bx-gold) 50%, transparent) inset; }
.bx-jar-badge .ico { font-size: 18px; }
.bx-jar-badge .num { font-family: var(--bx-font-display); font-size: 20px; color: var(--bx-gold);
  -webkit-text-stroke: 2.5px #0a0b12; paint-order: stroke fill; }
.bx-jar-label { position: absolute; left: 0; right: 0; top: 3%; text-align: center;
  font-family: var(--bx-font-display); font-size: 20px; letter-spacing: .04em; color: #fff;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 0 14px color-mix(in srgb, var(--bx-gold) 50%, transparent), 0 3px 5px rgba(0,0,0,.5); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
const FALLBACK = ['#ffd23e','#ff8a3d','#ff5436','#ff5e8a','#c45cff','#5c9dff','#28e0c4','#7dff8a'];
const MAX_BALLS = 400;

const imageCache = new Map();
function loadImage(url) {
  if (!url) return null;
  let img = imageCache.get(url);
  if (!img) { img = new Image(); img.src = url; imageCache.set(url, img); }
  return img;
}

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
    this.el.innerHTML = `<canvas></canvas><div class="bx-jar-label"></div><div class="bx-jar-badge"><span class="ico">🪙</span><span class="num">0</span></div>`;
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
    const jw = Math.min(this.w * 0.82, this.h * 0.5);
    this.jar = { cx: this.w/2, lidY: this.h*0.13, top: this.h*0.19, shoulderY: this.h*0.27, bottom: this.h*0.9,
      topW: jw*0.82, midW: jw, botW: jw*0.9, lidW: jw*0.8 };
    this.unit = jw; // basis für ball-größen
    this.draw();
  }
  halfW(y) {
    const J = this.jar; const yc = Math.max(J.top, Math.min(J.bottom, y));
    if (yc < J.shoulderY) { const t = (yc-J.top)/(J.shoulderY-J.top); return (J.topW + (J.midW-J.topW)*t)/2; }
    const t = (yc-J.shoulderY)/(J.bottom-J.shoulderY); return (J.midW + (J.botW-J.midW)*t)/2;
  }
  // Ball-Radius aus Coin-Wert (log-skaliert): kleines Gift = klein, großes = groß
  ballRadius(coins) {
    const t = Math.min(1, Math.log10(Math.max(1, coins)) / 3.4); // 1..~2500 coins
    return this.unit * (0.035 + 0.06 * t); // ~3.5%..9.5% der jar-breite (viele bälle passen rein)
  }
  // Füllgrad aus kumulierter Ball-Fläche (von unten gefüllt)
  jarArea() { return this.jar.midW * (this.jar.bottom - this.jar.top) * 0.78; }
  coinPos(rx, ry) {
    const y = this.jar.bottom - ry * (this.jar.bottom - this.jar.top);
    const hw = this.halfW(y);
    return { x: this.jar.cx + rx * (hw - 6), y };
  }
  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    this.coinsValue += event.gift.totalCoins;
    this.el.querySelector('.bx-jar-badge .num').textContent = fmt(this.coinsValue);
    this.spawn(event.gift);
  }
  spawn(gift) {
    if (this.resting.length + this.falling.length >= MAX_BALLS) this.resting.shift();
    const r = this.ballRadius(gift.totalCoins);
    // Füllhöhe = Fortschritt Richtung Ziel (coins), Bälle gleichmäßig von unten gestreut
    const fill = Math.min(0.97, this.coinsValue / this.target);
    const targetRy = 0.03 + Math.random() * Math.max(0.06, fill);
    const rx = (Math.random() * 2 - 1) * 0.9;
    this.falling.push({ rx, targetRy, r, y: this.jar.top - r - Math.random()*30, vy: 1.5 + Math.random()*1.6,
      img: loadImage(gift.icon), color: FALLBACK[Math.floor(Math.random()*FALLBACK.length)] });
    this.kick();
  }
  kick() { if (!this.running) { this.running = true; this.lastT = 0; requestAnimationFrame(this.frame); } }
  frame(now) {
    now = now || performance.now();
    // Delta-Time in 60fps-Frames (gedeckelt) → framerate-unabhängig, robust
    // auch wenn das Overlay-Fenster gedrosselt wird (Bälle setzen sich trotzdem).
    const dt = Math.min(4, this.lastT ? (now - this.lastT) / 16.67 : 1);
    this.lastT = now;
    for (const b of this.falling) {
      b.vy += 0.3 * dt; b.y += b.vy * dt;
      const landY = this.coinPos(b.rx, b.targetRy).y;
      if (b.y >= landY) { b.y = landY; b.ry = b.targetRy; this.resting.push(b); b.dead = true; }
    }
    this.falling = this.falling.filter((b) => !b.dead);
    this.draw();
    if (this.falling.length > 0) requestAnimationFrame(this.frame); else { this.running = false; this.lastT = 0; }
  }
  draw() {
    const ctx = this.ctx, J = this.jar;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const b of this.resting) { const p = this.coinPos(b.rx, b.ry); this.drawBall(p.x, p.y, b.r, b); }
    for (const b of this.falling) { const x = this.jar.cx + b.rx * (this.halfW(b.y) - 6); this.drawBall(x, b.y, b.r, b); }
    // Glas (bauchiges Einmachglas) über den Bällen
    const lx = (y)=>J.cx-this.halfW(y), rx=(y)=>J.cx+this.halfW(y);
    ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(214,232,255,.6)';
    ctx.beginPath();
    ctx.moveTo(lx(J.top), J.top);
    ctx.quadraticCurveTo(lx(J.shoulderY)-4, J.shoulderY-8, lx(J.shoulderY), J.shoulderY);
    ctx.lineTo(lx(J.bottom), J.bottom-14);
    ctx.quadraticCurveTo(lx(J.bottom), J.bottom+4, lx(J.bottom)+16, J.bottom+4);
    ctx.lineTo(rx(J.bottom)-16, J.bottom+4);
    ctx.quadraticCurveTo(rx(J.bottom), J.bottom+4, rx(J.bottom), J.bottom-14);
    ctx.lineTo(rx(J.shoulderY), J.shoulderY);
    ctx.quadraticCurveTo(rx(J.shoulderY)+4, J.shoulderY-8, rx(J.top), J.top);
    ctx.stroke();
    ctx.fillStyle = 'rgba(150,168,196,.9)'; roundRect(ctx, J.cx-J.lidW/2, J.lidY, J.lidW, (J.top-J.lidY)+8, 7); ctx.fill();
    ctx.fillStyle = 'rgba(186,202,228,.95)'; roundRect(ctx, J.cx-J.lidW/2-3, J.lidY, J.lidW+6, 9, 5); ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(lx(J.shoulderY)+16, J.shoulderY+10); ctx.lineTo(lx(J.bottom)+18, J.bottom-30); ctx.stroke(); ctx.lineCap='butt';
  }
  drawBall(x, y, r, b) {
    const ctx = this.ctx;
    // weißer ball-grund + leichter schatten-ring
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = '#f4f6fb'; ctx.fill();
    if (b.img && b.img.complete && b.img.naturalWidth > 0) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r-1.5, 0, Math.PI*2); ctx.clip();
      ctx.drawImage(b.img, x-r, y-r, r*2, r*2); ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(x, y, r-1.5, 0, Math.PI*2); ctx.fillStyle = b.color; ctx.fill();
    }
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x, y, r-0.5, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x-r*0.32, y-r*0.32, r*0.26, 0, Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
  }
  destroy() { this.observer.disconnect(); this.falling=[]; this.resting=[]; this.el.remove(); }
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
