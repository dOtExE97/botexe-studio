// wheel.js — Glücksrad. Segmente (Preise) als bunte Tortenstücke; dreht bei
// einer 'spin_wheel'-Action smooth aus und zeigt den Gewinn groß an.
// props: { segments?: '|'-getrennt, accent?, spinMs? }
// Canvas-Rad + Zeiger; rAF nur während des Drehens.
const STYLE_ID = 'bx-wh-style';
const CSS = `
.bx-wh { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--bx-font-display); }
.bx-wh canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-wh-ptr { position: absolute; top: 2%; left: 50%; transform: translateX(-50%); font-size: 32px;
  filter: drop-shadow(0 3px 4px rgba(0,0,0,.6)); z-index: 2; }
.bx-wh-result { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.6); opacity: 0;
  padding: 14px 30px; border-radius: 16px; text-align: center; pointer-events: none; z-index: 3;
  background: var(--bx-glass); box-shadow: var(--bx-shadow), 0 0 50px -12px var(--bx-accent);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-wh-result.show { animation: bx-wh-pop 2.6s cubic-bezier(.2,1.5,.3,1) forwards; }
.bx-wh-result .k { font-size: 13px; letter-spacing: .3em; color: var(--bx-gold); text-transform: uppercase; }
.bx-wh-result .v { font-size: 30px; color: #fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; margin-top: 4px; }
@keyframes bx-wh-pop { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.5); } 15% { opacity: 1; transform: translate(-50%,-50%) scale(1.08); }
  30% { transform: translate(-50%,-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-50%) scale(.9); } }
`;
const COLORS = ['#ff5436','#ffd23e','#28e0c4','#5c9dff','#c45cff','#ff5e8a','#7dff8a','#ff8a3d'];
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

export default class Wheel {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.segments = String(props.segments || '100 Coins|Nichts|VIP-Tag|Shoutout|50 Punkte|Joker|Doppelt|Pech')
      .split('|').map((x) => x.trim()).filter(Boolean);
    if (this.segments.length < 2) this.segments = ['Gewinn', 'Niete'];
    this.spinMs = Math.max(1500, Number(props.spinMs ?? 4500));
    this.angle = 0; this.spinning = false;
    this.el = document.createElement('div');
    this.el.className = 'bx-wh';
    this.el.innerHTML = `<canvas></canvas><div class="bx-wh-ptr">🔻</div><div class="bx-wh-result"><div class="k">Gewinn</div><div class="v"></div></div>`;
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
    this.w=r.width; this.h=r.height; this.cx=r.width/2; this.cy=r.height/2;
    this.radius = Math.min(r.width, r.height)*0.42;
    this.draw();
  }
  onAction(action) {
    if (action.kind !== 'spin_wheel' || this.spinning) return;
    const n = this.segments.length;
    const winner = typeof action.segmentIndex === 'number' ? action.segmentIndex % n : Math.floor(Math.random()*n);
    // ziel-winkel: zeiger oben (−90°) soll auf segment-mitte zeigen, + viele umdrehungen
    const seg = (Math.PI*2)/n;
    const targetMid = winner*seg + seg/2;
    const pointerAng = -Math.PI/2;
    const base = pointerAng - targetMid;
    const turns = 5 + Math.floor(Math.random()*3);
    this.fromAngle = this.angle % (Math.PI*2);
    this.toAngle = base + turns*Math.PI*2;
    this.winner = winner; this.startT = 0; this.spinning = true;
    const res = this.el.querySelector('.bx-wh-result'); res.classList.remove('show');
    requestAnimationFrame(this.frame);
  }
  frame(now) {
    now = now || performance.now();
    if (!this.startT) this.startT = now;
    const t = Math.min(1, (now-this.startT)/this.spinMs);
    const ease = 1 - Math.pow(1-t, 3); // ease-out cubic
    this.angle = this.fromAngle + (this.toAngle-this.fromAngle)*ease;
    this.draw();
    if (t < 1) { requestAnimationFrame(this.frame); }
    else { this.spinning = false; this.showResult(); }
  }
  showResult() {
    const res = this.el.querySelector('.bx-wh-result');
    res.querySelector('.v').textContent = this.segments[this.winner];
    res.classList.remove('show'); void res.offsetWidth; res.classList.add('show');
  }
  draw() {
    const ctx = this.ctx, n = this.segments.length, seg = (Math.PI*2)/n;
    ctx.clearRect(0,0,this.w,this.h);
    ctx.save(); ctx.translate(this.cx, this.cy); ctx.rotate(this.angle);
    for (let i=0;i<n;i++) {
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,this.radius, i*seg, (i+1)*seg); ctx.closePath();
      ctx.fillStyle = COLORS[i%COLORS.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(10,11,18,.6)'; ctx.lineWidth = 2; ctx.stroke();
      // label
      ctx.save(); ctx.rotate(i*seg + seg/2); ctx.textAlign='right'; ctx.fillStyle='#0a0b12';
      ctx.font = `${Math.max(11, this.radius*0.11)}px 'Lilita One', sans-serif`;
      const txt = this.segments[i].length>12 ? this.segments[i].slice(0,11)+'…' : this.segments[i];
      ctx.fillText(txt, this.radius*0.92, 5); ctx.restore();
    }
    ctx.restore();
    // nabe
    ctx.beginPath(); ctx.arc(this.cx,this.cy,this.radius*0.13,0,Math.PI*2);
    ctx.fillStyle='#14161f'; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.stroke();
    // rand
    ctx.beginPath(); ctx.arc(this.cx,this.cy,this.radius,0,Math.PI*2); ctx.lineWidth=6; ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.stroke();
  }
  destroy() { this.observer.disconnect(); this.el.remove(); }
}
