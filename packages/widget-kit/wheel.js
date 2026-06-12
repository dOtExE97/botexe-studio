// wheel.js — Profi-Glücksrad: Rad auf Standfuß, klickender Zeiger,
// Anlauf-Animation (kurz zurück → beschleunigen → smooth ausrollen),
// Gewinn-Popup. Blendet sich beim Spin automatisch ein und nach dem
// Ergebnis wieder aus (props.autoShow). props: { segments, accent, spinMs,
//   autoShow?, title? }. rAF nur während der Show (TTLS-schonend).
const STYLE_ID = 'bx-wh-style';
const CSS = `
.bx-wh { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); transition: opacity .45s ease, transform .45s cubic-bezier(.2,1.3,.3,1); }
.bx-wh.hidden { opacity: 0; transform: scale(.8) translateY(20px); pointer-events: none; }
.bx-wh canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-wh-title { position: absolute; left: 0; right: 0; top: 1%; text-align: center; font-size: 22px;
  letter-spacing: .08em; text-transform: uppercase; color: #fff;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 16px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 3px 5px rgba(0,0,0,.5); }
.bx-wh-result { position: absolute; left: 50%; top: 44%; transform: translate(-50%,-50%) scale(.5); opacity: 0;
  padding: 16px 34px; border-radius: 18px; text-align: center; pointer-events: none; z-index: 4;
  background: var(--bx-glass); box-shadow: var(--bx-shadow), 0 0 60px -10px var(--bx-accent);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.bx-wh-result.show { animation: bx-wh-pop 3s cubic-bezier(.2,1.5,.3,1) forwards; }
.bx-wh-result .k { font-size: 14px; letter-spacing: .34em; color: var(--bx-gold); text-transform: uppercase; }
.bx-wh-result .v { font-size: 34px; color: #fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; margin-top: 5px; }
.bx-wh-result .w { font-size: 15px; color: var(--bx-teal); margin-top: 4px; }
@keyframes bx-wh-pop { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.45); } 12% { opacity: 1; transform: translate(-50%,-50%) scale(1.1); }
  26% { transform: translate(-50%,-50%) scale(1); } 82% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-50%) scale(.92); } }
`;
const COLORS = ['#ff5436','#ffd23e','#28e0c4','#5c9dff','#c45cff','#ff5e8a','#7dff8a','#ff8a3d'];
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

