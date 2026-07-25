// gift-jar.js — Coin-Glas im TikFinity-Stil: jedes Gift fällt als BALL mit dem
// echten Geschenk-Bild ins Glas. Je mehr Coins, desto größer der Ball.
// Die Bälle stapeln sich (Heightmap-Physik) zu einem dichten Haufen.
// props: { target?, label?, accent? }. rAF nur bei Bewegung (TTLS-schonend).

import { comboPlan } from './combo.js';

const STYLE_ID = 'bx-jar-style';
// --u = „1px bei Standardgröße" (440×520): Badge, Label und Toasts sind
// Vielfache davon und wachsen mit, wenn das Glas größer gezogen wird.
const CSS = `
.bx-jar { position: absolute; inset: 0; font-family: var(--bx-font-display); container-type: size; --u: min(0.227cqi, 0.192cqh); }
.bx-jar canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-jar-badge { position: absolute; right: 5%; top: 3%; overflow: hidden; display: flex; align-items: center; gap: calc(var(--u) * 6);
  padding: calc(var(--u) * 5) calc(var(--u) * 14) calc(var(--u) * 9) calc(var(--u) * 10);
  border-radius: 999px; background: linear-gradient(160deg, rgba(28,30,42,.94), rgba(13,14,20,.92));
  box-shadow: 0 6px 16px -6px rgba(0,0,0,.6), 0 0 0 1.5px color-mix(in srgb, var(--bx-gold) 50%, transparent) inset; }
.bx-jar-badge .ico { font-size: clamp(9px, calc(var(--u) * 15), 60px); }
.bx-jar-badge .tgt { font-family: var(--bx-font-display); font-size: clamp(8px, calc(var(--u) * 12), 48px); color: #d9deee; opacity: .85; white-space: nowrap; }
.bx-jar-badge .num { font-family: var(--bx-font-display); font-size: clamp(10px, calc(var(--u) * 16), 64px); color: var(--bx-gold);
  -webkit-text-stroke: 2.5px #0a0b12; paint-order: stroke fill; white-space: nowrap; }
/* Ziel-Fortschritt: dünne Leiste am unteren Rand des Badges. Macht die
   Property „target" sichtbar — vorher wurde sie gesetzt und nie benutzt.
   Im Badge statt am Glas, damit sie mit keiner Behälter-Form kollidiert. */
.bx-jar-goal { position:absolute; left:6%; right:6%; bottom: 12%; height: clamp(2px, calc(var(--u) * 4), 16px);
  border-radius:999px; background: rgba(255,255,255,.16); overflow:hidden; }
.bx-jar-goal > i { display:block; height:100%; width:0%; border-radius:999px;
  background: linear-gradient(90deg, var(--bx-gold), #ff9d3d); box-shadow: 0 0 12px -2px var(--bx-gold);
  transition: width 600ms cubic-bezier(.25,1,.35,1); }
.bx-jar.done .bx-jar-goal > i { background: linear-gradient(90deg, var(--bx-teal), #7dffe9); box-shadow: 0 0 14px -2px var(--bx-teal); }
/* Ziel erreicht → Badge pulsiert kurz in Türkis. */
.bx-jar.done .bx-jar-badge { box-shadow: 0 6px 16px -6px rgba(0,0,0,.6), 0 0 0 2px var(--bx-teal) inset, 0 0 22px -4px var(--bx-teal);
  animation: bx-jar-done 1.1s ease-in-out infinite; }
.bx-jar.done .bx-jar-badge .num { color: var(--bx-teal); }
@keyframes bx-jar-done { 50% { transform: scale(1.06); } }
.bx-jar-label { position: absolute; left: 0; right: 0; top: 3%; text-align: center;
  font-family: var(--bx-font-display); font-size: clamp(11px, calc(var(--u) * 20), 80px); letter-spacing: .04em; color: #fff;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 0 14px color-mix(in srgb, var(--bx-gold) 50%, transparent), 0 3px 5px rgba(0,0,0,.5); }
/* Donation-Toasts (TikFinity-Style): „Name schickt Gift ×N" fliegt links oben ein. */
.bx-jar-toasts { position:absolute; left:4%; top:13%; right:4%; display:flex; flex-direction:column; gap: calc(var(--u) * 5); pointer-events:none; }
.bx-jar-toast { display:flex; align-items:center; gap: calc(var(--u) * 7); align-self:flex-start; max-width:100%;
  padding: calc(var(--u) * 5) calc(var(--u) * 12) calc(var(--u) * 5) calc(var(--u) * 6);
  border-radius:999px; font-family: var(--bx-font-body); font-size: clamp(9px, calc(var(--u) * 13), 52px); color:#fff; white-space:nowrap;
  background: linear-gradient(160deg, rgba(28,30,42,.95), rgba(13,14,20,.92)); box-shadow: 0 6px 16px -6px rgba(0,0,0,.6);
  overflow:hidden; text-overflow:ellipsis; animation: bx-jar-toast 3s ease forwards; }
.bx-jar-toast img { width: calc(var(--u) * 22); height: calc(var(--u) * 22); border-radius:50%; object-fit:cover; flex:none; }
.bx-jar-toast .g { width: calc(var(--u) * 18); height: calc(var(--u) * 18); object-fit:contain; flex:none; }
.bx-jar-toast b { color: var(--bx-gold); }
@keyframes bx-jar-toast { 0%{opacity:0; transform:translateX(-16px)} 10%{opacity:1; transform:none} 82%{opacity:1} 100%{opacity:0; transform:translateY(-8px)} }
/* TikFinity-Original: ihr Marken-Grau #282828cc als Pillen, Radius 1.6875rem. */
.bx-jar--tf .bx-jar-badge, .bx-jar--tf .bx-jar-toast { background:#282828cc; border-radius:1.6875rem; box-shadow:0 4px 14px -6px rgba(0,0,0,.5); }
.bx-jar--tf .bx-jar-badge .num { color:#ffd54a; -webkit-text-stroke:0; text-shadow:0 1px 2px rgba(0,0,0,.5); }
.bx-jar--tf .bx-jar-label { color:#fff; -webkit-text-stroke:0; font-weight:800; text-shadow:0 2px 6px rgba(0,0,0,.55); }
.bx-jar--tf .bx-jar-toast b { color:#ffd54a; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
const FALLBACK = ['#ffd23e','#ff8a3d','#ff5436','#ff5e8a','#c45cff','#5c9dff','#28e0c4','#7dff8a'];
const MAX_BALLS = 400;
const COLS = 15; // Spalten der Höhenkarte — Bälle stapeln sich pro Spalte von unten

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
  constructor(root, props, ctx) {
    ensureStyle();
    root.style.setProperty('--bx-accent', props.accent || '#ffd23e');
    this.target = Math.max(1, Number(props.target ?? 1000));
    this.coinsValue = 0;
    this.falling = [];
    this.resting = [];
    this.running = false;
    this.showToast = props.showToast !== false; // Donation-Toasts (TikFinity-Style)
    // Behälter-Form: klassisches Glas, Herz, Pokal, Schatztruhe oder das
    // originalgetreu nachgezeichnete TikFinity-Mason-Glas.
    this.shape = ['glas', 'herz', 'pokal', 'truhe', 'tikfinity'].includes(props.shape) ? props.shape : 'glas';
    this.toastTimers = new Set();
    this.el = document.createElement('div');
    this.el.className = 'bx-jar' + (this.shape === 'tikfinity' ? ' bx-jar--tf' : '');
    this.el.innerHTML = `<canvas></canvas><div class="bx-jar-label"></div><div class="bx-jar-badge"><span class="ico">🪙</span><span class="num">0</span><span class="tgt"></span><span class="bx-jar-goal"><i></i></span></div><div class="bx-jar-toasts"></div>`;
    this.el.querySelector('.bx-jar-label').textContent = props.label || 'Coin-Glas';
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this); this.frame = this.frame.bind(this);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(root);
    this.resize();
    this.updateBadge();
    // Editor-Vorschau: ein paar Beispiel-Bälle, sonst steht dort ein leeres Glas
    // und man kann Größe/Position nicht beurteilen.
    if (ctx && ctx.preview) this.demo();
  }

  /** Stand + Ziel im Badge („1.7K / 2K") und Ziel-Zustand. Das Ziel war vorher
   *  eine tote Property: gesetzt, aber nirgends benutzt. */
  updateBadge() {
    const num = this.el.querySelector('.bx-jar-badge .num');
    if (num) num.textContent = fmt(this.coinsValue);
    const tgt = this.el.querySelector('.bx-jar-badge .tgt');
    if (tgt) tgt.textContent = `/ ${fmt(this.target)}`;
    const bar = this.el.querySelector('.bx-jar-goal > i');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, (this.coinsValue / this.target) * 100))}%`;
    this.el.classList.toggle('done', this.coinsValue >= this.target);
  }

  /** Beispiel-Füllung für den Editor (keine Dauer-Animation, nur einmal). */
  demo() {
    this.coinsValue = Math.round(this.target * 0.45);
    this.updateBadge();
    const gift = { slug: 'Rose', count: 1, coinsPerUnit: 10, totalCoins: 10, icon: '' };
    for (let i = 0; i < 16; i++) {
      const t = setTimeout(() => { this.pendingTimers?.delete(t); this.spawn(gift, 5 + i * 45); }, i * 70);
      (this.pendingTimers ??= new Set()).add(t);
    }
  }
  resize() {
    const r = this.el.getBoundingClientRect(); if (r.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
    // Höhenkarte (Füllstand je Spalte, in ry-Einheiten 0..1) — überlebt Resizes,
    // weil ry auflösungsunabhängig ist. Nur einmal anlegen.
    if (!this.heightmap) this.heightmap = new Array(COLS).fill(0);
    // TikFinity-Glas ist breiter & gerader (Mason-Zylinder) als unser Original-Glas.
    const jw = this.shape === 'tikfinity' ? Math.min(this.w * 0.82, this.h * 0.62) : Math.min(this.w * 0.92, this.h * 0.72);
    // Form-abhängige Geometrie: Pokal lässt unten Platz für Stiel+Fuß,
    // Truhe oben für den gewölbten Deckel, TikFinity lässt oben Platz fürs Gewinde.
    const bottom = this.shape === 'pokal' ? this.h * 0.74 : this.shape === 'tikfinity' ? this.h * 0.9 : this.h * 0.93;
    const top = this.shape === 'truhe' ? this.h * 0.24 : this.shape === 'tikfinity' ? this.h * 0.17 : this.h * 0.165;
    this.jar = { cx: this.w/2, lidY: this.h*0.06, top, midY: this.h*0.52, bottom,
      neckW: this.shape === 'tikfinity' ? jw : jw*0.5, midW: jw, botW: this.shape === 'tikfinity' ? jw*0.98 : jw*0.74, lidW: jw*0.56 };
    this.unit = jw; // basis für ball-größen
    this.draw();
  }
  halfW(y) {
    const J = this.jar; const yc = Math.max(J.top, Math.min(J.bottom, y));
    const tv = (yc - J.top) / (J.bottom - J.top); // 0 = oben, 1 = unten
    if (this.shape === 'herz') {
      // Herz: oben breit (Lappen), spitz zulaufend nach unten.
      return (J.midW / 2) * Math.pow(Math.cos(tv * Math.PI / 2), 0.75) * (tv < 0.12 ? 0.86 + tv : 1);
    }
    if (this.shape === 'pokal') {
      // Pokal-Schale: Halb-Ellipse — unten (Stiel) schmal.
      return (J.midW / 2) * Math.sqrt(Math.max(0.02, 1 - tv * tv));
    }
    if (this.shape === 'truhe') {
      return J.midW / 2; // Truhe: gerade Wände
    }
    if (this.shape === 'tikfinity') {
      // Mason-Glas: fast senkrechte Wände, minimal eingezogene Mündung, runder Boden.
      let hw = J.midW / 2;
      if (tv < 0.05) hw *= 0.93 + tv * 1.4;            // Mündung minimal enger als Rand
      if (tv > 0.9) hw *= Math.sqrt(Math.max(0.04, 1 - Math.pow((tv - 0.9) / 0.1, 2))); // gerundeter Boden
      return hw;
    }
    // Klassisches Glas (Original): Hals → Bauch → Boden.
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
  colOf(rx) { return Math.min(COLS - 1, Math.max(0, Math.floor((rx + 1) / 2 * COLS))); }
  colRx(c) { return (c + 0.5) / COLS * 2 - 1; }
  coinPos(rx, ry) {
    const y = this.jar.bottom - ry * (this.jar.bottom - this.jar.top);
    const hw = this.halfW(y);
    return { x: this.jar.cx + rx * (hw - 6), y };
  }
  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'gift' || !event.gift) return;
    this.coinsValue += event.gift.totalCoins;
    this.updateBadge();
    if (this.showToast) this.addToast(event);
    // Combo (z.B. 10x Rose) wirft EINEN Ball pro Gift — nicht nur einen für die
    // ganze Combo. Anzahl gedeckelt, Ballgröße aus dem Einzel-Coin-Wert.
    const count = comboPlan(event.gift, 24).rockets;
    const coinsPerUnit = event.gift.coinsPerUnit || event.gift.totalCoins || 1;
    for (let i = 0; i < count; i++) {
      if (i === 0) this.spawn(event.gift, coinsPerUnit);
      else {
        const t = setTimeout(() => { this.pendingTimers?.delete(t); this.spawn(event.gift, coinsPerUnit); }, i * 55);
        (this.pendingTimers ??= new Set()).add(t);
      }
    }
  }
  spawn(gift, coins) {
    // Glas noch nicht vermessen (z.B. 0-Größe beim Mount/in der Vorschau)? Einmal
    // nachmessen; klappt das nicht, Ball überspringen (der Zähler lief schon) —
    // sonst Crash „reading 'top'".
    if (!this.jar) { this.resize(); if (!this.jar) return; }
    // Backpressure: bevorzugt fallende Bälle deckeln; ruhende nur entfernen, wenn
    // der Boden-Stapel selbst voll ist (sonst „verschwinden" Bälle am Boden). Beim
    // Entfernen die Spaltenhöhe zurücknehmen, sonst wächst der Haufen ins Unendliche.
    if (this.resting.length + this.falling.length >= MAX_BALLS) {
      if (this.resting.length > 0) {
        const rem = this.resting.shift();
        if (rem.col != null && this.heightmap) this.heightmap[rem.col] = Math.max(0, this.heightmap[rem.col] - 2 * rem.r / (this.jar.bottom - this.jar.top));
      } else this.falling.shift();
    }
    const r = this.ballRadius(coins ?? gift.totalCoins);
    // Bälle fallen leicht gestreut ein und stapeln sich dann über die Höhenkarte.
    const rx = (Math.random() * 2 - 1) * 0.82;
    this.falling.push({ rx, r, y: this.jar.top - r - Math.random()*30, vy: 1.2 + Math.random()*1.1, bounces: 0,
      img: loadImage(gift.icon), color: FALLBACK[Math.floor(Math.random()*FALLBACK.length)] });
    this.kick();
  }
  addToast(event) {
    const wrap = this.el.querySelector('.bx-jar-toasts');
    const nick = escapeHtml(event.user?.nickname || 'Jemand');
    const slug = escapeHtml(event.gift.slug || 'Gift');
    const cnt = event.gift.count > 1 ? ` ×${event.gift.count}` : '';
    const av = event.user?.profilePic ? `<img src="${escapeHtml(event.user.profilePic)}" alt="">` : '';
    const gi = event.gift.icon ? `<img class="g" src="${escapeHtml(event.gift.icon)}" alt="">` : '';
    const el = document.createElement('div');
    el.className = 'bx-jar-toast';
    el.innerHTML = `${av}<span><b>${nick}</b> ${slug}${cnt}</span>${gi}`;
    wrap.prepend(el);
    while (wrap.children.length > 3) wrap.lastElementChild.remove();
    const t = setTimeout(() => { this.toastTimers.delete(t); el.remove(); }, 3000);
    this.toastTimers.add(t);
  }
  kick() { if (!this.running) { this.running = true; this.lastT = 0; this.cancelFrame = scheduleFrame(this.frame); } }
  frame(now) {
    now = now || performance.now();
    // Delta-Time in 60fps-Frames (gedeckelt) → framerate-unabhängig, robust
    // auch wenn das Overlay-Fenster gedrosselt wird (Bälle setzen sich trotzdem).
    const dt = Math.min(4, this.lastT ? (now - this.lastT) / 16.67 : 1);
    this.lastT = now;
    const J = this.jar, span = J.bottom - J.top;
    for (const b of this.falling) {
      b.vy += 0.34 * dt; b.y += b.vy * dt;
      const col = this.colOf(b.rx);
      const ryR = b.r / span; // halbe Ball-Dicke in ry-Einheiten
      const restRy = Math.min(0.96, this.heightmap[col] + ryR); // oben auf dem Stapel dieser Spalte
      const landY = this.coinPos(b.rx, restRy).y;
      if (b.y >= landY) {
        // Leichter Abpraller (einmalig) — wie TikFinitys restitution 0.2, aber ohne Engine.
        if (b.vy > 1.4 && b.bounces < 1) { b.y = landY; b.vy = -b.vy * 0.24; b.bounces++; continue; }
        // In einen tieferen Nachbarn rollen → natürlicher Haufen statt Säulen.
        let c = col;
        const hL = col > 0 ? this.heightmap[col - 1] : Infinity;
        const hR = col < COLS - 1 ? this.heightmap[col + 1] : Infinity;
        if (Math.min(hL, hR) < this.heightmap[col] - ryR) c = (hL <= hR ? col - 1 : col + 1);
        const finalRy = Math.min(0.96, this.heightmap[c] + ryR);
        b.ry = finalRy; b.rx = this.colRx(c) + (Math.random() - 0.5) / COLS; b.col = c;
        this.heightmap[c] = Math.min(0.99, finalRy + ryR);
        this.resting.push(b); b.dead = true;
      }
    }
    this.falling = this.falling.filter((b) => !b.dead);
    this.draw();
    if (this.cancelFrame) this.cancelFrame();
    if (this.falling.length > 0) this.cancelFrame = scheduleFrame(this.frame); else { this.running = false; this.lastT = 0; }
  }
  jarPath(ctx, inset) {
    const J = this.jar; const k = inset || 0;
    const lx = (y)=>J.cx-this.halfW(y)+k, rx=(y)=>J.cx+this.halfW(y)-k;
    if (this.shape === 'herz') {
      // Echte Herzform (zwei Bögen oben, Spitze unten) — Bälle werden hineingeclippt.
      const w = J.midW - k * 2, ch = J.bottom - J.top, cx = J.cx;
      ctx.beginPath();
      ctx.moveTo(cx, J.bottom - k);
      ctx.bezierCurveTo(cx - w * 0.68, J.top + ch * 0.55, cx - w * 0.52, J.top - ch * 0.06 + k, cx, J.top + ch * 0.24);
      ctx.bezierCurveTo(cx + w * 0.52, J.top - ch * 0.06 + k, cx + w * 0.68, J.top + ch * 0.55, cx, J.bottom - k);
      ctx.closePath();
      return;
    }
    if (this.shape === 'truhe') {
      const w = J.midW - k * 2;
      roundRect(ctx, J.cx - w / 2, J.top + k, w, (J.bottom - J.top) - k * 2, 10);
      return;
    }
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
    if (this.shape === 'herz') { g.addColorStop(0, 'rgba(255,110,160,.2)'); g.addColorStop(.5, 'rgba(255,140,180,.1)'); g.addColorStop(1, 'rgba(220,70,130,.22)'); }
    else if (this.shape === 'truhe') { g.addColorStop(0, 'rgba(120,84,40,.28)'); g.addColorStop(.5, 'rgba(90,60,30,.2)'); g.addColorStop(1, 'rgba(70,46,22,.3)'); }
    else if (this.shape === 'tikfinity') { g.addColorStop(0, 'rgba(236,240,246,.14)'); g.addColorStop(.5, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(210,218,230,.16)'); } // klares, neutrales Glas
    else { g.addColorStop(0, 'rgba(120,150,190,.16)'); g.addColorStop(.5, 'rgba(150,180,220,.07)'); g.addColorStop(1, 'rgba(90,120,160,.18)'); }
    ctx.fillStyle = g; ctx.fill();
    // 2) Bälle (innerhalb des Glases geclippt)
    ctx.clip();
    for (const b of this.resting) { const p = this.coinPos(b.rx, b.ry); this.drawBall(p.x, p.y, b.r, b); }
    for (const b of this.falling) { const x = J.cx + b.rx * (this.halfW(b.y) - 6); this.drawBall(x, b.y, b.r, b); }
    ctx.restore();
    // 3) Glas-Outline — TikFinity: dünnes, klares Hellgrau (wie ihre PNG-Linie).
    this.jarPath(ctx, 0);
    if (this.shape === 'tikfinity') {
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(214,220,230,.72)'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.3)'; this.jarPath(ctx, 2.5); ctx.stroke();
    } else {
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(220,236,255,.66)'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.22)'; this.jarPath(ctx, 3); ctx.stroke();
    }
    // 4) Form-Deko: Glas → Schraubdeckel · Pokal → Stiel/Fuß/Henkel · Truhe → Deckel
    //    · TikFinity → Gewinde-Mündung (Mason-Rand)
    if (this.shape === 'tikfinity') {
      const mouthW = this.halfW(J.top) * 2;
      const rimTop = J.top - this.h * 0.045;
      // Gewinde-Ring (leicht überstehender Rand) + zwei Gewinde-Linien darunter.
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(214,220,230,.8)'; ctx.lineJoin = 'round';
      roundRect(ctx, J.cx - mouthW/2 - 4, rimTop, mouthW + 8, this.h * 0.055, this.h * 0.02); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(210,216,228,.55)'; ctx.lineCap = 'round';
      for (let i = 1; i <= 2; i++) {
        const yy = J.top + i * this.h * 0.028;
        ctx.beginPath();
        ctx.moveTo(J.cx - mouthW/2 + 6, yy);
        ctx.quadraticCurveTo(J.cx, yy + this.h * 0.012, J.cx + mouthW/2 - 6, yy - this.h * 0.006);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    } else if (this.shape === 'glas') {
      const lidH = (J.top - J.lidY) + 10;
      const lg = ctx.createLinearGradient(0, J.lidY, 0, J.lidY + lidH);
      lg.addColorStop(0, 'rgba(196,210,234,.96)'); lg.addColorStop(1, 'rgba(120,140,172,.95)');
      ctx.fillStyle = lg; roundRect(ctx, J.cx-J.lidW/2, J.lidY, J.lidW, lidH, 10); ctx.fill();
      ctx.fillStyle = 'rgba(230,240,255,.95)'; roundRect(ctx, J.cx-J.lidW/2-4, J.lidY, J.lidW+8, 11, 6); ctx.fill();
    } else if (this.shape === 'pokal') {
      // Stiel + Fuß + zwei Henkel in Gold
      const gold = ctx.createLinearGradient(0, J.bottom, 0, this.h * 0.95);
      gold.addColorStop(0, '#ffe88a'); gold.addColorStop(1, '#c9962c');
      ctx.fillStyle = gold;
      const stemW = J.midW * 0.12;
      roundRect(ctx, J.cx - stemW/2, J.bottom - 4, stemW, this.h * 0.13, 4); ctx.fill();
      roundRect(ctx, J.cx - J.midW * 0.28, this.h * 0.88, J.midW * 0.56, this.h * 0.055, 8); ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,215,80,.9)'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(J.cx - J.midW * 0.56, J.top + (J.bottom-J.top)*0.28, J.midW * 0.14, Math.PI * 0.75, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(J.cx + J.midW * 0.56, J.top + (J.bottom-J.top)*0.28, J.midW * 0.14, -Math.PI * 0.85, Math.PI * 0.25); ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (this.shape === 'truhe') {
      // Gewölbter Deckel + Metallband + Schloss
      const lidTop = this.h * 0.075;
      const wood = ctx.createLinearGradient(0, lidTop, 0, J.top);
      wood.addColorStop(0, 'rgba(146,96,52,.97)'); wood.addColorStop(1, 'rgba(96,60,30,.97)');
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.moveTo(J.cx - J.midW/2, J.top);
      ctx.quadraticCurveTo(J.cx, lidTop - 14, J.cx + J.midW/2, J.top);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,214,90,.95)';
      roundRect(ctx, J.cx - J.midW/2, J.top - 5, J.midW, 10, 4); ctx.fill();
      roundRect(ctx, J.cx - 12, J.top - 2, 24, 26, 5); ctx.fill();
      ctx.fillStyle = 'rgba(60,38,16,.9)';
      ctx.beginPath(); ctx.arc(J.cx, J.top + 12, 4.5, 0, Math.PI * 2); ctx.fill();
    }
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
  // Neuer Stream → Glas leeren, Coin-Zähler auf 0. WICHTIG: ausstehende Spawn-
  /** Session-Coins aus den Server-Stats rehydrieren: Nach Reconnect/Neustart
   *  wäre das Glas sonst leer, obwohl die Session längst gefüllt war. Nur
   *  anheben (max) — Bälle spawnen dafür keine, nur Stand + Füllhöhe. */
  onStats(stats) {
    const coins = stats?.totals?.coins;
    if (typeof coins !== 'number' || coins <= this.coinsValue) return;
    this.coinsValue = coins;
    this.updateBadge();
    if (this.jar) this.draw();
  }

  // Timer (Combo-Volley) clearen, sonst landen nach dem Reset noch Geister-Bälle
  // aus dem alten Stream im frisch geleerten Glas.
  onReset() {
    if (this.pendingTimers) { for (const t of this.pendingTimers) clearTimeout(t); this.pendingTimers.clear(); }
    for (const t of this.toastTimers) clearTimeout(t); this.toastTimers.clear();
    this.coinsValue = 0; this.falling = []; this.resting = [];
    if (this.heightmap) this.heightmap.fill(0);
    this.updateBadge();
    this.el.querySelectorAll('.bx-jar-toast').forEach((t) => t.remove());
    if (this.jar) this.draw();
  }

  destroy() {
    if (this.pendingTimers) { for (const t of this.pendingTimers) clearTimeout(t); this.pendingTimers.clear(); }
    for (const t of this.toastTimers) clearTimeout(t); this.toastTimers.clear();
    this.observer.disconnect(); this.falling=[]; this.resting=[]; this.el.remove();
  }
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));}
