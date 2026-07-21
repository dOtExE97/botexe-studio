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

/* ── Stil „Bombe" — Comic-Zeitbombe: Zündschnur-Emoji, rot-pulsierend, Sticker-Look. */
.bx-sub-bombe .bx-sub-time { background: #14161f; border-radius: 50% / 42%;
  box-shadow: 0 0 0 3px #000, 0 10px 24px -8px rgba(0,0,0,.8), inset 0 -8px 20px rgba(0,0,0,.6);
  color: #ffd23e; position: relative; }
.bx-sub-bombe .bx-sub-time::before { content: '🧨'; position: absolute; top: -0.7em; right: -0.35em;
  font-size: .55em; transform: rotate(30deg); animation: bx-sub-fuse .5s ease-in-out infinite alternate; }
@keyframes bx-sub-fuse { from { transform: rotate(26deg) scale(.95); } to { transform: rotate(34deg) scale(1.08); } }
.bx-sub-bombe .bx-sub-label { -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; color: #fff; }

/* ── Stil „LED" — Anzeigetafel: dunkle Tafel, Bernstein-Ziffern, Scanlines. */
.bx-sub-led .bx-sub-time { background: #0a0c0a; border-radius: 8px;
  box-shadow: 0 0 0 3px #1c201c, 0 12px 30px -10px rgba(0,0,0,.8), inset 0 0 24px rgba(0,0,0,.9);
  color: var(--bx-gold); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-gold) 70%, transparent); position: relative;
  font-family: var(--bx-font-mono); }
.bx-sub-led .bx-sub-time::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.28) 2px 4px); }
.bx-sub-led .bx-sub-label { font-family: var(--bx-font-mono); letter-spacing: .5em; color: var(--bx-gold); opacity: .8; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const two = (n) => String(n).padStart(2, '0');

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
    this.startMs = Math.max(0, Number(props.startMinutes ?? 30)) * 60000;
    this.remaining = this.startMs;
    this.lastT = 0;

    this.el = document.createElement('div');
    this.style = ['glas', 'bombe', 'led'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-sub${this.style !== 'glas' ? ` bx-sub-${this.style}` : ''}`;
    this.el.innerHTML = `<div class="bx-sub-label"></div><div class="bx-sub-time">00:00</div>`;
    this.el.querySelector('.bx-sub-label').textContent = props.title || 'Subathon';
    this.timeEl = this.el.querySelector('.bx-sub-time');
    root.appendChild(this.el);
    this.render();
    this.kick();
  }

  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    let add = 0;
    if (event.type === 'gift' && event.gift) add = (event.gift.totalCoins || 0) * this.perCoin; // || 0: NaN würde den Timer dauerhaft einfrieren
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

  // Sekundenuhr → setInterval statt rAF-Dauerschleife (rendert sich eh nur
  // 1×/Sekunde sichtbar; die Bewegung ist dt-basiert, also exakt gleich).
  kick() { if (!this.timer) { this.lastT = 0; this.timer = setInterval(() => this.frame(performance.now()), 250); } }

  frame(now) {
    const dt = this.lastT ? now - this.lastT : 0;
    this.lastT = now;
    this.remaining = Math.max(0, this.remaining - dt);
    this.render();
    if (this.remaining <= 0) { clearInterval(this.timer); this.timer = null; this.timeEl.textContent = 'VORBEI!'; }
  }

  render() {
    const total = Math.ceil(this.remaining / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    this.timeEl.textContent = h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
    this.el.classList.toggle('low', this.remaining > 0 && this.remaining < 60000);
  }

  /** Neuer Stream: Timer zurück auf die Startzeit (alter Countdown gehört zur alten Session). */
  onReset() {
    this.remaining = this.startMs;
    this.kick(); // Uhr läuft sicher (falls sie bei „VORBEI!" gestoppt wurde)
    this.render();
  }

  destroy() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.el.remove(); }
}