export default class Wheel {
  constructor(root, props) {
    ensureStyle();
    this.accent = props.accent || '#ff5436';
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.segments = String(props.segments || '100 Coins|Nichts|VIP-Tag|Shoutout|50 Punkte|Joker|Doppelt|Pech')
      .split('|').map((x) => x.trim()).filter(Boolean);
    if (this.segments.length < 2) this.segments = ['Gewinn', 'Niete'];
    this.spinMs = Math.max(2000, Number(props.spinMs ?? 5000));
    this.autoShow = props.autoShow !== false;
    this.title = props.title || 'Glücksrad';
    this.angle = 0; this.spinning = false; this.pointerDefl = 0; this.lastAngle = 0;
    this.el = document.createElement('div');
    this.el.className = 'bx-wh' + (this.autoShow ? ' hidden' : '');
    this.el.innerHTML = `<canvas></canvas><div class="bx-wh-title"></div><div class="bx-wh-result"><div class="k">Gewinn</div><div class="v"></div><div class="w"></div></div>`;
    this.el.querySelector('.bx-wh-title').textContent = this.title;
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this); this.frame = this.frame.bind(this);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(root);
    this.resize();
  }
  resize() {
    const r = this.el.getBoundingClientRect(); if (r.width===0) return;
    const dpr = Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=r.width*dpr; this.canvas.height=r.height*dpr; this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.w=r.width; this.h=r.height;
    // Rad oben, Standfuß darunter
    this.radius = Math.min(r.width*0.42, r.height*0.34);
    this.cx = r.width/2; this.cy = this.radius*1.18 + r.height*0.06;
    this.draw();
  }
  onAction(action) {
    if (action.kind !== 'spin_wheel' || this.spinning) return;
    const n = this.segments.length, seg = (Math.PI*2)/n;
    const winner = typeof action.segmentIndex === 'number' ? ((action.segmentIndex%n)+n)%n : Math.floor(Math.random()*n);
    const targetMid = winner*seg + seg/2;
    const base = (-Math.PI/2) - targetMid;
    const turns = 6 + Math.floor(Math.random()*3);
    this.fromAngle = this.angle % (Math.PI*2);
    this.toAngle = base + turns*Math.PI*2;
    this.winner = winner; this.winnerName = action.params && action.params.name ? String(action.params.name) : '';
    this.startT = 0; this.spinning = true;
    const res = this.el.querySelector('.bx-wh-result'); res.classList.remove('show');
    if (this.autoShow) this.el.classList.remove('hidden'); // einblenden
    this.cancelFrame = scheduleFrame(this.frame);
  }
  frame(now) {
    now = now || performance.now();
    if (!this.startT) { this.startT = now; this.lastAngle = this.fromAngle; }
    const t = Math.min(1, (now-this.startT)/this.spinMs);
    // Anlauf: erst kurz zurück (anticipation), dann beschleunigen, dann ease-out
    let p;
    if (t < 0.12) { p = -0.04 * Math.sin((t/0.12)*Math.PI); } // wind-up rückwärts
    else { const tt = (t-0.12)/0.88; p = 1 - Math.pow(1-tt, 3); } // ease-out cubic
    this.angle = this.fromAngle + (this.toAngle-this.fromAngle)*p;
    // Zeiger-Klick: lenkt aus, wenn eine Segment-Grenze unter ihm durchläuft
    const n = this.segments.length, seg = (Math.PI*2)/n;
    const speed = Math.abs(this.angle - this.lastAngle); this.lastAngle = this.angle;
    const phase = ((-Math.PI/2 - this.angle) % seg + seg) % seg / seg; // 0..1 innerhalb segment
    const nearEdge = Math.min(phase, 1-phase);
    this.pointerDefl = nearEdge < 0.12 ? Math.min(0.5, speed*6) * (phase < 0.5 ? -1 : 1) : this.pointerDefl*0.7;
    this.draw();
    if (this.cancelFrame) this.cancelFrame();
    if (t < 1) this.cancelFrame = scheduleFrame(this.frame);
    else { this.spinning = false; this.pointerDefl = 0; this.draw(); this.showResult(); }
  }
  showResult() {
    const res = this.el.querySelector('.bx-wh-result');
    res.querySelector('.v').textContent = this.segments[this.winner];
    res.querySelector('.w').textContent = this.winnerName ? `🎉 ${this.winnerName}` : '';
    res.classList.remove('show'); void res.offsetWidth; res.classList.add('show');
    // nach dem ergebnis wieder ausblenden
    clearTimeout(this.hideT);
    if (this.autoShow) this.hideT = setTimeout(() => this.el.classList.add('hidden'), 3200);
  }
  draw() {
    const ctx = this.ctx, n = this.segments.length, seg = (Math.PI*2)/n, R = this.radius;
    ctx.clearRect(0,0,this.w,this.h);
    // ── Standfuß (hinter dem Rad) ──
    const baseY = this.cy + R + (this.h - (this.cy+R))*0.5;
    const footW = R*1.1, footH = (this.h-(this.cy+R))*0.34;
    const ng = ctx.createLinearGradient(0, this.cy, 0, baseY+footH);
    ng.addColorStop(0,'#3a4055'); ng.addColorStop(1,'#1a1d28');
    ctx.fillStyle = ng;
    // post
    ctx.beginPath(); ctx.moveTo(this.cx-R*0.1, this.cy+R*0.5); ctx.lineTo(this.cx-R*0.16, baseY);
    ctx.lineTo(this.cx+R*0.16, baseY); ctx.lineTo(this.cx+R*0.1, this.cy+R*0.5); ctx.closePath(); ctx.fill();
    // base (trapez)
    ctx.beginPath(); ctx.moveTo(this.cx-footW/2, baseY+footH); ctx.lineTo(this.cx-footW*0.32, baseY);
    ctx.lineTo(this.cx+footW*0.32, baseY); ctx.lineTo(this.cx+footW/2, baseY+footH); ctx.closePath();
    ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=2; ctx.stroke();
    // ── Rad ──
    ctx.save(); ctx.translate(this.cx, this.cy); ctx.rotate(this.angle);
    for (let i=0;i<n;i++) {
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R, i*seg, (i+1)*seg); ctx.closePath();
      ctx.fillStyle = COLORS[i%COLORS.length]; ctx.fill();
      ctx.strokeStyle='rgba(10,11,18,.55)'; ctx.lineWidth=2; ctx.stroke();
      ctx.save(); ctx.rotate(i*seg+seg/2); ctx.textAlign='right'; ctx.fillStyle='#0a0b12';
      ctx.font = `${Math.max(12, R*0.115)}px 'Lilita One', sans-serif`;
      const txt = this.segments[i].length>13 ? this.segments[i].slice(0,12)+'…' : this.segments[i];
      ctx.fillText(txt, R*0.9, R*0.04); ctx.restore();
    }
    ctx.restore();
    // Rand
    ctx.beginPath(); ctx.arc(this.cx,this.cy,R,0,Math.PI*2); ctx.lineWidth=7; ctx.strokeStyle='rgba(255,255,255,.42)'; ctx.stroke();
    ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(this.cx,this.cy,R-4,0,Math.PI*2); ctx.stroke();
    // Pins am Rand (kleine punkte)
    for (let i=0;i<n;i++){ const a=this.angle+i*seg; const px=this.cx+Math.cos(a)*R, py=this.cy+Math.sin(a)*R;
      ctx.beginPath(); ctx.arc(px,py,3.2,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); }
    // Nabe
    ctx.beginPath(); ctx.arc(this.cx,this.cy,R*0.14,0,Math.PI*2);
    const hg=ctx.createRadialGradient(this.cx-4,this.cy-4,2,this.cx,this.cy,R*0.14);
    hg.addColorStop(0,'#454d68'); hg.addColorStop(1,'#14161f');
    ctx.fillStyle=hg; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.stroke();
    // ── Zeiger (klick-flap am oberen Rand) ──
    ctx.save(); ctx.translate(this.cx, this.cy - R - 2); ctx.rotate(this.pointerDefl);
    ctx.beginPath(); ctx.moveTo(-13,-14); ctx.lineTo(13,-14); ctx.lineTo(0,10); ctx.closePath();
    ctx.fillStyle = this.accent; ctx.fill(); ctx.strokeStyle='#0a0b12'; ctx.lineWidth=2.5; ctx.stroke();
    ctx.restore();
  }
  destroy() { clearTimeout(this.hideT); this.observer.disconnect(); this.el.remove(); }
}
