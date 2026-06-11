// leaderboard.js — Premium Top-Liste (Gifter oder Liker), live aus stats-Push.
// props: { source?: 'gifts'|'likes', limit?: number, title?: string, accent?: string }
// Glas-Panel, Medaillen-Ränge, Krone auf 1, Avatar-Glow, FLIP-Rang-Animation.

const STYLE_ID = 'bx-lb-style';
const CSS = `
.bx-lb { position: absolute; inset: 0; display: flex; flex-direction: column;
  font-family: var(--bx-font-body); padding: 16px 18px 14px; overflow: hidden;
  background: var(--bx-glass); border-radius: var(--bx-radius); box-shadow: var(--bx-shadow);
  -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); }
.bx-lb::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 70%, white), transparent 42%, color-mix(in srgb, var(--bx-accent) 30%, transparent));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events: none; }
.bx-lb-title { position: relative; overflow: hidden; font-family: var(--bx-font-display);
  font-size: 15px; letter-spacing: .3em; text-transform: uppercase; color: var(--bx-accent);
  text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 45%, transparent);
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-lb-title::after { content: ''; position: absolute; top: 0; bottom: 0; left: -60%; width: 45%;
  transform: skewX(-20deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent);
  animation: bx-shimmer 3.6s ease-in-out infinite; }
.bx-lb-list { position: relative; flex: 1; }
.bx-lb-row { position: absolute; left: 0; right: 0; height: 46px; display: flex; align-items: center; gap: 11px;
  padding: 0 6px; border-radius: 12px;
  transition: transform 520ms cubic-bezier(.25,1,.35,1), opacity 320ms, background 400ms; }
.bx-lb-row[data-rank="1"] { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-gold) 16%, transparent), transparent 70%); }
.bx-lb-rank { width: 28px; height: 28px; flex: none; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: 15px; color: #0a0b10; border-radius: 9px; background: #4a5066; }
.bx-lb-row[data-rank="1"] .bx-lb-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold); }
.bx-lb-row[data-rank="2"] .bx-lb-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); }
.bx-lb-row[data-rank="3"] .bx-lb-rank { background: linear-gradient(160deg,#f0b487,#c9763c); }
.bx-lb-row[data-rank="1"]::after { content: '👑'; position: absolute; left: 22px; top: -6px; font-size: 15px; transform: rotate(-18deg); filter: drop-shadow(0 1px 2px rgba(0,0,0,.8)); }
.bx-lb-pic { width: 32px; height: 32px; border-radius: 50%; flex: none; background: #1a1c28 center/cover;
  box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
.bx-lb-row[data-rank="1"] .bx-lb-pic { box-shadow: 0 0 0 2px var(--bx-gold), 0 0 14px -2px var(--bx-gold); }
.bx-lb-name { flex: 1; font-family: var(--bx-font-display); font-size: 18px; color: #fff; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 4px rgba(0,0,0,.5); }
.bx-lb-row[data-rank="1"] .bx-lb-name { color: var(--bx-gold); }
.bx-lb-val { font-family: var(--bx-font-mono); font-weight: 700; font-size: 16px; color: var(--bx-gold);
  text-shadow: 0 0 10px color-mix(in srgb, var(--bx-gold) 40%, transparent); }
.bx-lb-likes .bx-lb-title { color: var(--bx-pink); border-bottom-color: color-mix(in srgb, var(--bx-pink) 45%, transparent); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-pink) 45%, transparent); }
.bx-lb-likes .bx-lb-val { color: var(--bx-pink); text-shadow: 0 0 10px color-mix(in srgb, var(--bx-pink) 40%, transparent); }
.bx-lb-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 13px;
  letter-spacing: .2em; color: var(--bx-muted); text-transform: uppercase; }
@keyframes bx-shimmer { 0%,55% { left: -60%; } 100% { left: 130%; } }
`;

function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export default class Leaderboard {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.source = props.source === 'likes' ? 'likes' : 'gifts';
    this.limit = Math.min(10, Math.max(1, Number(props.limit ?? 5)));
    this.el = document.createElement('div');
    this.el.className = `bx-lb${this.source === 'likes' ? ' bx-lb-likes' : ''}`;
    const empty = this.source === 'likes' ? 'Noch keine Likes' : 'Noch keine Gifts';
    this.el.innerHTML = `<div class="bx-lb-title"></div><div class="bx-lb-list"><div class="bx-lb-empty">${empty}</div></div>`;
    this.el.querySelector('.bx-lb-title').textContent = props.title || (this.source === 'likes' ? 'Top Likes' : 'Top Gifter');
    root.appendChild(this.el);
    this.rows = new Map();
  }

  onStats(stats) {
    const src = this.source === 'likes' ? stats?.topLikers : stats?.topGifters;
    const items = (src ?? []).slice(0, this.limit);
    const list = this.el.querySelector('.bx-lb-list');
    const empty = list.querySelector('.bx-lb-empty');
    if (empty && items.length > 0) empty.remove();

    const seen = new Set();
    items.forEach((g, i) => {
      seen.add(g.id);
      let row = this.rows.get(g.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'bx-lb-row';
        row.style.opacity = '0';
        row.innerHTML = `<div class="bx-lb-rank"></div><div class="bx-lb-pic"></div><div class="bx-lb-name"></div><div class="bx-lb-val"></div>`;
        list.appendChild(row);
        this.rows.set(g.id, row);
        requestAnimationFrame(() => { row.style.opacity = '1'; });
      }
      row.dataset.rank = String(i + 1);
      row.style.transform = `translateY(${i * 48}px)`;
      row.querySelector('.bx-lb-rank').textContent = String(i + 1);
      row.querySelector('.bx-lb-name').textContent = g.nickname;
      row.querySelector('.bx-lb-val').textContent = this.source === 'likes' ? `${fmt(g.likes)} ❤` : fmt(g.coins);
      const pic = row.querySelector('.bx-lb-pic');
      if (g.profilePic) pic.style.backgroundImage = `url("${encodeURI(g.profilePic)}")`;
    });
    for (const [id, row] of this.rows) { if (!seen.has(id)) { row.remove(); this.rows.delete(id); } }
  }

  destroy() { this.el.remove(); }
}
