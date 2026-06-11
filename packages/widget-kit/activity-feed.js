// activity-feed.js — kombinierter Aktivitäts-Ticker (Follow, Sub, Share, Gift).
// Glas-Zeilen mit Icon-Badge je Typ. props: { max?, ttlMs?, accent? }
const STYLE_ID = 'bx-af-style';
const CSS = `
.bx-af { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 7px;
  overflow: hidden; font-family: var(--bx-font-body); }
.bx-af-item { display: flex; align-items: center; gap: 11px; padding: 8px 16px 8px 8px; border-radius: 14px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 8px 22px -8px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.05) inset;
  transform: translateX(-115%); animation: bx-af-in 380ms cubic-bezier(.2,1.4,.4,1) forwards; }
.bx-af-item.old { animation: bx-af-out 320ms ease-in forwards; }
.bx-af-badge { width: 34px; height: 34px; flex: none; display: flex; align-items: center; justify-content: center;
  font-size: 17px; border-radius: 11px; color: #0a0b10; }
.bx-af-text { font-size: 15px; color: #e9ebf4; text-shadow: 0 1px 2px rgba(0,0,0,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-af-text b { font-family: var(--bx-font-display); color: #fff; text-transform: uppercase; }
@keyframes bx-af-in { to { transform: translateX(0); } }
@keyframes bx-af-out { to { transform: translateX(-115%); opacity: 0; } }
`;
const TYPES = {
  follow: { icon: '➕', txt: 'folgt jetzt', col: '#28e0c4' },
  sub: { icon: '★', txt: 'hat subscribed', col: '#ffd23e' },
  share: { icon: '⇗', txt: 'hat geteilt', col: '#ff5436' },
  gift: { icon: '🎁', txt: '', col: '#ff5e8a' },
};
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));

export default class ActivityFeed {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.max = Math.min(12, Math.max(1, Number(props.max ?? 6)));
    this.ttlMs = Number(props.ttlMs ?? 60000);
    this.el = document.createElement('div');
    this.el.className = 'bx-af';
    root.appendChild(this.el);
    this.timers = new Set();
  }
  onEvent(event) {
    const def = TYPES[event.type];
    if (!def) return;
    const name = event.user?.nickname || 'Jemand';
    let line;
    if (event.type === 'gift' && event.gift) {
      line = `<b>${escapeHtml(name)}</b> schickt <b>${escapeHtml(event.gift.slug)}</b> (+${fmt(event.gift.totalCoins)})`;
    } else {
      line = `<b>${escapeHtml(name)}</b> ${def.txt}`;
    }
    const item = document.createElement('div');
    item.className = 'bx-af-item';
    item.innerHTML = `<div class="bx-af-badge" style="background:linear-gradient(150deg,${def.col},color-mix(in srgb,${def.col} 60%,#000))">${def.icon}</div><div class="bx-af-text">${line}</div>`;
    this.el.appendChild(item);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    const t = setTimeout(() => { this.timers.delete(t); item.classList.add('old'); setTimeout(() => item.remove(), 320); }, this.ttlMs);
    this.timers.add(t);
  }
  destroy() { for (const t of this.timers) clearTimeout(t); this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
