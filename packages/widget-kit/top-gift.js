// top-gift.js — Highlight des größten Einzel-Gifts der Session. Glas-Karte,
// Gift-Bild + Spender, Bounce bei neuem Rekord. props: { accent?, title? }
const STYLE_ID = 'bx-tg-style';
const CSS = `
.bx-tg { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: var(--bx-font-body); padding: 14px; text-align: center; background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); overflow: hidden; }
.bx-tg::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 80%, white), transparent 45%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-tg-kicker { font-family: var(--bx-font-display); font-size: 12px; letter-spacing: .42em; text-transform: uppercase; color: var(--bx-gold); }
.bx-tg-img { height: 64px; margin: 8px 0 4px; filter: drop-shadow(0 6px 14px rgba(0,0,0,.5)); animation: bx-float 2.8s ease-in-out infinite; }
.bx-tg-emoji { font-size: 50px; margin: 6px 0; }
.bx-tg-gift { font-family: var(--bx-font-display); font-size: 22px; text-transform: uppercase; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,.6); }
.bx-tg-by { font-size: 14px; color: var(--bx-muted); margin-top: 2px; }
.bx-tg-by b { color: var(--bx-accent); font-family: var(--bx-font-display); }
.bx-tg-coins { margin-top: 6px; font-family: var(--bx-font-mono); font-weight: 700; font-size: 22px; color: var(--bx-gold);
  text-shadow: 0 0 16px color-mix(in srgb, var(--bx-gold) 50%, transparent); }
.bx-tg.bounce { animation: bx-tg-bounce 600ms cubic-bezier(.2,1.6,.4,1); }
@keyframes bx-tg-bounce { 0%,100% { transform: scale(1); } 40% { transform: scale(1.07); } }
.bx-tg-empty { font-size: 13px; letter-spacing: .2em; color: var(--bx-muted); text-transform: uppercase; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));

export default class TopGift {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.title = props.title || 'Größtes Gift';
    this.max = 0;
    this.el = document.createElement('div');
    this.el.className = 'bx-tg';
    this.el.innerHTML = `<div class="bx-tg-empty">Noch kein Gift</div>`;
    root.appendChild(this.el);
  }
  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    if (event.gift.totalCoins <= this.max) return;
    this.max = event.gift.totalCoins;
    this.el.innerHTML = `
      <div class="bx-tg-kicker">${escapeHtml(this.title)}</div>
      ${event.gift.icon ? '<img class="bx-tg-img" alt="" />' : '<div class="bx-tg-emoji">🎁</div>'}
      <div class="bx-tg-gift"></div>
      <div class="bx-tg-by">von <b></b></div>
      <div class="bx-tg-coins">${fmt(event.gift.totalCoins)} Coins</div>`;
    if (event.gift.icon) this.el.querySelector('.bx-tg-img').src = event.gift.icon;
    this.el.querySelector('.bx-tg-gift').textContent = event.gift.slug;
    this.el.querySelector('.bx-tg-by b').textContent = event.user?.nickname || 'Jemand';
    this.el.classList.remove('bounce'); void this.el.offsetWidth; this.el.classList.add('bounce');
  }
  destroy() { this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
