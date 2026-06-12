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


// Anti-Throttle: der TTLS-Browser drosselt requestAnimationFrame auf ~1/s
// (Offscreen-Rendering). Fallback-Timer springt ein, wenn rAF nicht feuert —
// gesunder Browser läuft mit vollen FPS (Timer wird jedes Frame gecancelt).
function scheduleFrame(cb) {
  const raf = requestAnimationFrame(cb);
  const timer = setTimeout(() => { cancelAnimationFrame(raf); cb(performance.now()); }, 55);
  return () => clearTimeout(timer);
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
    const jw = Math.min(this.w * 0.92, this.h * 0.72);
    this.jar = { cx: this.w/2, lidY: this.h*0.06, top: this.h*0.165, midY: this.h*0.52, bottom: this.h*0.93,
      neckW: jw*0.5, midW: jw, botW: jw*0.74, lidW: jw*0.56 };
    this.unit = jw; // basis für ball-größen
    this.draw();
  }
  halfW(y) {
    const J = this.jar; const yc = Math.max(J.top, Math.min(J.bottom, y));
    if (yc <= J.midY) {
      // hals → bauch: weiche cosinus-kurve (gerundete schulter)
      const t = (yc - J.top) / (J.midY - J.top);
      const e = (1 - Math.cos(t * Math.PI)) / 2; // ease 0..1
      return (J.neckW + (J.midW - J.neckW) * e) / 2;
    }
    // bauch → boden: leicht einziehend, gerundeter boden
    const t = (yc - J.midY) / (J.bottom - J.midY);
    const e = Math.sin(t * Math.PI / 2 * 0.9); // sanft
    return (J.midW + (J.botW - J.midW) * e) / 2;
  }
  // Ball-Radius aus Coin-Wert (log-skaliert): kleines Gift = klein, großes = groß
  ballRadius(coins) {
    const t = Math.min(1, Math.log10(Math.max(1, coins)) / 3.4); // 1..~2500 coins
    return this.unit * (0.035 + 0.06 * t); // ~3.5%..9.5% der jar-breite (viele bälle passen rein)
  }
  // Füllgrad aus kumulierter Ball-Fläche (von unten gefüllt)
  jarArea() { return this.jar.midW * (this.jar.bottom - this.jar.top) * 0.7; }
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
  kick() { if (!this.running) { this.running = true; this.lastT = 0; this.cancelFrame = scheduleFrame(this.frame); } }
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
    if (this.cancelFrame) this.cancelFrame();
    if (this.falling.length > 0) this.cancelFrame = scheduleFrame(this.frame); else { this.running = false; this.lastT = 0; }
  }
  jarPath(ctx, inset) {
    const J = this.jar; const k = inset || 0;
    const lx = (y)=>J.cx-this.halfW(y)+k, rx=(y)=>J.cx+this.halfW(y)-k;
    ctx.beginPath();
    ctx.moveTo(lx(J.top), J.top);
    // linke seite: hals → bauch → boden in feinen schritten (glatte kurve)
    for (let y = J.top; y <= J.bottom-6; y += (J.bottom-J.top)/26) ctx.lineTo(lx(y), y);
    // gerundeter boden
    ctx.quadraticCurveTo(lx(J.bottom), J.bottom+6, J.cx, J.bottom+6);
    ctx.quadraticCurveTo(rx(J.bottom), J.bottom+6, rx(J.bottom-6), J.bottom-6);
    for (let y = J.bottom-6; y >= J.top; y -= (J.bottom-J.top)/26) ctx.lineTo(rx(y), y);
    ctx.closePath();
  }
  draw() {
    const ctx = this.ctx, J = this.jar;
    ctx.clearRect(0, 0, this.w, this.h);
    // 1) getönte Glasfüllung (hinter den Bällen) → wirkt wie echtes Glas
    ctx.save(); this.jarPath(ctx, 0);
    const g = ctx.createLinearGradient(J.cx - J.midW/2, 0, J.cx + J.midW/2, 0);
    g.addColorStop(0, 'rgba(120,150,190,.16)'); g.addColorStop(.5, 'rgba(150,180,220,.07)'); g.addColorStop(1, 'rgba(90,120,160,.18)');
    ctx.fillStyle = g; ctx.fill();
    // 2) Bälle (innerhalb des Glases geclippt)
    ctx.clip();
    for (const b of this.resting) { const p = this.coinPos(b.rx, b.ry); this.drawBall(p.x, p.y, b.r, b); }
    for (const b of this.falling) { const x = J.cx + b.rx * (this.halfW(b.y) - 6); this.drawBall(x, b.y, b.r, b); }
    ctx.restore();
    // 3) Glas-Outline
    this.jarPath(ctx, 0);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(220,236,255,.66)'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.22)'; this.jarPath(ctx, 3); ctx.stroke();
    // 4) Deckel (gerundeter Schraubdeckel mit Glanz)
    const lidH = (J.top - J.lidY) + 10;
    const lg = ctx.createLinearGradient(0, J.lidY, 0, J.lidY + lidH);
    lg.addColorStop(0, 'rgba(196,210,234,.96)'); lg.addColorStop(1, 'rgba(120,140,172,.95)');
    ctx.fillStyle = lg; roundRect(ctx, J.cx-J.lidW/2, J.lidY, J.lidW, lidH, 10); ctx.fill();
    ctx.fillStyle = 'rgba(230,240,255,.95)'; roundRect(ctx, J.cx-J.lidW/2-4, J.lidY, J.lidW+8, 11, 6); ctx.fill();
    // 5) Reflexe (zwei glanz-streifen)
    const lx = (y)=>J.cx-this.halfW(y);
    ctx.lineCap='round';
    ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.moveTo(lx(J.top+(J.midY-J.top)*0.5)+18, J.top+(J.midY-J.top)*0.5); ctx.lineTo(lx(J.bottom)+20, J.bottom-40); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.moveTo(lx(J.midY)+36, J.midY); ctx.lineTo(lx(J.bottom)+38, J.bottom-50); ctx.stroke();
    ctx.lineCap='butt';
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
