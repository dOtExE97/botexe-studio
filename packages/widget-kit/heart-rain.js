// heart-rain.js — Bei Likes steigen Emojis auf (TikTok-Signature). Transparent,
// am unteren Rand, deckt nichts zu. props: { emojis?, accent?, maxPerBurst? }
const STYLE_ID = 'bx-hr-style';
const CSS = `
.bx-hr { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.bx-hr-e { position: absolute; bottom: -8%; font-size: 34px; opacity: 0; will-change: transform, opacity;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.4)); animation: bx-hr-rise var(--dur,3.4s) ease-in forwards; }
@keyframes bx-hr-rise {
  0% { opacity: 0; transform: translateY(0) translateX(0) scale(.6) rotate(0); }
  12% { opacity: 1; transform: translateY(-12%) scale(1); }
  100% { opacity: 0; transform: translateY(-108%) translateX(var(--drift,0px)) scale(1.05) rotate(var(--rot,0deg)); }
}
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

export default class HeartRain {
  constructor(root, props) {
    ensureStyle();
    this.emojis = String(props.emojis || '❤️,💖,💕,✨,🔥').split(',').map((e) => e.trim()).filter(Boolean);
    this.maxPerBurst = Math.min(12, Math.max(1, Number(props.maxPerBurst ?? 5)));
    this.el = document.createElement('div');
    this.el.className = 'bx-hr';
    root.appendChild(this.el);
    this.live = 0; // cap gegen like-fluten
  }
  onEvent(event) {
    if (event.type !== 'like') return;
    const n = Math.min(this.maxPerBurst, Math.max(1, Math.round((event.likeCount ?? 1) / 5)));
    for (let i = 0; i < n; i++) setTimeout(() => this.spawn(), i * 90);
  }
  spawn() {
    if (this.live > 40) return; // harte obergrenze (TTLS-schonend)
    const e = document.createElement('div');
    e.className = 'bx-hr-e';
    e.textContent = this.emojis[Math.floor(Math.random() * this.emojis.length)] || '❤️';
    e.style.left = `${6 + Math.random() * 88}%`;
    e.style.fontSize = `${24 + Math.random() * 22}px`;
    e.style.setProperty('--dur', `${3 + Math.random() * 1.8}s`);
    e.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
    e.style.setProperty('--rot', `${(Math.random() - 0.5) * 50}deg`);
    this.el.appendChild(e);
    this.live++;
    setTimeout(() => { e.remove(); this.live--; }, 5200);
  }
  destroy() { this.el.remove(); }
}
