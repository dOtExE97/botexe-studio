// leaderboard.js — Top-Liste (Gifter/Liker) mit 3 Stilen.
// props: { source?, limit?, title?, accent?, style?: 'glas'|'neon'|'bars' }
const STYLE_ID = 'bx-lb-style';
const CSS = `
.bx-lb { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--bx-font-body); padding: 16px 18px 14px; overflow: hidden; }
.bx-lb-title { position: relative; overflow: hidden; font-family: var(--bx-font-display); font-size: 15px; letter-spacing: .3em;
  text-transform: uppercase; color: var(--bx-accent); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 45%, transparent);
  padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-lb-title::after { content:''; position:absolute; top:0; bottom:0; left:-60%; width:45%; transform:skewX(-20deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent); animation: bx-shimmer 3.6s ease-in-out infinite; }
.bx-lb-list { position: relative; flex: 1; }
.bx-lb-row { position: absolute; left:0; right:0; height:46px; display:flex; align-items:center; gap:11px; padding:0 8px; border-radius:12px;
  transition: transform 520ms cubic-bezier(.25,1,.35,1), opacity 320ms; }
.bx-lb-rank { width:28px; height:28px; flex:none; display:flex; align-items:center; justify-content:center; font-family: var(--bx-font-display); font-size:15px; color:#0a0b10; border-radius:9px; background:#4a5066; }
.bx-lb-row[data-rank="1"] .bx-lb-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold); }
.bx-lb-row[data-rank="2"] .bx-lb-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); }
.bx-lb-row[data-rank="3"] .bx-lb-rank { background: linear-gradient(160deg,#f0b487,#c9763c); }
.bx-lb-row[data-rank="1"]::after { content:'👑'; position:absolute; left:24px; top:-6px; font-size:15px; transform:rotate(-18deg); filter:drop-shadow(0 1px 2px rgba(0,0,0,.8)); z-index:2; }
.bx-lb-pic { width:32px; height:32px; border-radius:50%; flex:none; background:#1a1c28 center/cover; box-shadow:0 0 0 2px rgba(255,255,255,.12); }
.bx-lb-name { flex:1; font-family: var(--bx-font-display); font-size:18px; color:#fff; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 2px 4px rgba(0,0,0,.5); }
.bx-lb-val { font-family: var(--bx-font-mono); font-weight:700; font-size:16px; color: var(--bx-gold); text-shadow: 0 0 10px color-mix(in srgb, var(--bx-gold) 40%, transparent); }
.bx-lb-likes .bx-lb-title, .bx-lb-likes .bx-lb-val { color: var(--bx-pink); }
.bx-lb-likes .bx-lb-title { border-bottom-color: color-mix(in srgb, var(--bx-pink) 45%, transparent); }
.bx-lb-empty { display:flex; align-items:center; justify-content:center; height:100%; font-size:13px; letter-spacing:.2em; color: var(--bx-muted); text-transform:uppercase; }
@keyframes bx-shimmer { 0%,55% { left:-60%; } 100% { left:130%; } }

/* — GLAS — */
.bx-st-glas { background: var(--bx-glass); border-radius: var(--bx-radius); box-shadow: var(--bx-shadow);
  -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); }
.bx-st-glas::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 70%, white), transparent 42%, color-mix(in srgb, var(--bx-accent) 30%, transparent));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-st-glas .bx-lb-row[data-rank="1"] { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-gold) 16%, transparent), transparent 70%); }

/* — NEON — transparenter body, leuchtende outline, ohne panel-füllung (schont sicht) */
.bx-st-neon { background: rgba(8,9,14,.42); border-radius: 12px; border: 1.5px solid color-mix(in srgb, var(--bx-accent) 70%, transparent);
  box-shadow: 0 0 22px -6px var(--bx-accent), 0 0 30px -10px var(--bx-accent) inset; }
.bx-st-neon .bx-lb-name { text-shadow: 0 0 10px rgba(0,0,0,.9); }
.bx-st-neon .bx-lb-row[data-rank="1"] .bx-lb-name { color: var(--bx-gold); text-shadow: 0 0 12px var(--bx-gold); }

/* — BARS — jede zeile ist ein gefüllter balken (kein panel, minimale fläche) */
.bx-st-bars { background: none; box-shadow: none; padding: 6px 4px; }
.bx-st-bars .bx-lb-title { border: none; margin-bottom: 6px; }
.bx-st-bars .bx-lb-row { background: rgba(10,11,16,.55); overflow: hidden; box-shadow: 0 4px 12px -6px rgba(0,0,0,.6); }
.bx-st-bars .bx-lb-row::before { content:''; position:absolute; inset:0; width:var(--bar,0%); border-radius:12px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-accent) 55%, transparent), color-mix(in srgb, var(--bx-accent) 12%, transparent));
  transition: width 600ms cubic-bezier(.25,1,.35,1); z-index:0; }
.bx-st-bars .bx-lb-row > * { position: relative; z-index: 1; }
.bx-st-bars.bx-lb-likes .bx-lb-row::before { background: linear-gradient(90deg, color-mix(in srgb, var(--bx-pink) 55%, transparent), color-mix(in srgb, var(--bx-pink) 12%, transparent)); }

/* — ARCADE (TikFinity-Look) — keine box, avatare in reihe, kronen, konturschrift */
.bx-st-arcade { background: none; box-shadow: none; padding: 4px; }
.bx-st-arcade::before { display: none; }
.bx-st-arcade .bx-lb-title { border: none; margin: 0 0 4px; text-align: center;
  -webkit-text-stroke: 2px #08090d; paint-order: stroke fill; }
.bx-st-arcade .bx-lb-title::after { display: none; }
.bx-st-arcade .bx-lb-list { display: flex; align-items: flex-start; justify-content: center; gap: 4%; flex-wrap: nowrap; }
.bx-st-arcade .bx-lb-row { position: static; height: auto; flex-direction: column; align-items: center; gap: 3px; padding: 0; transform: none !important; flex: 1 1 0; min-width: 0; max-width: 22%; }
.bx-st-arcade .bx-lb-rank { display: none; }
.bx-st-arcade .bx-lb-pic { width: 64px; height: 64px; box-shadow: 0 0 0 3px #5c9dff, 0 4px 10px rgba(0,0,0,.5); }
.bx-st-arcade .bx-lb-row[data-rank="1"] .bx-lb-pic { box-shadow: 0 0 0 3px #ffd23e, 0 0 18px -2px #ffd23e, 0 4px 10px rgba(0,0,0,.5); }
.bx-st-arcade .bx-lb-row[data-rank="2"] .bx-lb-pic { box-shadow: 0 0 0 3px #cfd6e4, 0 4px 10px rgba(0,0,0,.5); }
.bx-st-arcade .bx-lb-row[data-rank="3"] .bx-lb-pic { box-shadow: 0 0 0 3px #f0a35a, 0 4px 10px rgba(0,0,0,.5); }
.bx-st-arcade .bx-lb-row::after { content: '👑'; position: static; order: -1; font-size: 20px; margin-bottom: -4px; transform: rotate(0); filter: drop-shadow(0 2px 3px rgba(0,0,0,.7)); opacity: .55; left: auto; top: auto; }
.bx-st-arcade .bx-lb-row[data-rank="1"]::after { opacity: 1; font-size: 26px; }
.bx-st-arcade .bx-lb-row[data-rank="2"]::after { opacity: .85; }
.bx-st-arcade .bx-lb-name { flex: none; max-width: 100%; font-size: 15px; text-align: center; color: #7dff8a;
  -webkit-text-stroke: 2px #08090d; paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.6); }
.bx-st-arcade .bx-lb-row[data-rank="1"] .bx-lb-name { color: #ffd23e; }
.bx-st-arcade .bx-lb-row[data-rank="2"] .bx-lb-name { color: #eaf0ff; }
.bx-st-arcade .bx-lb-row[data-rank="3"] .bx-lb-name { color: #ffb05a; }
.bx-st-arcade .bx-lb-val { font-family: var(--bx-font-display); font-size: 16px; color: #fff;
  -webkit-text-stroke: 2px #08090d; paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.6); }
.bx-st-arcade.bx-lb-likes .bx-lb-val { color: var(--bx-pink); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
const STYLES = new Set(['glas', 'neon', 'bars', 'arcade']);

export default class Leaderboard {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.source = props.source === 'likes' ? 'likes' : 'gifts';
    this.style = STYLES.has(props.style) ? props.style : 'glas';
    this.limit = Math.min(10, Math.max(1, Number(props.limit ?? 5)));
    this.showPic = props.showPic !== false;
    this.el = document.createElement('div');
    this.el.className = `bx-lb bx-st-${this.style}${this.source === 'likes' ? ' bx-lb-likes' : ''}`;
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
    const maxVal = Math.max(1, ...items.map((g) => (this.source === 'likes' ? g.likes : g.coins)));
    const seen = new Set();
    items.forEach((g, i) => {
      seen.add(g.id);
      let row = this.rows.get(g.id);
      if (!row) {
        row = document.createElement('div'); row.className = 'bx-lb-row'; row.style.opacity = '0';
        row.innerHTML = `<div class="bx-lb-rank"></div>${this.showPic ? '<div class="bx-lb-pic"></div>' : ''}<div class="bx-lb-name"></div><div class="bx-lb-val"></div>`;
        list.appendChild(row); this.rows.set(g.id, row);
        requestAnimationFrame(() => { row.style.opacity = '1'; });
      }
      const val = this.source === 'likes' ? g.likes : g.coins;
      row.dataset.rank = String(i + 1);
      if (this.style !== 'arcade') row.style.transform = `translateY(${i * 48}px)`;
      if (this.style === 'bars') row.style.setProperty('--bar', `${Math.max(8, (val / maxVal) * 100)}%`);
      row.querySelector('.bx-lb-rank').textContent = String(i + 1);
      row.querySelector('.bx-lb-name').textContent = g.nickname;
      const arrow = this.style === 'arcade' ? '▲ ' : '';
      row.querySelector('.bx-lb-val').textContent = this.source === 'likes' ? `${arrow}${fmt(val)} ❤` : `${arrow}${fmt(val)}`;
      const pic = row.querySelector('.bx-lb-pic');
      if (pic && g.profilePic) pic.style.backgroundImage = `url("${encodeURI(g.profilePic)}")`;
    });
    for (const [id, row] of this.rows) { if (!seen.has(id)) { row.remove(); this.rows.delete(id); } }
    if (this.style === 'arcade') {
      // DOM-reihenfolge = rang-reihenfolge (flexbox legt nebeneinander)
      items.forEach((g) => { const r = this.rows.get(g.id); if (r) list.appendChild(r); });
    }
  }
  destroy() { this.el.remove(); }
}
