// top-rotator.js — Rotierende Bestenliste für Hochformat: zeigt Top Gifter,
// dann smooth übergeblendet Top Likes, dann Top Punkte usw. — untereinander.
// props: { sources?: 'gifts,likes,points', interval?: sek, limit?, accent?, showPic? }
const STYLE_ID = 'bx-tr-style';
const CSS = `
.bx-tr { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--bx-font-body); overflow: hidden; }
.bx-tr-head { position: relative; height: 34px; margin-bottom: 6px; }
.bx-tr-title { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: 20px; letter-spacing: .08em; text-transform: uppercase; color: #fff;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 3px 5px rgba(0,0,0,.5);
  transition: opacity .35s, transform .35s; }
.bx-tr-list { position: relative; flex: 1; }
.bx-tr-list.out .bx-tr-row { opacity: 0; transform: translateY(-14px); }
.bx-tr-list.in .bx-tr-row { animation: bx-tr-rowin .45s cubic-bezier(.2,1.1,.3,1) backwards; }
@keyframes bx-tr-rowin { from { opacity: 0; transform: translateY(18px); } }
.bx-tr-row { display: flex; align-items: center; gap: 11px; height: 54px; padding: 0 6px;
  transition: opacity .3s, transform .3s; }
.bx-tr-rank { width: 34px; height: 34px; flex: none; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: 17px; color: #0a0b12; border-radius: 11px; background: #525873;
  -webkit-text-stroke: 0; box-shadow: 0 3px 8px rgba(0,0,0,.4); }
.bx-tr-row[data-rank="1"] .bx-tr-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold), 0 3px 8px rgba(0,0,0,.4); }
.bx-tr-row[data-rank="2"] .bx-tr-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); }
.bx-tr-row[data-rank="3"] .bx-tr-rank { background: linear-gradient(160deg,#f0b487,#c9763c); }
.bx-tr-pic { width: 46px; height: 46px; flex: none; border-radius: 50%; background: #1a1c28 center/cover;
  box-shadow: 0 0 0 3px #5c9dff, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="1"] .bx-tr-pic { box-shadow: 0 0 0 3px var(--bx-gold), 0 0 18px -2px var(--bx-gold), 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="2"] .bx-tr-pic { box-shadow: 0 0 0 3px #d7deec, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="3"] .bx-tr-pic { box-shadow: 0 0 0 3px #f0a35a, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-crown { position: absolute; margin-top: -34px; margin-left: 26px; font-size: 22px; transform: rotate(-12deg);
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.7)); }
.bx-tr-name { flex: 1; min-width: 0; font-family: var(--bx-font-display); font-size: 21px; color: #fff; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-tr-row[data-rank="1"] .bx-tr-name { color: var(--bx-gold); }
.bx-tr-val { flex: none; font-family: var(--bx-font-display); font-size: 21px; color: #fff;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-tr-val .arr { font-size: 15px; -webkit-text-stroke: 2px #0a0b12; }
.bx-tr-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-family: var(--bx-font-display);
  font-size: 15px; letter-spacing: .1em; color: var(--bx-muted); text-transform: uppercase; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
const SRC = {
  gifts: { title: 'Top Gifter', accent: '#ff5436', valColor: '#ffd23e', list: (s) => s?.topGifters || [], val: (e) => fmt(e.coins), arr: '▲' },
  likes: { title: 'Top Likes', accent: '#ff5e8a', valColor: '#ff8ab0', list: (s) => s?.topLikers || [], val: (e) => `${fmt(e.likes)} ❤`, arr: '▲' },
  points: { title: 'Top Supporter', accent: '#7c5cff', valColor: '#b59cff', list: (s) => s?.topPoints || [], val: (e) => fmt(e.points), arr: '★' },
};

export default class TopRotator {
  constructor(root, props) {
    ensureStyle();
    this.root = root;
    this.fixedAccent = props.accent || null;
    this.sources = String(props.sources || 'gifts,likes').split(',').map((x) => x.trim()).filter((x) => SRC[x]);
    if (this.sources.length === 0) this.sources = ['gifts', 'likes'];
    this.interval = Math.max(2, Number(props.interval ?? 5)) * 1000;
    this.limit = Math.min(8, Math.max(1, Number(props.limit ?? 5)));
    this.showPic = props.showPic !== false;
    this.idx = 0;
    this.stats = null;
    this.el = document.createElement('div');
    this.el.className = 'bx-tr';
    this.el.innerHTML = `<div class="bx-tr-head"><div class="bx-tr-title"></div></div><div class="bx-tr-list in"></div>`;
    this.titleEl = this.el.querySelector('.bx-tr-title');
    this.listEl = this.el.querySelector('.bx-tr-list');
    root.appendChild(this.el);
    this.render(true);
    if (this.sources.length > 1) this.timer = setInterval(() => this.rotate(), this.interval);
  }
  rotate() {
    this.idx = (this.idx + 1) % this.sources.length;
    // raus-animation, dann wechseln + rein
    this.listEl.classList.add('out');
    this.titleEl.style.opacity = '0';
    this.titleEl.style.transform = 'translateY(-8px)';
    setTimeout(() => { this.render(true); this.listEl.classList.remove('out'); this.titleEl.style.opacity=''; this.titleEl.style.transform=''; }, 360);
  }
  onStats(stats) { this.stats = stats; this.render(false); }
  render(animate) {
    const key = this.sources[this.idx];
    const def = SRC[key];
    const accent = this.fixedAccent || def.accent;
    this.root.style.setProperty('--bx-accent', accent);
    this.titleEl.textContent = def.title;
    const items = def.list(this.stats).slice(0, this.limit);
    this.listEl.classList.toggle('in', !!animate);
    if (animate) void this.listEl.offsetWidth;
    if (items.length === 0) { this.listEl.innerHTML = `<div class="bx-tr-empty">— noch keine —</div>`; return; }
    this.listEl.innerHTML = items.map((e, i) => `
      <div class="bx-tr-row" data-rank="${i+1}" style="animation-delay:${i*60}ms">
        <div class="bx-tr-rank">${i+1}</div>
        ${this.showPic ? `<div class="bx-tr-pic" style="${e.profilePic?`background-image:url('${encodeURI(e.profilePic)}')`:''}"></div>${i===0?'<div class="bx-tr-crown">👑</div>':''}` : ''}
        <div class="bx-tr-name">${escapeHtml(e.nickname)}</div>
        <div class="bx-tr-val" style="color:${i===0&&key!=='points'?def.valColor:'#fff'}"><span class="arr">${def.arr}</span> ${def.val(e)}</div>
      </div>`).join('');
  }
  destroy() { clearInterval(this.timer); this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
