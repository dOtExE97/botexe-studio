// points-board.js — All-Time-Punkte-Bestenliste (Loyalty), aus stats.topPoints.
// props: { limit?, title?, accent?, source='points' }. Glas-Panel wie leaderboard,
// mit Medaillen-Rängen (Gold/Silber/Bronze) + Krone (Inline-SVG) auf Platz 1.
const STYLE_ID = 'bx-pb-style';
// Krone als Inline-SVG (KEIN Emoji) — currentColor folgt der Goldfarbe der Krone.
const CROWN_SVG = `<svg class="bx-pb-crown" viewBox="0 0 24 18" aria-hidden="true"><path d="M2 6.2l3.6 3.1L9.4 3l2.6 4.2L14.6 3l3.8 6.3L22 6.2l-1.7 9.3a1 1 0 0 1-1 .8H4.7a1 1 0 0 1-1-.8L2 6.2Z" fill="currentColor" stroke="rgba(0,0,0,.55)" stroke-width=".8" stroke-linejoin="round"/><circle cx="2" cy="6.2" r="1.4" fill="currentColor"/><circle cx="12" cy="2.4" r="1.4" fill="currentColor"/><circle cx="22" cy="6.2" r="1.4" fill="currentColor"/></svg>`;
const CSS = `
.bx-pb { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--bx-font-body);
  padding: 16px 18px 14px; overflow: hidden; background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow); -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); }
.bx-pb::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 70%, white), transparent 42%, color-mix(in srgb, var(--bx-accent) 30%, transparent));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-pb-title { position: relative; overflow: hidden; font-family: var(--bx-font-display); font-size: 15px; letter-spacing: .3em;
  text-transform: uppercase; color: var(--bx-accent); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 45%, transparent);
  padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-pb-title::after { content:''; position:absolute; top:0; bottom:0; left:-60%; width:45%; transform:skewX(-20deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent); animation: bx-shimmer 3.6s ease-in-out infinite; }
.bx-pb-list { position: relative; flex: 1; }
.bx-pb-row { position: absolute; left:0; right:0; height:46px; display:flex; align-items:center; gap:11px; padding:0 6px; border-radius:12px;
  transition: transform 520ms cubic-bezier(.25,1,.35,1), opacity 320ms; }
.bx-pb-row[data-rank="1"] { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-gold) 16%, transparent), transparent 70%); }

/* — Rang-Badge: Default schlicht, Platz 1–3 als Medaillen — */
.bx-pb-rank { position: relative; width:28px; height:28px; flex:none; display:flex; align-items:center; justify-content:center;
  font-family: var(--bx-font-display); font-size:15px; color:#0a0b10; border-radius:50%; background:#4a5066;
  box-shadow: 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.18); }
.bx-pb-row[data-rank="1"] .bx-pb-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold), 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.45); }
.bx-pb-row[data-rank="2"] .bx-pb-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); box-shadow: 0 0 12px -3px #d7deec, 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.5); }
.bx-pb-row[data-rank="3"] .bx-pb-rank { background: linear-gradient(160deg,#f0b487,#c9763c); box-shadow: 0 0 12px -3px #f0a35a, 0 2px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35); }

/* — Krone (Inline-SVG) auf Platz 1, sitzt schräg über dem Badge — */
.bx-pb-crown { position:absolute; left:50%; top:-12px; width:18px; height:14px; transform:translateX(-50%) rotate(-14deg);
  color: var(--bx-gold); filter: drop-shadow(0 1px 2px rgba(0,0,0,.7)); z-index:2; pointer-events:none;
  animation: bx-pb-crown-float 2.8s ease-in-out infinite; }
@keyframes bx-pb-crown-float { 0%,100% { transform:translateX(-50%) rotate(-14deg) translateY(0); } 50% { transform:translateX(-50%) rotate(-14deg) translateY(-2px); } }

/* — Avatar mit Medaillen-Ring auf den Podestplätzen — */
.bx-pb-pic { width:32px; height:32px; border-radius:50%; flex:none; background:#1a1c28 center/cover; box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
.bx-pb-row[data-rank="1"] .bx-pb-pic { box-shadow: 0 0 0 2px var(--bx-gold), 0 0 14px -3px var(--bx-gold); }
.bx-pb-row[data-rank="2"] .bx-pb-pic { box-shadow: 0 0 0 2px #d7deec; }
.bx-pb-row[data-rank="3"] .bx-pb-pic { box-shadow: 0 0 0 2px #f0a35a; }

.bx-pb-name { flex:1; font-family: var(--bx-font-display); font-size:18px; color:var(--bx-text,#fff); text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 2px 4px rgba(0,0,0,.5); }
.bx-pb-row[data-rank="1"] .bx-pb-name { color: var(--bx-gold); }
.bx-pb-val { font-family: var(--bx-font-mono); font-weight:700; font-size:16px; color: var(--bx-accent);
  text-shadow: 0 0 10px color-mix(in srgb, var(--bx-accent) 40%, transparent); }
.bx-pb-row[data-rank="1"] .bx-pb-val { color: var(--bx-gold); text-shadow: 0 0 10px color-mix(in srgb, var(--bx-gold) 45%, transparent); }
.bx-pb-empty { display:flex; align-items:center; justify-content:center; height:100%; font-size:13px; letter-spacing:.2em; color: var(--bx-muted); text-transform:uppercase; }
@keyframes bx-shimmer { 0%,55% { left:-60%; } 100% { left:130%; } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));

/** URL sicher in CSS url("…") einbetten — NUR Quotes escapen, nie
 *  (nach-)encodieren: data-URIs und vor-encodierte CDN-URLs blieben sonst kaputt. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }
export default class PointsBoard {
  constructor(root, props) {
    ensureStyle();
    root.style.setProperty('--bx-accent', props.accent || '#7c5cff');
    this.limit = Math.min(10, Math.max(1, Number(props.limit ?? 5)));
    this.title = props.title || '';
    this.el = document.createElement('div');
    this.el.className = 'bx-pb';
    this.el.innerHTML = `<div class="bx-pb-title"></div><div class="bx-pb-list"><div class="bx-pb-empty">Noch keine Punkte</div></div>`;
    this.el.querySelector('.bx-pb-title').textContent = this.title || 'Top Supporter';
    root.appendChild(this.el);
    this.rows = new Map();
  }
  onStats(stats) {
    if (!this.title && stats?.currencyName) this.el.querySelector('.bx-pb-title').textContent = `Top ${stats.currencyName}`;
    const items = (stats?.topPoints ?? []).slice(0, this.limit);
    const list = this.el.querySelector('.bx-pb-list');
    const empty = list.querySelector('.bx-pb-empty');
    if (empty && items.length > 0) empty.remove();
    const seen = new Set();
    items.forEach((g, i) => {
      seen.add(g.id);
      let row = this.rows.get(g.id);
      if (!row) {
        row = document.createElement('div'); row.className = 'bx-pb-row'; row.style.opacity = '0';
        row.innerHTML = `<div class="bx-pb-rank"></div><div class="bx-pb-pic"></div><div class="bx-pb-name"></div><div class="bx-pb-val"></div>`;
        list.appendChild(row); this.rows.set(g.id, row);
        requestAnimationFrame(() => { row.style.opacity = '1'; });
      }
      const rank = i + 1;
      row.dataset.rank = String(rank);
      row.style.transform = `translateY(${i * 48}px)`;
      const rankEl = row.querySelector('.bx-pb-rank');
      // Krone (Inline-SVG) nur auf Platz 1; sonst keine — Badge zeigt die Rang-Zahl.
      rankEl.innerHTML = `${rank === 1 ? CROWN_SVG : ''}<span>${rank}</span>`;
      row.querySelector('.bx-pb-name').textContent = g.nickname;
      row.querySelector('.bx-pb-val').textContent = fmt(g.points);
      const pic = row.querySelector('.bx-pb-pic');
      if (g.profilePic) pic.style.backgroundImage = `url("${cssUrl(g.profilePic)}")`;
    });
    for (const [id, row] of this.rows) { if (!seen.has(id)) { row.remove(); this.rows.delete(id); } }
  }
  destroy() { this.el.remove(); }
}
