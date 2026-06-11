// points-board.js — All-Time-Punkte-Bestenliste (Loyalty), aus stats.topPoints.
// props: { limit?, title?, accent? }. Glas-Panel wie leaderboard.
const STYLE_ID = 'bx-pb-style';
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
.bx-pb-row[data-rank="1"] { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-accent) 18%, transparent), transparent 70%); }
.bx-pb-rank { width:28px; height:28px; flex:none; display:flex; align-items:center; justify-content:center;
  font-family: var(--bx-font-display); font-size:15px; color:#0a0b10; border-radius:9px; background:#4a5066; }
.bx-pb-row[data-rank="1"] .bx-pb-rank { background: linear-gradient(160deg,#d8b4ff,#7c5cff); box-shadow: 0 0 16px -2px var(--bx-accent); }
.bx-pb-pic { width:32px; height:32px; border-radius:50%; flex:none; background:#1a1c28 center/cover; box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
.bx-pb-name { flex:1; font-family: var(--bx-font-display); font-size:18px; color:#fff; text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 2px 4px rgba(0,0,0,.5); }
.bx-pb-val { font-family: var(--bx-font-mono); font-weight:700; font-size:16px; color: var(--bx-accent);
  text-shadow: 0 0 10px color-mix(in srgb, var(--bx-accent) 40%, transparent); }
.bx-pb-empty { display:flex; align-items:center; justify-content:center; height:100%; font-size:13px; letter-spacing:.2em; color: var(--bx-muted); text-transform:uppercase; }
@keyframes bx-shimmer { 0%,55% { left:-60%; } 100% { left:130%; } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));

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
      row.dataset.rank = String(i + 1);
      row.style.transform = `translateY(${i * 48}px)`;
      row.querySelector('.bx-pb-rank').textContent = String(i + 1);
      row.querySelector('.bx-pb-name').textContent = g.nickname;
      row.querySelector('.bx-pb-val').textContent = fmt(g.points);
      const pic = row.querySelector('.bx-pb-pic');
      if (g.profilePic) pic.style.backgroundImage = `url("${encodeURI(g.profilePic)}")`;
    });
    for (const [id, row] of this.rows) { if (!seen.has(id)) { row.remove(); this.rows.delete(id); } }
  }
  destroy() { this.el.remove(); }
}
