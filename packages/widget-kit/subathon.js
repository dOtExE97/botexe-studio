// subathon.js — Subathon-Timer: läuft rückwärts, aber Geschenke/Follower/Likes
// VERLÄNGERN die Zeit. Klassiker, um den Stream am Laufen zu halten. Bei jedem
// Zuwachs ploppt „+Xs" auf; bei 0 endet der Subathon.
// props: { startMinutes?, secondsPerCoin?, secondsPerFollow?, secondsPerLike?,
//          maxMinutes?, title?, addSoundId?, accent? }
const STYLE_ID = 'bx-sub-style';
const CSS = `
.bx-sub { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:4px; container-type:size; font-family: var(--bx-font-body); background: var(--bx-glass);
  border-radius: var(--bx-radius); box-shadow: var(--bx-shadow), 0 0 46px -16px var(--bx-accent);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); overflow:hidden; }
.bx-sub::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 80%, white), transparent 45%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-sub-label { font-family: var(--bx-font-display); font-size: clamp(11px, 4cqmin, 20px); letter-spacing:.26em;
  text-transform:uppercase; color: var(--bx-muted); }
.bx-sub-time { font-family: var(--bx-font-num); font-weight:800; font-size: clamp(34px, 22cqmin, 96px); line-height:1;
  color:#fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 22px color-mix(in srgb, var(--bx-accent) 55%, transparent); }
.bx-sub.low .bx-sub-time { color: #ff5b5b; animation: bx-sub-blink 1s infinite; }
@keyframes bx-sub-blink { 0%,100%{opacity:1} 50%{opacity:.55} }
.bx-sub-add { position:absolute; top:10%; font-family: var(--bx-font-display); font-size: clamp(16px, 7cqmin, 34px);
  color: var(--bx-teal); -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill;
  animation: bx-sub-add 1200ms cubic-bezier(.2,1,.3,1) forwards; pointer-events:none; }
@keyframes bx-sub-add { 0%{opacity:0; transform: translateY(14px) scale(.7)} 18%{opacity:1; transform:none}
  100%{opacity:0; transform: translateY(-26px)} }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const two = (n) => String(n).padStart(2, '0');

function scheduleFrame(cb) {
  const raf = requestAnimationFrame(cb);
  const timer = setTimeout(() => { cancelAnimationFrame(raf); cb(performance.now()); }, 200);
  return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
}

export default class Subathon {
  constructor(root, props, ctx) {
    ensureStyle();
    this.host = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.perCoin = Math.max(0, Number(props.secondsPerCoin ?? 2));
    this.perFollow = Math.max(0, Number(props.secondsPerFollow ?? 30));
    this.perLike = Math.max(0, Number(props.secondsPerLike ?? 0));
    this.maxMs = Math.max(1, Number(props.maxMinutes ?? 600)) * 60000;
    this.addSound = props.addSoundId || '';
    this.remaining = Math.max(0, Number(props.startMinutes ?? 30)) * 60000;
    this.lastT = 0;

    this.el = document.createElement('div');
    this.el.className = 'bx-sub';
    this.el.innerHTML = `<div class="bx-sub-label"></div><div class="bx-sub-time">00:00</div>`;
    this.el.querySelector('.bx-sub-label').textContent = props.title || 'Subathon';
    this.timeEl = this.el.querySelector('.bx-sub-time');
    root.appendChild(this.el);
    this.render();
    this.kick();
  }

  onEvent(event) {
    let add = 0;
    if (event.type === 'gift' && event.gift) add = event.gift.totalCoins * this.perCoin;
    else if (event.type === 'follow') add = this.perFollow;
    else if (event.type === 'like') add = (event.likeCount ?? 0) * this.perLike;
    if (add <= 0) return;
    this.remaining = Math.min(this.maxMs, this.remaining + add * 1000);
    this.popAdd(Math.round(add));
    if (this.addSound) this.host.playSound?.(this.addSound);
    this.kick();
  }

  popAdd(sec) {
    const p = document.createElement('div');
    p.className = 'bx-sub-add';
    p.textContent = `+${sec}s`;
    this.el.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }

  kick() { if (!this.running) { this.running = true; this.lastT = 0; this.cancelFrame = scheduleFrame(this.frame.bind(this)); } }

  frame(now) {
    if (this.cancelFrame) this.cancelFrame();
    const dt = this.lastT ? now - this.lastT : 0;
    this.lastT = now;
    this.remaining = Math.max(0, this.remaining - dt);
    this.render();
    if (this.remaining > 0) this.cancelFrame = scheduleFrame(this.frame.bind(this));
    else { this.running = false; this.timeEl.textContent = 'VORBEI!'; }
  }

  render() {
    const total = Math.ceil(this.remaining / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    this.timeEl.textContent = h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
    this.el.classList.toggle('low', this.remaining > 0 && this.remaining < 60000);
  }

  destroy() { if (this.cancelFrame) this.cancelFrame(); this.running = false; this.el.remove(); }
}
