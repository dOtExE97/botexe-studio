// leaderboard.js — Top-Liste der Session, live aus dem stats-Push.
// props: { source?: 'gifts'|'likes', limit?: number, title?: string }
// source 'gifts' = Top-Gifter (Coins) · 'likes' = Like-Liste (TikFinity-Style)
// Rang-Wechsel animieren per FLIP-light (transform-transition).

const STYLE_ID = 'bx-lb-style';
const CSS = `
.bx-lb {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  font-family: 'Arial Black', 'Archivo Black', Impact, sans-serif;
  background: linear-gradient(170deg, rgba(16,18,26,.9), rgba(10,11,16,.84));
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
  box-shadow: 0 14px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08) inset;
  padding: 14px 16px 12px;
  overflow: hidden;
}
.bx-lb-title {
  font-size: 14px; letter-spacing: .34em; text-transform: uppercase;
  color: #ffd23e; text-shadow: 0 2px 8px rgba(0,0,0,.8);
  border-bottom: 2px solid #ff4d2e; padding-bottom: 8px; margin-bottom: 8px;
}
.bx-lb-list { position: relative; flex: 1; }
.bx-lb-row {
  position: absolute; left: 0; right: 0; height: 40px;
  display: flex; align-items: center; gap: 10px;
  transition: transform 480ms cubic-bezier(.25,1,.35,1), opacity 300ms;
}
.bx-lb-rank {
  width: 26px; height: 26px; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #0c0d12; background: #5a6072;
  clip-path: polygon(15% 0, 100% 0, 85% 100%, 0 100%);
}
.bx-lb-row[data-rank="1"] .bx-lb-rank { background: #ffd23e; box-shadow: 0 0 14px rgba(255,210,62,.7); }
.bx-lb-row[data-rank="2"] .bx-lb-rank { background: #cfd6e4; }
.bx-lb-row[data-rank="3"] .bx-lb-rank { background: #d98a4a; }
.bx-lb-pic { width: 28px; height: 28px; border-radius: 50%; flex: none;
  background: #262a36 center/cover; box-shadow: 0 0 0 2px rgba(255,255,255,.15); }
.bx-lb-name {
  flex: 1; font-size: 16px; color: #fff; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 0 2px 0 rgba(0,0,0,.4);
}
.bx-lb-coins {
  font-family: Consolas, Menlo, monospace; font-weight: 700;
  font-size: 15px; color: #ffd23e;
}
.bx-lb-likes .bx-lb-coins { color: #ff5e8a; }
.bx-lb-likes .bx-lb-title { color: #ff5e8a; border-bottom-color: #ff5e8a; }
.bx-lb-empty {
  display: flex; align-items: center; justify-content: center; height: 100%;
  font-size: 13px; letter-spacing: .2em; color: #5a6072; text-transform: uppercase;
}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
}

export default class Leaderboard {
  constructor(root, props) {
    ensureStyle();
    this.source = props.source === 'likes' ? 'likes' : 'gifts';
    this.limit = Math.min(10, Math.max(1, Number(props.limit ?? 5)));
    this.el = document.createElement('div');
    this.el.className = `bx-lb${this.source === 'likes' ? ' bx-lb-likes' : ''}`;
    const emptyText = this.source === 'likes' ? 'Noch keine Likes' : 'Noch keine Gifts';
    this.el.innerHTML = `
      <div class="bx-lb-title"></div>
      <div class="bx-lb-list"><div class="bx-lb-empty">${emptyText}</div></div>`;
    this.el.querySelector('.bx-lb-title').textContent =
      props.title || (this.source === 'likes' ? 'Top Likes' : 'Top Gifter');
    root.appendChild(this.el);
    this.rows = new Map(); // userId → row-element
  }

  onStats(stats) {
    const source = this.source === 'likes' ? stats?.topLikers : stats?.topGifters;
    const gifters = (source ?? []).slice(0, this.limit);
    const list = this.el.querySelector('.bx-lb-list');
    const empty = list.querySelector('.bx-lb-empty');
    if (empty && gifters.length > 0) empty.remove();

    const seen = new Set();
    gifters.forEach((g, i) => {
      seen.add(g.id);
      let row = this.rows.get(g.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'bx-lb-row';
        row.style.opacity = '0';
        row.innerHTML = `
          <div class="bx-lb-rank"></div>
          <div class="bx-lb-pic"></div>
          <div class="bx-lb-name"></div>
          <div class="bx-lb-coins"></div>`;
        list.appendChild(row);
        this.rows.set(g.id, row);
        requestAnimationFrame(() => {
          row.style.opacity = '1';
        });
      }
      row.dataset.rank = String(i + 1);
      row.style.transform = `translateY(${i * 42}px)`;
      row.querySelector('.bx-lb-rank').textContent = String(i + 1);
      row.querySelector('.bx-lb-name').textContent = g.nickname;
      row.querySelector('.bx-lb-coins').textContent =
        this.source === 'likes' ? `${fmt(g.likes)} ❤` : fmt(g.coins);
      const pic = row.querySelector('.bx-lb-pic');
      if (g.profilePic) pic.style.backgroundImage = `url("${encodeURI(g.profilePic)}")`;
    });

    for (const [id, row] of this.rows) {
      if (!seen.has(id)) {
        row.remove();
        this.rows.delete(id);
      }
    }
  }

  destroy() {
    this.el.remove();
  }
}
