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
.bx-tg-svg { width: 58px; height: 58px; margin: 6px 0; color: var(--bx-gold);
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--bx-gold) 55%, transparent)) drop-shadow(0 5px 12px rgba(0,0,0,.5));
  animation: bx-float 2.8s ease-in-out infinite; }
.bx-tg-svg svg { width: 100%; height: 100%; display: block; }
.bx-tg-gift { font-family: var(--bx-font-display); font-size: 22px; text-transform: uppercase; color: var(--bx-text,#fff); text-shadow: 0 2px 8px rgba(0,0,0,.6); }
.bx-tg-by { display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 14px; color: var(--bx-muted); margin-top: 5px; }
.bx-tg-by b { color: var(--bx-accent); font-family: var(--bx-font-display); }
.bx-tg-av { width: 26px; height: 26px; border-radius: 50%; object-fit: cover;
  border: 2px solid color-mix(in srgb, var(--bx-accent) 70%, transparent); box-shadow: 0 2px 8px rgba(0,0,0,.5); }
.bx-tg-coins { margin-top: 6px; font-family: var(--bx-font-mono); font-weight: 700; font-size: 22px; color: var(--bx-gold);
  text-shadow: 0 0 16px color-mix(in srgb, var(--bx-gold) 50%, transparent); }
.bx-tg.bounce { animation: bx-tg-bounce 600ms cubic-bezier(.2,1.6,.4,1); }
@keyframes bx-tg-bounce { 0%,100% { transform: scale(1); } 40% { transform: scale(1.07); } }
.bx-tg-empty { display: flex; flex-direction: column; align-items: center; gap: 12px;
  font-size: 13px; letter-spacing: .2em; color: var(--bx-muted); text-transform: uppercase; }
.bx-tg-empty .bx-tg-svg { width: 46px; height: 46px; margin: 0; opacity: .5; color: var(--bx-muted);
  filter: drop-shadow(0 3px 8px rgba(0,0,0,.4)); animation: none; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
// Inline-SVG-Geschenk, eingefärbt via currentColor (Gold-Token + Glow / muted im Empty-State).
const GIFT_SVG = '<span class="bx-tg-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg></span>';

export default class TopGift {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.title = props.title || 'Größtes Gift';
    this.max = 0;
    this.el = document.createElement('div');
    this.el.className = 'bx-tg';
    this.el.innerHTML = `<div class="bx-tg-empty">${GIFT_SVG}<span>Noch kein Gift</span></div>`;
    root.appendChild(this.el);
  }
  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    if (event.gift.totalCoins <= this.max) return;
    this.render({
      coins: event.gift.totalCoins,
      slug: event.gift.slug,
      icon: event.gift.icon,
      nickname: event.user?.nickname,
      avatar: event.user?.profilePic,
    });
  }
  // Nach Overlay-Reload aus den Session-Stats wiederherstellen (sonst leer).
  onStats(stats) {
    const t = stats?.topGift;
    if (!t || t.coins <= this.max) return;
    this.render({ coins: t.coins, slug: t.giftSlug, icon: t.giftIcon, nickname: t.nickname, avatar: t.profilePic });
  }
  render({ coins, slug, icon, nickname, avatar }) {
    this.max = coins;
    this.el.innerHTML = `
      <div class="bx-tg-kicker">${escapeHtml(this.title)}</div>
      ${icon ? '<img class="bx-tg-img" alt="" />' : GIFT_SVG}
      <div class="bx-tg-gift"></div>
      <div class="bx-tg-by">${avatar ? '<img class="bx-tg-av" alt="" />' : ''} von <b></b></div>
      <div class="bx-tg-coins">${fmt(coins)} Coins</div>`;
    if (icon) this.el.querySelector('.bx-tg-img').src = icon;
    if (avatar) this.el.querySelector('.bx-tg-av').src = avatar;
    this.el.querySelector('.bx-tg-gift').textContent = slug;
    this.el.querySelector('.bx-tg-by b').textContent = nickname || 'Jemand';
    this.el.classList.remove('bounce'); void this.el.offsetWidth; this.el.classList.add('bounce');
  }
  destroy() { this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
