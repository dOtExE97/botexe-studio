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
  border-radius: 11px; color: #0a0b10; }
.bx-af-badge svg { width: 19px; height: 19px; display: block; }
.bx-af-text { font-size: 15px; color: #e9ebf4; text-shadow: 0 1px 2px rgba(0,0,0,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-af-text b { font-family: var(--bx-font-display); color: #fff; text-transform: uppercase; }
@keyframes bx-af-in { to { transform: translateX(0); } }
@keyframes bx-af-out { to { transform: translateX(-115%); opacity: 0; } }
`;
// Monochrome Inline-SVG-Icons (currentColor = dunkle Badge-Schrift auf hellem Gradient).
const ICONS = {
  follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M19 8v6M22 11h-6"/></svg>',
  sub: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 20.1 6.5 19.3l1.3-6.1L3.2 9l6.2-.7L12 2.6Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>',
};
const TYPES = {
  follow: { icon: ICONS.follow, txt: 'folgt jetzt', col: '#28e0c4' },
  sub: { icon: ICONS.sub, txt: 'hat subscribed', col: '#ffd23e' },
  share: { icon: ICONS.share, txt: 'hat geteilt', col: '#ff5436' },
  gift: { icon: ICONS.gift, txt: '', col: '#ff5e8a' },
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
